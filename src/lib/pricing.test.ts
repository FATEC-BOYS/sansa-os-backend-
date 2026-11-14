import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type {PrismaClient} from '@prisma/client';
import {PricingInput,simulatePricing,type PricingParameters} from './pricing.js';
import {registerPricingRoutes} from '../routes/pricing.js';
const fixture: PricingParameters = {
  parameterVersion:'test-v1',scenario:'Teste sintético',sourceReference:'Fixture de teste; não é tabela SANSA',
  disciplines:[{name:'Design',minutes:120,hourlyCostCents:5000}],
  allocatedFixedCents:1000,toolsCents:1000,riskBps:0,taxBps:1000,targetMarginBps:2000,
  proposedPriceCents:null,requestedDiscountBps:0,maxDiscountBps:500
};
test('cost, tax and margin use selling price, with conservative cent rounding', () => {
  const {calculation:c} = simulatePricing(fixture);
  assert.equal(c.totalCostCents,12000);
  assert.equal(c.minimumPriceCents,13334);
  assert.equal(c.targetPriceCents,17143);
  assert.equal(c.proposed,null);
});
test('zero margin, risk, fractional hour and zero price', () => {
  const result = simulatePricing({...fixture,disciplines:[{name:'Design',minutes:1,hourlyCostCents:100}],allocatedFixedCents:0,toolsCents:0,riskBps:5000,taxBps:0,targetMarginBps:0,proposedPriceCents:0});
  assert.equal(result.calculation.laborCents,2);
  assert.equal(result.calculation.riskCents,1);
  assert.equal(result.calculation.minimumPriceCents,3);
  assert.equal(result.calculation.targetPriceCents,3);
  assert.equal(result.calculation.proposed?.marginBps,null);
  assert.ok(result.alerts.includes('negative_margin'));
});
test('discount exposes limit and losses without applying conditions', () => {
  const result = simulatePricing({...fixture,proposedPriceCents:14000,requestedDiscountBps:1000});
  assert.equal(result.calculation.discounted?.priceCents,12600);
  assert.ok(result.alerts.includes('discount_exceeds_limit'));
  assert.ok(result.alerts.includes('discount_negative_margin'));
  assert.equal(result.discountApplied,false);
  assert.equal(result.requiresHumanApproval,true);
  assert.equal(result.pricingCommitted,false);
});
test('deterministic snapshot, no missing or invalid commercial defaults', () => {
  assert.deepEqual(simulatePricing(fixture),simulatePricing({...fixture}));
  for (const invalid of [{}, {...fixture,taxBps:8000,targetMarginBps:2000}, {...fixture,toolsCents:-1}, {...fixture,requestedDiscountBps:1}, {...fixture,disciplines:[]}, {...fixture,targetMarginBps:Infinity}, {...fixture,unknown:true}]) assert.equal(PricingInput.safeParse(invalid).success,false);
  const {taxBps:_,...missingTax} = fixture;
  assert.equal(PricingInput.safeParse(missingTax).success,false);
});
test('HTTP rejects bad input, simulates without writes and saves an internal snapshot atomically', async () => {
  const writes: unknown[] = [];
  const tx = {
    approval:{create:async (args:unknown) => {writes.push(args);return {id:'estimate-1',createdAt:new Date('2026-01-01T00:00:00Z')};}},
    activity:{create:async (args:unknown) => {writes.push(args);}}
  };
  const prisma = {$transaction:async (callback:(client:typeof tx)=>unknown) => callback(tx)} as unknown as PrismaClient;
  const app = Fastify();
  registerPricingRoutes(app,prisma);
  try {
    assert.equal((await app.inject({method:'POST',url:'/api/sales/pricing/simulate',payload:{}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/api/sales/pricing/simulate',payload:fixture})).statusCode,200);
    assert.equal(writes.length,0);
    const response = await app.inject({method:'POST',url:'/api/sales/pricing/estimates',payload:fixture});
    assert.equal(response.statusCode,201);
    assert.equal(response.json().estimateId,'estimate-1');
    assert.equal(writes.length,2);
    const saved = writes[0] as {data:{kind:string;status:string;content:string}};
    assert.equal(saved.data.kind,'pricing_simulation');
    assert.equal(saved.data.status,'pending');
    assert.deepEqual(JSON.parse(saved.data.content),response.json().snapshot);
  } finally {await app.close();}
});
