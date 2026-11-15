import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {BriefingData,briefingMissing,EstimateInput,calculateEstimate,priceReview,VersionInput} from './commercial.js';
import {renderProposalPdf} from './proposal-pdf.js';
const params={name:'Fictitious scope',parametersConfirmed:true as const,lines:[{discipline:'Design',minutes:120,hourlyCostCents:5000}],fixedCostCents:1000,toolsCents:500,taxBps:1000,riskBps:1000,marginBps:2000};
test('incomplete briefing can be saved without budget or sensitive personal data',()=>{
  const draft=BriefingData.parse({});assert.ok(briefingMissing(draft).includes('objectiveConfirmed'));
  const complete=BriefingData.parse({company:'Cliente fictício',objective:'Apresentar produtos',audience:'Público local',deliverables:'Uma página',objectiveConfirmed:true});
  assert.deepEqual(briefingMissing(complete),[]);assert.equal(complete.budget,'');
  assert.equal(BriefingData.safeParse({...complete,cpf:'not-accepted'}).success,false);
});
test('deterministic cost memorial uses margin on revenue and risk on cost',()=>{
  const result=calculateEstimate(params);
  assert.equal(result.laborCents,10000);assert.equal(result.subtotalCents,11500);
  assert.equal(result.riskCents,1150);assert.equal(result.totalCostCents,12650);
  assert.equal(result.minimumCents,14056);assert.equal(result.recommendedCents,18072);
  assert.deepEqual(calculateEstimate(params),result);
});
test('zero margin, zero tax and fractional hours round upward in cents',()=>{
  const result=calculateEstimate({...params,lines:[{discipline:'Design',minutes:1,hourlyCostCents:100}],fixedCostCents:0,toolsCents:0,taxBps:0,marginBps:0,riskBps:0});
  assert.equal(result.laborCents,2);assert.equal(result.minimumCents,2);assert.equal(result.recommendedCents,2);
});
test('human parameters and valid denominator are required',()=>{
  assert.equal(EstimateInput.safeParse({}).success,false);
  assert.equal(EstimateInput.safeParse({...params,parametersConfirmed:false}).success,false);
  assert.equal(EstimateInput.safeParse({...params,taxBps:5000,marginBps:5000}).success,false);
  assert.equal(EstimateInput.safeParse({...params,lines:[{discipline:'Design',minutes:0,hourlyCostCents:100}]}).success,false);
  assert.throws(()=>calculateEstimate({...params,taxBps:9900,marginBps:99,lines:[{discipline:'Design',minutes:600000,hourlyCostCents:100000000}]}));
});
test('discount and negative margin are identified without applying them',()=>{
  const result=calculateEstimate(params);
  assert.equal(priceReview(result,params.taxBps,18072).discountCents,0);
  assert.equal(priceReview(result,params.taxBps,16000).discountCents,2072);
  assert.equal(priceReview(result,params.taxBps,14055).negativeMargin,true);
  assert.equal(priceReview(result,params.taxBps,14056).negativeMargin,false);
  assert.equal(VersionInput.safeParse({estimateId:'e',expectedRevision:1,priceCents:16000,commercialConfirmed:false,validity:'10 dias',timeline:'30 dias',paymentTerms:'a combinar'}).success,false);
});
test('PDF preserves version metadata and paginates long Portuguese content',async()=>{
  const bytes=await renderProposalPdf(('Objetivo: criação de página. Exclusões e revisões a confirmar.\n').repeat(200),{number:3,createdAt:new Date('2026-11-15T00:00:00Z'),approved:false});
  const pdf=await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount()>1);assert.equal(pdf.getTitle(),'SANSA | Proposta v3');
  for(const page of pdf.getPages())assert.equal(Math.round(page.getWidth()),595);
});
