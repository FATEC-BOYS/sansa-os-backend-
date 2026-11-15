import {test} from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import {registerAiCheckRoutes} from "../routes/ai-check.js";

test("status não chama o provedor; teste exige chave, limita repetição e não expõe segredos",async()=>{
  const old=process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  let calls=0;
  const app=Fastify();registerAiCheckRoutes(app,async()=>{calls++;});
  try{
    assert.equal((await app.inject('/api/sales/ai-status')).json().accessVerified,false);
    assert.equal(calls,0);
    assert.equal((await app.inject({method:'POST',url:'/api/sales/ai-test'})).statusCode,503);
    process.env.OPENAI_API_KEY="private-test-key";
    const success=await app.inject({method:'POST',url:'/api/sales/ai-test'});
    assert.equal(success.statusCode,200);assert.equal(calls,1);
    assert.ok(!success.body.includes("private-test-key"));
    assert.equal((await app.inject({method:'POST',url:'/api/sales/ai-test'})).statusCode,429);
    assert.equal(calls,1);
  }finally{await app.close();if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test("erros do provedor são traduzidos sem devolver detalhes privados",async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="test-key";
  try{
    for(const [error,code] of [[{status:401},"authentication_failed"],[{status:429,code:"insufficient_quota"},"quota_exceeded"],[{status:429},"rate_limited"],[{status:404},"model_unavailable"],[{name:"APIConnectionTimeoutError"},"timeout"]] as const){
      const app=Fastify();registerAiCheckRoutes(app,async()=>{throw {...error,message:"private provider details"};});
      try{
        const response=await app.inject({method:'POST',url:'/api/sales/ai-test'});
        assert.equal(response.json().code,code);assert.ok(!response.body.includes("private provider details"));
      }finally{await app.close();}
    }
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
