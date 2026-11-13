export type WhatsAppStage="identifier"|"validator"|"service"|"sales"|"after_service"|"human_handoff";
export type WhatsAppIntent="opt_out"|"payment"|"existing_client"|"proposal"|"pricing"|"services"|"human"|"unknown";
export type WhatsAppContext={stage:WhatsAppStage;validationStatus:"unverified"|"pending"|"verified";optedOut:boolean};

export type RouteDecision={
  agent:WhatsAppStage;
  stage:WhatsAppStage;
  intent:WhatsAppIntent;
  needsHuman:boolean;
  draft:string|null;
  optedOut:boolean;
  statusNote:string;
};

export function classifyIntent(input:string):WhatsAppIntent{
  const t=input.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  if(/\b(parar|sair|descadastrar|nao me contate|nao envie|remover contato|stop|cancelar mensagens)\b/.test(t))return "opt_out";
  if(/\b(humano|atendente|pessoa|falar com alguem|reclamacao|urgente)\b/.test(t))return "human";
  if(/\b(pix|boleto|cobranca|pagamento|nota fiscal|fatura|reembolso|cartao|dados bancarios)\b/.test(t))return "payment";
  if(/\b(sou cliente|ja sou cliente|meu pedido|meu projeto|contrato assinado|acompanhar projeto)\b/.test(t))return "existing_client";
  if(/\b(proposta|orcamento enviado|aprovacao|assinar contrato)\b/.test(t))return "proposal";
  if(/\b(preco|valor|orcamento|quanto custa|parcelamento|desconto|fechar|contratar)\b/.test(t))return "pricing";
  if(/\b(site|landing page|loja virtual|design|identidade visual|logotipo|branding|portfolio|servicos|social media|criar marca)\b/.test(t))return "services";
  return "unknown";
}
export function routeWhatsAppMessage(ctx:WhatsAppContext,text:string):RouteDecision{
  const intent=classifyIntent(text);
  if(ctx.optedOut||intent==="opt_out")return {
    agent:"identifier",stage:"human_handoff",intent:"opt_out",needsHuman:false,
    draft:null,optedOut:true,statusNote:"Pedido de não contato; bloquear follow-ups e campanhas."
  };
  if(intent==="human")return {
    agent:"identifier",stage:"human_handoff",intent,needsHuman:true,optedOut:false,
    draft:"Claro! Vou encaminhar sua mensagem para a equipe da SANSA.",statusNote:"Transferência humana solicitada."
  };
  if(intent==="payment")return {
    agent:"after_service",stage:"human_handoff",intent,needsHuman:true,optedOut:false,
    draft:"Para conferir pagamentos ou documentos com segurança, nossa equipe precisa verificar a referência do seu pedido ou proposta. Não envie senhas, códigos de banco ou dados de cartão por aqui.",
    statusNote:"Cobrança ou Pix exige fonte financeira autorizada, revisão e verificação de titularidade."
  };
  if(intent==="existing_client")return {
    agent:"validator",stage:"validator",intent,needsHuman:true,optedOut:false,
    draft:"Posso te ajudar com seu projeto. Você tem o código de referência da proposta ou do projeto da SANSA? A equipe vai conferir nos nossos registros antes de compartilhar informações restritas. Não precisamos do CPF completo.",
    statusNote:"Não considerar identidade verificada pelo número do WhatsApp. A conferência requer registro oficial."
  };
  if(ctx.stage==="validator" && ctx.validationStatus!=="verified"){
    return {agent:"validator",stage:"validator",intent,needsHuman:true,optedOut:false,
      draft:"Obrigada! Vou pedir à equipe que confirme sua referência nos registros da SANSA. Até lá, posso explicar nossos serviços, mas não acessar dados de contrato ou cobrança.",
      statusNote:"Validação ainda não foi concluída e requer checagem independente."};
  }
  if(intent==="pricing"||intent==="proposal")return {
    agent:"sales",stage:"sales",intent,needsHuman:true,optedOut:false,
    draft:"Que bom! Para preparar uma proposta adequada, você pode me contar qual serviço precisa, o objetivo do projeto e se tem uma data desejada? Os valores e condições serão confirmados pela equipe.",
    statusNote:"Sem preço, desconto, garantia de resultado, contrato ou fechamento automático."
  };
  if(ctx.validationStatus==="verified"&&ctx.stage==="after_service")return {
    agent:"after_service",stage:"after_service",intent,needsHuman:true,optedOut:false,
    draft:"Entendi. Vou registrar sua dúvida para a equipe conferir o histórico do projeto e retornar com a informação correta.",
    statusNote:"Pós-atendimento sujeito à verificação das fontes; documentos e pagamentos são manuais."};
  }
  return {
    agent:"service",stage:"service",intent,needsHuman:false,optedOut:false,
    draft:"Olá! Sou a assistente digital da SANSA Oficina Digital. Trabalhamos com sites e landing pages, identidade visual e experiências digitais. O que você gostaria de criar ou melhorar? Se preferir, posso encaminhar sua conversa para uma pessoa da equipe.",
    statusNote:"Apresentação geral de serviços; não confirmar identidade nem necessidade sem evidência."
  };
}
