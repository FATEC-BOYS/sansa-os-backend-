import {z} from "zod";
import {ProposalInput,services} from "./sales.js";
import {generateProposal,type CrmContext} from "./sales-ai.js";

type Input=z.infer<typeof ProposalInput>;
export function hasConfirmedObjective(input:Input){
  return input.objectiveConfirmed&&input.goal.length>=10&&!/não sei|nao sei|peguei do crm|não informado|a definir/i.test(input.goal);
}
export async function prepareSalesDraft(input:Input,context?:CrmContext,generate=generateProposal){
  // Whitelist bounded context; full notes, contact data and financial estimates never enter the AI request.
  const safe=context?{type:context.type?.slice(0,120)??null,status:context.status.slice(0,120),nextStep:context.nextStep?.slice(0,500)??null}:undefined;
  if(hasConfirmedObjective(input))return {...await generate(input,undefined,safe),kind:"commercial_proposal"};
  const service=services.find(item=>item.id===input.service)!.name;
  return {
    kind:"briefing",
    title:`Briefing · ${input.clientName}`,
    summary:"Objetivo ainda não confirmado. Perguntas preparadas por regras para revisão; nenhuma proposta criada.",
    content:[
      "SANSA | BRIEFING — MATERIAL INTERNO PARA REVISÃO",
      `Contato: ${input.clientName}`,
      `Serviço selecionado pela SANSA (não confirmado pelo cliente): ${service}`,
      ...(safe?[`Tipo no CRM: ${safe.type||"não informado"}`,`Etapa no CRM: ${safe.status}`,`Próximo passo interno: ${safe.nextStep||"não informado"}`]:[]),
      "",
      "Não há objetivo confirmado suficiente para uma proposta. Cadastro, estimativas e observações do CRM não comprovam demanda ou aceite.",
      "",
      "PERGUNTAS PARA ADAPTAR ANTES DE CONTATAR",
      "1. Há alguma demanda de design ou desenvolvimento em andamento? O que vocês precisam resolver ou comunicar?",
      `2. O serviço ${service.toLowerCase()} faz sentido para essa necessidade, ou a prioridade é outra?`,
      "3. Quem é o público e qual ação vocês esperam que ele realize?",
      "4. Quais materiais, páginas ou funcionalidades já foram definidos?",
      "5. Já existem textos, imagens e identidade visual disponíveis?",
      "6. Existe uma data desejada e uma faixa de investimento para avaliar a viabilidade?",
      "7. Quem será responsável por aprovar o projeto?",
      "",
      "PRÓXIMO PASSO INTERNO",
      "Registrar as respostas, confirmar o objetivo no formulário e somente então preparar a proposta. Revisar o canal e as orientações do CRM antes de qualquer contato. Nada foi enviado."
    ].join("\n")
  };
}
