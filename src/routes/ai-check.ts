import type {FastifyInstance} from "fastify";
import {aiFailure,checkOpenAI} from "../lib/ai-check.js";

export function registerAiCheckRoutes(app:FastifyInstance,probe:()=>Promise<void>=checkOpenAI){
  let nextAttempt=0;
  app.get("/api/sales/ai-status",async()=>({
    configured:Boolean(process.env.OPENAI_API_KEY?.trim()),
    model:process.env.OPENAI_MODEL||"gpt-5-mini",
    accessVerified:false
  }));
  app.post("/api/sales/ai-test",async(_request,reply)=>{
    if(!process.env.OPENAI_API_KEY?.trim())return reply.code(503).send({code:"key_missing",error:"Configure OPENAI_API_KEY no backend da Railway."});
    if(Date.now()<nextAttempt)return reply.code(429).send({code:"test_cooldown",error:"Aguarde 30 segundos entre os testes de conexão."});
    nextAttempt=Date.now()+30000;
    try{
      await probe();
      return {ok:true,provider:"openai",model:process.env.OPENAI_MODEL||"gpt-5-mini",verifiedAt:new Date().toISOString()};
    }catch(error){
      const failure=aiFailure(error);
      return reply.code(502).send({code:failure.code,error:failure.message});
    }
  });
}
