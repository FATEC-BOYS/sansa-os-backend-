import {test} from "node:test";
import assert from "node:assert/strict";
import {ProposalInput,buildProposal} from "./sales.js";
import {generateProposal} from "./sales-ai.js";

const input={clientName:"Cliente teste",service:"landing_page",package:"essencial",goal:"Apresentar serviços para receber contatos pelo WhatsApp."};
test("modelo padrão não chama IA e preserva compatibilidade",async()=>{
  const parsed=ProposalInput.parse(input);
  const result=await generateProposal(parsed,async()=>{throw Error("Não deveria chamar IA");});
  assert.equal(result.content,buildProposal(parsed).content);
  assert.match(result.summary,/Modelo padrão/);
});
test("IA preserva escopo e condições comerciais e identifica origem",async()=>{
  const parsed=ProposalInput.parse({...input,generationMode:"ai",priceCents:350000,timeline:"6 semanas",paymentTerms:"50% na entrada",customScope:"Uma página com seis seções"});
  const result=await generateProposal(parsed,async goal=>{assert.equal(goal,input.goal);return "Apresentar os serviços com clareza e facilitar o contato pelo WhatsApp.";});
  const marker="ESCOPO PRELIMINAR";
  assert.equal(result.content.slice(result.content.indexOf(marker)),buildProposal(parsed).content.slice(buildProposal(parsed).content.indexOf(marker)));
  assert.match(result.summary,/IA \(OpenAI\)/);
  assert.ok(result.content.includes(input.goal));
});
test("falha da IA não retorna modelo padrão silenciosamente",async()=>{
  await assert.rejects(generateProposal(ProposalInput.parse({...input,generationMode:"ai"}),async()=>{throw Error("quota");}),/quota/);
});
