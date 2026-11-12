import "dotenv/config";
import Fastify from "fastify";
import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { agents } from "./lib/agents.js";
import { parseLeadRow, summarizeLeads } from "./lib/crm.js";
import { registerDiscoveryRoutes } from "./routes/discovery.js";

const prisma = new PrismaClient();
const app = Fastify({logger: true});
const key = process.env.INTERNAL_API_KEY ?? "";

function validSecret(candidate: unknown): boolean {
  if (typeof candidate !== "string" || key.length < 24) return false;
  const expected = Buffer.from(key);
  const provided = Buffer.from(candidate);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health") return;
  if (!key || key.length < 24 || key === "replace-with-a-long-random-secret") {
    return reply.code(503).send({error: "INTERNAL_API_KEY not configured securely"});
  }
  if (!validSecret(request.headers["x-api-key"])) {
    return reply.code(401).send({error: "Unauthorized"});
  }
});

app.get("/health", async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {ok: true, service: "sansa-os-backend", database: "connected"};
  } catch {
    return reply.code(503).send({ok: false, service: "sansa-os-backend", database: "disconnected"});
  }
});

app.get("/api/overview", async () => {
  const [leads, approvals, activities] = await Promise.all([
    prisma.lead.findMany({orderBy: {updatedAt: "desc"}, take: 200}),
    prisma.approval.findMany({orderBy: {createdAt: "desc"}, take: 50}),
    prisma.activity.findMany({orderBy: {createdAt: "desc"}, take: 20})
  ]);
  const latestSync = await prisma.activity.findFirst({where: {kind: "crm_synced"},orderBy: {createdAt: "desc"}});
  return {
    metrics: summarizeLeads(leads),
    crm: {connected: Boolean(latestSync), lastSyncedAt: latestSync?.createdAt ?? null, source: "Google Sheets · Prospeccao", count: leads.length},
    agents,
    leads,
    approvals,
    activities,
    externalAutomations: {managedHere: false, status: "not_integrated"}
  };
});

app.get("/api/leads", async () =>
  prisma.lead.findMany({orderBy: {updatedAt: "desc"},take: 200})
);

app.get("/api/approvals", async () =>
  prisma.approval.findMany({orderBy: {createdAt: "desc"},take: 100})
);

const newDraft = z.object({
  agent: z.enum(["commercial", "customer_success", "creative", "projects", "finance", "operations"]),
  kind: z.enum(["email_draft", "followup_draft", "briefing", "internal_note", "project_task"]),
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(5).max(500),
  content: z.string().trim().min(1).max(20000),
  leadId: z.string().optional()
});

app.post("/api/approvals", async (request, reply) => {
  const result = newDraft.safeParse(request.body);
  if (!result.success) return reply.code(400).send({error: result.error.flatten()});
  if (result.data.leadId && !await prisma.lead.findUnique({where: {id: result.data.leadId}})) {
    return reply.code(404).send({error: "Lead not found"});
  }
  const approval = await prisma.approval.create({data: {...result.data,status: "pending"}});
  await prisma.activity.create({data: {kind: "draft_created",message: `Rascunho criado: ${approval.title}`}});
  return reply.code(201).send(approval);
});

app.patch<{Params:{id:string}}>("/api/approvals/:id", async (request, reply) => {
  const result = z.object({status: z.enum(["approved","rejected"])}).safeParse(request.body);
  if (!result.success) return reply.code(400).send({error: result.error.flatten()});
  const changed = await prisma.approval.updateMany({
    where: {id: request.params.id,status: "pending"},
    data: {status: result.data.status,reviewedAt: new Date()}
  });
  if (changed.count === 0) return reply.code(409).send({error:"Action not pending or not found"});
  const approval = await prisma.approval.findUniqueOrThrow({where:{id:request.params.id}});
  await prisma.activity.create({data:{
    kind:"approval_reviewed",
    message:`Rascunho ${result.data.status === "approved" ? "aprovado" : "rejeitado"}: ${approval.title}. Nenhuma ação externa executada.`
  }});
  return approval;
});

app.post("/api/crm/sync", async (_request, reply) => {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!spreadsheetId || !credentialPath) {
    return reply.code(503).send({error:"CRM integration not configured. Set GOOGLE_SHEET_ID and GOOGLE_APPLICATION_CREDENTIALS."});
  }
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialPath, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });
    const sheets = google.sheets({version:"v4",auth});
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,range: "'Prospeccao'!A7:O500"
    });
    const rows = response.data.values ?? [];
    const parsed = rows.map((row, index) => parseLeadRow(row, index + 7)).filter((lead): lead is NonNullable<typeof lead> => lead !== null);
    for (const lead of parsed) {
      await prisma.lead.upsert({
        where: {sourceRow:lead.sourceRow},
        update:lead,
        create:lead
      });
    }
    const activity = await prisma.activity.create({data:{
      kind: "crm_synced",
      message: `CRM sincronizado manualmente: ${parsed.length} registros lidos; planilha não modificada.`
    }});
    return {ok:true,readRows:parsed.length,lastSyncedAt:activity.createdAt};
  } catch (error) {
    requestErrorLog(error);
    return reply.code(502).send({error:"CRM sync failed. Review credentials, permissions and logs."});
  }
});

function requestErrorLog(error: unknown) {
  // Evite registrar objetos de credenciais ou tokens; somente uma descrição genérica.
  app.log.error({errorType: error instanceof Error ? error.name : "Unknown"}, "CRM sync failed");
}

registerDiscoveryRoutes(app,prisma);

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "127.0.0.1";
app.listen({port,host}).catch(error => {
  app.log.error(error);
  process.exit(1);
});

for (const signal of ["SIGINT","SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
