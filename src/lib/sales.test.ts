import {test} from "node:test";
import assert from "node:assert/strict";
import {ProposalInput,NegotiationInput,buildProposal,buildNegotiation} from "./sales.js";

const draft={clientName:"Ateliê do Bairro",service:"landing_page" as const,package:"essencial" as const,
  goal:"Divulgar uma coleção especial para novos clientes."};
test("não cria preços nem condições sem dados aprovados",()=>{
  const p=buildProposal(ProposalInput.parse(draft));
  assert.ok(p.content.includes("INVESTIMENTO: a definir"));
  assert.ok(p.content.includes("PRAZO: a confirmar"));
  assert.ok(p.content.includes("CONDIÇÕES DE PAGAMENTO: a combinar"));
});
test("preço só é apresentado se informado em centavos",()=>{
  const p=buildProposal(ProposalInput.parse({...draft,priceCents:345000}));
  assert.ok(p.content.includes("R$ 3.450,00")||p.content.includes("R$ 3.450,00"));
  assert.equal(ProposalInput.safeParse({...draft,priceCents:-100}).success,false);
});
test("escopo personalizado não altera preço automaticamente",()=>{
  const p=buildProposal(ProposalInput.parse({...draft,customScope:"Formulário de interesse",priceCents:null}));
  assert.ok(p.content.includes("Formulário de interesse"));
  assert.ok(p.content.includes("a definir"));
});
test("objeções de preço não produzem desconto nem Pix",()=>{
  const p=buildNegotiation(NegotiationInput.parse({
    clientName:"Loja do Centro",objection:"price",context:"O cliente achou o preço elevado"
  }));
  assert.ok(p.content.includes("revisar as prioridades"));
  assert.equal(p.content.includes("10% de desconto"),false);
  assert.equal(p.content.includes("chave Pix"),false);
});
