import {createHash} from 'node:crypto';
import {z} from 'zod';

const cents = z.number().int().min(0).max(100_000_000);
const bps = z.number().int().min(0).max(10_000);
export const PricingInput = z.object({
  parameterVersion: z.string().trim().min(1).max(80),
  scenario: z.string().trim().min(2).max(160),
  sourceReference: z.string().trim().min(3).max(500),
  disciplines: z.array(z.object({
    name: z.string().trim().min(2).max(100),
    minutes: z.number().int().min(1).max(600_000),
    hourlyCostCents: cents
  }).strict()).min(1).max(30),
  allocatedFixedCents: cents,
  toolsCents: cents,
  riskBps: bps,
  taxBps: bps,
  targetMarginBps: bps,
  proposedPriceCents: cents.nullable(),
  requestedDiscountBps: bps,
  maxDiscountBps: bps
}).strict().superRefine((value, ctx) => {
  if (value.taxBps + value.targetMarginBps >= 10_000)
    ctx.addIssue({code:'custom',path:['targetMarginBps'],message:'Impostos + margem devem ser inferiores a 100%.'});
  if (value.requestedDiscountBps > 0 && value.proposedPriceCents === null)
    ctx.addIssue({code:'custom',path:['proposedPriceCents'],message:'Informe preço proposto para simular desconto.'});
});
export type PricingParameters = z.infer<typeof PricingInput>;
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;

export function simulatePricing(input: PricingParameters) {
  // Validate callers as well as HTTP requests; no implicit commercial defaults.
  const parameters = PricingInput.parse(input);
  const lines = parameters.disciplines.map(line => ({...line,
    costCents: Number(ceil(BigInt(line.minutes) * BigInt(line.hourlyCostCents), 60n))
  }));
  const laborCents = lines.reduce((sum, line) => sum + line.costCents, 0);
  const baseCostCents = laborCents + parameters.allocatedFixedCents + parameters.toolsCents;
  const riskCents = Number(ceil(BigInt(baseCostCents) * BigInt(parameters.riskBps), 10_000n));
  const totalCostCents = baseCostCents + riskCents;
  // Margin is a fraction of selling price, not markup on costs.
  const minimumPriceCents = Number(ceil(BigInt(totalCostCents) * 10_000n, BigInt(10_000 - parameters.taxBps)));
  const targetPriceCents = Number(ceil(BigInt(totalCostCents) * 10_000n, BigInt(10_000 - parameters.taxBps - parameters.targetMarginBps)));
  const proposed = parameters.proposedPriceCents;
  const discountedPriceCents = proposed === null ? null : Number(BigInt(proposed) * BigInt(10_000 - parameters.requestedDiscountBps) / 10_000n);
  const evaluate = (price: number | null) => {
    if (price === null) return null;
    const taxCents = Number(ceil(BigInt(price) * BigInt(parameters.taxBps), 10_000n));
    const profitCents = price - taxCents - totalCostCents;
    return {priceCents:price,taxCents,profitCents,marginBps:price === 0 ? null : Math.floor(profitCents / price * 10_000)};
  };
  const proposedResult = evaluate(proposed);
  const discountedResult = evaluate(discountedPriceCents);
  const alerts: string[] = [];
  if (proposedResult && proposedResult.profitCents < 0) alerts.push('negative_margin');
  if (discountedResult && discountedResult.profitCents < 0) alerts.push('discount_negative_margin');
  if (parameters.requestedDiscountBps > parameters.maxDiscountBps) alerts.push('discount_exceeds_limit');
  if (totalCostCents === 0) alerts.push('zero_cost_review_required');
  const calculation = {lines,laborCents,baseCostCents,riskCents,totalCostCents,minimumPriceCents,targetPriceCents,proposed:proposedResult,discounted:discountedResult};
  const parameterHash = createHash('sha256').update(JSON.stringify(parameters)).digest('hex');
  return {
    schemaVersion:1, formulaVersion:'pricing-v1', parameterHash, parameters, calculation, alerts,
    mode:'simulation', requiresHumanApproval:true, discountApplied:false,
    pricingCommitted:false, outboundEnabled:false
  };
}
