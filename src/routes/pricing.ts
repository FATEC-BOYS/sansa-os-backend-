import type {FastifyInstance} from 'fastify';
import type {PrismaClient} from '@prisma/client';
import {PricingInput,simulatePricing} from '../lib/pricing.js';

export function registerPricingRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.post('/api/sales/pricing/simulate', async (request, reply) => {
    const input = PricingInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send({error:'Parâmetros de custo e margem obrigatórios ou inválidos',details:input.error.flatten()});
    return simulatePricing(input.data);
  });
  app.post('/api/sales/pricing/estimates', async (request, reply) => {
    const input = PricingInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send({error:'Parâmetros de custo e margem obrigatórios ou inválidos',details:input.error.flatten()});
    const snapshot = simulatePricing(input.data);
    // Separate immutable internal record, never a contract or external proposal.
    const estimate = await prisma.$transaction(async tx => {
      const result = await tx.approval.create({data:{
        agent:'sales',kind:'pricing_simulation',status:'pending',
        title:`Simulação · ${input.data.scenario}`.slice(0,160),
        summary:`Parâmetros ${input.data.parameterVersion}; revisão humana obrigatória. Nenhuma condição aplicada.`,
        content:JSON.stringify(snapshot)
      }});
      await tx.activity.create({data:{kind:'pricing_estimate_saved',message:`Simulação ${result.id}; fórmula pricing-v1; parâmetros ${snapshot.parameterHash}.`}});
      return result;
    });
    return reply.code(201).send({estimateId:estimate.id,createdAt:estimate.createdAt,snapshot});
  });
}
