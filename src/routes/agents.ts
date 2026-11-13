import type {FastifyInstance} from "fastify";
import type {PrismaClient} from "@prisma/client";
import {z} from "zod";
import {normalizeName} from "../lib/discovery.js";

const reportSchema=z.object({
  agent:z.enum(["commercial","operations"]),
  runDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status:z.enum(["completed","blocked","failed"]),
  summary:z.string().trim().min(4).max(500),
  processed:z.number().int().min(0).max(100).default(0),
  skipped:z.number().int().min(0).max(500).default(0)
}).strict();

function recent(date:Date|null|undefined) {
  return Boolean(date && Date.now()-date.getTime() <= 7*24*60*60*1000);
}
export function registerAgentRoutes(app:FastifyInstance,prisma:PrismaClient){
  // Internal service-to-service routes. Existing x-api-key is required.
  // CRM remains source of truth; when unavailable or stale, do not approach anyone.
  app.get("/api/agents/work-items",async ()=>{
    const lastSync=await prisma.activity.findFirst({
      where:{kind:"crm_synced"},orderBy:{createdAt:"desc"}
    });
    if(!recent(lastSync?.createdAt)){
      return {crmReady:false,reason:"CRM não conectado ou última leitura tem mais de 7 dias",candidates:[]};
    }
    const [leads,prospects]=await Promise.all([
      prisma.lead.findMany({select:{name:true,status:true,decision:true},take:2000}),
      prisma.localProspect.findMany({
        where:{
          status:"shortlisted",
          OR:[{contactEmail:{not:null}},{contactWhatsapp:{not:null}}],
          approvals:{none:{}}
        },
        orderBy:[{priorityScore:"desc"},{createdAt:"asc"}],
        take:100
      })
    ]);
    // Conservative deduplication: don't contact an establishment that exists in the CRM,
    // even when its status looks favorable. Manual review can resolve ambiguous matches.
    const knownNames=new Set(leads.map(lead=>normalizeName(lead.name)));
    const candidates=prospects
      .filter(p=>!knownNames.has(normalizeName(p.name)))
      .filter(p=>p.priorityScore>=40)
      .slice(0,10)
      .map(p=>({
        id:p.id,name:p.name,category:p.category,
        priorityScore:p.priorityScore,
        channel:p.contactEmail?"email" as const:"whatsapp" as const
      }));
    return {crmReady:true,reason:null,candidates};
  });

  app.post("/api/agents/run-report",async(request,reply)=>{
    const parsed=reportSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:"Relatório de agente inválido"});
    const data=parsed.data;
    // One status record per agent and local calendar day.
    const run=await prisma.agentRun.upsert({
      where:{agent_runDate:{agent:data.agent,runDate:data.runDate}},
      create:data,update:{status:data.status,summary:data.summary,processed:data.processed,skipped:data.skipped}
    });
    await prisma.activity.create({data:{
      kind:"agent_run",
      message:`Agente ${data.agent==="commercial"?"Comercial":"Operações"}: ${data.status}. ${data.summary}`.slice(0,500)
    }});
    return reply.code(201).send({
      id:run.id,agent:run.agent,runDate:run.runDate,
      status:run.status,processed:run.processed,skipped:run.skipped
    });
  });

  app.get("/api/agents/runs",async()=>
    prisma.agentRun.findMany({orderBy:{updatedAt:"desc"},take:30})
  );
}
