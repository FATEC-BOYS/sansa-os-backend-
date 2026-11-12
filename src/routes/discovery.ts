import type {FastifyInstance} from "fastify";
import type {PrismaClient} from "@prisma/client";
import {z} from "zod";
import {CandidateInput,SearchInput,normalizeName,searchOsm,scoreCandidate} from "../lib/discovery.js";
import {assessProspect} from "../lib/proposals.js";

export function registerDiscoveryRoutes(app:FastifyInstance,prisma:PrismaClient) {
  app.post("/api/discovery/search",async (request,reply)=>{
    const validated=SearchInput.safeParse(request.body);
    if(!validated.success)return reply.code(400).send({error:"Região ou segmento inválido"});
    try {
      const results=await searchOsm(validated.data);
      const [leads,shortlisted]=await Promise.all([
        prisma.lead.findMany({select:{name:true}}),
        prisma.localProspect.findMany({select:{sourceKey:true}})
      ]);
      const known=new Set(leads.map(x=>normalizeName(x.name)));
      const shortlistedIds=new Set(shortlisted.map(x=>x.sourceKey));
      return {source:"OpenStreetMap / Overpass",attribution:"© OpenStreetMap contributors (ODbL)",
        evaluation:"Triagem por regras; é necessário investigar antes de propor.",
        candidates:results.map(row=>({
          ...row,alreadyInCrm:known.has(normalizeName(row.name)),alreadyShortlisted:shortlistedIds.has(row.sourceKey)
        }))};
    } catch(error) {
      if(error instanceof Error && error.message==="RATE_LIMIT")return reply.code(429).send({error:"Aguarde 60 segundos entre pesquisas para respeitar o provedor de mapas."});
      app.log.warn({reason:error instanceof Error?error.name:"unknown"},"Discovery provider error");
      return reply.code(502).send({error:"Não foi possível consultar os estabelecimentos agora. Tente novamente mais tarde."});
    }
  });

  app.get("/api/discovery/prospects",async ()=>
    prisma.localProspect.findMany({orderBy:[{createdAt:"desc"}],take:100})
  );

  app.post("/api/discovery/prospects",async (request,reply)=>{
    const validated=CandidateInput.safeParse(request.body);
    if(!validated.success)return reply.code(400).send({error:"Dados da oportunidade inválidos"});
    const data=validated.data;
    const known=await prisma.lead.findMany({select:{name:true}});
    if(known.some(lead=>normalizeName(lead.name)===normalizeName(data.name))) {
      return reply.code(409).send({error:"Esse nome já aparece no CRM atual. Revise antes de criar outra oportunidade."});
    }
    const existing=await prisma.localProspect.findUnique({where:{sourceKey:data.sourceKey}});
    if(existing)return reply.code(409).send({error:"Esse comércio já está na fila de pesquisa."});
    const scored=scoreCandidate({
      shop:data.category==="Moda"?"clothes":undefined,
      website:data.website??undefined,
      "contact:instagram":data.socialListed?"listed":undefined
    } as Record<string,string>);
    // Score and provenance come from the server's triage, never from an agent claiming validated results.
    const prospect=await prisma.localProspect.create({data:{
      sourceKey:data.sourceKey,name:data.name,category:data.category,
      latitude:data.lat,longitude:data.lon,website:data.website,
      socialListed:data.socialListed,priorityScore:data.priorityScore,
      scoreEvidence:data.evidence.join(" | ").slice(0,1500),status:"shortlisted"
    }});
    await prisma.activity.create({data:{kind:"prospect_shortlisted",message:`Pesquisa local: ${prospect.name} adicionado à fila de investigação.`}});
    return reply.code(201).send(prospect);
  });

  app.post<{Params:{id:string}}>("/api/discovery/prospects/:id/draft",async (request,reply)=>{
    const prospect=await prisma.localProspect.findUnique({where:{id:request.params.id}});
    if(!prospect)return reply.code(404).send({error:"Comércio não encontrado"});
    // Never auto-send. Existing pending drafts are returned to avoid duplication.
    const existing=await prisma.approval.findFirst({
      where:{prospectId:prospect.id,status:"pending"},orderBy:{createdAt:"desc"}
    });
    if(existing)return {reused:true,approval:existing,mode:prospect.analysisMode||"unknown"};
    let output:Awaited<ReturnType<typeof assessProspect>>;
    try {
      output=await assessProspect({
        name:prospect.name,category:prospect.category,website:prospect.website,
        socialListed:prospect.socialListed,score:prospect.priorityScore,evidence:prospect.scoreEvidence
      });
    } catch(error) {
      app.log.warn({reason:error instanceof Error?error.name:"unknown"},"Prospect assessment failed");
      return reply.code(502).send({error:"A análise por IA não concluiu. Nenhuma proposta foi gerada. Verifique a chave, o modelo e o limite da API."});
    }
    const saved=await prisma.$transaction(async transaction=>{
      const savedProspect=await transaction.localProspect.update({where:{id:prospect.id},data:{
        analysisMode:output.mode,analysisSummary:output.assessment.rationale
      }});
      const approval=await transaction.approval.create({data:{
        agent:"commercial",kind:"email_draft",title:output.assessment.subject,
        summary:`Proposta de ${output.assessment.service.replaceAll("_"," ")} para ${prospect.name} — verificação manual necessária.`,
        content:output.assessment.body,prospectId:savedProspect.id,status:"pending"
      }});
      await transaction.activity.create({data:{
        kind:"local_proposal_drafted",message:`Rascunho para ${prospect.name} gerado (${output.mode==="ai"?"IA":"regras"}). Não enviado.`
      }});
      return approval;
    });
    return reply.code(201).send({mode:output.mode,assessment:output.assessment,approval:saved});
  });
}
