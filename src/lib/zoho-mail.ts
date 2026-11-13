export type MailCategory="services"|"proposal"|"existing_client"|"payment"|"human"|"opt_out"|"general";

export function classifyMail(subject:string,preview:string):MailCategory {
  const text=(subject+" "+preview.slice(0,500)).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(/\b(parar envios|remover meu email|descadastrar|nao envie|opt.?out|unsubscribe)\b/.test(text))return "opt_out";
  if(/\b(pix|boleto|fatura|pagamento|nota fiscal|comprovante|reembolso)\b/.test(text))return "payment";
  if(/\b(meu projeto|sou cliente|ja sou cliente|suporte|atualizacao do site|erro no site)\b/.test(text))return "existing_client";
  if(/\b(proposta|orcamento|contratar|preco|precos|valores|valor|desconto|parcelar)\b/.test(text))return "proposal";
  if(/\b(falar com voce|atendente|reclamacao|urgente|pessoa responsavel)\b/.test(text))return "human";
  if(/\b(landing page|site|identidade visual|design|branding|logo|portfolio|servicos|ui.ux)\b/.test(text))return "services";
  return "general";
}

export function skipAutomatedMail(from:string,subject:string):boolean{
  const f=from.toLowerCase().trim();
  const s=subject.toLowerCase();
  return !f.includes("@") ||
    f.endsWith("@sansadigital.com.br") ||
    /(^|[.@\-_])(no.?reply|noreply|mailer.daemon|postmaster)([.@\-_]|$)/i.test(f) ||
    /teste de recebimento.*sansa oficina digital/i.test(s) ||
    /delivery status notification|undeliverable|falha na entrega/i.test(s);
}

export function draftMailReply(category:MailCategory):{agent:string;body:string}|null{
  if(category==="opt_out")return null;
  const intro="Olá! Tudo bem?\n\nObrigada pelo contato com a SANSA Oficina Digital. ";
  const signature="\n\nAtenciosamente,\nEquipe SANSA Oficina Digital\nhttps://sansadigital.com.br/";
  if(category==="payment")return {agent:"after_service",body:intro+"Para informações sobre pagamentos ou documentos, nossa equipe precisa conferir a referência da proposta ou projeto e os registros financeiros antes de orientar. Não compartilhe dados bancários ou códigos de segurança por e-mail."+signature};
  if(category==="existing_client")return {agent:"customer_success",body:intro+"Para acompanhar seu projeto, você pode informar a referência da proposta ou projeto? Nossa equipe verificará os registros antes de compartilhar informações específicas."+signature};
  if(category==="proposal")return {agent:"commercial",body:intro+"Podemos conversar sobre seu projeto! Você poderia compartilhar o objetivo, as entregas desejadas e o prazo ideal? Assim preparamos uma proposta personalizada, com condições confirmadas pela equipe."+signature};
  if(category==="services")return {agent:"service",body:intro+"Trabalhamos com sites, landing pages, identidade visual e experiências digitais. Conta um pouco sobre seu negócio e o que gostaria de criar ou melhorar? Você pode conhecer nossos projetos em https://sansadigital.com.br/."+signature};
  if(category==="human")return {agent:"operations",body:intro+"Vamos encaminhar sua mensagem para uma pessoa da equipe, que poderá verificar os detalhes e retornar com as informações corretas."+signature};
  return {agent:"service",body:intro+"Recebemos sua mensagem. Você poderia nos contar um pouco mais sobre o que precisa? Se preferir, podemos encaminhar para a equipe responsável."+signature};
}
