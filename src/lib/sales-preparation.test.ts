import {test} from "node:test";
import assert from "node:assert/strict";
import {ProposalInput,buildProposal} from "./sales.js";
import {prepareSalesDraft} from "./sales-preparation.js";

const base={clientName:"Casa exemplo",service:"landing_page",package:"essencial",generationMode:"ai"};
test("objetivo ausente ou incerto vira briefing sem chamar IA",async()=>{
  for(const goal of ["","Não sei, peguei do crm","a definir"]){
    const result=await prepareSalesDraft(ProposalInput.parse({...base,goal,objectiveConfirmed:true}),{type:"Loja",status:"Não abordado",nextStep:"Conferir interesse"},async()=>{throw Error("IA não deveria ser chamada");});
    assert.equal(result.kind,"briefing");assert.ok(result.content.includes("Conferir interesse"));
    assert.ok(!result.content.includes("INVESTIMENTO:"));
  }
});
test("confirmação explícita é necessária mesmo com texto longo",async()=>{
  const result=await prepareSalesDraft(ProposalInput.parse({...base,goal:"Apresentar os serviços e receber contatos."}));
  assert.equal(result.kind,"briefing");
});
test("proposta confirmada recebe somente contexto permitido e limitado",async()=>{
  const input=ProposalInput.parse({...base,objectiveConfirmed:true,goal:"Apresentar os serviços e receber contatos.",priceCents:350000});
  const result=await prepareSalesDraft(input,{type:"Agência",status:"Demanda",nextStep:"x".repeat(800)},async(data,_writer,context)=>{
    assert.equal(context?.nextStep?.length,500);assert.deepEqual(Object.keys(context!),["type","status","nextStep"]);
    return buildProposal(data);
  });
  assert.equal(result.kind,"commercial_proposal");assert.ok(result.content.includes("INVESTIMENTO:"));
});
