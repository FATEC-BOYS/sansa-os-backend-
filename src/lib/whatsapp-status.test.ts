import {test} from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import {createHmac} from "node:crypto";
import type {PrismaClient} from "@prisma/client";
import rawBody from "fastify-raw-body";
import {registerMetaWhatsAppRoutes} from "../routes/meta-whatsapp.js";

test("configuração não comprova webhook e assinatura inválida não cria evidência",async()=>{
  const old={...process.env};
  process.env.META_VERIFY_TOKEN="v".repeat(32);
  process.env.META_APP_SECRET="s".repeat(32);
  process.env.META_WA_PHONE_NUMBER_ID="123456789";
  let latest: {message:string;createdAt:Date}|null=null;
  const prisma={activity:{findFirst:async()=>latest,create:async({data}:{data:{message:string}})=>{latest={message:data.message,createdAt:new Date()};return latest;}}} as unknown as PrismaClient;
  const app=Fastify();
  await app.register(rawBody,{field:"rawBody",global:false,encoding:false,runFirst:true});
  registerMetaWhatsAppRoutes(app,prisma);
  try{
    let status=(await app.inject("/api/whatsapp/status")).json();
    assert.equal(status.webhookReady,true);
    assert.equal(status.lastVerifiedEvent,null);
    const body=JSON.stringify({object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value:{metadata:{phone_number_id:"999"}}}]}]});
    const rejected=await app.inject({method:"POST",url:"/api/webhooks/meta/whatsapp",headers:{"content-type":"application/json"},payload:body});
    assert.equal(rejected.statusCode,401);
    assert.equal(latest,null);
    const signature="sha256="+createHmac("sha256",process.env.META_APP_SECRET).update(body).digest("hex");
    const accepted=await app.inject({method:"POST",url:"/api/webhooks/meta/whatsapp",headers:{"content-type":"application/json","x-hub-signature-256":signature},payload:body});
    assert.equal(accepted.statusCode,200);
    assert.equal(accepted.json().ignored,1);
    status=(await app.inject("/api/whatsapp/status")).json();
    assert.equal(status.lastVerifiedEvent.received,0);
    assert.equal(status.lastVerifiedEvent.ignored,1);
    assert.equal(JSON.stringify(status).includes(process.env.META_APP_SECRET),false);
    assert.equal(status.outboundEnabled,false);
  }finally{await app.close();process.env=old;}
});
