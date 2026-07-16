const knownPlaceholders = new Set([
  'replace-with-sepay-secret',
  'replace-with-payment-webhook-secret',
  'your_sepay_webhook_secret',
  'change-me'
]);

export function strongWebhookCredential(value, { production = process.env.NODE_ENV === 'production' } = {}) {
  const credential = String(value || '').trim();
  if (!credential) return false;
  if (!production) return true;
  return credential.length >= 32 && !knownPlaceholders.has(credential.toLowerCase());
}
