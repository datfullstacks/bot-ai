import { config, nowIso } from './config.js';
import { isDeliveryMode, isSeatEmailFulfillment, requiresSeatUsagePolicy } from './catalog.js';
import {
  decryptInventorySecret,
  inventoryEncryptionStatus,
  isEncryptedInventorySecret
} from './inventorySecrets.js';
import { salesReadinessProblems } from './salesGuard.js';
import { readStore } from './storage.js';
import { getTelegramEmojiStatus } from './telegramEmojiHealth.js';
import { strongWebhookCredential } from './webhookSecurity.js';

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

function memberServiceUrlReady(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && url.hostname.toLowerCase().endsWith('.railway.internal');
  } catch {
    return false;
  }
}

function memberIntegrationReady(integration = {}) {
  return Boolean(
    integration.enabled
    && memberServiceUrlReady(integration.serviceUrl)
    && integration.apiKey
    && integration.accountRef
  );
}

function memberFulfillmentSummary() {
  return Object.fromEntries(Object.entries(config.memberFulfillment.integrations).map(([provider, integration]) => [
    provider,
    {
      enabled: integration.enabled,
      configured: memberIntegrationReady(integration),
      serviceUrlConfigured: Boolean(integration.serviceUrl),
      accountRefConfigured: Boolean(integration.accountRef),
      apiKeyConfigured: Boolean(integration.apiKey),
      skus: integration.skus
    }
  ]));
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

function telegramEmojiReadinessDetail(emojiStatus, loadedPacks, requiredPacks) {
  if (!emojiStatus.registryReady) {
    const missingPacks = Object.entries(emojiStatus.packs || {})
      .filter(([, pack]) => !pack.loaded)
      .map(([name]) => name);
    const missingKeys = Object.entries(emojiStatus.packs || {})
      .filter(([, pack]) => pack.loaded)
      .flatMap(([name, pack]) => (pack.missingRequiredKeys || []).map((key) => `${name}.${key}`));
    const parts = [`${loadedPacks}/${requiredPacks} required packs loaded.`];
    if (missingPacks.length) parts.push(`Missing packs: ${missingPacks.join(', ')}.`);
    if (missingKeys.length) parts.push(`Missing IDs: ${missingKeys.join(', ')}.`);
    return parts.join(' ');
  }

  const liveHealth = emojiStatus.liveHealth || {};
  if (liveHealth.status === 'missing') {
    return 'Live Telegram emoji health report is missing. Run telegram:emoji-health with --write-report.';
  }
  if (liveHealth.status === 'stale') {
    const ageHours = Math.round(Number(liveHealth.ageMs || 0) / (60 * 60 * 1000));
    return `Live Telegram emoji health report is stale (${ageHours}h old).`;
  }
  if (liveHealth.status === 'failed') {
    const missing = liveHealth.missingRequiredPacks?.length
      ? ` Missing packs in report: ${liveHealth.missingRequiredPacks.join(', ')}.`
      : '';
    return `Live Telegram emoji validation failed: ${liveHealth.reason || 'unknown_error'}.${missing}`;
  }
  if (liveHealth.status === 'healthy') {
    return `${loadedPacks}/${requiredPacks} required packs loaded; live Telegram validation passed.`;
  }
  return `${loadedPacks}/${requiredPacks} required packs loaded; live validation is not required without a bot token.`;
}

function appBaseUrl() {
  return config.baseUrl.replace(/\/$/, '');
}

function sepayWebhookAuthConfigured() {
  if (config.sepay.webhookAuth === 'none') return false;
  if (config.sepay.webhookAuth === 'hmac') return strongWebhookCredential(config.sepay.webhookSecret);
  if (['api_key', 'apikey'].includes(config.sepay.webhookAuth)) {
    return strongWebhookCredential(config.sepay.webhookApiKey);
  }
  return false;
}

function inventorySummary(db) {
  const activeStockProducts = db.products.filter((product) => (
    product.active !== false && !isSeatEmailFulfillment(product)
  ));
  const activeSeatProducts = db.products.filter((product) => (
    product.active !== false && isSeatEmailFulfillment(product)
  ));
  const activeStockProductIds = new Set(activeStockProducts.map((product) => product.id));
  return db.inventory.reduce((summary, item) => {
    const status = String(item.status || 'unknown');
    summary[status] = Number(summary[status] || 0) + 1;
    if (activeStockProductIds.has(item.productId)) {
      summary.stockBacked[status] = Number(summary.stockBacked[status] || 0) + 1;
    }
    return summary;
  }, {
    products: db.products.length,
    activeStockProducts: activeStockProducts.length,
    activeSeatProducts: activeSeatProducts.length,
    total: db.inventory.length,
    available: 0,
    reserved: 0,
    sold: 0,
    stockBacked: {
      total: db.inventory.filter((item) => activeStockProductIds.has(item.productId)).length,
      available: 0,
      reserved: 0,
      sold: 0
    }
  });
}

function requiresInventory(db) {
  return db.products.some((product) => (
    product.active !== false && !isSeatEmailFulfillment(product)
  ));
}

function inventoryPayloadSummary(db) {
  const summary = { available: 0, plaintext: 0, undecryptable: 0 };
  const stockProductIds = new Set(db.products
    .filter((product) => product.active !== false && !isSeatEmailFulfillment(product))
    .map((product) => product.id));
  for (const item of db.inventory) {
    if (item.status !== 'available' || !stockProductIds.has(item.productId)) continue;
    summary.available += 1;
    if (!isEncryptedInventorySecret(item.secret)) {
      summary.plaintext += 1;
      continue;
    }
    try {
      decryptInventorySecret(item.secret);
    } catch {
      summary.undecryptable += 1;
    }
  }
  return summary;
}

function buildChecks(db = null) {
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

  const encryption = inventoryEncryptionStatus();
  const inventoryRequired = !db || requiresInventory(db);
  if (encryption.valid) {
    addOk(checks, 'inventory_encryption', 'Inventory encryption', 'AES-256-GCM key configured');
  } else if (!inventoryRequired) {
    addOk(checks, 'inventory_encryption', 'Inventory encryption', 'Not required for active Seat email products.');
  } else {
    const status = production ? 'warning' : 'ok';
    checks.push(item(
      'inventory_encryption',
      'Inventory encryption',
      status,
      encryption.error || (production
        ? 'Set INVENTORY_ENCRYPTION_KEY before importing real stock.'
        : 'Optional for local development.')
    ));
  }

  if (production && db) {
    const payloads = inventoryPayloadSummary(db);
    if (payloads.plaintext > 0) {
      addWarning(
        checks,
        'inventory_plaintext',
        'Legacy plaintext inventory',
        `${payloads.plaintext} available item(s) must be re-imported with encryption.`
      );
    } else if (payloads.undecryptable > 0) {
      addWarning(
        checks,
        'inventory_decryption',
        'Inventory decryption failed',
        `${payloads.undecryptable} available item(s) cannot be decrypted with the configured key.`
      );
    } else if (payloads.available > 0) {
      addOk(checks, 'inventory_payloads', 'Inventory payloads', 'Encrypted and decryptable');
    }
  }

  if (!config.sales.enabled) {
    addWarning(checks, 'sales', 'Sales are closed', 'Set SALES_ENABLED=true only after SePay, product policies and inventory are ready.');
  } else {
    const salesProblems = salesReadinessProblems();
    if (salesProblems.length) {
      addWarning(checks, 'sales', 'Sales configuration is incomplete', salesProblems.join('; '));
    } else {
      addOk(checks, 'sales', 'Sales', 'Order creation enabled');
    }

    if (db) {
      const inventory = inventorySummary(db);
      if (inventory.activeStockProducts === 0) {
        addOk(checks, 'inventory_available', 'Available inventory', 'No active stock-backed products require inventory.');
      } else if (inventory.stockBacked.available > 0) {
        addOk(checks, 'inventory_available', 'Available inventory', `${inventory.stockBacked.available} item(s) ready`);
      } else {
        addWarning(checks, 'inventory_available', 'No inventory available', 'Import encrypted stock before opening sales.');
      }

      const incompleteProducts = db.products.filter((product) => (
        product.active !== false
        && [
          'description',
          'accountType',
          'warrantyPolicy',
          'replacementPolicy',
          ...(requiresSeatUsagePolicy(product) ? ['usagePolicy'] : [])
        ]
          .some((key) => !String(product[key] || '').trim())
      ));
      if (incompleteProducts.length) {
        addWarning(
          checks,
          'product_policies',
          'Product purchase information is incomplete',
          `${incompleteProducts.length} active product(s) need description, account type, warranty, replacement policy or required Seat usage rules.`
        );
      } else {
        addOk(checks, 'product_policies', 'Product purchase information', 'Complete');
      }

      const invalidDeliveryModes = db.products.filter((product) => (
        product.active !== false
        && product.deliveryMode !== undefined
        && !isDeliveryMode(product.deliveryMode)
      ));
      if (invalidDeliveryModes.length) {
        addWarning(
          checks,
          'product_delivery_modes',
          'Product delivery modes are invalid',
          `${invalidDeliveryModes.length} active product(s) must use text or file.`
        );
      } else {
        addOk(checks, 'product_delivery_modes', 'Product delivery modes', 'Valid');
      }
    }
  }

  if (db) {
    for (const [provider, integration] of Object.entries(config.memberFulfillment.integrations)) {
      const activeSkus = db.products
        .filter((product) => (
          product.active !== false
          && isSeatEmailFulfillment(product)
          && integration.skus.includes(String(product.sku || '').toLowerCase())
        ))
        .map((product) => product.sku);
      if (!activeSkus.length) continue;
      const label = {
        chatgpt: 'ChatGPT member service',
        canva: 'Canva member API',
        claude: 'Claude member API'
      }[provider] || `${provider} member API`;
      if (memberIntegrationReady(integration)) {
        addOk(
          checks,
          `member_service_${provider}`,
          label,
          `${activeSkus.length} automatic Seat SKU(s) configured; live API connectivity is checked during fulfillment.`
        );
      } else {
        addWarning(
          checks,
          `member_service_${provider}`,
          `${label} is not fully configured`,
          `Set enabled, private/HTTPS URL, API key and account reference for: ${activeSkus.join(', ')}.`
        );
      }
    }
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
    } else if (config.sepay.webhookAuth === 'hmac' && strongWebhookCredential(config.sepay.webhookSecret)) {
      addOk(checks, 'sepay_webhook_auth', 'SePay webhook auth', 'HMAC');
    } else if (
      ['api_key', 'apikey'].includes(config.sepay.webhookAuth)
      && strongWebhookCredential(config.sepay.webhookApiKey)
    ) {
      addOk(checks, 'sepay_webhook_auth', 'SePay webhook auth', 'API key');
    } else {
      addWarning(checks, 'sepay_webhook_auth', 'SePay webhook credential missing or weak', 'Set a strong SEPAY_WEBHOOK_SECRET or SEPAY_WEBHOOK_API_KEY for the selected auth mode.');
    }

    if (config.sepay.webhookAccountNumbers.length > 0) {
      addOk(
        checks,
        'sepay_account_allowlist',
        'SePay destination account allowlist',
        `${config.sepay.webhookAccountNumbers.length} account(s) configured`
      );
    } else if (production) {
      addWarning(
        checks,
        'sepay_account_allowlist',
        'SePay destination account allowlist missing',
        'Set SEPAY_WEBHOOK_ACCOUNT_NUMBERS before accepting production payments.'
      );
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
  const emojiDetail = telegramEmojiReadinessDetail(emojiStatus, loadedPacks, requiredPacks);
  const emojiShouldWarn = !emojiStatus.ready
    && (production || emojiStatus.liveHealth?.required);
  if (!emojiStatus.enabled) {
    checks.push(item('telegram_custom_text_emoji', 'Telegram text custom emoji', 'ok', 'Disabled by TELEGRAM_CUSTOM_TEXT_EMOJI=false.'));
  } else if (emojiShouldWarn) {
    addWarning(checks, 'telegram_custom_text_emoji', 'Telegram custom emoji readiness incomplete', emojiDetail);
  } else {
    addOk(checks, 'telegram_custom_text_emoji', 'Telegram custom emoji', emojiDetail);
  }

  return checks;
}

export async function getSystemStatus() {
  const db = await readStore();
  const checks = buildChecks(db);
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
    memberFulfillment: memberFulfillmentSummary(),
    sales: {
      enabled: config.sales.enabled,
      inventoryEncryptionConfigured: inventoryEncryptionStatus().valid,
      inventory: inventorySummary(db)
    },
    telegram: {
      tokenConfigured: Boolean(config.telegram.token),
      polling: config.telegram.polling,
      webhookSecretConfigured: Boolean(config.telegram.webhookSecret),
      mediaFileIdCacheEnabled: config.telegram.mediaFileIdCache,
      mediaFileIdCacheStore: config.telegram.mediaFileIdCache
        ? configured('REDIS_URL') ? 'redis' : 'memory'
        : 'disabled',
      mediaFileIdCacheTtlSeconds: config.telegram.mediaFileIdCacheTtlSeconds,
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
  const checks = buildChecks(db);
  const warnings = checks.filter((check) => check.status === 'warning').length;
  const provider = supportedPaymentProviders.has(config.payment.provider) ? config.payment.provider : 'mock_fallback';
  const sepayEnabled = provider === 'sepay';
  const webhookBase = appBaseUrl();
  const telegramEmoji = getTelegramEmojiStatus();

  return {
    ok: warnings === 0,
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
    sales: {
      enabled: config.sales.enabled,
      inventoryEncryptionConfigured: inventoryEncryptionStatus().valid
    },
    telegram: {
      tokenConfigured: Boolean(config.telegram.token),
      polling: config.telegram.polling,
      webhookSecretConfigured: Boolean(config.telegram.webhookSecret),
      mediaFileIdCacheEnabled: config.telegram.mediaFileIdCache,
      mediaFileIdCacheStore: config.telegram.mediaFileIdCache
        ? configured('REDIS_URL') ? 'redis' : 'memory'
        : 'disabled',
      mediaFileIdCacheTtlSeconds: config.telegram.mediaFileIdCacheTtlSeconds,
      webhookUrl: `${webhookBase}/api/public/telegram/webhook`
    },
    telegramEmoji,
    payment: {
      provider,
      configuredProvider: config.payment.provider,
      sepayWebhookUrl: `${webhookBase}/api/public/payments/sepay-webhook`,
      mockWebhookUrl: `${webhookBase}/api/public/payments/mock-webhook`
    },
    memberFulfillment: memberFulfillmentSummary(),
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
