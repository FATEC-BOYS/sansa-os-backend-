import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {integrationHealth} from './integration-health.js';
import {registerIntegrationHealthRoutes} from '../routes/integration-health.js';

test('missing and partial settings fail closed', () => {
  const empty = integrationHealth({});
  assert.equal(empty.integrations.internal.state, 'incomplete');
  assert.equal(empty.integrations.crm.state, 'disabled');
  assert.equal(empty.integrations.zoho.state, 'disabled');
  assert.equal(empty.integrations.meta.state, 'disabled');
  const partial = integrationHealth({GOOGLE_SHEET_ID:'sheet', META_APP_SECRET:'secret', ZOHO_IMAP_ENABLED:'true'});
  for (const name of ['crm', 'zoho', 'meta'] as const) assert.equal(partial.integrations[name].state, 'incomplete');
  assert.deepEqual(partial.outbound, {email:false, whatsapp:false});
});

test('invalid JSON and invalid enabled mail settings are reported without values', () => {
  for (const value of ['{secret', 'null', '{}', '[]']) {
    const report = integrationHealth({GOOGLE_SHEET_ID:'sheet', GOOGLE_SERVICE_ACCOUNT_JSON:value});
    assert.equal(report.integrations.crm.state, 'incomplete');
    assert.deepEqual(report.integrations.crm.invalid, ['GOOGLE_SERVICE_ACCOUNT_JSON']);
  }
  const report = integrationHealth({ZOHO_IMAP_ENABLED:'true', ZOHO_IMAP_USER:'invalid', ZOHO_IMAP_APP_PASSWORD:'short'});
  assert.equal(report.integrations.zoho.state, 'incomplete');
});

test('configured credentials never imply verified access or enable outbound', async () => {
  const env = {
    INTERNAL_API_KEY:'private-internal-key-123456789',
    GOOGLE_SHEET_ID:'private-sheet-id',
    GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:'private@example.test', private_key:'-----BEGIN PRIVATE KEY-----private-material'}),
    ZOHO_IMAP_ENABLED:'true', ZOHO_IMAP_USER:'private@example.test', ZOHO_IMAP_APP_PASSWORD:'private-password',
    META_VERIFY_TOKEN:'private-verify', META_APP_SECRET:'private-meta-secret', META_WA_PHONE_NUMBER_ID:'private-phone',
    META_WA_SEND_ENABLED:'true'
  };
  const app = Fastify();
  registerIntegrationHealthRoutes(app,env);
  try {
    const response = await app.inject('/api/integrations/health');
    assert.equal(response.statusCode,200);
    const report = response.json();
    for (const value of Object.values(report.integrations) as {state:string}[]) assert.equal(value.state,'configured');
    assert.equal(report.providerAccessVerified,false);
    assert.deepEqual(report.outbound,{email:false,whatsapp:false});
    for (const secret of [env.INTERNAL_API_KEY,env.GOOGLE_SHEET_ID,env.GOOGLE_SERVICE_ACCOUNT_JSON,env.ZOHO_IMAP_USER,env.ZOHO_IMAP_APP_PASSWORD,env.META_VERIFY_TOKEN,env.META_APP_SECRET,env.META_WA_PHONE_NUMBER_ID]) assert.ok(!response.body.includes(secret));
  } finally {await app.close();}
});
