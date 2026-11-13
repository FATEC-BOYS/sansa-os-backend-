import type {FastifyInstance,FastifyRequest} from "fastify";
import type {PrismaClient} from "@prisma/client";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {verifyMetaSignature,constantTimeStringMatch} from "../lib/whatsapp-security.js";
import {routeWhatsAppMessage,type WhatsAppStage} from "../lib/whatsapp-flow.js";

const message=z.object({
  from:z.string().regex(/^\d{8,16}$/),
  id:z.string().min(5).max(200),
  timestamp:z.string(),
  type:z.string(),
  text:z.object({body:z.string()}).optional()
}).passthrough();
const contact=z.object({
  wa_id:z.string(),
  profile:z.object({name:z.string()}).optional()
}).passthrough();
const payload=z.object({
  object:z.literal("whatsapp_business_account"),
  entry:z.array(z.object({
    changes:z.array(z.object({
      field:z.string().optional(),
      value:z.object({
        messaging_product:z.string().optional(),
        metadata:z.object({phone_number_id:z.string()}).optional(),
        messages:z.array(message).optional(),
        contacts:z.array(contact).optional()
      }).passthrough()
    }).passthrough())
  }).passthrough()).max(25)
}).passthrough();

function asDate(seconds:string):Date {
  const n=Number(seconds);
  return Number.isFinite(n)&&n>0&&n<5000000000 ? new Date(n*1000) : new Date();
}
function phoneMasked(waId:string) {
  return waId.length>=4 ? "••••"+waId.slice(-4) : "••••";
}
function stageFromStored(value:string):WhatsAppStage {
  if(["identifier","validator","service","sales","after_service","human_handoff"].includes(value))
    return value as WhatsAppStage;
  return "identifier";
}
function isDuplicate(error:unknown):boolean{
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code==="P2002";
}

export function registerMetaWhatsAppRoutes(app:FastifyInstance,prisma:PrismaClient){
  const endpoint="/api/webhooks/meta/whatsapp";

  app.get<{Querystring:Record<string,unknown>}>(endpoint,async(request,reply)=>{
    const configured=process.env.META_VERIFY_TOKEN;
    if(!configured||configured.length<24)
      return reply.code(503).send({error:"Webhook verification not configured"});
    const query=request.query;
    if(query["hub.mode"]!=="subscribe"||
      !constantTimeStringMatch(query["hub.verify_token"],configured)||
      typeof query["hub.challenge"]!=="string"||
      !/^\d{1,32}$/.test(query["hub.challenge"]))
      return reply.code(403).send({error:"Invalid webhook verification"});
    return reply.type("text/plain").code(200).send(query["hub.challenge"]);
  });

  app.post(endpoint,{config:{rawBody:true},bodyLimit:256*1024},async(request,reply)=>{
    const secret=process.env.META_APP_SECRET;
    const expectedPhone=process.env.META_WA_PHONE_NUMBER_ID;
    if(!secret||secret.length<16||!expectedPhone)
      return reply.code(503).send({error:"Meta connection not configured"});
    const raw=(request as FastifyRequest & {rawBody?:Buffer}).rawBody;
    if(!verifyMetaSignature(raw,request.headers["x-hub-signature-256"],secret))
      return reply.code(401).send({error:"Invalid Meta signature"});
    const parsed=payload.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"Invalid Meta event"});
    let received=0,duplicates=0,ignored=0;
    for(const entry of parsed.data.entry){
      for(const change of entry.changes){
        if(change.value.metadata?.phone_number_id!==expectedPhone){ignored++;continue;}
        if(change.field && change.field!=="messages"){ignored++;continue;}
        const profiles=new Map((change.value.contacts||[]).map(item=>[item.wa_id,item.profile?.name]));
        for(const item of change.value.messages||[]){
          // Store minimal customer data, never raw Meta payloads, sensitive credentials or token.
          try{
            const body=item.type==="text"?item.text?.body?.slice(0,2000)??null:null;
            await prisma.$transaction(async tx=>{
              const conversation=await tx.whatsAppConversation.upsert({
                where:{waId:item.from},
                create:{
                  waId:item.from,
                  profileName:profiles.get(item.from)?.slice(0,80)??null,
                  lastInboundAt:asDate(item.timestamp)
                },
                update:{lastInboundAt:asDate(item.timestamp)}
              });
              await tx.whatsAppMessage.create({data:{
                metaMessageId:item.id,conversationId:conversation.id,
                direction:"inbound",type:item.type,text:body,receivedAt:asDate(item.timestamp)
              }});
              if(body){
                const decision=routeWhatsAppMessage({
                  stage:stageFromStored(conversation.stage),
                  validationStatus:conversation.validationStatus==="verified"?"verified":conversation.validationStatus==="pending"?"pending":"unverified",
                  optedOut:conversation.optedOut
                },body);
                await tx.whatsAppConversation.update({
                  where:{id:conversation.id},
                  data:{
                    stage:decision.stage,intent:decision.intent,
                    optedOut:decision.optedOut||conversation.optedOut,
                    handoffRequired:decision.needsHuman,
                    ...(decision.stage==="validator"?{validationStatus:"pending"}:{})
                  }
                });
                // This creates only a human-review draft; no WhatsApp Graph API send call exists.
                if(decision.draft && !decision.optedOut){
                  await tx.approval.create({data:{
                    agent:decision.agent,kind:"whatsapp_draft",channel:"whatsapp",
                    conversationId:conversation.id,status:"pending",
                    title:`WhatsApp · ${decision.agent} · ${phoneMasked(item.from)}`,
                    summary:decision.statusNote.slice(0,500),
                    content:decision.draft
                  }});
                }
                if(decision.needsHuman||decision.optedOut)
                  await tx.activity.create({data:{
                    kind:decision.optedOut?"whatsapp_opt_out":"whatsapp_handoff",
                    message:`WhatsApp ${phoneMasked(item.from)}: ${decision.statusNote}`.slice(0,500)
                  }});
              } else {
                await tx.whatsAppConversation.update({where:{id:conversation.id},data:{handoffRequired:true,stage:"human_handoff"}});
                await tx.activity.create({data:{kind:"whatsapp_media_review",message:`WhatsApp ${phoneMasked(item.from)}: mídia ou tipo não textual recebido; revisão humana necessária.`}});
              }
            });
            received++;
          }catch(error){
            if(isDuplicate(error)){duplicates++;continue;}
            app.log.error({reason:error instanceof Error?error.name:"unknown"},"WhatsApp ingestion transaction failed");
            // Meta may retry. Transaction and unique message ID prevent duplicate proposals.
            return reply.code(500).send({error:"Message storage unavailable"});
          }
        }
      }
    }
    return reply.code(200).send({ok:true,received,duplicates,ignored});
  });

  // These internal endpoints still require INTERNAL_API_KEY via global hook.
  app.get("/api/whatsapp/status",async()=>({
    integration:"meta_whatsapp_cloud_api",
    webhookReady:Boolean(process.env.META_VERIFY_TOKEN&&process.env.META_APP_SECRET&&process.env.META_WA_PHONE_NUMBER_ID),
    outboundEnabled:false,
    policy:"Inbound verified and stored; drafts only, no automated sends"
  }));
  app.get("/api/whatsapp/conversations",async()=>{
    const conversations=await prisma.whatsAppConversation.findMany({
      orderBy:{updatedAt:"desc"},take:50,
      include:{_count:{select:{messages:true,approvals:true}}}
    });
    return conversations.map(c=>({
      id:c.id,displayContact:phoneMasked(c.waId),profileName:c.profileName,
      stage:c.stage,intent:c.intent,validationStatus:c.validationStatus,
      optedOut:c.optedOut,handoffRequired:c.handoffRequired,
      lastInboundAt:c.lastInboundAt,updatedAt:c.updatedAt,
      messagesCount:c._count.messages,draftsCount:c._count.approvals
    }));
  });
  app.get<{Params:{id:string}}>("/api/whatsapp/conversations/:id",async(request,reply)=>{
    const conversation=await prisma.whatsAppConversation.findUnique({
      where:{id:request.params.id},
      include:{
        messages:{orderBy:{receivedAt:"desc"},take:40},
        approvals:{orderBy:{createdAt:"desc"},take:30}
      }
    });
    if(!conversation)return reply.code(404).send({error:"Conversation not found"});
    return {
      id:conversation.id,displayContact:phoneMasked(conversation.waId),
      profileName:conversation.profileName,stage:conversation.stage,
      validationStatus:conversation.validationStatus,handoffRequired:conversation.handoffRequired,
      optedOut:conversation.optedOut, messages:conversation.messages,
      approvals:conversation.approvals
    };
  });
}
