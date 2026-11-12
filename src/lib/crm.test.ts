import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLeadRow, parsePtDate, parseReaisToCents, summarizeLeads } from "./crm.js";

test("converte reais brasileiros sem arredondamento incorreto", () => {
  assert.equal(parseReaisToCents("R$ 1.500,50"), 150050);
  assert.equal(parseReaisToCents(""), 0);
});
test("valida datas brasileiras e rejeita datas inválidas", () => {
  assert.equal(parsePtDate("31/02/2026"), undefined);
  assert.equal(parsePtDate("12/11/2026")?.getUTCDate(), 12);
});
test("lê uma linha do CRM sem guardar dados de contato", () => {
  const row = ["Empresa exemplo", "Agência", "Parcerias", "E-mail", "12/11/2026", "Proposta enviada", "Sim", "", "Acompanhar", "", "", "R$ 500,00", "", "https://example.com", "email@example.com"];
  const parsed = parseLeadRow(row, 7);
  assert.equal(parsed?.sourceRow, 7);
  assert.equal(parsed?.answered, true);
  assert.equal(parsed?.potentialCents, 50000);
  assert.equal(JSON.stringify(parsed).includes("email@example.com"), false);
});
test("não confunde faturamento estimado com fechado", () => {
  const summary = summarizeLeads([{status:"Proposta enviada",answered:true,closedCents:0}]);
  assert.equal(summary.proposals, 1);
  assert.equal(summary.revenueCents, 0);
});
