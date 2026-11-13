import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyMail,draftMailReply,skipAutomatedMail} from "./zoho-mail.js";
test("classifica pedidos comerciais sem confundir pagamento com negociação",()=>{
  assert.equal(classifyMail("Preciso de um orçamento","landing page"),"proposal");
  assert.equal(classifyMail("Meu boleto","Quero confirmar o pagamento"),"payment");
  assert.equal(classifyMail("Projeto","Quero um site"),"services");
});
test("descadastro não gera mensagem automática",()=>{
  assert.equal(classifyMail("Não envie mais emails",""),"opt_out");
  assert.equal(draftMailReply("opt_out"),null);
});
test("não cria orçamento ou comprovante inventados",()=>{
  assert.doesNotMatch(draftMailReply("proposal")!.body,/R\$\s*\d/);
  assert.doesNotMatch(draftMailReply("payment")!.body,/chave pix:|pagamento confirmado/i);
});
test("não processa respostas do próprio domínio e mensagens de teste",()=>{
  assert.equal(skipAutomatedMail("comercial@sansadigital.com.br","Oi"),true);
  assert.equal(skipAutomatedMail("amigo@exemplo.com","Teste de recebimento — SANSA Oficina Digital"),true);
  assert.equal(skipAutomatedMail("cliente@exemplo.com","Olá, quero orçamento"),false);
});
