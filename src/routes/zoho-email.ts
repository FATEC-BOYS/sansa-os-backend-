import type {FastifyInstance} from "fastify";
import type {PrismaClient} from "@prisma/client";
import {Prisma} from "@prisma/client";
import {ImapFlow} from "imapflow";
import {simpleParser} from "mailparser";
import {classifyMail,draftMailReply,skipAutomatedMail} from "../lib/zoho-mail.js";

const mailbox="INBOX";
let syncing=false;
const validAddress=(v:string)=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
function credentials(){
  const enabled=process.env.ZOHO_IMAP_ENABLED==="true";
  const user=process.env.ZOHO_IMAP_USER?.trim()??"";
  const pass=process.env.ZOHO_IMAP_APP_PASSWORD??"";
  return {enabled,user,pass,ready:enabled&&validAddress(user)&&pass.length>=10};
}
function targetAddress(addresses:string[]):string|null{
  const approved=new Set((process.env.ZOHO_ALIAS_ADDRESSES||"comercial@sansadigital.com.br,contato@sansadigital.com.br,propostas@sansadigital.com.br")
    .split(",").map(v=>v.trim().toLowerCase()).filter(Boolean));
  return addresses.find(a=>approved.has(a.toLowerCase()))??null;
}
function safeDate(value:Date|undefined|null):Date{
  return value instanceof Date&&!Number.isNaN(value.getTime())?value:new Date();
}
function isDuplicate(error:unknown){
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code==="P2002";
}

export function registerZohoEmailRoutes(app:FastifyInstance,prisma:PrismaClient){
  app.get("/api/email/status",async()=>{
    const config=credentials();
    const [total,last]=await Promise.all([
      prisma.mailMessage.count(),
      prisma.activity.findFirst({where:{kind:"zoho_email_synced"},orderBy:{createdAt:"desc"}})
    ]);
    return {
      provider:"Zoho Mail",configured:config.ready,
      readOnly:true,autoSendEnabled:false,
      lastSyncedAt:last?.createdAt??null,total
    };
  });
  app.get("/api/email/inbox",async()=>{
    const rows=await prisma.mailMessage.findMany({
      orderBy:{receivedAt:"desc"},take:70,
      include:{approval:{select:{id:true,status:true,title:true}}}
    });
    return rows.map(row=>({
      id:row.id,fromAddress:row.fromAddress,senderName:row.senderName,
      toAddress:row.toAddress,subject:row.subject,preview:row.preview,
      category:row.category,receivedAt:row.receivedAt,
      approval:row.approval
    }));
  });
  app.post("/api/email/sync",async(_request,reply)=>{
    const {ready,user,pass}=credentials();
    if(!ready)return reply.code(503).send({error:"Zoho não conectado. Ative IMAP e configure ZOHO_IMAP_USER e ZOHO_IMAP_APP_PASSWORD nas variáveis privadas da API."});
    if(syncing)return reply.code(409).send({error:"Uma sincronização de e-mail já está em andamento."});
    syncing=true;
    let added=0,skipped=0,drafts=0;
    const client=new ImapFlow({
      host:"imappro.zoho.com",port:993,secure:true,
      auth:{user,pass},logger:false,
      socketTimeout:30000,connectionTimeout:15000
    });
    client.on("error",error=>app.log.warn({errorType:error instanceof Error?error.name:"unknown"},"Zoho IMAP connection failed"));
    try {
      await client.connect();
      const lock=await client.getMailboxLock(mailbox,{readOnly:true});
      try {
        const selected=client.mailbox;
        const exists=selected?selected.exists:0;
        const uidValidity=selected?String(selected.uidValidity):"unknown";
        if(exists){
          const first=Math.max(1,exists-39);
          const items=await client.fetchAll(`${first}:${exists}`,{uid:true,envelope:true,size:true});
          const cutoff=Date.now()-14*86400_000;
          for(const item of items){
            if(added>=10)break;
            const from=item.envelope?.from?.[0]?.address?.toLowerCase().trim()||"";
            const recipients=(item.envelope?.to||[]).map(a=>a.address?.trim().toLowerCase()||"");
            const to=targetAddress(recipients);
            const subject=(item.envelope?.subject||"(Sem assunto)").slice(0,300);
            const receivedAt=safeDate(item.envelope?.date);
            if(!to||skipAutomatedMail(from,subject)||receivedAt.getTime()<cutoff){skipped++;continue;}
            const prior=await prisma.mailMessage.findUnique({
              where:{mailbox_uidValidity_uid:{mailbox,uidValidity,uid:item.uid}},select:{id:true}
            });
            if(prior){skipped++;continue;}
            let preview="";
            if(typeof item.size==="number"&&item.size<=256000){
              const full=await client.fetchOne(item.uid,{source:true},{uid:true});
              if(full&&full.source){
                const mail=await simpleParser(full.source,{skipHtmlToText:true,skipTextToHtml:true,skipImageLinks:true});
                preview=(mail.text||"").replace(/\u0000/g,"").slice(0,1500);
              }
            }else{
              preview="Mensagem com anexos ou conteúdo extenso. Verificar diretamente no Zoho Mail.";
            }
            const category=classifyMail(subject,preview);
            const response=draftMailReply(category);
            try{
              await prisma.$transaction(async tx=>{
                const msg=await tx.mailMessage.create({data:{
                  mailbox,uidValidity,uid:item.uid,
                  fromAddress:from,senderName:item.envelope?.from?.[0]?.name?.slice(0,120)||null,
                  toAddress:to,subject,preview,category,receivedAt
                }});
                if(response&&validAddress(from)){
                  await tx.approval.create({data:{
                    agent:response.agent,kind:"email_draft",channel:"email",mailMessageId:msg.id,
                    title:`Responder · ${subject}`.slice(0,160),
                    summary:`Mensagem de ${from} para ${to}. Rascunho seguro; precisa de revisão.`.slice(0,500),
                    content:response.body,status:"pending"
                  }});
                }
              });
              added++;
              if(response)drafts++;
            }catch(error){
              if(isDuplicate(error)){skipped++;continue;}
              throw error;
            }
          }
        }
      } finally {lock.release();}
      await prisma.activity.create({data:{
        kind:"zoho_email_synced",
        message:`Zoho Mail: ${added} novos e-mails recebidos e ${drafts} respostas preparadas; ${skipped} ignorados/anteriores. Sem envio.`
      }});
      return {ok:true,added,skipped,drafts,mode:"read_only"};
    }catch(error){
      app.log.error({errorType:error instanceof Error?error.name:"unknown"},"Zoho IMAP sync failed");
      return reply.code(502).send({error:"Não foi possível consultar o Zoho. Verifique IMAP habilitado, e-mail da conta e senha de aplicativo."});
    }finally{
      syncing=false;
      try{await client.logout();}catch{}
    }
  });
}
