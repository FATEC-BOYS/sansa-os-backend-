import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeBrazilianWhatsApp,normalizeEmail,validateContacts} from "./contacts.js";

test("aceita DDD brasileiro com/sem DDI e mantém formato E.164",()=>{
  assert.equal(normalizeBrazilianWhatsApp("(11) 99999-9999"),"+5511999999999");
  assert.equal(normalizeBrazilianWhatsApp("+55 11 99999-9999"),"+5511999999999");
  assert.equal(normalizeBrazilianWhatsApp("11 3333-3333"),"+551133333333");
});
test("valida telefone e impede URLs maliciosas",()=>{
  for(const item of ["javascript:alert(1)","https://example.com","000","55 00 99999 9999"]){
    assert.throws(()=>normalizeBrazilianWhatsApp(item),/INVALID_WHATSAPP/);
  }
});
test("permite atualizar ambos, apenas um ou limpar",()=>{
  assert.deepEqual(validateContacts({email:"comercial@example.com",whatsapp:"11999999999"}),{
    contactEmail:"comercial@example.com",contactWhatsapp:"+5511999999999"
  });
  assert.deepEqual(validateContacts({email:""}),{contactEmail:null});
  assert.deepEqual(validateContacts({whatsapp:null}),{contactWhatsapp:null});
  assert.deepEqual(validateContacts({email:"vendas@example.com"}),{contactEmail:"vendas@example.com"});
  assert.throws(()=>validateContacts({}));
});
test("rejeita e-mails inválidos",()=>{
  assert.equal(normalizeEmail("contato@example.com"),"contato@example.com");
  assert.throws(()=>validateContacts({email:"sem-email"}),/INVALID_EMAIL/);
});
