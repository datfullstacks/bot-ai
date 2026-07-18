import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const generatedSecret = randomBytes(32).toString('hex');

function commaSeparated(value, fallback = '') {
  return String(value ?? fallback)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function enabled(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function accountRefsBySku(value, name) {
  const raw = String(value || '').trim();
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be a JSON object mapping SKU to account reference`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object mapping SKU to account reference`);
  }
  const output = {};
  for (const [skuValue, accountRefValue] of Object.entries(parsed)) {
    const sku = String(skuValue || '').trim().toLowerCase();
    const accountRef = String(accountRefValue || '').trim();
    if (!sku || !accountRef || accountRef.length > 320) {
      throw new Error(`${name} contains an invalid SKU or account reference`);
    }
    output[sku] = accountRef;
  }
  return output;
}

export function boundedInteger(value, fallback, { name = 'value', min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function boundedEnv(name, fallback, bounds) {
  return boundedInteger(process.env[name], fallback, { name, ...bounds });
}

const gptMemberServiceUrl = String(
  process.env.GPT_MEMBER_SERVICE_URL || process.env.GPT_MEMBER_SERVICE_BASE_URL || ''
).trim();
const canvaMemberServiceUrl = String(
  process.env.CANVA_MEMBER_SERVICE_URL || process.env.CANVA_MEMBER_SERVICE_BASE_URL || ''
).trim();
const claudeMemberServiceUrl = String(
  process.env.CLAUDE_MEMBER_SERVICE_URL || process.env.CLAUDE_MEMBER_SERVICE_BASE_URL || ''
).trim();

export const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  dataFile: process.env.DATA_FILE || resolve(process.cwd(), 'data', 'db.json'),
  storage: {
    driver: process.env.STORE_DRIVER || (process.env.DATABASE_URL ? 'postgres' : 'json'),
    postgresWriteMode: process.env.POSTGRES_WRITE_MODE || 'row'
  },
  database: {
    url: process.env.DATABASE_URL || '',
    poolMax: Number(process.env.DATABASE_POOL_MAX || 10)
  },
  redis: {
    url: process.env.REDIS_URL || '',
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'kaito-ai-shop'
  },
  sales: {
    enabled: String(
      process.env.SALES_ENABLED
        ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')
    ).toLowerCase() === 'true',
    testTelegramIds: String(process.env.SALES_TEST_TELEGRAM_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  },
  inventory: {
    encryptionKey: process.env.INVENTORY_ENCRYPTION_KEY || ''
  },
  auth: {
    secret: process.env.AUTH_SECRET || generatedSecret,
    secureCookie: process.env.NODE_ENV === 'production'
  },
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    polling: String(process.env.TELEGRAM_POLLING || 'false').toLowerCase() === 'true',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    welcomeAnimationUrl: process.env.TELEGRAM_WELCOME_ANIMATION_URL || '',
    startImageFileId: process.env.TELEGRAM_START_IMAGE_FILE_ID || '',
    startImageUrl: process.env.TELEGRAM_START_IMAGE_URL || '',
    startImageFile: process.env.TELEGRAM_START_IMAGE_FILE || resolve(process.cwd(), 'public', 'brand', 'start', 'welcome.png'),
    supportHandle: process.env.TELEGRAM_SUPPORT_HANDLE || '',
    customTextEmoji: String(process.env.TELEGRAM_CUSTOM_TEXT_EMOJI || 'true').toLowerCase() !== 'false',
    customEmojiMapFile: process.env.TELEGRAM_CUSTOM_EMOJI_MAP_FILE || resolve(process.cwd(), 'data', 'telegram-custom-emoji-map.json'),
    uiEmojiMapFile: process.env.TELEGRAM_UI_EMOJI_MAP_FILE || resolve(process.cwd(), 'data', 'telegram-ui-emoji-map.json'),
    sloganEmojiMapFile: process.env.TELEGRAM_SLOGAN_EMOJI_MAP_FILE || resolve(process.cwd(), 'data', 'telegram-slogan-emoji-map.json'),
    sloganTileEmojiMapFile: process.env.TELEGRAM_SLOGAN_TILE_EMOJI_MAP_FILE || resolve(process.cwd(), 'data', 'telegram-slogan-tile-emoji-map.json'),
    bannerEmojiMapFile: process.env.TELEGRAM_BANNER_EMOJI_MAP_FILE || resolve(process.cwd(), 'data', 'telegram-banner-emoji-map.json'),
    newsEmojiMapFile: process.env.TELEGRAM_NEWS_EMOJI_MAP_FILE || resolve(process.cwd(), 'data', 'telegram-news-emoji-map.json'),
    flameEmojiMapFile: process.env.TELEGRAM_FLAME_EMOJI_MAP_FILE || resolve(process.cwd(), 'data', 'telegram-flame-emoji-map.json'),
    gameEmojiMapFile: process.env.TELEGRAM_GAME_EMOJI_MAP_FILE || resolve(process.cwd(), 'data', 'telegram-game-emoji-map.json'),
    roboEmojiMapFile: process.env.TELEGRAM_ROBO_EMOJI_MAP_FILE || resolve(process.cwd(), 'data', 'telegram-robo-emoji-map.json'),
    retroFontEmojiMapFile: process.env.TELEGRAM_RETRO_FONT_EMOJI_MAP_FILE || resolve(process.cwd(), 'data', 'telegram-retro-font-emoji-map.json'),
    emojiHealthReportFile: process.env.TELEGRAM_EMOJI_HEALTH_REPORT_FILE || resolve(process.cwd(), 'data', 'telegram-emoji-health-report.json'),
    emojiReleaseReportFile: process.env.TELEGRAM_EMOJI_RELEASE_REPORT_FILE || resolve(process.cwd(), 'data', 'telegram-emoji-release-report.json'),
    emojiRequiredPacks: process.env.TELEGRAM_EMOJI_REQUIRED_PACKS || 'brand,ui,sloganTile,news,flame,game,robo,retro',
    emojiHealthMaxAgeHours: Number(process.env.TELEGRAM_EMOJI_HEALTH_MAX_AGE_HOURS || 24),
    stickerMapFile: process.env.TELEGRAM_STICKER_MAP_FILE || resolve(process.cwd(), 'data', 'telegram-shop-sticker-map.json'),
    stickers: {
      start: process.env.TELEGRAM_START_STICKER_ID || '',
      catalog: process.env.TELEGRAM_CATALOG_STICKER_ID || '',
      brand: process.env.TELEGRAM_BRAND_STICKER_ID || '',
      topup: process.env.TELEGRAM_TOPUP_STICKER_ID || '',
      account: process.env.TELEGRAM_ACCOUNT_STICKER_ID || '',
      language: process.env.TELEGRAM_LANGUAGE_STICKER_ID || '',
      support: process.env.TELEGRAM_SUPPORT_STICKER_ID || '',
      order: process.env.TELEGRAM_ORDER_STICKER_ID || '',
      delivery: process.env.TELEGRAM_DELIVERY_STICKER_ID || ''
    }
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'mock',
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'dev-payment-secret'
  },
  orders: {
    ttlMinutes: Number(process.env.ORDER_TTL_MINUTES || 15),
    maxQuantity: Number(process.env.MAX_ORDER_QUANTITY || 20),
    maxPendingPerUser: Number(process.env.MAX_PENDING_ORDERS_PER_USER || 3)
  },
  memberFulfillment: {
    sweepIntervalMs: boundedEnv('MEMBER_FULFILLMENT_SWEEP_MS', 30_000, { min: 10_000, max: 3_600_000 }),
    concurrency: boundedEnv('MEMBER_FULFILLMENT_CONCURRENCY', 2, { min: 1, max: 10 }),
    retryBaseMs: boundedEnv('MEMBER_FULFILLMENT_RETRY_BASE_MS', 30_000, { min: 1_000, max: 900_000 }),
    maxRetries: boundedEnv('MEMBER_FULFILLMENT_MAX_RETRIES', 8, { min: 0, max: 50 }),
    integrations: {
      chatgpt: {
        enabled: enabled(process.env.GPT_MEMBER_SERVICE_ENABLED, Boolean(gptMemberServiceUrl)),
        serviceUrl: gptMemberServiceUrl,
        apiKey: String(process.env.GPT_MEMBER_SERVICE_API_KEY || '').trim(),
        seatGuardApiKey: String(
          process.env.GPT_SEAT_GUARD_API_KEY || process.env.GPT_MEMBER_SERVICE_API_KEY || ''
        ).trim(),
        accountRef: String(
          process.env.GPT_MEMBER_ACCOUNT_REF || process.env.GPT_MEMBER_SERVICE_ACCOUNT_REF || ''
        ).trim(),
        skus: commaSeparated(process.env.GPT_MEMBER_SKUS, 'chatgpt-business-seat-1m'),
        protectedEmails: commaSeparated(process.env.GPT_SEAT_PROTECTED_EMAILS),
        defaultSeatTermMonths: boundedEnv('GPT_SEAT_DEFAULT_TERM_MONTHS', 1, { min: 1, max: 120 }),
        seatGuardMaxResponseBytes: boundedEnv('GPT_SEAT_GUARD_MAX_RESPONSE_BYTES', 2 * 1024 * 1024, {
          min: 64 * 1024,
          max: 10 * 1024 * 1024
        }),
        expiryAutoRemove: enabled(process.env.GPT_SEAT_EXPIRY_AUTO_REMOVE, false),
        expirySweepMs: boundedEnv('GPT_SEAT_EXPIRY_SWEEP_MS', 15 * 60_000, {
          min: 60_000,
          max: 24 * 60 * 60_000
        }),
        expiryBatchSize: boundedEnv('GPT_SEAT_EXPIRY_BATCH_SIZE', 10, { min: 1, max: 100 }),
        expiryGraceMs: boundedEnv('GPT_SEAT_EXPIRY_GRACE_MS', 0, {
          min: 0,
          max: 7 * 24 * 60 * 60_000
        }),
        expiryRetryWindowMs: boundedEnv('GPT_SEAT_EXPIRY_RETRY_WINDOW_MS', 15 * 60_000, {
          min: 15 * 60_000,
          max: 7 * 24 * 60 * 60_000
        }),
        requestTimeoutMs: boundedEnv('GPT_MEMBER_REQUEST_TIMEOUT_MS', 10_000, { min: 1_000, max: 120_000 }),
        operationTimeoutMs: boundedEnv('GPT_MEMBER_OPERATION_TIMEOUT_MS', 180_000, { min: 1_000, max: 1_800_000 }),
        pollIntervalMs: boundedEnv('GPT_MEMBER_POLL_INTERVAL_MS', 1_500, { min: 100, max: 60_000 })
      },
      canva: {
        enabled: enabled(process.env.CANVA_MEMBER_SERVICE_ENABLED, Boolean(canvaMemberServiceUrl)),
        serviceUrl: canvaMemberServiceUrl,
        apiKey: String(process.env.CANVA_MEMBER_SERVICE_API_KEY || '').trim(),
        seatGuardApiKey: String(
          process.env.CANVA_SEAT_GUARD_API_KEY || process.env.CANVA_MEMBER_SERVICE_API_KEY || ''
        ).trim(),
        accountRef: String(
          process.env.CANVA_MEMBER_ACCOUNT_REF || process.env.CANVA_MEMBER_SERVICE_ACCOUNT_REF || ''
        ).trim(),
        skus: commaSeparated(process.env.CANVA_MEMBER_SKUS, 'canva-pro-1m,canva-pro-6m'),
        protectedEmails: commaSeparated(process.env.CANVA_SEAT_PROTECTED_EMAILS),
        defaultSeatTermMonths: boundedEnv('CANVA_SEAT_DEFAULT_TERM_MONTHS', 1, { min: 1, max: 120 }),
        seatGuardMaxResponseBytes: boundedEnv('CANVA_SEAT_GUARD_MAX_RESPONSE_BYTES', 2 * 1024 * 1024, {
          min: 64 * 1024,
          max: 10 * 1024 * 1024
        }),
        expiryAutoRemove: enabled(process.env.CANVA_SEAT_EXPIRY_AUTO_REMOVE, false),
        expirySweepMs: boundedEnv('CANVA_SEAT_EXPIRY_SWEEP_MS', 15 * 60_000, {
          min: 60_000,
          max: 24 * 60 * 60_000
        }),
        expiryBatchSize: boundedEnv('CANVA_SEAT_EXPIRY_BATCH_SIZE', 10, { min: 1, max: 100 }),
        expiryGraceMs: boundedEnv('CANVA_SEAT_EXPIRY_GRACE_MS', 0, {
          min: 0,
          max: 7 * 24 * 60 * 60_000
        }),
        expiryRetryWindowMs: boundedEnv('CANVA_SEAT_EXPIRY_RETRY_WINDOW_MS', 15 * 60_000, {
          min: 15 * 60_000,
          max: 7 * 24 * 60 * 60_000
        }),
        requestTimeoutMs: boundedEnv('CANVA_MEMBER_REQUEST_TIMEOUT_MS', 10_000, { min: 1_000, max: 120_000 }),
        operationTimeoutMs: boundedEnv('CANVA_MEMBER_OPERATION_TIMEOUT_MS', 600_000, { min: 1_000, max: 1_800_000 }),
        pollIntervalMs: boundedEnv('CANVA_MEMBER_POLL_INTERVAL_MS', 2_000, { min: 100, max: 60_000 })
      },
      claude: {
        enabled: enabled(process.env.CLAUDE_MEMBER_SERVICE_ENABLED, Boolean(claudeMemberServiceUrl)),
        serviceUrl: claudeMemberServiceUrl,
        apiKey: String(process.env.CLAUDE_MEMBER_SERVICE_API_KEY || '').trim(),
        seatGuardApiKey: String(
          process.env.CLAUDE_SEAT_GUARD_API_KEY || process.env.CLAUDE_MEMBER_SERVICE_API_KEY || ''
        ).trim(),
        accountRef: String(
          process.env.CLAUDE_MEMBER_ACCOUNT_REF || process.env.CLAUDE_MEMBER_SERVICE_ACCOUNT_REF || ''
        ).trim(),
        accountRefsBySku: accountRefsBySku(
          process.env.CLAUDE_MEMBER_ACCOUNT_REFS_BY_SKU,
          'CLAUDE_MEMBER_ACCOUNT_REFS_BY_SKU'
        ),
        skus: commaSeparated(
          process.env.CLAUDE_MEMBER_SKUS,
          'claude-business-seat-1x-1m,claude-business-seat-6-5x-1m'
        ),
        protectedEmails: commaSeparated(process.env.CLAUDE_SEAT_PROTECTED_EMAILS),
        defaultSeatTermMonths: boundedEnv('CLAUDE_SEAT_DEFAULT_TERM_MONTHS', 1, { min: 1, max: 120 }),
        seatGuardMaxResponseBytes: boundedEnv('CLAUDE_SEAT_GUARD_MAX_RESPONSE_BYTES', 2 * 1024 * 1024, {
          min: 64 * 1024,
          max: 10 * 1024 * 1024
        }),
        expiryAutoRemove: enabled(process.env.CLAUDE_SEAT_EXPIRY_AUTO_REMOVE, false),
        expirySweepMs: boundedEnv('CLAUDE_SEAT_EXPIRY_SWEEP_MS', 15 * 60_000, {
          min: 60_000,
          max: 24 * 60 * 60_000
        }),
        expiryBatchSize: boundedEnv('CLAUDE_SEAT_EXPIRY_BATCH_SIZE', 10, { min: 1, max: 100 }),
        expiryGraceMs: boundedEnv('CLAUDE_SEAT_EXPIRY_GRACE_MS', 0, {
          min: 0,
          max: 7 * 24 * 60 * 60_000
        }),
        expiryRetryWindowMs: boundedEnv('CLAUDE_SEAT_EXPIRY_RETRY_WINDOW_MS', 15 * 60_000, {
          min: 15 * 60_000,
          max: 7 * 24 * 60 * 60_000
        }),
        requestTimeoutMs: boundedEnv('CLAUDE_MEMBER_REQUEST_TIMEOUT_MS', 10_000, { min: 1_000, max: 120_000 }),
        operationTimeoutMs: boundedEnv('CLAUDE_MEMBER_OPERATION_TIMEOUT_MS', 600_000, { min: 1_000, max: 1_800_000 }),
        pollIntervalMs: boundedEnv('CLAUDE_MEMBER_POLL_INTERVAL_MS', 2_000, { min: 100, max: 60_000 })
      }
    }
  },
  traffic: {
    maxBodyBytes: Number(process.env.MAX_BODY_BYTES || 1024 * 1024),
    authPerMinute: Number(process.env.RATE_LIMIT_AUTH_PER_MINUTE || 12),
    publicPerMinute: Number(process.env.RATE_LIMIT_PUBLIC_PER_MINUTE || 600),
    adminPerMinute: Number(process.env.RATE_LIMIT_ADMIN_PER_MINUTE || 300),
    telegramUserPerMinute: Number(process.env.RATE_LIMIT_TELEGRAM_USER_PER_MINUTE || 30),
    telegramBuyPerMinute: Number(process.env.RATE_LIMIT_TELEGRAM_BUY_PER_MINUTE || 6)
  },
  sepay: {
    accountNumber: process.env.SEPAY_ACCOUNT_NUMBER || '',
    bankCode: process.env.SEPAY_BANK_CODE || '',
    qrTemplate: process.env.SEPAY_QR_TEMPLATE || 'compact',
    paymentPrefix: process.env.SEPAY_PAYMENT_PREFIX || 'KAITO',
    memoPrefix: process.env.SEPAY_MEMO_PREFIX || '',
    memoSuffix: process.env.SEPAY_MEMO_SUFFIX || 'thanh toan don hang',
    webhookAuth: String(process.env.SEPAY_WEBHOOK_AUTH || 'hmac').toLowerCase(),
    webhookSecret: process.env.SEPAY_WEBHOOK_SECRET || '',
    webhookApiKey: process.env.SEPAY_WEBHOOK_API_KEY || '',
    webhookAccountNumbers: String(process.env.SEPAY_WEBHOOK_ACCOUNT_NUMBERS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    webhookGateways: String(process.env.SEPAY_WEBHOOK_GATEWAYS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }
};

export function assertMemberSkuRouting(integrations = config.memberFulfillment.integrations) {
  const owners = new Map();
  for (const [provider, integration] of Object.entries(integrations || {})) {
    if (!Array.isArray(integration.skus) || integration.skus.length === 0) {
      throw new Error(`${provider.toUpperCase()}_MEMBER_SKUS must contain at least one SKU`);
    }
    const seen = new Set();
    for (const sku of integration.skus) {
      if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(sku)) {
        throw new Error(`${provider.toUpperCase()}_MEMBER_SKUS contains an invalid SKU`);
      }
      if (seen.has(sku)) {
        throw new Error(`${provider.toUpperCase()}_MEMBER_SKUS contains duplicate SKU ${sku}`);
      }
      seen.add(sku);
      if (owners.has(sku)) {
        throw new Error(`Member SKU ${sku} is routed to both ${owners.get(sku)} and ${provider}`);
      }
      owners.set(sku, provider);
    }
  }
  return true;
}

assertMemberSkuRouting();

export function nowIso() {
  return new Date().toISOString();
}
