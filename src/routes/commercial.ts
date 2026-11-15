import type {FastifyInstance} from 'fastify';
import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {BriefingData,briefingMissing,EstimateInput,calculateEstimate,VersionInput,priceReview} from '../lib/commercial.js';
import {buildProposal,ProposalInput} from '../lib/sales.js';
import {renderProposalPdf} from '../lib/proposal-pdf.js';

const SaveInput=z.object({leadId:z.string().min(1).max(100).nullable().default(null),data:BriefingData,expectedRevision:z.number().int().min(1).optional()}).strict();
const include={estimates:{orderBy:{createdAt:'desc' as const},take:50},proposals:{orderBy:{number:'desc' as const},take:50,include:{approval:{select:{id:true,status:true}}}}};
export function registerCommercialRoutes(app:FastifyInstance,prisma:PrismaClient){
  app.get('/api/commercial/briefings',async()=>({briefings:await prisma.briefing.findMany({orderBy:{updatedAt:'desc'},take:100})}));
  app.get<{Params:{id:string}}>('/api/commercial/briefings/:id',async(request,reply)=>{
    const result=await prisma.briefing.findUnique({where:{id:request.params.id},include});
    if(!result)return reply.code(404).send({error:'Briefing não encontrado.'});
    return {...result,missing:briefingMissing(BriefingData.parse(result.data))};
  });
  app.post('/api/commercial/briefings',async(request,reply)=>{
    const input=SaveInput.safeParse(request.body);
    if(!input.success)return reply.code(400).send({error:'Confira os campos do briefing.'});
    const {leadId,data}=input.data;
    if(leadId){const lead=await prisma.lead.findUnique({where:{id:leadId}});if(!lead)return reply.code(404).send({error:'Contato não encontrado.'});data.company=lead.name;}
    const briefing=await prisma.briefing.create({data:{leadId,data}});
    return reply.code(201).send({...briefing,missing:briefingMissing(data)});
  });
  app.put<{Params:{id:string}}>('/api/commercial/briefings/:id',async(request,reply)=>{
    const input=SaveInput.safeParse(request.body);
    if(!input.success||!input.data.expectedRevision)return reply.code(400).send({error:'Informe os campos e a revisão atual.'});
    const {leadId,data,expectedRevision}=input.data;
    if(leadId){const lead=await prisma.lead.findUnique({where:{id:leadId}});if(!lead)return reply.code(404).send({error:'Contato não encontrado.'});data.company=lead.name;}
    const changed=await prisma.briefing.updateMany({where:{id:request.params.id,revision:expectedRevision},data:{leadId,data,revision:{increment:1}}});
    if(!changed.count)return reply.code(409).send({error:'O briefing mudou em outra sessão. Reabra antes de salvar.'});
    const briefing=await prisma.briefing.findUniqueOrThrow({where:{id:request.params.id}});
    return {...briefing,missing:briefingMissing(data)};
  });
  app.post<{Params:{id:string}}>('/api/commercial/briefings/:id/estimates',async(request,reply)=>{
    const parsed=z.object({expectedRevision:z.number().int().min(1),parameters:EstimateInput}).strict().safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'Preencha e confirme todos os parâmetros; imposto e margem precisam somar menos de 100%.'});
    let calculation;try{calculation=calculateEstimate(parsed.data.parameters);}catch{return reply.code(400).send({error:'O cálculo excede o limite suportado.'});}
    // Conditional write locks the briefing row: concurrent edits cannot attach an
    // estimate to a revision different from the one reviewed by the operator.
    const result=await prisma.$transaction(async tx=>{
      const lock=await tx.briefing.updateMany({where:{id:request.params.id,revision:parsed.data.expectedRevision},data:{proposalSequence:{increment:0}}});
      if(!lock.count)return null;
      return tx.estimate.create({data:{briefingId:request.params.id,briefingRevision:parsed.data.expectedRevision,parameters:parsed.data.parameters,calculation}});
    });
    if(!result)return reply.code(409).send({error:'Briefing alterado ou não encontrado. Reabra e calcule novamente.'});
    return reply.code(201).send(result);
  });
  app.post<{Params:{id:string}}>('/api/commercial/briefings/:id/versions',async(request,reply)=>{
    const parsed=VersionInput.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'Confirme investimento, validade, prazo e condições da proposta.'});
    const input=parsed.data;
    try{
      const result=await prisma.$transaction(async tx=>{
        const lock=await tx.briefing.updateMany({where:{id:request.params.id,revision:input.expectedRevision},data:{proposalSequence:{increment:1}}});
        if(!lock.count)throw new Error('STALE');
        const briefing=await tx.briefing.findUniqueOrThrow({where:{id:request.params.id}});
        const data=BriefingData.parse(briefing.data);
        if(briefingMissing(data).length)throw new Error('INCOMPLETE');
        const estimate=await tx.estimate.findUnique({where:{id:input.estimateId}});
        if(!estimate||estimate.briefingId!==briefing.id||estimate.briefingRevision!==briefing.revision)throw new Error('STALE');
        const parameters=EstimateInput.parse(estimate.parameters);
        const calculation=calculateEstimate(parameters);
        const review=priceReview(calculation,parameters.taxBps,input.priceCents);
        if(review.negativeMargin)throw new Error('NEGATIVE_MARGIN');
        if(review.discountCents&&!input.discountApproved)throw new Error('DISCOUNT');
        const payload=buildProposal(ProposalInput.parse({clientName:data.company,service:data.service,package:'sob_medida',goal:data.objective,objectiveConfirmed:true,customScope:data.deliverables,priceCents:input.priceCents,timeline:input.timeline,paymentTerms:input.paymentTerms,dependencies:[data.constraints,input.exclusions].filter(Boolean).join('\n').slice(0,500)}));
        const content=[payload.content,'',`VERSÃO: ${briefing.proposalSequence}`,`VALIDADE: ${input.validity}`,`MARCOS: ${input.milestones||'Não confirmados; alinhar antes da contratação.'}`,`REVISÕES: ${input.revisions||'Não confirmadas; alinhar antes da contratação.'}`,`REFERÊNCIAS: ${data.references||'Não informadas.'}`,`PÚBLICO: ${data.audience}`,'Aceite do cliente e contrato são etapas separadas da aprovação interna.'].join('\n');
        const version=await tx.proposalVersion.create({data:{briefingId:briefing.id,estimateId:estimate.id,number:briefing.proposalSequence,briefingRevision:briefing.revision,snapshot:{briefing:data,conditions:input,priceReview:review,author:'Operador do painel autenticado',parameterVersion:'sansa-cost-v1'},content}});
        const approval=await tx.approval.create({data:{agent:'sales',kind:'commercial_proposal',title:`${payload.title} · v${version.number}`.slice(0,160),summary:payload.summary,content,status:'pending',leadId:briefing.leadId,proposalVersionId:version.id}});
        await tx.activity.create({data:{kind:'proposal_version_created',message:`Proposta v${version.number} criada para revisão interna. Nenhum envio ou cobrança.`}});
        return {...version,approval:{id:approval.id,status:approval.status}};
      });
      return reply.code(201).send(result);
    }catch(error){
      const code=error instanceof Error?error.message:'';
      const messages:Record<string,string>={STALE:'Briefing ou cálculo desatualizado. Reabra e calcule novamente.',INCOMPLETE:'Confirme objetivo, público e entregáveis antes de criar a proposta.',DISCOUNT:'O desconto precisa de aprovação explícita.',NEGATIVE_MARGIN:'Investimento abaixo do custo líquido. Revise escopo e parâmetros.'};
      if(messages[code])return reply.code(code==='STALE'?409:400).send({error:messages[code]});
      throw error;
    }
  });
  app.get<{Params:{id:string}}>('/api/commercial/versions/:id/pdf',async(request,reply)=>{
    const version=await prisma.proposalVersion.findUnique({where:{id:request.params.id},include:{approval:{select:{status:true}}}});
    if(!version)return reply.code(404).send({error:'Versão não encontrada.'});
    const bytes=await renderProposalPdf(version.content,{number:version.number,createdAt:version.createdAt,approved:version.approval?.status==='approved'});
    return reply.header('Cache-Control','no-store').header('Content-Type','application/pdf').header('Content-Disposition',`attachment; filename="SANSA-proposta-v${version.number}.pdf"`).send(Buffer.from(bytes));
  });
}
