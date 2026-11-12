export type LeadFromSheet = {
  sourceRow: number;
  name: string;
  type?: string;
  origin?: string;
  channel?: string;
  firstContactAt?: Date;
  status: string;
  answered: boolean;
  reviewAt?: Date;
  decision?: string;
  nextStep?: string;
  notes?: string;
  potentialCents: number;
  closedCents: number;
  referenceUrl?: string;
};

export function parsePtDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(value.trim())) return;
  const [d, m, y] = value.trim().split("/").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  if (date.getUTCDate() !== d || date.getUTCMonth() !== m - 1) return;
  return date;
}

export function parseReaisToCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== "string" || !value.trim()) return 0;
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

export function parseLeadRow(row: unknown[], sourceRow: number): LeadFromSheet | null {
  const cell = (index: number) => String(row[index] ?? "").trim();
  if (!cell(0)) return null;
  return {
    sourceRow,
    name: cell(0),
    type: cell(1) || undefined,
    origin: cell(2) || undefined,
    channel: cell(3) || undefined,
    firstContactAt: parsePtDate(cell(4)),
    status: cell(5) || "Não informado",
    answered: cell(6).toLowerCase() === "sim",
    reviewAt: parsePtDate(cell(7)),
    decision: cell(8) || undefined,
    nextStep: cell(9) || undefined,
    notes: cell(10) || undefined,
    potentialCents: parseReaisToCents(row[11]),
    closedCents: parseReaisToCents(row[12]),
    referenceUrl: /^https:\/\//.test(cell(13)) ? cell(13) : undefined
  };
}

export function summarizeLeads(leads: Array<{status: string; answered: boolean; closedCents: number}>) {
  return {
    records: leads.length,
    responded: leads.filter(lead => lead.answered).length,
    proposals: leads.filter(lead => /proposta enviada/i.test(lead.status)).length,
    closed: leads.filter(lead => /fechado/i.test(lead.status)).length,
    revenueCents: leads.reduce((sum, lead) => sum + lead.closedCents, 0)
  };
}
