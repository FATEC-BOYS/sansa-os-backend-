import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {integrationHealth} from './integration-health.js';
import {registerIntegrationHealthRoutes} from '../routes/integration-health.js';

test('AI configuration never implies a successful provider request', () => {
  assert.equal(integrationHealth({}).integrations.ai.state, 'disabled');
  assert.equal(integrationHealth({OPENAI_API_KEY: '   '}).integrations.ai.state, 'disabled');
  const report = integrationHealth({OPENAI_API_KEY: 'fictitious-key'});
  assert.equal(report.integrations.ai.state, 'configured');
  assert.equal(report.providerAccessVerified, false);
  assert.deepEqual(report.outbound, {email: false, whatsapp: false});
});

test('public secret aliases alert without enabling private integrations or leaking values', async () => {
  const env = {
    NEXT_PUBLIC_OPENAI_API_KEY: 'fictitious-sensitive-openai',
    VITE_META_APP_SECRET: 'fictitious-sensitive-meta',
    PUBLIC_GOOGLE_SERVICE_ACCOUNT_JSON: '{fictitious-private-json}',
  };
  const app = Fastify();
  registerIntegrationHealthRoutes(app, env);
  try {
    const response = await app.inject('/api/integrations/health');
    const report = response.json();
    assert.equal(response.statusCode, 200);
    assert.equal(report.integrations.ai.state, 'disabled');
    assert.equal(report.integrations.meta.state, 'disabled');
    assert.equal(report.integrations.crm.state, 'disabled');
    assert.ok(report.alerts.some((a: {code: string}) => a.code === 'public_secret_variable'));
    for (const value of Object.values(env)) assert.ok(!response.body.includes(value));
    for (const name of Object.keys(env)) assert.ok(!response.body.includes(name));
  } finally { await app.close(); }
});

test('all supported public prefixes and secret names are covered', () => {
  for (const prefix of ['NEXT_PUBLIC_', 'VITE_', 'PUBLIC_']) {
    for (const key of ['INTERNAL_API_KEY', 'OPENAI_API_KEY', 'META_APP_SECRET', 'META_VERIFY_TOKEN', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'ZOHO_IMAP_APP_PASSWORD']) {
      assert.ok(integrationHealth({[prefix + key]: 'fictitious-secret'}).alerts.some(a => a.code === 'public_secret_variable'));
    }
  }
  assert.ok(!integrationHealth({NEXT_PUBLIC_SITE_URL: 'https://example.test'}).alerts.some(a => a.code === 'public_secret_variable'));
});
