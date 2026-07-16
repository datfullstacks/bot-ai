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
    emojiRequiredPacks: process.env.TELEGRAM_EMOJI_REQUIRED_PACKS || 'banner,ui,slogan',
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

export function nowIso() {
  return new Date().toISOString();
}
