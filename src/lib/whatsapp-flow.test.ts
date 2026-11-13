import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyIntent,routeWhatsAppMessage} from "./whatsapp-flow.js";
import {createHmac} from "node:crypto";
import {verifyMetaSignature,constantTimeStringMatch} from "./whatsapp-security.js";
const ctx={stage:"identifier" as const,validationStatus:"unverified" as const,optedOut:false};
test("Identificador envia dúvidas de site para atendimento, não valida por telefone",()=>{
  const d=routeWhatsAppMessage(ctx,"Quero criar um site");
  assert.equal(d.stage,"service");assert.equal(d.needsHuman,false);
});
test("Validador não confunde referência citada com confirmação",()=>{
  const d=routeWhatsAppMessage(ctx,"Já sou cliente, meu projeto está atrasado");
  assert.equal(d.stage,"validator");assert.equal(d.needsHuman,true);
  assert.match(d.draft||"",/não precisamos do CPF completo/i);
});
test("Negociação não inventa valores ou contratos",()=>{
  const d=routeWhatsAppMessage(ctx,"Quanto custa uma landing page?");
  assert.equal(d.stage,"sales");assert.equal(d.needsHuman,true);
  assert.match(d.draft||"",/valores e condições serão confirmados/);
});
test("Pix ou boleto obrigatoriamente encaminha para humano",()=>{
  const d=routeWhatsAppMessage(ctx,"Quero meu pix e boleto");
  assert.equal(d.stage,"human_handoff");assert.equal(d.agent,"after_service");
  assert.equal(d.needsHuman,true);
  assert.equal(/chave pix:/i.test(d.draft||""),false);
});
test("Opt-out bloqueia resposta automática",()=>{
  assert.equal(classifyIntent("Não envie mais mensagens"),"opt_out");
  const d=routeWhatsAppMessage(ctx,"Não envie mais mensagens");
  assert.equal(d.optedOut,true);assert.equal(d.draft,null);
});
test("Webhook: assinatura HMAC de corpo ORIGINAL verificada",()=>{
  const raw=Buffer.from('{"object":"whatsapp_business_account"}');
  const secret="test-secret";
  const sig="sha256="+createHmac("sha256",secret).update(raw).digest("hex");
  assert.equal(verifyMetaSignature(raw,sig,secret),true);
  assert.equal(verifyMetaSignature(Buffer.from("{}", "utf8"),sig,secret),false);
  assert.equal(verifyMetaSignature(raw,"sha256=not-a-signature",secret),false);
  assert.equal(constantTimeStringMatch("verify-123","verify-123"),true);
  assert.equal(constantTimeStringMatch("verify-123","verify-124"),false);
});
