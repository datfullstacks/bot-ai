import { getSystemStatus } from '../src/systemStatus.js';

const strict = process.argv.includes('--strict');

try {
  const status = await getSystemStatus();
  const payload = {
    ok: strict ? status.warnings === 0 : true,
    status: status.status,
    warnings: status.warnings,
    environment: status.environment,
    baseUrl: status.baseUrl,
    storage: status.storage,
    payment: {
      provider: status.payment.provider,
      configuredProvider: status.payment.configuredProvider
    },
    telegram: {
      tokenConfigured: status.telegram.tokenConfigured,
      polling: status.telegram.polling,
      webhookSecretConfigured: status.telegram.webhookSecretConfigured
    },
    telegramEmoji: status.telegramEmoji,
    checks: status.checks
  };

  console.log(JSON.stringify(payload, null, 2));
  if (strict && status.warnings > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
}
