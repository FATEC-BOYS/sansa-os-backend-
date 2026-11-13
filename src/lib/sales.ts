import {z} from "zod";

export const serviceIds=["landing_page","site_institucional","identidade_visual","ux_ui","site_redesign"] as const;
export const packages=["essencial","completo","sob_medida"] as const;
export type ServiceId=typeof serviceIds[number];
export type PackageKey=typeof packages[number];
type Service={id:ServiceId;name:string;shortDescription:string;packages:Record<PackageKey,{label:string;deliverables:string[];note:string}>};

export const services:Service[]=[
  {id:"landing_page",name:"Landing page",shortDescription:"Página direcionada a uma campanha, produto ou conversão.",packages:{
    essencial:{label:"Essencial",deliverables:["Estrutura de uma página responsiva","Design visual alinhado à identidade","CTA para contato ou conversão"],note:"Para uma ação com objetivo principal claro"},
    completo:{label:"Completo",deliverables:["Briefing e estrutura de seções","Design responsivo personalizado","Implementação da landing page","Integração de CTA e formulário, conforme escopo"],note:"Para campanhas com mais elementos"},
    sob_medida:{label:"Sob medida",deliverables:["Diagnóstico de objetivos","Proposta de experiência digital personalizada","Entregas e integrações definidas em conjunto"],note:"Complexidade a levantar antes de precificar"}
  }},
  {id:"site_institucional",name:"Site institucional",shortDescription:"Presença digital com páginas, conteúdo e identidade do negócio.",packages:{
    essencial:{label:"Essencial",deliverables:["Arquitetura simples de conteúdo","Layout responsivo","Páginas principais definidas no briefing"],note:"Site de apresentação inicial"},
    completo:{label:"Completo",deliverables:["Planejamento da arquitetura de informação","Design de páginas responsivas","Implementação do site","Formulário ou contato conforme escopo"],note:"Site para apresentar serviços com clareza"},
    sob_medida:{label:"Sob medida",deliverables:["Descoberta de requisitos","Design e desenvolvimento personalizados","Integrações a confirmar no diagnóstico"],note:"Requisitos técnicos demandam orçamento específico"}
  }},
  {id:"identidade_visual",name:"Identidade visual",shortDescription:"Sistema de marca e aplicações visuais.",packages:{
    essencial:{label:"Essencial",deliverables:["Direção visual de marca","Marca ou assinatura gráfica conforme briefing","Paleta e recomendações tipográficas"],note:"Construção visual inicial"},
    completo:{label:"Completo",deliverables:["Pesquisa e direção criativa","Sistema de identidade visual","Aplicações prioritárias","Guia básico de uso"],note:"Marca com aplicações consistentes"},
    sob_medida:{label:"Sob medida",deliverables:["Descoberta de posicionamento","Sistema visual com aplicações específicas","Manual e desdobramentos definidos no projeto"],note:"Escopo e complexidade serão personalizados"}
  }},
  {id:"ux_ui",name:"UI/UX",shortDescription:"Interfaces e experiência para produtos digitais.",packages:{
    essencial:{label:"Essencial",deliverables:["Mapeamento da interface-alvo","Proposta de telas prioritárias","Protótipo navegável conforme escopo"],note:"Projeto com fluxo bem delimitado"},
    completo:{label:"Completo",deliverables:["Levantamento de fluxos e requisitos","Wireframes e interface visual","Protótipo de alta fidelidade","Handoff de design"],note:"Experiência digital de múltiplas etapas"},
    sob_medida:{label:"Sob medida",deliverables:["Descoberta e análise de fluxos","Experiência digital customizada","Componentes e entregas conforme escopo aprovado"],note:"Pesquisa ou testes dependem de escopo"}
  }},
  {id:"site_redesign",name:"Redesign de site",shortDescription:"Evolução da experiência visual e funcional de um site existente.",packages:{
    essencial:{label:"Essencial",deliverables:["Diagnóstico inicial com autorização","Nova direção de interface","Redesign de páginas priorizadas"],note:"Atualização focalizada"},
    completo:{label:"Completo",deliverables:["Levantamento de objetivos e conteúdo","Redesign responsivo de páginas definidas","Implementação conforme requisitos","Ajustes de experiência"],note:"Modernização visual e técnica"},
    sob_medida:{label:"Sob medida",deliverables:["Auditoria técnica quando autorizada","Redesign e reconstrução personalizados","Integrações e migração sob análise"],note:"Orçamento depende do levantamento"}
  }}
];
export const ProposalInput=z.object({
  clientName:z.string().trim().min(2).max(140),
  service:z.enum(serviceIds),package:z.enum(packages),
  goal:z.string().trim().min(10).max(800),
  customScope:z.string().trim().max(1400).optional().default(""),
  priceCents:z.number().int().min(100).max(100000000).nullable().default(null),
  timeline:z.string().trim().max(300).optional().default(""),
  paymentTerms:z.string().trim().max(300).optional().default(""),
  dependencies:z.string().trim().max(500).optional().default("")
}).strict();
export const NegotiationInput=z.object({
  clientName:z.string().trim().min(2).max(140),
  objection:z.enum(["price","timeline","scope","competitor","payment","followup"]),
  context:z.string().trim().min(4).max(1200),
  agreedTerms:z.string().trim().max(400).optional().default("")
}).strict();

function formatMoney(cents:number){return (cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
export function buildProposal(input:z.infer<typeof ProposalInput>):{title:string;summary:string;content:string}{
  const service=services.find(item=>item.id===input.service)!;
  const version=service.packages[input.package];
  const content=[
    "SANSA OFICINA DIGITAL | PROPOSTA COMERCIAL",
    `Para: ${input.clientName}`,
    `Serviço: ${service.name} — ${version.label}`,
    "",
    "OBJETIVO DO PROJETO",
    input.goal,
    "",
    "ESCOPO PRELIMINAR (A CONFIRMAR COM O CLIENTE)",
    ...version.deliverables.map(item=>`• ${item}`),
    ...(input.customScope?["","Personalizações solicitadas:",input.customScope]:[]),
    "",
    `INVESTIMENTO: ${input.priceCents!==null?formatMoney(input.priceCents)+" (valor proposto para aprovação)":"a definir após alinhamento de escopo"}`,
    `PRAZO: ${input.timeline||"a confirmar após análise de agenda e requisitos"}`,
    `CONDIÇÕES DE PAGAMENTO: ${input.paymentTerms||"a combinar, sem cobrança emitida"}`,
    `DEPENDÊNCIAS E EXCLUSÕES: ${input.dependencies||"a definir no escopo final; hospedagem, conteúdo, integrações e revisões devem ser conferidos"}`,
    "",
    "PRÓXIMOS PASSOS",
    "Validar escopo, investimento, etapas e condições com a SANSA; então formalizar contrato e início do projeto.",
    "",
    "Esta é uma proposta preliminar para revisão. Não constitui contrato assinado nem confirmação de pagamento.",
    "SANSA Oficina Digital — https://sansadigital.com.br/"
  ].join("\n");
  return {
    title:`Proposta · ${service.name} · ${input.clientName}`,
    summary:`${service.name} / ${version.label} — ${input.priceCents===null?"sem preço definido":formatMoney(input.priceCents)}; confirmar condições antes de apresentar.`,
    content
  };
}
const replies:Record<z.infer<typeof NegotiationInput>["objection"],{title:string;body:string}>={
  price:{title:"Objeção de investimento",body:"Entendo a preocupação com o investimento. Podemos revisar as prioridades e propor uma primeira etapa com menos entregáveis, preservando a qualidade. O valor de cada alternativa será confirmado antes de qualquer compromisso."},
  timeline:{title:"Objeção de prazo",body:"Entendo que o prazo é importante. Vou revisar os requisitos e a disponibilidade antes de confirmar uma data. Podemos avaliar uma entrega em etapas, se isso atender ao objetivo."},
  scope:{title:"Mudanças de escopo",body:"Podemos incluir essa necessidade no planejamento, mas precisamos avaliar impacto no escopo, nas entregas, no preço e no prazo antes de confirmar as condições."},
  competitor:{title:"Comparação com outra proposta",body:"Faz sentido comparar alternativas. Posso detalhar exatamente o que está incluído em nossa proposta, as entregas e as condições, para que vocês decidam com clareza, sem desqualificar o trabalho de outros fornecedores."},
  payment:{title:"Condições de pagamento",body:"Podemos conversar sobre etapas de pagamento vinculadas às entregas, mas qualquer condição precisa de aprovação e formalização antes da cobrança. Posso registrar sua preferência para avaliarmos?"},
  followup:{title:"Acompanhamento de proposta",body:"Queria saber se vocês tiveram oportunidade de avaliar nossa proposta. Se surgir alguma dúvida sobre escopo ou entregas, posso esclarecer. Se não for prioridade agora, tudo bem."}
};
export function buildNegotiation(input:z.infer<typeof NegotiationInput>):{title:string;summary:string;content:string}{
  const reply=replies[input.objection];
  return {
    title:`Negociação · ${reply.title} · ${input.clientName}`,
    summary:`Resposta para objeção: ${reply.title}. Contexto relatado: ${input.context.slice(0,180)}. Nenhuma alteração comercial aprovada automaticamente.`.slice(0,500),
    content:[`Olá, equipe ${input.clientName}! Tudo bem?`,"",reply.body,...(input.agreedTerms?["","Condições já registradas para conferência interna:",input.agreedTerms]:[]),"","Se fizer sentido, seguimos com a revisão do escopo e formalização após aprovação.","","Alessandra | SANSA Oficina Digital"].join("\n")
  };
}
