import type {FastifyInstance} from "fastify";
import type {PrismaClient} from "@prisma/client";
import {z} from "zod";
import {services,ProposalInput,NegotiationInput,buildProposal,buildNegotiation} from "../lib/sales.js";

export function registerSalesRoutes(app:FastifyInstance,prisma:PrismaClient){
  app.get("/api/sales/catalog",async()=>({
    services,
    pricing:"Nenhum preço fixo ou desconto automático. Investimento digitado pela fundadora.",
    payment:"Cobrança e conciliação não integradas."
  }));
  app.post("/api/sales/proposal-drafts",async(request,reply)=>{
    const parsed=ProposalInput.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"Dados da proposta inválidos",details:parsed.error.flatten()});
    const payload=buildProposal(parsed.data);
    const result=await prisma.$transaction(async tx=>{
      const approval=await tx.approval.create({data:{
        agent:"sales",kind:"commercial_proposal",status:"pending",title:payload.title,
        summary:payload.summary,content:payload.content
      }});
      await tx.activity.create({data:{kind:"sales_proposal_drafted",message:`Proposta comercial para ${parsed.data.clientName} criada para revisão. Não enviada.`.slice(0,500)}});
      return approval;
    });
    return reply.code(201).send({approval:result});
  });
  app.post("/api/sales/negotiation-drafts",async(request,reply)=>{
    const parsed=NegotiationInput.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"Dados da negociação inválidos",details:parsed.error.flatten()});
    const payload=buildNegotiation(parsed.data);
    const result=await prisma.$transaction(async tx=>{
      const approval=await tx.approval.create({data:{
        agent:"sales",kind:"negotiation_reply",status:"pending",
        title:payload.title,summary:payload.summary,content:payload.content
      }});
      await tx.activity.create({data:{kind:"sales_negotiation_drafted",message:`Resposta de negociação para ${parsed.data.clientName} criada para revisão. Não enviada.`.slice(0,500)}});
      return approval;
    });
    return reply.code(201).send({approval:result});
  });
  app.patch<{Params:{id:string}}>("/api/sales/drafts/:id",async(request,reply)=>{
    const parsed=z.object({
      title:z.string().trim().min(3).max(160).optional(),
      content:z.string().trim().min(1).max(20000).optional()
    }).strict().refine(v=>v.title!==undefined||v.content!==undefined).safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"Edição inválida"});
    const edited=await prisma.approval.updateMany({
      where:{id:request.params.id,status:"pending",kind:{in:["commercial_proposal","negotiation_reply"]}},
      data:parsed.data
    });
    if(!edited.count)return reply.code(409).send({error:"Rascunho não encontrado ou já revisado"});
    const approval=await prisma.approval.findUniqueOrThrow({where:{id:request.params.id}});
    await prisma.activity.create({data:{kind:"sales_draft_edited",message:"Rascunho comercial editado antes da aprovação."}});
    return approval;
  });
}
