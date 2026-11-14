type Environment = Record<string, string | undefined>;
export type IntegrationCheck = {
  state: 'disabled' | 'incomplete' | 'configured';
  missing: string[];
  invalid: string[];
};

// Reports configuration only. Provider access is never inferred from credentials.
export function integrationHealth(env: Environment) {
  const present = (name: string) => Boolean(env[name]?.trim());
  function check(required: string[], enabled: boolean, invalid: string[] = []): IntegrationCheck {
    const missing = required.filter(name => !present(name));
    return {state: !enabled ? 'disabled' : missing.length || invalid.length ? 'incomplete' : 'configured', missing, invalid};
  }
  const crmInvalid: string[] = [];
  if (present('GOOGLE_SERVICE_ACCOUNT_JSON')) {
    try {
      const value = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON!);
      if (!value || value.type !== 'service_account' || typeof value.client_email !== 'string' || !value.client_email.includes('@') || typeof value.private_key !== 'string' || !value.private_key.includes('PRIVATE KEY')) crmInvalid.push('GOOGLE_SERVICE_ACCOUNT_JSON');
    } catch { crmInvalid.push('GOOGLE_SERVICE_ACCOUNT_JSON'); }
  }
  const crm = check(['GOOGLE_SHEET_ID'], present('GOOGLE_SHEET_ID') || present('GOOGLE_SERVICE_ACCOUNT_JSON') || present('GOOGLE_APPLICATION_CREDENTIALS'), crmInvalid);
  if (!present('GOOGLE_SERVICE_ACCOUNT_JSON') && !present('GOOGLE_APPLICATION_CREDENTIALS')) {
    crm.missing.push('GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS');
    if (crm.state !== 'disabled') crm.state = 'incomplete';
  }
  const key = env.INTERNAL_API_KEY ?? '';
  const internal = check(['INTERNAL_API_KEY'], true, key.length < 24 || key === 'replace-with-a-long-random-secret' ? ['INTERNAL_API_KEY'] : []);
  const zoho = check(['ZOHO_IMAP_USER', 'ZOHO_IMAP_APP_PASSWORD'], env.ZOHO_IMAP_ENABLED === 'true', [
    ...(present('ZOHO_IMAP_USER') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.ZOHO_IMAP_USER!.trim()) ? ['ZOHO_IMAP_USER'] : []),
    ...(present('ZOHO_IMAP_APP_PASSWORD') && env.ZOHO_IMAP_APP_PASSWORD!.length < 10 ? ['ZOHO_IMAP_APP_PASSWORD'] : [])
  ]);
  const metaNames = ['META_VERIFY_TOKEN', 'META_APP_SECRET', 'META_WA_PHONE_NUMBER_ID'];
  const meta = check(metaNames, metaNames.some(present));
  const integrations = {internal, crm, zoho, meta};
  return {
    scope: 'configuration_only' as const,
    integrations,
    alerts: Object.entries(integrations).filter(([, value]) => value.state === 'incomplete').map(([service]) => ({service, code: 'configuration_incomplete'})),
    outbound: {email: false, whatsapp: false},
    providerAccessVerified: false
  };
}
