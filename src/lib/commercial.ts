import {z} from 'zod';
import {serviceIds} from './sales.js';
const text = (max=2000) => z.string().trim().max(max).default('');
export const BriefingData = z.object({
  company:text(140), objective:text(800), audience:text(600),
  service:z.enum(serviceIds).default('landing_page'), references:text(), deliverables:text(1400),
  desiredDeadline:text(300), budget:text(300), constraints:text(1000),
  contactPermission:z.enum(['unknown','granted','denied']).default('unknown'),
  objectiveConfirmed:z.boolean().default(false)
}).strict();
export function briefingMissing(data:z.infer<typeof BriefingData>) {
  const missing = (['company','objective','audience','deliverables'] as const).filter(key => !data[key]);
  return [...missing,...(!data.objectiveConfirmed?['objectiveConfirmed']:[])];
}
const cents=z.number().int().min(0).max(100000000);
const bps=z.number().int().min(0).max(9900);
export const EstimateInput=z.object({
  name:z.string().trim().min(1).max(100),
  parametersConfirmed:z.literal(true),
  lines:z.array(z.object({discipline:z.string().trim().min(1).max(100),minutes:z.number().int().min(1).max(600000),hourlyCostCents:cents}).strict()).min(1).max(30),
  fixedCostCents:cents, toolsCents:cents, taxBps:bps, riskBps:bps, marginBps:bps
}).strict().refine(v=>v.taxBps+v.marginBps<10000,{message:'Imposto e margem devem somar menos de 100%.',path:['marginBps']});
export type EstimateParameters=z.infer<typeof EstimateInput>;
const ceil=(n:bigint,d:bigint)=>(n+d-1n)/d;
export function calculateEstimate(input:EstimateParameters) {
  const p=EstimateInput.parse(input);
  const lines=p.lines.map(line=>({...line,costCents:Number(ceil(BigInt(line.minutes)*BigInt(line.hourlyCostCents),60n))}));
  const labor=lines.reduce((sum,line)=>sum+BigInt(line.costCents),0n);
  const subtotal=labor+BigInt(p.fixedCostCents)+BigInt(p.toolsCents);
  const risk=ceil(subtotal*BigInt(p.riskBps),10000n);
  const cost=subtotal+risk;
  const minimum=ceil(cost*10000n,BigInt(10000-p.taxBps));
  const recommended=ceil(cost*10000n,BigInt(10000-p.taxBps-p.marginBps));
  if(recommended>100000000n)throw new Error('Estimate exceeds supported limit');
  return {algorithm:'sansa-cost-v1' as const,lines,laborCents:Number(labor),subtotalCents:Number(subtotal),riskCents:Number(risk),totalCostCents:Number(cost),minimumCents:Number(minimum),recommendedCents:Number(recommended)};
}
export function priceReview(calculation:ReturnType<typeof calculateEstimate>,taxBps:number,priceCents:number) {
  const net=BigInt(priceCents)*BigInt(10000-taxBps);
  return {discountCents:Math.max(0,calculation.recommendedCents-priceCents),negativeMargin:net<BigInt(calculation.totalCostCents)*10000n};
}
export const VersionInput=z.object({
  estimateId:z.string().min(1).max(100), expectedRevision:z.number().int().min(1),
  priceCents:z.number().int().min(100).max(100000000), commercialConfirmed:z.literal(true),
  discountApproved:z.boolean().default(false),
  validity:z.string().trim().min(1).max(200), timeline:z.string().trim().min(1).max(300),
  paymentTerms:z.string().trim().min(1).max(300), exclusions:text(1000), milestones:text(1000), revisions:text(500)
}).strict();
