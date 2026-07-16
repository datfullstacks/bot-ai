import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataFile = resolve(process.cwd(), 'data', `system-readiness-${process.pid}-${Date.now()}.json`);
const bannerEmojiMapFile = resolve(process.cwd(), 'data', `telegram-banner-readiness-${process.pid}-${Date.now()}.json`);
const uiEmojiMapFile = resolve(process.cwd(), 'data', `telegram-ui-readiness-${process.pid}-${Date.now()}.json`);
const sloganEmojiMapFile = resolve(process.cwd(), 'data', `telegram-slogan-readiness-${process.pid}-${Date.now()}.json`);
const emojiHealthReportFile = resolve(process.cwd(), 'data', `telegram-emoji-health-${process.pid}-${Date.now()}.json`);

process.env.STORE_DRIVER = 'json';
process.env.DATA_FILE = dataFile;
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
process.env.PAYMENT_PROVIDER = 'sepay';
process.env.SEPAY_ACCOUNT_NUMBER = '1234567890';
process.env.SEPAY_BANK_CODE = 'MBBank';
process.env.SEPAY_WEBHOOK_AUTH = 'hmac';
process.env.SEPAY_WEBHOOK_SECRET = 'readiness-sepay-secret';
process.env.TELEGRAM_BOT_TOKEN = '123456:test-token';
process.env.TELEGRAM_POLLING = 'true';
process.env.TELEGRAM_WEBHOOK_SECRET = 'telegram-webhook-secret';
process.env.TELEGRAM_BANNER_EMOJI_MAP_FILE = bannerEmojiMapFile;
process.env.TELEGRAM_UI_EMOJI_MAP_FILE = uiEmojiMapFile;
process.env.TELEGRAM_SLOGAN_EMOJI_MAP_FILE = sloganEmojiMapFile;
process.env.TELEGRAM_EMOJI_HEALTH_REPORT_FILE = emojiHealthReportFile;
process.env.TELEGRAM_EMOJI_REQUIRED_PACKS = 'banner,ui,slogan';
process.env.BASE_URL = 'https://shop.example.test';
process.env.AUTH_SECRET = 'readiness-auth-secret-with-more-than-32-chars';
process.env.ADMIN_PASSWORD = 'readiness-strong-password';

const storage = await import('../src/storage.js');
const shop = await import('../src/shop.js');
const system = await import('../src/systemStatus.js');

try {
  await writeFile(bannerEmojiMapFile, JSON.stringify({
    stickerType: 'custom_emoji',
    customEmojiIdsByFile: {
      'kaito.webm': 'ce_banner_kaito',
      'welcome.webm': 'ce_banner_welcome',
      'products.webm': 'ce_banner_products'
    }
  }), 'utf8');
  await writeFile(uiEmojiMapFile, JSON.stringify({
    stickerType: 'custom_emoji',
    customEmojiIdsByFile: {
      'products.webm': 'ce_ui_products',
      'support.webm': 'ce_ui_support'
    }
  }), 'utf8');
  await writeFile(sloganEmojiMapFile, JSON.stringify({
    stickerType: 'custom_emoji',
    customEmojiIdsByFile: {
      'welcome.webm': 'ce_slogan_welcome',
      'payment.webm': 'ce_slogan_payment'
    }
  }), 'utf8');
  await writeFile(emojiHealthReportFile, JSON.stringify({
    ok: true,
    generatedAt: '2026-06-15T00:00:00.000Z',
    telegramValidation: {
      ok: true,
      requested: 7,
      returned: 7
    }
  }), 'utf8');

  await storage.initStore();
  const product = await shop.createProduct('readiness-admin', {
    sku: 'ready-chatgpt',
    name: 'Ready ChatGPT',
    description: 'Readiness inventory product',
    category: 'AI Accounts',
    brand: 'ChatGPT',
    packageType: 'Plus 1M',
    price: 99000,
    currency: 'VND'
  });
  await shop.importInventory('readiness-admin', product.id, ['ready-account-1']);

  const readiness = await system.getReadiness();

  assert.equal(readiness.ok, true);
  assert.equal(readiness.status, 'ready');
  assert.equal(readiness.storage.driver, 'json');
  assert.equal(readiness.payment.provider, 'sepay');
  assert.equal(readiness.sepay.enabled, true);
  assert.equal(readiness.sepay.accountConfigured, true);
  assert.equal(readiness.sepay.webhookAuth, 'hmac');
  assert.equal(readiness.sepay.webhookAuthConfigured, true);
  assert.equal(readiness.telegram.tokenConfigured, true);
  assert.equal(readiness.telegram.polling, true);
  assert.equal(readiness.telegram.webhookSecretConfigured, true);
  assert.equal(readiness.telegramEmoji.enabled, true);
  assert.equal(readiness.telegramEmoji.requiredPacks.join(','), 'banner,ui,slogan');
  assert.equal(readiness.telegramEmoji.packs.banner.loaded, true);
  assert.equal(readiness.telegramEmoji.packs.banner.availableRequiredKeys, 3);
  assert.equal(readiness.telegramEmoji.lastHealth.telegramValidation.returned, 7);
  assert.equal(readiness.traffic.redisConfigured, false);
  assert.equal(readiness.inventory.products >= 1, true);
  assert.equal(readiness.inventory.available >= 1, true);
  assert.equal(readiness.webhooks.telegram, 'https://shop.example.test/api/public/telegram/webhook');
  assert.equal(readiness.webhooks.sepay, 'https://shop.example.test/api/public/payments/sepay-webhook');
  assert.ok(Array.isArray(readiness.checks));
  assert.equal(readiness.checks.some((check) => check.id === 'sepay_webhook_auth' && check.status === 'ok'), true);

  console.log(JSON.stringify({ ok: true, checked: 'runtime readiness detail' }, null, 2));
} finally {
  await rm(dataFile, { force: true });
  await rm(bannerEmojiMapFile, { force: true });
  await rm(uiEmojiMapFile, { force: true });
  await rm(sloganEmojiMapFile, { force: true });
  await rm(emojiHealthReportFile, { force: true });
}
