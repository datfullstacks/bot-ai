import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataFile = resolve(process.cwd(), 'data', `system-readiness-${process.pid}-${Date.now()}.json`);
const brandEmojiMapFile = resolve(process.cwd(), 'data', `telegram-brand-readiness-${process.pid}-${Date.now()}.json`);
const bannerEmojiMapFile = resolve(process.cwd(), 'data', `telegram-banner-readiness-${process.pid}-${Date.now()}.json`);
const uiEmojiMapFile = resolve(process.cwd(), 'data', `telegram-ui-readiness-${process.pid}-${Date.now()}.json`);
const sloganEmojiMapFile = resolve(process.cwd(), 'data', `telegram-slogan-readiness-${process.pid}-${Date.now()}.json`);
const sloganTileEmojiMapFile = resolve(process.cwd(), 'data', `telegram-slogan-tile-readiness-${process.pid}-${Date.now()}.json`);
const newsEmojiMapFile = resolve(process.cwd(), 'data', `telegram-news-readiness-${process.pid}-${Date.now()}.json`);
const flameEmojiMapFile = resolve(process.cwd(), 'data', `telegram-flame-readiness-${process.pid}-${Date.now()}.json`);
const gameEmojiMapFile = resolve(process.cwd(), 'data', `telegram-game-readiness-${process.pid}-${Date.now()}.json`);
const roboEmojiMapFile = resolve(process.cwd(), 'data', `telegram-robo-readiness-${process.pid}-${Date.now()}.json`);
const retroEmojiMapFile = resolve(process.cwd(), 'data', `telegram-retro-readiness-${process.pid}-${Date.now()}.json`);
const emojiHealthReportFile = resolve(process.cwd(), 'data', `telegram-emoji-health-${process.pid}-${Date.now()}.json`);

process.env.STORE_DRIVER = 'json';
process.env.DATA_FILE = dataFile;
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
process.env.PAYMENT_PROVIDER = 'sepay';
process.env.SALES_ENABLED = 'true';
process.env.INVENTORY_ENCRYPTION_KEY = '11'.repeat(32);
process.env.SEPAY_ACCOUNT_NUMBER = '1234567890';
process.env.SEPAY_BANK_CODE = 'MBBank';
process.env.SEPAY_WEBHOOK_ACCOUNT_NUMBERS = '1234567890';
process.env.SEPAY_WEBHOOK_AUTH = 'hmac';
process.env.SEPAY_WEBHOOK_SECRET = 'readiness-sepay-secret';
process.env.TELEGRAM_BOT_TOKEN = '123456:test-token';
process.env.TELEGRAM_POLLING = 'true';
process.env.TELEGRAM_WEBHOOK_SECRET = 'telegram-webhook-secret';
process.env.TELEGRAM_CUSTOM_EMOJI_MAP_FILE = brandEmojiMapFile;
process.env.TELEGRAM_BANNER_EMOJI_MAP_FILE = bannerEmojiMapFile;
process.env.TELEGRAM_UI_EMOJI_MAP_FILE = uiEmojiMapFile;
process.env.TELEGRAM_SLOGAN_EMOJI_MAP_FILE = sloganEmojiMapFile;
process.env.TELEGRAM_SLOGAN_TILE_EMOJI_MAP_FILE = sloganTileEmojiMapFile;
process.env.TELEGRAM_NEWS_EMOJI_MAP_FILE = newsEmojiMapFile;
process.env.TELEGRAM_FLAME_EMOJI_MAP_FILE = flameEmojiMapFile;
process.env.TELEGRAM_GAME_EMOJI_MAP_FILE = gameEmojiMapFile;
process.env.TELEGRAM_ROBO_EMOJI_MAP_FILE = roboEmojiMapFile;
process.env.TELEGRAM_RETRO_FONT_EMOJI_MAP_FILE = retroEmojiMapFile;
process.env.TELEGRAM_EMOJI_HEALTH_REPORT_FILE = emojiHealthReportFile;
process.env.TELEGRAM_EMOJI_REQUIRED_PACKS = 'banner,ui,slogan';
process.env.TELEGRAM_EMOJI_HEALTH_MAX_AGE_HOURS = '24';
process.env.BASE_URL = 'https://shop.example.test';
process.env.AUTH_SECRET = 'readiness-auth-secret-with-more-than-32-chars';
process.env.ADMIN_PASSWORD = 'readiness-strong-password';
process.env.GPT_MEMBER_SERVICE_ENABLED = 'true';
process.env.GPT_MEMBER_SERVICE_URL = 'http://gpt-member-service.railway.internal:3002/api/v1';
process.env.GPT_MEMBER_SERVICE_API_KEY = 'gsk_readiness_chatgpt';
process.env.GPT_MEMBER_ACCOUNT_REF = 'chatgpt-admin@example.com';
process.env.CANVA_MEMBER_SERVICE_ENABLED = 'true';
process.env.CANVA_MEMBER_SERVICE_URL = 'http://canva-member-api.railway.internal:3012/api/v1';
process.env.CANVA_MEMBER_SERVICE_API_KEY = 'gsk_readiness_canva';
process.env.CANVA_MEMBER_ACCOUNT_REF = 'canva-admin@example.com';

const storage = await import('../src/storage.js');
const shop = await import('../src/shop.js');
const system = await import('../src/systemStatus.js');
const emojiRegistry = await import('../src/telegramEmojiRegistry.js');
const emojiHealth = await import('../src/telegramEmojiHealth.js');

try {
  const requiredKeys = emojiRegistry.DEFAULT_REQUIRED_KEYS_BY_PACK;
  await Promise.all([
    writeFile(brandEmojiMapFile, JSON.stringify(fileMap(['chatgpt'], 'brand')), 'utf8'),
    writeFile(uiEmojiMapFile, JSON.stringify(fileMap(requiredKeys.ui, 'ui')), 'utf8'),
    writeFile(sloganTileEmojiMapFile, JSON.stringify({
      stickerType: 'custom_emoji',
      customEmojiIdsByFile: Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => [
          `daily_update_0${index}.webm`,
          `ce_slogan_tile_daily_update_0${index}`
        ])
      ),
      slogans: {
        daily_update: {
          tiles: Array.from({ length: 6 }, (_, index) => ({
            key: `daily_update_0${index}`,
            customEmojiId: `ce_slogan_tile_daily_update_0${index}`
          }))
        }
      }
    }), 'utf8'),
    writeFile(
      newsEmojiMapFile,
      JSON.stringify(newsFileMap(
        requiredKeys.news,
        emojiRegistry.DEFAULT_REQUIRED_MIN_COUNTS_BY_PACK.news
      )),
      'utf8'
    ),
    writeFile(flameEmojiMapFile, JSON.stringify(fileMap(requiredKeys.flame, 'flame', 'tgs')), 'utf8'),
    writeFile(gameEmojiMapFile, JSON.stringify(fileMap(requiredKeys.game, 'game', 'tgs')), 'utf8'),
    writeFile(roboEmojiMapFile, JSON.stringify({
      stickerType: 'custom_emoji',
      customEmojiIdsByAlias: Object.fromEntries(
        requiredKeys.robo.map((key) => [key, [`ce_robo_${key}`]])
      )
    }), 'utf8'),
    writeFile(retroEmojiMapFile, JSON.stringify({
      stickerType: 'custom_emoji',
      customEmojiIdsByCharacter: Object.fromEntries(
        requiredKeys.retro.map((key) => [key, `ce_retro_${key}`])
      )
    }), 'utf8')
  ]);
  const initialEmojiHealthReport = await emojiHealth.buildTelegramEmojiHealthReport({
    registry: emojiHealth.loadTelegramEmojiRegistryFromConfig(),
    requiredPacks: emojiRegistry.DEFAULT_REQUIRED_EMOJI_PACKS,
    token: process.env.TELEGRAM_BOT_TOKEN,
    fetchImpl: async (_url, options) => {
      const ids = JSON.parse(options.body).custom_emoji_ids;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            result: ids.map((id) => ({ custom_emoji_id: id }))
          };
        }
      };
    }
  });
  await writeFile(emojiHealthReportFile, JSON.stringify(initialEmojiHealthReport), 'utf8');

  await storage.initStore();
  const product = await shop.createProduct('readiness-admin', {
    sku: 'ready-chatgpt',
    name: 'Ready ChatGPT',
    description: 'Readiness inventory product',
    accountType: 'Tài khoản riêng',
    warrantyPolicy: 'Bảo hành 30 ngày',
    replacementPolicy: 'Đổi khi lỗi bàn giao',
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
  assert.equal(readiness.checks.some((check) => check.id === 'sepay_account_allowlist' && check.status === 'ok'), true);
  assert.equal(readiness.telegram.tokenConfigured, true);
  assert.equal(readiness.telegram.polling, true);
  assert.equal(readiness.telegram.webhookSecretConfigured, true);
  assert.equal(readiness.telegramEmoji.enabled, true);
  assert.deepEqual(readiness.telegramEmoji.requiredPacks, emojiRegistry.DEFAULT_REQUIRED_EMOJI_PACKS);
  assert.equal(readiness.telegramEmoji.requiredPacks.length, 8);
  assert.equal(readiness.telegramEmoji.requiredPacks.includes('sloganTile'), true);
  assert.equal(readiness.telegramEmoji.requiredPacks.includes('banner'), false);
  assert.equal(readiness.telegramEmoji.requiredPacks.includes('slogan'), false);
  assert.equal(readiness.telegramEmoji.packs.banner, undefined);
  assert.equal(readiness.telegramEmoji.packs.slogan, undefined);
  assert.equal(readiness.telegramEmoji.packs.sloganTile.availableRequiredKeys, 1);
  assert.equal(readiness.telegramEmoji.packs.news.loaded, true);
  assert.equal(readiness.telegramEmoji.packs.news.customEmojiIdCount, 100);
  assert.equal(readiness.telegramEmoji.packs.news.missingRequiredCustomEmojiIds, 0);
  assert.equal(readiness.telegramEmoji.packs.flame.loaded, true);
  assert.equal(readiness.telegramEmoji.packs.game.loaded, true);
  assert.equal(
    readiness.telegramEmoji.lastHealth.telegramValidation.returned,
    initialEmojiHealthReport.telegramValidation.requested
  );
  assert.equal(readiness.telegramEmoji.liveHealth.status, 'healthy');
  assert.equal(readiness.traffic.redisConfigured, false);
  assert.equal(readiness.inventory.products >= 1, true);
  assert.equal(readiness.inventory.available >= 1, true);
  assert.equal(readiness.webhooks.telegram, 'https://shop.example.test/api/public/telegram/webhook');
  assert.equal(readiness.webhooks.sepay, 'https://shop.example.test/api/public/payments/sepay-webhook');
  assert.equal(readiness.memberFulfillment.chatgpt.configured, true);
  assert.equal(readiness.memberFulfillment.canva.configured, true);
  assert.equal(JSON.stringify(readiness).includes('gsk_readiness_'), false, 'Readiness must not expose member API keys.');
  assert.equal(JSON.stringify(readiness).includes('.railway.internal'), false, 'Public readiness must not expose private service hostnames.');
  const chatgptMemberCheck = readiness.checks.find((check) => check.id === 'member_service_chatgpt');
  assert.equal(chatgptMemberCheck?.status, 'ok');
  assert.match(chatgptMemberCheck?.detail || '', /configured/i);
  assert.doesNotMatch(chatgptMemberCheck?.detail || '', /\bconnected\b/i);
  assert.equal(readiness.checks.some((check) => check.id === 'member_service_canva' && check.status === 'ok'), true);
  assert.ok(Array.isArray(readiness.checks));
  assert.equal(readiness.checks.some((check) => check.id === 'sepay_webhook_auth' && check.status === 'ok'), true);
  assert.equal(readiness.checks.some((check) => check.id === 'product_delivery_modes' && check.status === 'ok'), true);
  assert.equal(readiness.checks.some((check) => (
    check.id === 'telegram_custom_text_emoji'
    && check.status === 'ok'
    && check.detail.includes('live Telegram validation passed')
  )), true);

  await writeFile(emojiHealthReportFile, JSON.stringify({
    ...initialEmojiHealthReport,
    generatedAt: '2000-01-01T00:00:00.000Z',
  }), 'utf8');
  const staleReadiness = await system.getReadiness();
  assert.equal(staleReadiness.ok, false);
  assert.equal(staleReadiness.telegramEmoji.liveHealth.status, 'stale');
  assert.equal(staleReadiness.checks.some((check) => (
    check.id === 'telegram_custom_text_emoji'
    && check.status === 'warning'
    && check.detail.includes('is stale')
  )), true);

  console.log(JSON.stringify({ ok: true, checked: 'runtime readiness detail' }, null, 2));
} finally {
  await Promise.all([
    dataFile,
    brandEmojiMapFile,
    bannerEmojiMapFile,
    uiEmojiMapFile,
    sloganEmojiMapFile,
    sloganTileEmojiMapFile,
    newsEmojiMapFile,
    flameEmojiMapFile,
    gameEmojiMapFile,
    roboEmojiMapFile,
    retroEmojiMapFile,
    emojiHealthReportFile
  ].map((file) => rm(file, { force: true })));
}

function fileMap(keys, prefix, extension = 'webm') {
  return {
    stickerType: 'custom_emoji',
    customEmojiIdsByFile: Object.fromEntries(
      keys.map((key) => [`${key}.${extension}`, `ce_${prefix}_${key}`])
    )
  };
}

function newsFileMap(requiredKeys, minimumCount) {
  const fillerCount = Math.max(0, minimumCount - requiredKeys.length);
  return fileMap([
    ...requiredKeys,
    ...Array.from({ length: fillerCount }, (_, index) => `item-${String(index).padStart(3, '0')}`)
  ], 'news', 'tgs');
}
