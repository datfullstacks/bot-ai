import { config, nowIso } from './config.js';
import { readStore } from './storage.js';
import { getTelegramEmojiStatus } from './telegramEmojiHealth.js';

const supportedPaymentProviders = new Set(['mock', 'sepay']);
const weakAdminPasswords = new Set(['admin123', 'change-me-now', 'password', 'admin']);
const placeholderSecrets = new Set([
  'replace-with-a-long-random-secret',
  'replace-with-long-random-secret',
  'replace-with-payment-webhook-secret',
  'replace-with-sepay-secret'
]);

function configured(name) {
  return Boolean(String(process.env[name] || '').trim());
}

function hostKind(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '::1'].includes(host)) return 'local';
    if (url.protocol !== 'https:') return 'non_https';
    return 'public_https';
  } catch {
    return 'invalid';
  }
}

function masked(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return 'configured';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function item(id, label, status, detail = '') {
  return { id, label, status, detail };
}

function addWarning(items, id, label, detail) {
  items.push(item(id, label, 'warning', detail));
}

function addOk(items, id, label, detail) {
  items.push(item(id, label, 'ok', detail));
}

function appBaseUrl() {
  return config.baseUrl.replace(/\/$/, '');
}

function sepayWebhookAuthConfigured() {
  if (config.sepay.webhookAuth === 'none') return false;
  if (config.sepay.webhookAuth === 'hmac') return Boolean(config.sepay.webhookSecret);
  if (['api_key', 'apikey'].includes(config.sepay.webhookAuth)) return Boolean(config.sepay.webhookApiKey);
  return false;
}

function inventorySummary(db) {
  return db.inventory.reduce((summary, item) => {
    const status = String(item.status || 'unknown');
    summary[status] = Number(summary[status] || 0) + 1;
    return summary;
  }, {
    products: db.products.length,
    total: db.inventory.length,
    available: 0,
    reserved: 0,
    sold: 0
  });
}

function buildChecks() {
  const checks = [];
  const production = process.env.NODE_ENV === 'production';
  const baseHostKind = hostKind(config.baseUrl);
  const authSecret = String(process.env.AUTH_SECRET || '');
  const paymentSecret = String(process.env.PAYMENT_WEBHOOK_SECRET || '');
  const adminPassword = String(process.env.ADMIN_PASSWORD || config.admin.password);

  if (baseHostKind === 'public_https') {
    addOk(checks, 'base_url', 'BASE_URL', config.baseUrl);
  } else if (baseHostKind === 'local') {
    addWarning(checks, 'base_url', 'BASE_URL is local', 'Set a public HTTPS BASE_URL before Telegram webhooks or real payments.');
  } else if (baseHostKind === 'non_https') {
    addWarning(checks, 'base_url', 'BASE_URL is not HTTPS', 'Use HTTPS for production webhooks and payment pages.');
  } else {
    addWarning(checks, 'base_url', 'BASE_URL is invalid', config.baseUrl);
  }

  if (configured('AUTH_SECRET') && authSecret.length >= 32 && !placeholderSecrets.has(authSecret)) {
    addOk(checks, 'auth_secret', 'AUTH_SECRET', 'Configured');
  } else {
    addWarning(checks, 'auth_secret', 'AUTH_SECRET is weak or missing', 'Set a long random secret so dashboard sessions survive restarts safely.');
  }

  if (configured('ADMIN_PASSWORD') && !weakAdminPasswords.has(adminPassword)) {
    addOk(checks, 'admin_password', 'Admin password', 'Configured');
  } else {
    addWarning(checks, 'admin_password', 'Admin password is still default/weak', 'Set ADMIN_PASSWORD before exposing the dashboard.');
  }

  if (config.storage.driver === 'postgres' && configured('DATABASE_URL')) {
    addOk(checks, 'storage', 'Storage', `PostgreSQL ${config.storage.postgresWriteMode === 'document' ? 'document writes' : 'row-level hot path'}`);
  } else if (config.storage.driver === 'json') {
    const status = production ? 'warning' : 'ok';
    checks.push(item('storage', 'Storage', status, production ? 'JSON storage is not recommended for production.' : 'JSON file storage for local development.'));
  } else {
    addWarning(checks, 'storage', 'Storage is misconfigured', 'Set STORE_DRIVER=json or STORE_DRIVER=postgres with DATABASE_URL.');
  }

  if (configured('REDIS_URL')) {
    addOk(checks, 'redis', 'Redis rate limit store', 'Configured');
  } else {
    const status = production ? 'warning' : 'ok';
    checks.push(item('redis', 'Redis rate limit store', status, production ? 'Set REDIS_URL for multi-process traffic limits.' : 'Using in-memory rate limits locally.'));
  }

  if (!supportedPaymentProviders.has(config.payment.provider)) {
    addWarning(checks, 'payment_provider', 'Payment provider is unknown', `Configured value: ${config.payment.provider}`);
  } else if (config.payment.provider === 'mock') {
    const status = production ? 'warning' : 'ok';
    checks.push(item('payment_provider', 'Payment provider', status, production ? 'Mock payment is for testing only.' : 'Mock payment for local testing.'));
  } else {
    addOk(checks, 'payment_provider', 'Payment provider', 'SePay');
  }

  if (config.payment.provider === 'sepay') {
    if (config.sepay.accountNumber && config.sepay.bankCode) {
      addOk(checks, 'sepay_qr', 'SePay QR account', `${config.sepay.bankCode} ${masked(config.sepay.accountNumber)}`);
    } else {
      addWarning(checks, 'sepay_qr', 'SePay QR account missing', 'Set SEPAY_ACCOUNT_NUMBER and SEPAY_BANK_CODE.');
    }

    if (config.sepay.webhookAuth === 'none') {
      addWarning(checks, 'sepay_webhook_auth', 'SePay webhook auth disabled', 'Use hmac or api_key outside isolated testing.');
    } else if (config.sepay.webhookAuth === 'hmac' && config.sepay.webhookSecret) {
      addOk(checks, 'sepay_webhook_auth', 'SePay webhook auth', 'HMAC');
    } else if (['api_key', 'apikey'].includes(config.sepay.webhookAuth) && config.sepay.webhookApiKey) {
      addOk(checks, 'sepay_webhook_auth', 'SePay webhook auth', 'API key');
    } else {
      addWarning(checks, 'sepay_webhook_auth', 'SePay webhook secret missing', 'Set SEPAY_WEBHOOK_SECRET or SEPAY_WEBHOOK_API_KEY for the selected auth mode.');
    }
  }

  if (config.payment.provider === 'mock') {
    if (configured('PAYMENT_WEBHOOK_SECRET') && !placeholderSecrets.has(paymentSecret)) {
      addOk(checks, 'mock_webhook_secret', 'Mock webhook secret', 'Configured');
    } else {
      addWarning(checks, 'mock_webhook_secret', 'Mock webhook secret is default/missing', 'Set PAYMENT_WEBHOOK_SECRET if mock webhooks are reachable.');
    }
  }

  if (config.telegram.token) {
    addOk(checks, 'telegram_token', 'Telegram bot token', `Configured ${masked(config.telegram.token)}`);
  } else {
    addWarning(checks, 'telegram_token', 'Telegram bot token missing', 'Set TELEGRAM_BOT_TOKEN to enable the bot.');
  }

  if (config.telegram.polling) {
    addOk(checks, 'telegram_mode', 'Telegram delivery mode', 'Polling enabled');
  } else if (config.telegram.webhookSecret) {
    addOk(checks, 'telegram_mode', 'Telegram delivery mode', 'Webhook secret configured');
  } else {
    addWarning(checks, 'telegram_mode', 'Telegram delivery mode not configured', 'Enable polling for local runs or set TELEGRAM_WEBHOOK_SECRET for webhook mode.');
  }

  const emojiStatus = getTelegramEmojiStatus();
  const loadedPacks = Object.values(emojiStatus.packs || {}).filter((pack) => pack.loaded).length;
  const requiredPacks = emojiStatus.requiredPacks?.length || 0;
  if (!emojiStatus.enabled) {
    checks.push(item('telegram_custom_text_emoji', 'Telegram text custom emoji', 'ok', 'Disabled by TELEGRAM_CUSTOM_TEXT_EMOJI=false.'));
  } else if (process.env.NODE_ENV === 'production' && !emojiStatus.ready) {
    addWarning(checks, 'telegram_custom_text_emoji', 'Telegram custom emoji maps incomplete', `${loadedPacks}/${requiredPacks} required packs loaded.`);
  } else {
    addOk(checks, 'telegram_custom_text_emoji', 'Telegram custom emoji', `${loadedPacks}/${requiredPacks} required packs loaded.`);
  }

  return checks;
}

export async function getSystemStatus() {
  const db = await readStore();
  const checks = buildChecks();
  const warnings = checks.filter((check) => check.status === 'warning').length;
  const telegramEmoji = getTelegramEmojiStatus();

  return {
    generatedAt: nowIso(),
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    baseUrl: config.baseUrl,
    status: warnings ? 'needs_config' : 'ready',
    warnings,
    checks,
    storage: {
      driver: config.storage.driver,
      postgresWriteMode: config.storage.driver === 'postgres' ? config.storage.postgresWriteMode : undefined,
      dataFile: config.storage.driver === 'json' ? config.dataFile : undefined,
      databaseConfigured: configured('DATABASE_URL')
    },
    traffic: {
      redisConfigured: configured('REDIS_URL'),
      maxBodyBytes: config.traffic.maxBodyBytes,
      authPerMinute: config.traffic.authPerMinute,
      publicPerMinute: config.traffic.publicPerMinute,
      adminPerMinute: config.traffic.adminPerMinute,
      telegramUserPerMinute: config.traffic.telegramUserPerMinute,
      telegramBuyPerMinute: config.traffic.telegramBuyPerMinute
    },
    orders: {
      ttlMinutes: config.orders.ttlMinutes,
      maxQuantity: config.orders.maxQuantity,
      maxPendingPerUser: config.orders.maxPendingPerUser
    },
    telegram: {
      tokenConfigured: Boolean(config.telegram.token),
      polling: config.telegram.polling,
      webhookSecretConfigured: Boolean(config.telegram.webhookSecret),
      webhookUrl: `${config.baseUrl.replace(/\/$/, '')}/api/public/telegram/webhook`
    },
    telegramEmoji,
    payment: {
      provider: supportedPaymentProviders.has(config.payment.provider) ? config.payment.provider : 'mock_fallback',
      configuredProvider: config.payment.provider,
      sepayWebhookUrl: `${config.baseUrl.replace(/\/$/, '')}/api/public/payments/sepay-webhook`,
      mockWebhookUrl: `${config.baseUrl.replace(/\/$/, '')}/api/public/payments/mock-webhook`
    },
    counts: {
      admins: db.admins.length,
      sessions: db.sessions.length,
      products: db.products.length,
      inventory: db.inventory.length,
      users: db.users.length,
      orders: db.orders.length,
      payments: db.payments.length,
      auditLogs: db.auditLogs.length
    }
  };
}

export async function getReadiness() {
  const db = await readStore();
  const checks = buildChecks();
  const warnings = checks.filter((check) => check.status === 'warning').length;
  const provider = supportedPaymentProviders.has(config.payment.provider) ? config.payment.provider : 'mock_fallback';
  const sepayEnabled = provider === 'sepay';
  const webhookBase = appBaseUrl();
  const telegramEmoji = getTelegramEmojiStatus();

  return {
    ok: true,
    status: warnings ? 'needs_config' : 'ready',
    warnings,
    generatedAt: nowIso(),
    checks,
    storage: {
      driver: config.storage.driver,
      postgresWriteMode: config.storage.driver === 'postgres' ? config.storage.postgresWriteMode : undefined,
      databaseConfigured: configured('DATABASE_URL'),
      dataFile: config.storage.driver === 'json' ? config.dataFile : undefined
    },
    traffic: {
      redisConfigured: configured('REDIS_URL'),
      rateLimitStore: configured('REDIS_URL') ? 'redis' : 'memory'
    },
    telegram: {
      tokenConfigured: Boolean(config.telegram.token),
      polling: config.telegram.polling,
      webhookSecretConfigured: Boolean(config.telegram.webhookSecret),
      webhookUrl: `${webhookBase}/api/public/telegram/webhook`
    },
    telegramEmoji,
    payment: {
      provider,
      configuredProvider: config.payment.provider,
      sepayWebhookUrl: `${webhookBase}/api/public/payments/sepay-webhook`,
      mockWebhookUrl: `${webhookBase}/api/public/payments/mock-webhook`
    },
    paymentProvider: provider,
    sepay: {
      enabled: sepayEnabled,
      accountConfigured: Boolean(config.sepay.accountNumber && config.sepay.bankCode),
      bankCode: config.sepay.bankCode || '',
      accountNumber: masked(config.sepay.accountNumber),
      paymentPrefix: config.sepay.paymentPrefix,
      webhookAuth: config.sepay.webhookAuth,
      webhookAuthConfigured: sepayWebhookAuthConfigured(),
      webhookUrl: `${webhookBase}/api/public/payments/sepay-webhook`
    },
    webhooks: {
      telegram: `${webhookBase}/api/public/telegram/webhook`,
      sepay: `${webhookBase}/api/public/payments/sepay-webhook`,
      mockPayment: `${webhookBase}/api/public/payments/mock-webhook`
    },
    inventory: inventorySummary(db)
  };
}
