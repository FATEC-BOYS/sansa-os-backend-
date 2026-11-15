import OpenAI from "openai";

export function aiFailure(error:unknown){
  const value=error&&typeof error==="object"?error as {status?:number;code?:string;name?:string}:{};
  if(value.status===401)return {code:"authentication_failed",message:"A OpenAI recusou a chave. Confira OPENAI_API_KEY na Railway."};
  if(value.code==="insufficient_quota")return {code:"quota_exceeded",message:"A OpenAI informou falta de créditos ou limite de gastos atingido. Confira o faturamento da API."};
  if(value.status===429)return {code:"rate_limited",message:"Limite de requisições da OpenAI atingido. Aguarde e tente novamente."};
  if(value.status===404)return {code:"model_unavailable",message:"O modelo configurado não está disponível para essa conta. Confira OPENAI_MODEL."};
  if(value.name?.includes("Timeout"))return {code:"timeout",message:"A OpenAI demorou para responder. Tente novamente mais tarde."};
  return {code:"provider_error",message:"Não foi possível confirmar a conexão com a OpenAI. Tente novamente ou confira a configuração."};
}

export async function checkOpenAI(){
  const client=new OpenAI({timeout:20000,maxRetries:0});
  const response=await client.responses.create({
    model:process.env.OPENAI_MODEL||"gpt-5-mini",
    input:"Teste técnico de conexão da SANSA. Responda apenas: OK.",
    max_output_tokens:128
  });
  if(response.error||response.status==="failed")throw new Error("Provider response failed");
}
