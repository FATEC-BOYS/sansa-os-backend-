import type {FastifyInstance} from 'fastify';
import {integrationHealth} from '../lib/integration-health.js';

export function registerIntegrationHealthRoutes(app: FastifyInstance, env: Record<string, string | undefined> = process.env) {
  // Protected by the same API-key hook as all other internal routes.
  app.get('/api/integrations/health', async () => integrationHealth(env));
}
