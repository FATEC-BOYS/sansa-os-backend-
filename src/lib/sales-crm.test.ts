import {test} from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type {PrismaClient} from "@prisma/client";
import {registerSalesRoutes} from "../routes/sales.js";

test("proposta usa nome autoritativo do CRM e guarda o vínculo sem modificar o contato",async()=>{
  let saved:Record<string,unknown>|undefined;
  const tx={approval:{create:async({data}:{data:Record<string,unknown>})=>{saved=data;return data;}},activity:{create:async()=>({})}};
  const prisma={lead:{findUnique:async({where}:{where:{id:string}})=>where.id==="existing"?{id:"existing",name:"Nome do CRM",type:null,status:"Contato",nextStep:null}:null},$transaction:async(fn:(value:typeof tx)=>Promise<unknown>)=>fn(tx)} as unknown as PrismaClient;
  const app=Fastify();registerSalesRoutes(app,prisma);
  const input={objectiveConfirmed:true,clientName:"Nome adulterado",service:"landing_page",package:"essencial",goal:"Apresentar serviços e receber contatos.",leadId:"existing"};
  try{
    const response=await app.inject({method:"POST",url:"/api/sales/proposal-drafts",payload:input});
    assert.equal(response.statusCode,201);
    assert.equal(saved?.leadId,"existing");
    assert.ok(String(saved?.content).includes("Para: Nome do CRM"));
    assert.ok(!String(saved?.content).includes("Nome adulterado"));
    saved=undefined;
    const missing=await app.inject({method:"POST",url:"/api/sales/proposal-drafts",payload:{...input,leadId:"missing"}});
    assert.equal(missing.statusCode,404);assert.equal(saved,undefined);
    const manual=await app.inject({method:"POST",url:"/api/sales/proposal-drafts",payload:{...input,leadId:undefined}});
    assert.equal(manual.statusCode,201);
  }finally{await app.close();}
});
