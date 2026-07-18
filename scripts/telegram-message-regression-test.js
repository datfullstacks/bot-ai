import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataFile = resolve(process.cwd(), 'data', `telegram-message-${process.pid}-${Date.now()}.json`);
const customEmojiMapFile = resolve(process.cwd(), 'data', `telegram-custom-emoji-${process.pid}-${Date.now()}.json`);
const uiEmojiMapFile = resolve(process.cwd(), 'data', `telegram-ui-emoji-${process.pid}-${Date.now()}.json`);
const sloganEmojiMapFile = resolve(process.cwd(), 'data', `telegram-slogan-emoji-${process.pid}-${Date.now()}.json`);
const sloganTileEmojiMapFile = resolve(process.cwd(), 'data', `telegram-slogan-tile-emoji-${process.pid}-${Date.now()}.json`);
const bannerEmojiMapFile = resolve(process.cwd(), 'data', `telegram-banner-emoji-${process.pid}-${Date.now()}.json`);
const newsEmojiMapFile = resolve(process.cwd(), 'data', `telegram-news-emoji-${process.pid}-${Date.now()}.json`);
const flameEmojiMapFile = resolve(process.cwd(), 'data', `telegram-flame-emoji-${process.pid}-${Date.now()}.json`);
const gameEmojiMapFile = resolve(process.cwd(), 'data', `telegram-game-emoji-${process.pid}-${Date.now()}.json`);
const roboEmojiMapFile = resolve(process.cwd(), 'data', `telegram-robo-emoji-${process.pid}-${Date.now()}.json`);
const retroFontEmojiMapFile = resolve(process.cwd(), 'data', `telegram-retro-font-emoji-${process.pid}-${Date.now()}.json`);
const regularStickerMapFile = resolve(process.cwd(), 'data', `telegram-shop-sticker-${process.pid}-${Date.now()}.json`);
const startImageFile = resolve(process.cwd(), 'data', `telegram-start-image-${process.pid}-${Date.now()}.png`);
const menuEmojiKeys = [
  'products',
  'topup',
  'account',
  'orders',
  'language',
  'support',
  'security',
  'instant-delivery',
  'automation-247',
  'quality',
  'member',
  'offers',
  'notifications',
  'promotions',
  'reviews',
  'academy',
  'news',
  'events',
  'policy',
  'logout'
];
process.env.STORE_DRIVER = 'json';
process.env.DATA_FILE = dataFile;
process.env.BASE_URL = 'http://localhost:3000';
process.env.TELEGRAM_CUSTOM_EMOJI_MAP_FILE = customEmojiMapFile;
process.env.TELEGRAM_UI_EMOJI_MAP_FILE = uiEmojiMapFile;
process.env.TELEGRAM_SLOGAN_EMOJI_MAP_FILE = sloganEmojiMapFile;
process.env.TELEGRAM_SLOGAN_TILE_EMOJI_MAP_FILE = sloganTileEmojiMapFile;
process.env.TELEGRAM_BANNER_EMOJI_MAP_FILE = bannerEmojiMapFile;
process.env.TELEGRAM_NEWS_EMOJI_MAP_FILE = newsEmojiMapFile;
process.env.TELEGRAM_FLAME_EMOJI_MAP_FILE = flameEmojiMapFile;
process.env.TELEGRAM_GAME_EMOJI_MAP_FILE = gameEmojiMapFile;
process.env.TELEGRAM_ROBO_EMOJI_MAP_FILE = roboEmojiMapFile;
process.env.TELEGRAM_RETRO_FONT_EMOJI_MAP_FILE = retroFontEmojiMapFile;
process.env.TELEGRAM_STICKER_MAP_FILE = regularStickerMapFile;
process.env.TELEGRAM_START_IMAGE_FILE = startImageFile;
process.env.TELEGRAM_START_IMAGE_URL = 'https://cdn.example.local/kaito-start.png';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.TELEGRAM_BOT_TOKEN = '123:test';
process.env.TELEGRAM_POLLING = 'false';
process.env.TELEGRAM_START_STICKER_ID = '';
process.env.TELEGRAM_CATALOG_STICKER_ID = 'sticker_catalog';
process.env.TELEGRAM_BRAND_STICKER_ID = 'sticker_brand';
process.env.TELEGRAM_ORDER_STICKER_ID = 'sticker_order';
process.env.TELEGRAM_DELIVERY_STICKER_ID = 'sticker_delivery';
process.env.TELEGRAM_SUPPORT_HANDLE = '@kaitoukit';
process.env.TELEGRAM_CUSTOM_TEXT_EMOJI = 'true';
process.env.AUTH_SECRET ||= 'telegram-message-auth-secret';
process.env.PAYMENT_WEBHOOK_SECRET ||= 'telegram-message-payment-secret';

await writeFile(customEmojiMapFile, JSON.stringify({
  stickerType: 'custom_emoji',
  stickerFormat: 'video',
  customEmojiIdsByFile: {
    'ChatGPT.png': 'ce_chatgpt_file',
    'Canva.webm': 'ce_canva_motion',
    'CapCut.webm': 'ce_capcut_motion',
    'Claude.png': 'ce_claude_file',
    'Cursor.webm': 'ce_cursor_motion',
    'Discord.webm': 'ce_discord_motion',
    'Facebook.webm': 'ce_facebook_motion',
    'Gemini.webm': 'ce_gemini_motion',
    'Gmail.webm': 'ce_gmail_motion',
    'Google.webm': 'ce_google_motion',
    'Microsoft.webm': 'ce_microsoft_motion',
    'Notion.webm': 'ce_notion_motion',
    'PayPal.webm': 'ce_paypal_motion',
    'Telegram.webm': 'ce_telegram_motion',
    'TikTok.webm': 'ce_tiktok_motion'
  },
  fileIdsByFile: {
    'ChatGPT.webm': 'sticker_chatgpt_motion',
    'Claude.webm': 'sticker_claude_motion'
  },
  customEmojiIdsByBrand: {
    chatgpt: ['ce_chatgpt_brand'],
    claude: ['ce_claude_brand']
  },
  fileIdsByBrand: {
    chatgpt: ['sticker_chatgpt_brand'],
    claude: ['sticker_claude_brand'],
    google: ['sticker_google_motion'],
    telegram: ['sticker_telegram_motion']
  }
}), 'utf8');

await writeFile(uiEmojiMapFile, JSON.stringify({
  stickerType: 'custom_emoji',
  stickerFormat: 'video',
  customEmojiIdsByFile: Object.fromEntries(menuEmojiKeys.map((key) => [`${key}.webm`, `ce_ui_${key}`])),
  customEmojiIdsByBrand: Object.fromEntries(menuEmojiKeys.map((key) => [key.replace(/[^a-z0-9]+/g, ''), [`ce_ui_${key}`]]))
}), 'utf8');

await writeFile(sloganEmojiMapFile, JSON.stringify({
  stickerType: 'custom_emoji',
  stickerFormat: 'video',
  customEmojiIdsByFile: {
    'welcome.webm': 'ce_slogan_welcome',
    'catalog.webm': 'ce_slogan_catalog',
    'checkout.webm': 'ce_slogan_checkout',
    'payment.webm': 'ce_slogan_payment',
    'delivery.webm': 'ce_slogan_delivery',
    'support.webm': 'ce_slogan_support',
    'soldout.webm': 'ce_slogan_soldout',
    'text-shopping-flow.webm': 'ce_slogan_text-shopping-flow'
  },
  customEmojiIdsByBrand: {
    welcome: ['ce_slogan_welcome'],
    catalog: ['ce_slogan_catalog'],
    checkout: ['ce_slogan_checkout'],
    payment: ['ce_slogan_payment'],
    delivery: ['ce_slogan_delivery'],
    support: ['ce_slogan_support'],
    soldout: ['ce_slogan_soldout'],
    textshoppingflow: ['ce_slogan_text-shopping-flow']
  },
  fileIdsByFile: {
    'welcome.webm': 'sticker_slogan_welcome'
  },
  fileIdsByBrand: {
    welcome: ['sticker_slogan_welcome']
  },
  stickers: [
    {
      brandKey: 'support',
      fileName: 'support.webm',
      emoji: '🎧',
      customEmojiId: 'ce_slogan_support'
    }
  ]
}), 'utf8');

const dailyUpdateTileIds = Array.from({ length: 6 }, (_, index) => `ce_slogan_tile_daily_update_${index}`);
const canonicalNewsEmojiIds = {
  comet: 'ce_news_comet',
  lightning: 'ce_news_lightning',
  'shopping-bag': 'ce_news_shopping_bag',
  warning: 'ce_news_warning',
  globe: 'ce_news_globe',
  chat: 'ce_news_chat',
  chart: 'ce_news_chart',
  down: 'ce_news_down',
  check: 'ce_news_check',
  cross: 'ce_news_cross',
  bell: 'ce_news_bell',
  dollar: 'ce_news_dollar',
  'arrow-right': 'ce_news_arrow_right',
  fire: 'ce_news_fire',
  boom: 'ce_news_boom',
  megaphone: 'ce_news_megaphone',
  search: 'ce_news_search',
  shield: 'ce_news_shield',
  link: 'ce_news_link',
  info: 'ce_news_info',
  'thumbs-up': 'ce_news_thumbs_up',
  hundred: 'ce_news_hundred',
  refresh: 'ce_news_refresh',
  diamond: 'ce_news_diamond',
  star: 'ce_news_star',
  crown: 'ce_news_crown',
  lock: 'ce_news_lock',
  settings: 'ce_news_settings',
  hourglass: 'ce_news_hourglass',
  download: 'ce_news_download',
  idea: 'ce_news_idea',
  plus: 'ce_news_plus',
  home: 'ce_news_home',
  party: 'ce_news_party'
};
const newsEmojiIds = {
  ...canonicalNewsEmojiIds,
  fast: canonicalNewsEmojiIds.comet,
  newsflash: canonicalNewsEmojiIds.lightning,
  auto247: canonicalNewsEmojiIds.refresh,
  tracking: canonicalNewsEmojiIds.search,
  adminchat: canonicalNewsEmojiIds.chat,
  adminshield: canonicalNewsEmojiIds.shield,
  adminboom: canonicalNewsEmojiIds.boom,
  adminfire: canonicalNewsEmojiIds.fire,
  adminhundred: canonicalNewsEmojiIds.hundred
};
const flameEmojiIds = {
  moneyface: 'ce_flame_moneyface'
};
await writeFile(sloganTileEmojiMapFile, JSON.stringify({
  stickerType: 'custom_emoji',
  stickerFormat: 'video',
  packName: 'kaito_ai_shop_slogan_tiles_by_testbot',
  customEmojiIdsByFile: Object.fromEntries(dailyUpdateTileIds.map((id, index) => [`daily_update_${String(index).padStart(2, '0')}.webm`, id])),
  customEmojiIdsByBrand: Object.fromEntries(dailyUpdateTileIds.map((id, index) => [`dailyupdate${String(index).padStart(2, '0')}`, [id]])),
  slogans: {
    daily_update: {
      key: 'daily_update',
      text: 'DAILY UPDATE',
      fallbackText: '🎫 DAILY UPDATE 🎫',
      emoji: '🎫',
      placeholder: '🎫🎫🎫🎫🎫🎫',
      tiles: dailyUpdateTileIds.map((id, index) => ({
        index,
        key: `daily_update_${String(index).padStart(2, '0')}`,
        emoji: '🎫',
        fileName: `daily_update_${String(index).padStart(2, '0')}.webm`,
        customEmojiId: id
      }))
    }
  }
}), 'utf8');

await writeFile(newsEmojiMapFile, JSON.stringify({
  stickerType: 'custom_emoji',
  stickerFormat: 'animated',
  packName: 'NewsEmoji',
  customEmojiIdsByFile: Object.fromEntries(
    Object.entries(canonicalNewsEmojiIds).map(([alias, id]) => [`${alias}.tgs`, id])
  ),
  customEmojiIdsByBrand: Object.fromEntries(
    Object.entries(newsEmojiIds).map(([alias, id]) => [alias, [id]])
  )
}), 'utf8');

await writeFile(flameEmojiMapFile, JSON.stringify({
  stickerType: 'custom_emoji',
  stickerFormat: 'animated',
  packName: 'kaito_ai_shop_flame_emoji_by_testbot',
  customEmojiIdsByFile: {
    'moneyface.tgs': flameEmojiIds.moneyface
  },
  customEmojiIdsByBrand: {
    moneyface: [flameEmojiIds.moneyface]
  }
}), 'utf8');

await writeFile(gameEmojiMapFile, JSON.stringify({
  stickerType: 'custom_emoji',
  stickerFormat: 'animated',
  packName: 'kaito_ai_shop_game_emoji_by_testbot',
  customEmojiIdsByFile: {
    'products.tgs': 'ce_game_products'
  },
  customEmojiIdsByBrand: {
    products: ['ce_game_products']
  }
}), 'utf8');

await writeFile(bannerEmojiMapFile, JSON.stringify({
  stickerType: 'custom_emoji',
  stickerFormat: 'video',
  customEmojiIdsByFile: {
    'kaito.webm': 'ce_banner_kaito',
    'welcome.webm': 'ce_banner_welcome',
    'products.webm': 'ce_banner_products',
    'orders.webm': 'ce_banner_orders',
    'support.webm': 'ce_banner_support',
    'account.webm': 'ce_banner_account',
    'checkin.webm': 'ce_banner_checkin',
    'minigame.webm': 'ce_banner_minigame',
    'vip.webm': 'ce_banner_vip',
    'hot.webm': 'ce_banner_hot',
    'new.webm': 'ce_banner_new',
    'sale.webm': 'ce_banner_sale',
    'auto247.webm': 'ce_banner_auto247',
    'instant.webm': 'ce_banner_instant',
    'trusted.webm': 'ce_banner_trusted',
    'contact.webm': 'ce_banner_contact',
    'combo.webm': 'ce_banner_combo',
    'review.webm': 'ce_banner_review',
    'soldout.webm': 'ce_banner_soldout',
    'delivery.webm': 'ce_banner_delivery',
    'payment.webm': 'ce_banner_payment',
    'ai.webm': 'ce_banner_ai',
    'mmo.webm': 'ce_banner_mmo',
    'refund.webm': 'ce_banner_refund',
    'stock.webm': 'ce_banner_stock',
    'guide.webm': 'ce_banner_guide',
    'logout.webm': 'ce_banner_logout',
    'secure.webm': 'ce_banner_secure'
  },
  customEmojiIdsByBrand: {
    kaito: ['ce_banner_kaito'],
    welcome: ['ce_banner_welcome'],
    products: ['ce_banner_products'],
    orders: ['ce_banner_orders'],
    support: ['ce_banner_support'],
    account: ['ce_banner_account'],
    checkin: ['ce_banner_checkin'],
    minigame: ['ce_banner_minigame'],
    vip: ['ce_banner_vip'],
    hot: ['ce_banner_hot'],
    new: ['ce_banner_new'],
    sale: ['ce_banner_sale'],
    auto247: ['ce_banner_auto247'],
    instant: ['ce_banner_instant'],
    trusted: ['ce_banner_trusted'],
    contact: ['ce_banner_contact'],
    combo: ['ce_banner_combo'],
    review: ['ce_banner_review'],
    soldout: ['ce_banner_soldout'],
    delivery: ['ce_banner_delivery'],
    payment: ['ce_banner_payment'],
    ai: ['ce_banner_ai'],
    mmo: ['ce_banner_mmo'],
    refund: ['ce_banner_refund'],
    stock: ['ce_banner_stock'],
    guide: ['ce_banner_guide'],
    logout: ['ce_banner_logout'],
    secure: ['ce_banner_secure']
  }
}), 'utf8');

await writeFile(roboEmojiMapFile, JSON.stringify({
  stickerType: 'custom_emoji',
  stickerFormat: 'video',
  packName: 'RoboEmoji',
  customEmojiIdsByEmoji: {
    '😊': 'ce_robo_smile',
    '👋': 'ce_robo_wave',
    '🙏': 'ce_robo_please',
    '🤩': 'ce_robo_wow',
    '🥳': 'ce_robo_party',
    '🤑': 'ce_robo_money',
    '👌': 'ce_robo_ok',
    '👍': 'ce_robo_thumbsup',
    '💯': 'ce_robo_hundred',
    '🫡': 'ce_robo_salute',
    '➕': 'ce_robo_plus'
  },
  customEmojiIdsByAlias: {
    smile: ['ce_robo_smile'],
    wave: ['ce_robo_wave'],
    please: ['ce_robo_please'],
    wow: ['ce_robo_wow'],
    party: ['ce_robo_party'],
    money: ['ce_robo_money'],
    ok: ['ce_robo_ok'],
    thumbsup: ['ce_robo_thumbsup'],
    hundred: ['ce_robo_hundred'],
    salute: ['ce_robo_salute'],
    plus: ['ce_robo_plus']
  }
}), 'utf8');

await writeFile(retroFontEmojiMapFile, JSON.stringify({
  stickerType: 'custom_emoji',
  stickerFormat: 'animated',
  packName: 'RetroFontEmoji',
  customEmojiIdsByCharacter: {
    A: 'ce_retro_a',
    D: 'ce_retro_d',
    H: 'ce_retro_h',
    I: 'ce_retro_i',
    K: 'ce_retro_k',
    O: 'ce_retro_o',
    P: 'ce_retro_p',
    S: 'ce_retro_s',
    T: 'ce_retro_t'
  }
}), 'utf8');

await writeFile(regularStickerMapFile, JSON.stringify({
  stickerType: 'regular',
  stickerFormat: 'video',
  stageFileIds: {
    start: 'regular_start_sticker',
    topup: 'regular_topup_sticker',
    support: 'regular_support_sticker'
  }
}), 'utf8');
await writeFile(startImageFile, Buffer.from('fake-start-image'));

const storage = await import('../src/storage.js');
const shop = await import('../src/shop.js');
const catalog = await import('../src/catalog.js');
const telegram = await import('../src/telegram.js');
assert.ok(
  telegram.productArtworkFilePath({ artwork: '/brand/product-plans/gemini-advanced-1m-v2.jpg' }).endsWith('gemini-advanced-1m-v2.jpg'),
  'Gemini product detail should resolve its generated plan artwork.'
);
assert.ok(
  telegram.brandArtworkFilePath('ChatGPT').endsWith('catalog-artwork\\brands\\chatgpt.jpg')
    || telegram.brandArtworkFilePath('ChatGPT').endsWith('catalog-artwork/brands/chatgpt.jpg'),
  'Each Telegram brand page should resolve its own generated banner.'
);
assert.equal(
  telegram.productArtworkFilePath({ artwork: '/etc/passwd' }),
  '',
  'Telegram must reject artwork outside the safe public product-plan directory.'
);
const brandAssets = await import('../public/brand-assets.js');

const {
  brandIcon,
  buildBrandKeyboard,
  buildCancelConfirmationKeyboard,
  buildCatalogKeyboard,
  buildConfirmationKeyboard,
  buildCategoryKeyboard,
  categoryMenuMessage,
  buildMainMenuKeyboard,
  buildPackageKeyboard,
  buildPaymentKeyboard,
  buildProductDetailKeyboard,
  buildSeatEmailPromptKeyboard,
  buildSeatEmailReviewKeyboard,
  confirmationMessage,
  deliveryDocumentCaption,
  deliveryDocumentFilename,
  deliveryDocumentText,
  deliveryMessage,
  formatOrderStatus,
  formatStockStatus,
  handleTelegramUpdate,
  configureTelegramMenu,
  notifyBotRestoredToUsers,
  notifyDelivery,
  TELEGRAM_MENU_LANGUAGE_CODES,
  bannerCustomEmojiId,
  orderMessage,
  paymentQrCaption,
  productDetailMessage,
  productMessage,
  seatAwaitingFulfillmentMessage,
  seatEmailPromptMessage,
  seatEmailReviewMessage,
  seatFulfillmentCompletedMessage,
  sendTelegramMessage,
  sendTelegramPhotoFile,
  sloganCustomEmojiId,
  startMessage,
  unknownCommandMessage,
  usageMessage
} = telegram;

function assertNoUnsupportedHtml(text) {
  const strippedAllowed = text
    .replaceAll(/<tg-emoji emoji-id="[A-Za-z0-9_-]+">[^<>]+<\/tg-emoji>/g, '')
    .replaceAll('<b>', '')
    .replaceAll('</b>', '')
    .replaceAll('<i>', '')
    .replaceAll('</i>', '')
    .replaceAll('<code>', '')
    .replaceAll('</code>', '');
  assert.equal(
    /<\/?[a-z][^>]*>/i.test(strippedAllowed),
    false,
    `Message contains unsupported Telegram HTML: ${text}`
  );
}

function assertAllKeyboardButtonsAnimated(keyboard, label) {
  const buttons = keyboard?.inline_keyboard?.flat() || [];
  assert.ok(buttons.length > 0, `${label} should contain buttons.`);
  for (const button of buttons) {
    assert.ok(
      button.icon_custom_emoji_id,
      `${label} button "${button.text}" should include icon_custom_emoji_id.`
    );
  }
}

function assertEveryEmojiAnimated(call, label) {
  const field = call?.body?.text ? 'text' : 'caption';
  const text = String(call?.body?.[field] || '');
  const entities = call?.body?.[field === 'text' ? 'entities' : 'caption_entities'] || [];
  const customEntities = entities.filter((entity) => entity.type === 'custom_emoji');
  const segments = new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text);

  for (const segment of segments) {
    if (!/\p{Extended_Pictographic}/u.test(segment.segment)) continue;
    assert.ok(
      customEntities.some((entity) => (
        entity.offset === segment.index
        && entity.length === segment.segment.length
      )),
      `${label} emoji "${segment.segment}" at offset ${segment.index} should be a custom_emoji entity.`
    );
  }
}

try {
  await storage.initStore();

  for (const text of [startMessage(), usageMessage(), unknownCommandMessage()]) {
    assert.equal(text.includes('<sku>'), false, 'Telegram HTML messages must not include raw <sku> placeholders.');
    assertNoUnsupportedHtml(text);
  }

  const welcomeText = startMessage();
  assert.match(welcomeText, /<b>KAITO KID AI SHOP<\/b> 🤑 chào bạn/);
  assert.equal(welcomeText.includes('<tg-emoji'), false, 'Caption/text runtime should not send custom emoji entities.');
  assert.equal(welcomeText.includes('ce_'), false, 'Caption/text runtime should not leak custom emoji IDs.');
  const replacementBannerIds = {
    account: 'ce_ui_account',
    ai: 'ce_chatgpt_file',
    auto247: 'ce_ui_instant-delivery',
    instant: 'ce_ui_instant-delivery',
    checkin: 'ce_notion_motion',
    news: 'ce_ui_news',
    guide: 'ce_ui_news',
    combo: 'ce_ui_offers',
    contact: newsEmojiIds.adminchat,
    delivery: 'ce_ui_orders',
    orders: 'ce_ui_orders',
    stock: 'ce_ui_orders',
    event: 'ce_ui_events',
    minigame: 'ce_ui_events',
    mmo: 'ce_ui_events',
    hot: newsEmojiIds.adminfire,
    kaito: 'ce_ui_reviews',
    review: 'ce_ui_reviews',
    welcome: 'ce_robo_wave',
    logout: 'ce_ui_logout',
    refund: 'ce_ui_logout',
    member: 'ce_ui_member',
    vip: 'ce_ui_member',
    new: 'ce_ui_notifications',
    soldout: 'ce_ui_notifications',
    payment: 'ce_ui_topup',
    policy: 'ce_ui_security',
    secure: 'ce_ui_security',
    trusted: 'ce_ui_security',
    products: 'ce_game_products',
    sale: 'ce_ui_promotions',
    support: 'ce_ui_support'
  };
  for (const [key, expectedId] of Object.entries(replacementBannerIds)) {
    assert.equal(bannerCustomEmojiId(key), expectedId, `Banner alias ${key} should use a live replacement pack.`);
    assert.equal(expectedId.startsWith('ce_banner_'), false);
  }
  const replacementSloganIds = {
    catalog: 'ce_game_products',
    checkout: 'ce_robo_ok',
    payment: 'ce_ui_topup',
    delivery: 'ce_ui_orders',
    support: 'ce_ui_support',
    soldout: 'ce_ui_notifications',
    welcome: 'ce_ui_reviews',
    'text-shopping-flow': 'ce_ui_reviews'
  };
  for (const [key, expectedId] of Object.entries(replacementSloganIds)) {
    assert.equal(sloganCustomEmojiId(key), expectedId, `Slogan alias ${key} should use a live replacement pack.`);
    assert.equal(expectedId.startsWith('ce_slogan_'), false);
  }
  assert.match(welcomeText, /<b>KAITO KID AI SHOP<\/b> 🤑 chào bạn 👋/);
  assert.ok(welcomeText.includes('🎫 DAILY UPDATE 🎫'), 'Plain welcome fallback should include the readable Daily Update slogan.');
  assert.ok(
    startMessage({ retroFontBrand: true }).startsWith('🔤🔤🔤🔤🔤 🔤🔤🔤 🔤🔤 🔤🔤🔤🔤 🤑 chào bạn 👋'),
    'Retro welcome title should lead with the KAITO KID AI SHOP custom-font placeholders, then put Flame money and the wave at the end.'
  );
  assert.ok(
    startMessage({ retroFontBrand: true, sloganTiles: true }).includes('🎫🎫🎫🎫🎫🎫'),
    'Custom welcome payload should include Daily Update slogan tile placeholders.'
  );
  assert.equal(welcomeText.includes('🤩 Shop AI/MMO tự động'), false, 'Welcome should hide the shop slogan line.');
  assert.equal(welcomeText.includes('🛒 Sản phẩm hot luôn sẵn trong menu'), false, 'Welcome should hide the product-hot line.');
  assert.equal(/Chọn nhanh - .*Thanh toán gọn - .*Nhận hàng liền/i.test(welcomeText), false, 'Welcome should hide the sales flow slogan.');
  assert.equal(startMessage().includes('🐱'), false, 'Welcome should not use stiff/cute raw animal emoji.');
  assert.equal(welcomeText.includes('💳 Nạp tiền/đặt gói riêng khi cần'), false, 'Welcome should keep top-up in the menu buttons, not the intro text.');
  assert.match(welcomeText, /☄️ Giao nhanh ☄️\n/);
  assert.match(welcomeText, /🔄 Tự động 24\/7, bot xử lý liên tục 🔄/);
  assert.match(welcomeText, /🔍 Theo dõi đơn hàng ngay trong bot 🔍/);
  assert.match(welcomeText, /💬 Admin: @kaitoukit 🛡 💥🔥💯/);
  assert.equal(usageMessage(), 'ℹ️ Cú pháp: <code>/buy sku 1</code>');
  assert.match(unknownCommandMessage(), /🛒 Sản phẩm/);

  assert.equal(formatOrderStatus('pending_payment'), '💳 Chờ thanh toán');
  assert.equal(formatOrderStatus('payment_review'), '📣 Cần kiểm tra');
  assert.equal(formatOrderStatus('awaiting_fulfillment'), '🔍 Đã thanh toán · chờ cấp Seat');
  assert.equal(formatOrderStatus('delivered'), '📦 Đã giao hàng');
  assert.equal(formatStockStatus({ stock: { available: 2 } }), '📦 Còn 2');
  assert.equal(formatStockStatus({ stock: { available: 0 } }), '📣 Hết hàng');
  assert.equal(brandAssets.brandIcon('ChatGPT'), '🤖');
  assert.equal(brandAssets.brandIcon('Claude'), '🧠');
  assert.equal(brandAssets.brandIcon('Canva'), '🎨');
  assert.equal(brandIcon('Telegram'), '✈');

  const mainMenu = buildMainMenuKeyboard();
  const expectedMainMenu = [
    [
      ['Sản phẩm', 'catalog:all', newsEmojiIds['shopping-bag']],
      ['Đặt gói riêng', 'topup', newsEmojiIds.dollar]
    ],
    [
      ['Tài khoản', 'account', newsEmojiIds.settings],
      ['Đơn hàng', 'orders:mine', newsEmojiIds.search]
    ],
    [
      ['Hỗ trợ', 'support', newsEmojiIds.chat],
      ['Thông báo', 'notifications', newsEmojiIds.bell]
    ]
  ];
  assert.deepEqual(
    mainMenu.inline_keyboard,
    expectedMainMenu.map((row) => row.map(([text, callback_data, icon_custom_emoji_id]) => ({
      text,
      callback_data,
      icon_custom_emoji_id
    })))
  );

  const categoryText = categoryMenuMessage([
    { category: 'AI Accounts', brand: 'ChatGPT' },
    { category: 'Design Accounts', brand: 'Canva' }
  ]);
  assert.match(categoryText, /Danh mục sản phẩm/);
  assert.equal(categoryText.includes('<tg-emoji'), false);
  assert.match(categoryText, /🛍/);
  assert.match(categoryText, /⚡/);
  assert.match(categoryText, /🔄/);
  assert.match(categoryText, /👌/);
  assert.match(categoryText, /🙏/);
  assert.match(categoryText, /🎉/);
  assert.match(categoryText, /🎁/);
  assert.match(categoryText, /✨/);
  assert.match(categoryText, /2 danh mục · 2 nhãn hàng · 📦 0 gói đang nhận đơn/);
  assert.match(categoryText, /liên hệ admin/i);
  assert.match(categoryText, /@kaitoukit/);
  assert.match(categoryText, /Chọn một danh mục bên dưới/);
  assert.match(categoryText, /🔥 <b>Sản phẩm hot<\/b> được liệt kê ngay dưới các nút danh mục/);

  const hotCategoryProducts = [
    {
      sku: 'hot-sold-out',
      name: 'Hot hết hàng',
      category: 'AI Accounts',
      brand: 'ChatGPT',
      price: 99000,
      currency: 'VND',
      sortOrder: 1,
      hot: true,
      stock: { available: 0 }
    },
    {
      sku: 'hot-in-stock-low',
      name: 'Hot còn một',
      category: 'Design Accounts',
      brand: 'Canva',
      price: 49000,
      currency: 'VND',
      sortOrder: 20,
      hot: true,
      stock: { available: 1 }
    },
    {
      sku: 'hot-in-stock-high',
      name: 'Hot còn nhiều',
      category: 'AI Accounts',
      brand: 'Claude',
      price: 129000,
      currency: 'VND',
      sortOrder: 30,
      hot: true,
      stock: { available: 3 }
    },
    {
      sku: 'hot-fourth',
      name: 'Hot thứ tư',
      category: 'Social/MMO Accounts',
      brand: 'Telegram',
      price: 79000,
      currency: 'VND',
      sortOrder: 40,
      hot: true,
      stock: { available: 2 }
    }
  ];
  const hotCategoryKeyboard = buildCategoryKeyboard(hotCategoryProducts);
  const hotCategoryRows = hotCategoryKeyboard.inline_keyboard;
  const hotProductRows = hotCategoryRows.filter((row) => row[0]?.callback_data?.startsWith('pkg:'));
  assert.equal(hotProductRows.length, 4, 'Every flagged hot product should be listed as a package button.');
  assert.deepEqual(
    hotProductRows.map((row) => row[0].callback_data),
    ['pkg:hot-in-stock-high', 'pkg:hot-fourth', 'pkg:hot-in-stock-low', 'pkg:hot-sold-out'],
    'Hot buttons should prioritize stock availability and place sold-out products last.'
  );
  assert.match(hotProductRows[0][0].text, /HOT · Hot còn nhiều · 129\.000 VND · Còn 3/);
  assert.match(hotProductRows[1][0].text, /HOT · Hot thứ tư · 79\.000 VND · Còn 2/);
  assert.match(hotProductRows[2][0].text, /HOT · Hot còn một · 49\.000 VND · Còn 1/);
  assert.match(hotProductRows[3][0].text, /HOT · Hot hết hàng · 99\.000 VND · Hết hàng/);
  const lastCategoryRowIndex = hotCategoryRows.reduce((lastIndex, row, index) => (
    row.some((button) => button.callback_data?.startsWith('cat:')) ? index : lastIndex
  ), -1);
  const firstHotRowIndex = hotCategoryRows.findIndex((row) => row[0]?.callback_data?.startsWith('pkg:'));
  const refreshRowIndex = hotCategoryRows.findIndex((row) => row[0]?.callback_data === 'catalog:all');
  assert.ok(firstHotRowIndex > lastCategoryRowIndex, 'Hot product buttons should appear below every category button.');
  assert.ok(refreshRowIndex > firstHotRowIndex + hotProductRows.length - 1, 'Refresh and home should remain below the hot product list.');
  assert.ok(hotProductRows.every((row) => row.length === 1), 'Each hot product should use one full-width keyboard row.');
  assert.ok(hotProductRows.every((row) => row[0].icon_custom_emoji_id), 'Each hot product should use its animated brand icon.');
  assert.ok(hotProductRows.every((row) => [...row[0].text].length <= 64), 'Hot product labels should stay within Telegram button limits.');
  assertAllKeyboardButtonsAnimated(hotCategoryKeyboard, 'hot category keyboard');
  assert.ok(hotCategoryKeyboard.inline_keyboard.flat().every((button) => Buffer.byteLength(button.callback_data || '', 'utf8') <= 64));

  const categoryKeyboard = buildCategoryKeyboard([
    {
      category: 'AI Accounts',
      brand: 'ChatGPT',
      sku: 'chatgpt-plus-1m',
      packageType: 'Plus 1M',
      name: 'ChatGPT Plus',
      price: 10000,
      currency: 'VND',
      stock: { available: 2 }
    },
    {
      category: 'Design Accounts',
      brand: 'Canva',
      sku: 'canva-pro-1m',
      packageType: 'Pro 1M',
      name: 'Canva Pro',
      price: 49000,
      currency: 'VND',
      stock: { available: 0 }
    },
    {
      category: 'AI Accounts',
      brand: 'Claude',
      sku: 'claude-pro-1m',
      packageType: 'Pro 1M',
      name: 'Claude Pro',
      price: 129000,
      currency: 'VND',
      stock: { available: 1 }
    }
  ]);
  assert.equal(categoryKeyboard.inline_keyboard[0].length, 2);
  assert.ok(categoryKeyboard.inline_keyboard[0][0].text.includes('AI Accounts'));
  assert.ok(categoryKeyboard.inline_keyboard[0][0].text.includes('[3]'));
  assert.ok(categoryKeyboard.inline_keyboard[0][1].text.includes('Design Accounts'));
  assert.ok(categoryKeyboard.inline_keyboard[0][1].text.includes('[Seat]'));
  assert.ok(categoryKeyboard.inline_keyboard[0].every((button) => button.callback_data.startsWith('cat:')));
  assert.equal(categoryKeyboard.inline_keyboard[0][0].icon_custom_emoji_id, newsEmojiIds.idea);
  assert.equal(categoryKeyboard.inline_keyboard[0][1].icon_custom_emoji_id, newsEmojiIds.diamond);
  assert.equal(
    categoryKeyboard.inline_keyboard.flat().some((button) => button.callback_data?.startsWith('pkg:')),
    false,
    'Products that are not flagged hot should not be listed below the category rows.'
  );
  assert.ok(categoryKeyboard.inline_keyboard.some((row) => (
    row[0].text === 'Làm mới'
    && row[0].callback_data === 'catalog:all'
    && row[0].icon_custom_emoji_id === newsEmojiIds.refresh
  )));
  assert.ok(categoryKeyboard.inline_keyboard.some((row) => (
    row[0].text === 'Menu chính'
    && row[0].callback_data === 'start:menu'
    && row[0].icon_custom_emoji_id === newsEmojiIds.home
  )));
  assertAllKeyboardButtonsAnimated(categoryKeyboard, 'category keyboard');
  assert.ok(categoryKeyboard.inline_keyboard.flat().every((button) => Buffer.byteLength(button.callback_data || '', 'utf8') <= 64));

  const soldOutCatalogKeyboard = buildCategoryKeyboard([{
    category: 'Design Accounts',
    brand: 'CapCut',
    sku: 'capcut-pro-1m',
    packageType: 'Pro 1M',
    name: 'CapCut Pro',
    price: 49000,
    currency: 'VND',
    stock: { available: 0 }
  }]);
  assert.ok(soldOutCatalogKeyboard.inline_keyboard[0][0].text.includes('Design Accounts'));
  assert.ok(soldOutCatalogKeyboard.inline_keyboard[0][0].text.includes('[Hết]'));

  const brandKeyboard = buildBrandKeyboard([
    { category: 'AI Accounts', brand: 'ChatGPT', stock: { available: 2 } },
    { category: 'AI Accounts', brand: 'Claude', stock: { available: 1 } },
    { category: 'AI Accounts', brand: 'ChatGPT', stock: { available: 0 } }
  ], 'AI Accounts');
  assert.equal(brandKeyboard.inline_keyboard[0].length, 2);
  assert.ok(brandKeyboard.inline_keyboard[0].every((button) => button.callback_data.startsWith('brand:')));
  assert.equal(brandKeyboard.inline_keyboard[0][0].text, 'ChatGPT');
  assert.equal(brandKeyboard.inline_keyboard[0][0].icon_custom_emoji_id, 'ce_chatgpt_file');
  assert.equal(brandKeyboard.inline_keyboard[0][1].text, 'Claude');
  assert.equal(brandKeyboard.inline_keyboard[0][1].icon_custom_emoji_id, 'ce_claude_file');
  assert.equal(brandKeyboard.inline_keyboard.at(-1)[0].text, 'Tất cả danh mục');
  assert.equal(brandKeyboard.inline_keyboard.at(-1)[0].icon_custom_emoji_id, newsEmojiIds['arrow-right']);
  assertAllKeyboardButtonsAnimated(brandKeyboard, 'brand keyboard');

  const figmaBrandKeyboard = buildBrandKeyboard([
    { category: 'Design Accounts', brand: 'Figma', stock: { available: 1 } }
  ], 'Design Accounts');
  assert.equal(
    figmaBrandKeyboard.inline_keyboard[0][0].icon_custom_emoji_id,
    newsEmojiIds.diamond,
    'Figma should use the semantic Design emoji instead of falling back to the KAITO pack.'
  );

  const productsText = productMessage([{
    name: 'AI <Plus> & Team',
    sku: 'kaito<sku>&1',
    category: 'AI Accounts',
    brand: 'ChatGPT',
    packageType: 'Plus 1M',
    sortOrder: 10,
    price: 10000,
    currency: 'VND',
    stock: { available: 2 }
  }, {
    name: 'Claude Pro 1 tháng',
    sku: 'claude-pro-1m',
    category: 'AI Accounts',
    brand: 'Claude',
    packageType: 'Pro 1M',
    sortOrder: 20,
    price: 129000,
    currency: 'VND',
    stock: { available: 1 }
  }]);
  assert.match(productsText, /🛒 <b>KAITO KID AI SHOP - Gói đang bán<\/b>/);
  assert.match(productsText, /💡 AI Accounts/);
  assert.match(productsText, /🤖 ChatGPT/);
  assert.match(productsText, /🧠 Claude/);
  assert.match(productsText, /AI &lt;Plus&gt; &amp; Team/);
  assert.match(productsText, /🎫 SKU: <code>kaito&lt;sku&gt;&amp;1<\/code>/);
  assert.match(productsText, /📦 Còn 2/);
  assertNoUnsupportedHtml(productsText);

  const packageKeyboard = buildPackageKeyboard([{
    id: 'prd_1',
    name: 'ChatGPT Plus',
    sku: 'chatgpt-plus-1m',
    category: 'AI Accounts',
    brand: 'ChatGPT',
    packageType: 'Plus 1M',
    sortOrder: 10,
    price: 10000,
    currency: 'VND',
    stock: { available: 2 }
  }, {
    id: 'prd_2',
    name: 'ChatGPT Team Slot',
    sku: 'chatgpt-team-slot-1m',
    category: 'AI Accounts',
    brand: 'ChatGPT',
    packageType: 'Team Slot 1M',
    sortOrder: 20,
    price: 15000,
    currency: 'VND',
    stock: { available: 0 }
  }]);
  assert.deepEqual(packageKeyboard.inline_keyboard[0], [
    {
      text: 'Xem gói · Plus 1M · 10.000 VND',
      callback_data: 'pkg:prd_1',
      icon_custom_emoji_id: 'ce_chatgpt_file'
    }
  ]);
  assert.deepEqual(packageKeyboard.inline_keyboard[1], [
    {
      text: 'Hết hàng · Team Slot 1M · 15.000 VND',
      callback_data: 'pkg:prd_2',
      icon_custom_emoji_id: 'ce_chatgpt_file'
    }
  ]);
  assert.ok(packageKeyboard.inline_keyboard.flat().some((button) => button.callback_data.startsWith('cat:')));
  assert.ok(packageKeyboard.inline_keyboard.flat().some((button) => button.callback_data === 'orders:mine'));
  assertAllKeyboardButtonsAnimated(packageKeyboard, 'package keyboard');

  const detailProduct = {
    id: 'prd_detail',
    sku: 'chatgpt-plus-1m',
    name: 'ChatGPT Plus',
    category: 'AI Accounts',
    brand: 'ChatGPT',
    packageType: 'Plus 1M',
    description: 'Tài khoản AI cao cấp',
    accountType: 'Tài khoản riêng',
    warrantyPolicy: 'Bảo hành 30 ngày',
    replacementPolicy: 'Đổi nếu lỗi từ dữ liệu bàn giao',
    usagePolicy: '• Chỉ dùng ứng dụng chính thức.\n• Không chia sẻ OAuth token.',
    deliveryMode: 'file',
    price: 10000,
    currency: 'VND',
    stock: { available: 2 }
  };
  const detailText = productDetailMessage(detailProduct);
  assert.match(detailText, /Mô tả: Tài khoản AI cao cấp/);
  assert.match(detailText, /Loại tài khoản: Tài khoản riêng/);
  assert.match(detailText, /Bảo hành: Bảo hành 30 ngày/);
  assert.match(detailText, /Điều kiện đổi lỗi: Đổi nếu lỗi từ dữ liệu bàn giao/);
  assert.match(detailText, /Quy định sử dụng:<\/b>\n• Chỉ dùng ứng dụng chính thức/);
  assert.match(detailText, /Không chia sẻ OAuth token/);
  assert.match(detailText, /Cách giao hàng: Tệp TXT/);
  for (const emoji of ['🛍', 'ℹ️', '⚙️', '🛡', '🔄', '⚠️', '⬇️', '💵', '📊']) {
    assert.ok(detailText.includes(emoji), `Product details should use the News "${emoji}" fallback.`);
  }
  const detailKeyboard = buildProductDetailKeyboard(detailProduct);
  assert.ok(detailKeyboard.inline_keyboard.flat().some((button) => (
    button.callback_data === 'buy:prd_detail:1'
    && button.icon_custom_emoji_id === newsEmojiIds['shopping-bag']
  )));
  assert.ok(detailKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Các gói khác'
    && button.icon_custom_emoji_id === newsEmojiIds['arrow-right']
  )));
  assert.ok(detailKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Liên hệ hỗ trợ'
    && button.url
    && button.icon_custom_emoji_id === newsEmojiIds.adminchat
  )), 'Product support URL should use the News admin-chat emoji.');
  assertAllKeyboardButtonsAnimated(detailKeyboard, 'product detail keyboard');

  const seatProduct = {
    ...detailProduct,
    id: 'prd_seat',
    sku: 'chatgpt-business-seat-1m',
    name: 'ChatGPT Business Seat 1M',
    packageType: 'Business Seat 1M',
    fulfillmentMode: 'seat_email',
    deliveryMode: 'text',
    price: 400000,
    stock: { available: 0 }
  };
  assert.equal(formatStockStatus(seatProduct), '🔍 Nhận email để cấp Seat');
  const seatDetailText = productDetailMessage(seatProduct);
  assert.match(seatDetailText, /gửi 1 hoặc nhiều email, mỗi email một dòng/i);
  assert.match(seatDetailText, /không cần chờ nhập kho/i);
  assert.match(seatDetailText, /Quy định sử dụng/);
  assert.equal(seatDetailText.includes('Hết hàng'), false);
  const seatDetailKeyboard = buildProductDetailKeyboard(seatProduct);
  assert.ok(seatDetailKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Nhập email mua Seat'
    && button.callback_data === 'buy:prd_seat:1'
  )), 'A zero-stock Seat should still be orderable by email.');
  assertAllKeyboardButtonsAnimated(seatDetailKeyboard, 'seat product detail keyboard');

  const seatDraft = { id: 'draft_opaque_123', revision: 2 };
  const seatPromptText = seatEmailPromptMessage(seatProduct);
  assert.match(seatPromptText, /mỗi email đúng một dòng/i);
  assert.match(seatPromptText, /email1@example\.com/);
  const seatPromptKeyboard = buildSeatEmailPromptKeyboard(seatProduct, seatDraft);
  assert.ok(seatPromptKeyboard.inline_keyboard.flat().some((button) => (
    button.callback_data === 'seat_cancel:draft_opaque_123'
  )));
  assertAllKeyboardButtonsAnimated(seatPromptKeyboard, 'seat email prompt keyboard');

  const seatEmails = ['seat-one@example.com', 'seat-two@example.com'];
  const seatReviewText = seatEmailReviewMessage(seatProduct, seatEmails);
  assert.match(seatReviewText, /Số lượng: 2/);
  assert.match(seatReviewText, /800\.000 VND/);
  assert.match(seatReviewText, /seat-one@example\.com/);
  assert.match(seatReviewText, /seat-two@example\.com/);
  assert.match(seatReviewText, /đồng ý <b>Quy định sử dụng<\/b>/);
  const seatReviewKeyboard = buildSeatEmailReviewKeyboard(seatDraft);
  for (const button of seatReviewKeyboard.inline_keyboard.flat()) {
    assert.equal(button.callback_data.includes('@'), false, 'Seat callback data must not contain customer emails.');
    assert.ok(Buffer.byteLength(button.callback_data, 'utf8') <= 64, 'Seat callback data must fit Telegram limits.');
  }
  assertAllKeyboardButtonsAnimated(seatReviewKeyboard, 'seat email review keyboard');

  const seatOrderFixture = {
    id: 'ord_seat_1',
    productName: seatProduct.name,
    quantity: 2,
    total: 800000,
    currency: 'VND',
    status: 'pending_payment',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    productSnapshot: { fulfillmentMode: 'seat_email', deliveryMode: 'text' },
    fulfillment: {
      mode: 'seat_email',
      recipients: seatEmails.map((email) => ({ email, status: 'pending' }))
    }
  };
  const seatOrderText = orderMessage(seatOrderFixture, { reference: 'KAITOSEAT1' });
  assert.match(seatOrderText, /Đơn đã tạo - chờ thanh toán/);
  assert.match(seatOrderText, /seat-one@example\.com/);
  assert.equal(seatOrderText.includes('đã giữ hàng'), false);
  assert.equal(seatOrderText.includes('trả hàng về kho'), false);
  assert.match(seatAwaitingFulfillmentMessage({
    ...seatOrderFixture,
    status: 'awaiting_fulfillment'
  }), /Đã nhận thanh toán - đang cấp Seat/);
  assert.match(seatFulfillmentCompletedMessage({
    ...seatOrderFixture,
    status: 'delivered'
  }), /Đã cấp Seat/);
  const deliveredSeatKeyboard = buildPaymentKeyboard({
    ...seatOrderFixture,
    status: 'delivered'
  }, {});
  assert.equal(
    deliveredSeatKeyboard.inline_keyboard.flat().some((button) => button.callback_data?.startsWith('delivery:')),
    false,
    'Delivered Seat orders should not expose inventory secrets.'
  );

  const confirmText = confirmationMessage(detailProduct, 2);
  assert.match(confirmText, /Xác nhận mua/);
  assert.match(confirmText, /Số lượng: 2/);
  assert.match(confirmText, /20.000 VND/);
  assert.match(confirmText, /Giao hàng: Tệp TXT/);
  for (const emoji of ['✔️', '🛍', '📊', '💵', '⬇️', '🔒']) {
    assert.ok(confirmText.includes(emoji), `Confirmation should use the News "${emoji}" fallback.`);
  }
  const confirmKeyboard = buildConfirmationKeyboard(detailProduct, 2);
  assert.ok(confirmKeyboard.inline_keyboard.flat().some((button) => (
    button.callback_data === 'confirm:prd_detail:2'
    && button.icon_custom_emoji_id === newsEmojiIds.check
  )));
  assert.ok(confirmKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Giảm'
    && button.icon_custom_emoji_id === newsEmojiIds.down
  )));
  assert.ok(confirmKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Số lượng 2'
    && button.icon_custom_emoji_id === newsEmojiIds.chart
  )));
  assert.ok(confirmKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Tăng'
    && button.icon_custom_emoji_id === newsEmojiIds.plus
  )));
  assert.ok(confirmKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Hỗ trợ'
    && button.url
    && button.icon_custom_emoji_id === newsEmojiIds.adminchat
  )), 'Confirmation support URL should use the News admin-chat emoji.');
  assertAllKeyboardButtonsAnimated(confirmKeyboard, 'confirmation keyboard');

  const orderText = orderMessage({
    id: 'ord<1>',
    productName: 'Bot <Pro>',
    quantity: 1,
    total: 10000,
    currency: 'VND',
    status: 'pending_payment',
    productSnapshot: { deliveryMode: 'file' }
  }, {
    reference: 'KAITO<REF>',
    paymentUrl: 'https://pay.local/?memo=A&B',
    qrImageUrl: 'https://qr.local/?x=<bad>'
  });
  assert.match(orderText, /<b>Đơn đã tạo - đã giữ hàng<\/b>/);
  assert.equal(orderText.includes('<tg-emoji'), false);
  assert.match(orderText, /💳/);
  assert.match(orderText, /🔍/);
  assert.equal(orderText.includes('🥳'), false, 'Order headings should use News tracking instead of the Robo party emoji.');
  assert.match(orderText, /🤑/);
  assert.match(orderText, /👌/);
  assert.match(orderText, /giữ hàng/i);
  assert.match(orderText, /💳 Trạng thái: Chờ thanh toán/);
  assert.match(orderText, /ord&lt;1&gt;/);
  assert.match(orderText, /Bot &lt;Pro&gt;/);
  assert.match(orderText, /KAITO&lt;REF&gt;/);
  assert.match(orderText, /Giao hàng: Tệp TXT/);
  assert.equal(orderText.includes('https://pay.local'), false);
  assertNoUnsupportedHtml(orderText);
  const paymentKeyboard = buildPaymentKeyboard({
    id: 'ord_1',
    status: 'pending_payment'
  }, {
    paymentUrl: 'https://pay.local/',
    qrImageUrl: 'https://qr.local/'
  });
  assert.equal(paymentKeyboard.inline_keyboard.flat().some((button) => (
    ['Thanh toán', 'Xem QR'].includes(button.text)
  )), false, 'Payment and QR links should be replaced by an immediately sent QR image.');
  assert.ok(paymentKeyboard.inline_keyboard.flat().some((button) => (
    button.callback_data === 'cancel:ord_1'
    && button.icon_custom_emoji_id === newsEmojiIds.cross
  )));
  assert.ok(paymentKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Đơn của tôi'
    && button.callback_data === 'orders:mine'
    && button.icon_custom_emoji_id === newsEmojiIds.tracking
  )), 'The order-list button should use the News tracking emoji.');
  assert.ok(paymentKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Liên hệ hỗ trợ'
    && button.url
    && button.icon_custom_emoji_id === newsEmojiIds.adminchat
  )), 'Payment support URL should use the News admin-chat emoji.');
  assertAllKeyboardButtonsAnimated(paymentKeyboard, 'payment keyboard');
  const qrCaption = paymentQrCaption({
    id: 'ord<qr>',
    total: 400000,
    currency: 'VND'
  }, {
    reference: 'KAITO<QR>'
  });
  assert.match(qrCaption, /Quét QR để thanh toán/);
  assert.match(qrCaption, /400\.000 VND/);
  assert.match(qrCaption, /ord&lt;qr&gt;/);
  assert.match(qrCaption, /KAITO&lt;QR&gt;/);
  assertNoUnsupportedHtml(qrCaption);
  const deliveredOrderKeyboard = buildPaymentKeyboard({ id: 'ord_1', status: 'delivered' }, {});
  assert.ok(deliveredOrderKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Xem lại thông tin giao hàng'
    && button.icon_custom_emoji_id === newsEmojiIds.download
  )));
  assert.ok(deliveredOrderKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Đơn của tôi'
    && button.icon_custom_emoji_id === newsEmojiIds.tracking
  )));
  assert.ok(deliveredOrderKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Liên hệ hỗ trợ'
    && button.url
    && button.icon_custom_emoji_id === newsEmojiIds.adminchat
  )));
  assertAllKeyboardButtonsAnimated(deliveredOrderKeyboard, 'delivered order keyboard');
  const cancelConfirmationKeyboard = buildCancelConfirmationKeyboard({ id: 'ord_1' });
  assert.ok(cancelConfirmationKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Giữ đơn'
    && button.icon_custom_emoji_id === newsEmojiIds.lock
  )));
  assert.ok(cancelConfirmationKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Xác nhận hủy'
    && button.icon_custom_emoji_id === newsEmojiIds.cross
  )));
  assert.ok(cancelConfirmationKeyboard.inline_keyboard.flat().some((button) => (
    button.text === 'Liên hệ hỗ trợ'
    && button.url
    && button.icon_custom_emoji_id === newsEmojiIds.adminchat
  )));
  assertAllKeyboardButtonsAnimated(cancelConfirmationKeyboard, 'cancel confirmation keyboard');

  const deliveryText = deliveryMessage({
    id: 'ord<2>',
    productName: 'Key <VIP>'
  }, ['secret<one>&two']);
  assert.match(deliveryText, /<b>Đã giao hàng<\/b>/);
  assert.equal(deliveryText.includes('<tg-emoji'), false);
  assert.match(deliveryText, /📦/);
  assert.match(deliveryText, /mua thêm/i);
  assert.match(deliveryText, /ord&lt;2&gt;/);
  assert.match(deliveryText, /Key &lt;VIP&gt;/);
  assert.match(deliveryText, /secret&lt;one&gt;&amp;two/);
  assertNoUnsupportedHtml(deliveryText);

  const rawDeliverySecret = 'tài khoản|mật khẩu<&>第二行';
  const documentText = deliveryDocumentText({
    id: 'ord/../../<2>',
    productName: 'Key <VIP>',
    quantity: 1
  }, [rawDeliverySecret]);
  assert.ok(documentText.includes(rawDeliverySecret), 'TXT delivery must preserve the raw secret exactly.');
  assert.ok(documentText.endsWith('\r\n'));
  const documentFilename = deliveryDocumentFilename({ id: 'ord/../../<2>' });
  assert.match(documentFilename, /^kaito-delivery-[A-Za-z0-9._-]+\.txt$/);
  assert.equal(documentFilename.includes('/'), false);
  assert.equal(documentFilename.includes('\\'), false);
  assert.equal(documentFilename.includes('..'), false);
  const documentCaption = deliveryDocumentCaption({
    id: 'ord<2>',
    productName: 'Key <VIP>'
  });
  assert.match(documentCaption, /ord&lt;2&gt;/);
  assert.match(documentCaption, /Key &lt;VIP&gt;/);
  assert.equal(documentCaption.includes(rawDeliverySecret), false);
  assertNoUnsupportedHtml(documentCaption);

  const calls = [];
  let forceDocumentFailure = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: parseTelegramBody(options.body) });
    if (forceDocumentFailure && String(url).includes('/sendDocument')) {
      return {
        ok: false,
        status: 500,
        async text() {
          return JSON.stringify({ ok: false, description: 'Internal Server Error' });
        }
      };
    }
    return {
      ok: true,
      async json() {
        return { ok: true };
      }
    };
  };

  const fileDeliveryUser = await shop.upsertTelegramUser({
    id: '9101',
    username: 'file-delivery-buyer',
    first_name: 'File',
    last_name: 'Buyer'
  });
  const fileDeliveryProduct = await shop.createProduct('telegram-message-test', {
    sku: 'telegram-file-delivery',
    name: 'Telegram File Delivery',
    description: 'File delivery regression product',
    accountType: 'Test account',
    warrantyPolicy: 'Test warranty',
    replacementPolicy: 'Test replacement',
    deliveryMode: 'file',
    price: 10000,
    currency: 'VND'
  });
  const fileDeliverySecret = 'unicode-user|mật-khẩu<&>第二行';
  await shop.importInventory('telegram-message-test', fileDeliveryProduct.id, [fileDeliverySecret]);
  const fileCheckout = await shop.createOrderForUser(fileDeliveryUser, fileDeliveryProduct.sku, 1);
  await shop.applyPaymentEvent({
    id: 'evt_telegram_file_delivery',
    provider: fileCheckout.payment.provider,
    providerPaymentId: fileCheckout.payment.providerPaymentId,
    reference: fileCheckout.payment.reference,
    amount: fileCheckout.order.total,
    currency: fileCheckout.order.currency,
    status: 'paid',
    raw: { regression: true },
    receivedAt: new Date().toISOString()
  });

  calls.length = 0;
  await notifyDelivery(fileCheckout.order.id);
  const fileDeliveryCall = calls.find((call) => call.url.includes('/sendDocument'));
  assert.ok(fileDeliveryCall, 'File delivery mode should send one Telegram document.');
  assert.equal(await fileDeliveryCall.body.document.text(), deliveryDocumentText(
    { ...fileCheckout.order, status: 'delivered' },
    [fileDeliverySecret]
  ));
  assert.equal(fileDeliveryCall.body.caption.includes(fileDeliverySecret), false);
  assertEveryEmojiAnimated(fileDeliveryCall, 'TXT delivery caption');
  assertAllKeyboardButtonsAnimated(fileDeliveryCall.body.reply_markup, 'TXT delivery keyboard');
  assert.equal(
    calls.some((call) => call.url.includes('/sendMessage') && String(call.body.text || '').includes(fileDeliverySecret)),
    false,
    'Successful file delivery must not duplicate the secret in a text message.'
  );

  calls.length = 0;
  forceDocumentFailure = true;
  await notifyDelivery(fileCheckout.order.id);
  forceDocumentFailure = false;
  assert.ok(calls.some((call) => call.url.includes('/sendDocument')), 'Fallback should attempt the TXT document first.');
  const fallbackDeliveryCall = calls.find((call) => (
    call.url.includes('/sendMessage')
    && String(call.body.text || '').includes('unicode-user|mật-khẩu')
  ));
  assert.ok(fallbackDeliveryCall, 'A failed document delivery should fall back to the existing text delivery.');
  assertEveryEmojiAnimated(fallbackDeliveryCall, 'text delivery fallback');
  assertAllKeyboardButtonsAnimated(fallbackDeliveryCall.body.reply_markup, 'text delivery fallback keyboard');

  const seatNotificationUser = await shop.upsertTelegramUser({
    id: '9102',
    username: 'seat-notification-buyer',
    first_name: 'Seat',
    last_name: 'Buyer'
  });
  const seatNotificationProduct = await shop.createProduct('telegram-message-test', {
    sku: 'telegram-seat-notification',
    name: 'Telegram Business Seat',
    description: 'Seat notification regression product',
    accountType: 'Business workspace seat',
    warrantyPolicy: 'Test warranty',
    replacementPolicy: 'Test replacement',
    fulfillmentMode: 'seat_email',
    price: 400000,
    currency: 'VND'
  });
  const seatNotificationCheckout = await shop.createOrderForUser(
    seatNotificationUser,
    seatNotificationProduct.sku,
    1,
    { recipientEmails: ['notify-one@example.com', 'notify-two@example.com'] }
  );
  await shop.applyPaymentEvent({
    id: 'evt_telegram_seat_notification',
    provider: seatNotificationCheckout.payment.provider,
    providerPaymentId: seatNotificationCheckout.payment.providerPaymentId,
    reference: seatNotificationCheckout.payment.reference,
    amount: seatNotificationCheckout.order.total,
    currency: seatNotificationCheckout.order.currency,
    status: 'paid',
    raw: { regression: true },
    receivedAt: new Date().toISOString()
  });

  calls.length = 0;
  await notifyDelivery(seatNotificationCheckout.order.id);
  const seatAwaitingCall = calls.find((call) => (
    call.url.includes('/sendMessage') && call.body.text?.includes('Đã nhận thanh toán - đang cấp Seat')
  ));
  assert.ok(seatAwaitingCall);
  assertEveryEmojiAnimated(seatAwaitingCall, 'Seat awaiting fulfillment notification');
  assertAllKeyboardButtonsAnimated(seatAwaitingCall.body.reply_markup, 'Seat awaiting fulfillment keyboard');

  await shop.completeSeatFulfillment('telegram-message-test', seatNotificationCheckout.order.id, {
    note: 'Invitations sent'
  });
  calls.length = 0;
  await notifyDelivery(seatNotificationCheckout.order.id);
  const seatCompletedCall = calls.find((call) => (
    call.url.includes('/sendMessage') && call.body.text?.includes('Đã cấp Seat')
  ));
  assert.ok(seatCompletedCall, 'A completed Seat must have a resendable Telegram notice.');
  assertEveryEmojiAnimated(seatCompletedCall, 'Seat completion notification');
  assertAllKeyboardButtonsAnimated(seatCompletedCall.body.reply_markup, 'Seat completion keyboard');

  const seatRefundCheckout = await shop.createOrderForUser(
    seatNotificationUser,
    seatNotificationProduct.sku,
    1,
    { recipientEmails: ['refund-seat@example.com'] }
  );
  await shop.applyPaymentEvent({
    id: 'evt_telegram_seat_refund',
    provider: seatRefundCheckout.payment.provider,
    providerPaymentId: seatRefundCheckout.payment.providerPaymentId,
    reference: seatRefundCheckout.payment.reference,
    amount: seatRefundCheckout.order.total,
    currency: seatRefundCheckout.order.currency,
    status: 'paid',
    raw: { regression: true },
    receivedAt: new Date().toISOString()
  });
  await shop.markOrderRefunded('telegram-message-test', seatRefundCheckout.order.id, { note: 'Refunded' });
  calls.length = 0;
  await notifyDelivery(seatRefundCheckout.order.id);
  const seatRefundCall = calls.find((call) => (
    call.url.includes('/sendMessage') && call.body.text?.includes('Đơn đã được đánh dấu hoàn tiền')
  ));
  assert.ok(seatRefundCall, 'Refunded Seat orders should notify the customer.');
  assertEveryEmojiAnimated(seatRefundCall, 'Seat refund notification');
  assertAllKeyboardButtonsAnimated(seatRefundCall.body.reply_markup, 'Seat refund keyboard');

  calls.length = 0;
  await handleTelegramUpdate({
    message: {
      text: '/start',
      chat: { id: 9001 },
      from: { id: 9001, username: 'buyer' }
    }
  });

  assert.equal(calls.some((call) => call.url.includes('/sendSticker') || call.url.includes('/sendAnimation')), false);
  const welcomePhoto = calls.find((call) => call.url.includes('/sendPhoto') && String(call.body.chat_id) === '9001');
  assert.ok(welcomePhoto, '/start should send the welcome image.');
  assert.equal(
    welcomePhoto.body.photo,
    'https://cdn.example.local/kaito-start.png',
    '/start should prefer the configured public HTTPS image URL over a local upload.'
  );
  assert.equal(
    welcomePhoto.body.caption_entities?.some((entity) => entity.type === 'custom_emoji') || false,
    false,
    '/start photo should not send custom emoji caption entities because Telegram rejects them for this flow.'
  );
  assert.equal(welcomePhoto.body.caption, undefined);
  assert.equal(welcomePhoto.body.reply_markup, undefined);
  const welcomeMessage = calls.find((call) => call.url.includes('/sendMessage') && String(call.body.chat_id) === '9001' && call.body.text?.includes('Admin: @kaitoukit'));
  assert.ok(welcomeMessage, '/start should send a text message with the menu and custom emoji entities.');
  assert.equal(
    welcomeMessage.body.entities?.some((entity) => entity.type === 'custom_emoji') || false,
    true,
    '/start text should send custom emoji entities when configured.'
  );
  assert.equal(hasCustomEmojiId(welcomeMessage, 'ce_banner_welcome'), false, '/start text should leave the trailing wave as a native emoji, not the banner welcome tile.');
  assert.ok(hasCustomEmojiId(welcomeMessage, 'ce_retro_k'), '/start text should animate the first KAITO letter from the retro pack.');
  assert.ok(hasCustomEmojiId(welcomeMessage, 'ce_retro_d'), '/start text should animate the KID letter D from the retro pack.');
  assert.ok(hasCustomEmojiId(welcomeMessage, 'ce_retro_p'), '/start text should animate the final SHOP letter from the retro pack.');
  assert.ok(hasCustomEmojiId(welcomeMessage, flameEmojiIds.moneyface), '/start text should animate the money face with Flame Emoji.');
  assert.ok(hasCustomEmojiId(welcomeMessage, 'ce_robo_wave'), '/start text should animate the trailing wave with Robo Emoji.');
  assertEveryEmojiAnimated(welcomeMessage, '/start message');
  assertAllKeyboardButtonsAnimated(welcomeMessage.body.reply_markup, '/start keyboard');
  assert.equal(countCustomEmojiId(welcomeMessage, newsEmojiIds.fast), 2, '/start text should animate both sides of Giao nhanh with NewsEmoji.');
  assert.equal(countCustomEmojiId(welcomeMessage, newsEmojiIds.auto247), 2, '/start text should animate both sides of Tự động 24/7 with NewsEmoji.');
  assert.equal(countCustomEmojiId(welcomeMessage, newsEmojiIds.tracking), 2, '/start text should animate both sides of order tracking with NewsEmoji.');
  assert.equal(countCustomEmojiId(welcomeMessage, newsEmojiIds.adminchat), 1, '/start text should animate the Admin chat icon with NewsEmoji.');
  assert.equal(countCustomEmojiId(welcomeMessage, newsEmojiIds.adminshield), 1, '/start text should animate the Admin shield icon with NewsEmoji.');
  assert.equal(countCustomEmojiId(welcomeMessage, newsEmojiIds.adminboom), 1, '/start text should animate the Admin boom icon with NewsEmoji.');
  assert.equal(countCustomEmojiId(welcomeMessage, newsEmojiIds.adminfire), 1, '/start text should animate the Admin fire icon with NewsEmoji.');
  assert.equal(countCustomEmojiId(welcomeMessage, 'ce_robo_hundred'), 1, '/start text should animate the Admin hundred icon with Robo Emoji.');
  assert.equal(countCustomEmojiId(welcomeMessage, newsEmojiIds.adminhundred), 0, '/start text should not animate the Admin hundred icon with NewsEmoji.');
  assert.equal(countCustomEmojiId(welcomeMessage, newsEmojiIds.newsflash), 0, '/start text should reserve the News flash emoji for catalog messaging.');
  for (const id of dailyUpdateTileIds) {
    assert.ok(hasCustomEmojiId(welcomeMessage, id), `/start text should animate Daily Update slogan tile ${id}.`);
  }
  assert.equal(hasCustomEmojiId(welcomeMessage, 'ce_slogan_welcome'), false, '/start text should not use slogan entities that fail live rendering.');
  assert.equal(welcomeMessage.body.parse_mode, undefined);
  assert.equal(welcomePhoto.body._fallback_caption, undefined, 'Internal fallback caption must not be sent to Telegram.');
  assert.equal(welcomePhoto.body._fallback_parse_mode, undefined, 'Internal fallback parse mode must not be sent to Telegram.');
  assert.equal(welcomeMessage.body._fallback_text, undefined, 'Internal fallback text must not be sent to Telegram.');
  assert.equal(welcomeMessage.body._fallback_parse_mode, undefined, 'Internal fallback parse mode must not be sent to Telegram.');
  assert.ok(welcomeMessage.body.text.includes('Admin: @kaitoukit'));
  assert.ok(welcomeMessage.body.text.includes('Giao nhanh'));
  assert.ok(welcomeMessage.body.text.includes('Tự động 24/7'));
  assert.ok(welcomeMessage.body.text.includes('Theo dõi đơn hàng'));
  assert.equal(welcomeMessage.body.text.includes('Shop AI/MMO tự động'), false);
  assert.equal(welcomeMessage.body.text.includes('Sản phẩm hot luôn sẵn trong menu'), false);
  assert.ok(welcomeMessage.body.reply_markup?.inline_keyboard?.flat().some((button) => button.callback_data === 'catalog:all'));
  const chatMenuButtonCall = calls.find((call) => call.url.includes('/setChatMenuButton') && call.body.chat_id === 9001);
  assert.ok(chatMenuButtonCall, '/start should enable the Telegram menu button for the current chat.');
  assert.equal(chatMenuButtonCall.body.menu_button.type, 'commands');

  calls.length = 0;
  await storage.withWrite(async (db) => {
    db.users.push(
      {
        id: 'usr_startup_1',
        telegramId: '9101',
        username: 'startup-one',
        firstName: 'Startup',
        lastName: 'One',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'usr_startup_2',
        telegramId: '9102',
        username: 'startup-two',
        firstName: 'Startup',
        lastName: 'Two',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'usr_startup_duplicate',
        telegramId: '9101',
        username: 'startup-duplicate',
        firstName: 'Startup',
        lastName: 'Duplicate',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    );
  });
  const restartResult = await notifyBotRestoredToUsers();
  const restartCalls = calls.filter((call) => call.url.includes('/sendMessage'));
  assert.equal(restartResult.attempted, 3);
  assert.equal(restartResult.sent, 3);
  assert.deepEqual(
    restartCalls.map((call) => String(call.body.chat_id)).sort(),
    ['9001', '9101', '9102'],
    'Startup broadcast should notify every known Telegram user once.'
  );
  assert.ok(
    restartCalls.every((call) => call.body.text === '🔄 Bot đã hoạt động trở lại'),
    'Startup broadcast should use the requested restored message.'
  );
  for (const call of restartCalls) {
    assertEveryEmojiAnimated(call, 'startup restored broadcast');
    assert.ok(
      hasCustomEmojiId(call, newsEmojiIds.refresh),
      'Startup broadcast should use the News refresh custom emoji.'
    );
  }

  calls.length = 0;
  await handleTelegramUpdate({
    update_id: 1001,
    message: {
      message_id: 101,
      text: '/buy',
      chat: { id: 9001 },
      from: { id: 9001, username: 'buyer' }
    }
  });
  const buyUsageCall = calls.find((call) => (
    call.url.includes('/sendMessage')
    && String(call.body.chat_id) === '9001'
    && call.body.text?.includes('/buy sku 1')
  ));
  assert.ok(buyUsageCall, '/buy without a SKU should send usage guidance.');
  assert.ok(hasCustomEmojiId(buyUsageCall, newsEmojiIds.info), '/buy usage should use the News info emoji.');
  assertEveryEmojiAnimated(buyUsageCall, '/buy usage guidance');

  calls.length = 0;
  await configureTelegramMenu();
  const commandCalls = calls.filter((call) => call.url.includes('/setMyCommands'));
  const defaultCommandsCall = commandCalls.find((call) => !call.body.language_code);
  const vietnameseCommandsCall = commandCalls.find((call) => call.body.language_code === 'vi');
  assert.ok(defaultCommandsCall, 'Startup should publish default Telegram bot commands so English/non-Vietnamese clients can open the bot menu.');
  assert.ok(vietnameseCommandsCall, 'Startup should also publish Vietnamese Telegram bot commands for Vietnamese clients.');
  assert.deepEqual(defaultCommandsCall.body.commands.map((item) => item.command), ['start', 'products', 'orders', 'notifications', 'support', 'account']);
  assert.deepEqual(vietnameseCommandsCall.body.commands.map((item) => item.command), defaultCommandsCall.body.commands.map((item) => item.command));
  assert.match(defaultCommandsCall.body.commands.find((item) => item.command === 'start').description, /menu/i);
  assert.ok(Array.isArray(TELEGRAM_MENU_LANGUAGE_CODES), 'Supported menu languages should be explicit and testable.');
  for (const languageCode of ['vi', 'en', 'id', 'th', 'zh', 'ja', 'ko', 'ru', 'de', 'fr', 'es', 'pt', 'ar', 'tr']) {
    assert.ok(
      TELEGRAM_MENU_LANGUAGE_CODES.includes(languageCode),
      `Telegram menu should cover ${languageCode} clients.`
    );
    assert.ok(
      commandCalls.some((call) => call.body.language_code === languageCode),
      `Startup should publish bot commands for ${languageCode} clients.`
    );
  }
  const menuButtonCall = calls.find((call) => call.url.includes('/setChatMenuButton'));
  assert.equal(menuButtonCall.body.menu_button.type, 'commands');

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_1',
      data: 'catalog:all',
      message: { chat: { id: 9001 }, message_id: 44 },
      from: { id: 9001, username: 'buyer' }
    }
  });

  assert.ok(calls.some((call) => call.url.includes('/answerCallbackQuery')));
  assert.equal(calls.some((call) => call.url.includes('/sendSticker') || call.url.includes('/sendAnimation')), false);
  assert.ok(calls.some((call) => call.body.text?.includes('Thanh toán khớp tự động; hàng kho giao ngay, Seat xử lý theo email.')));
  const catalogCall = calls.find((call) => call.body.reply_markup?.inline_keyboard?.flat().some((button) => button.callback_data?.startsWith('cat:')));
  assert.ok(catalogCall);
  assert.equal(countCustomEmojiId(catalogCall, newsEmojiIds['shopping-bag']), 1, 'Catalog heading should use the News shopping-bag emoji.');
  assert.equal(countCustomEmojiId(catalogCall, newsEmojiIds.newsflash), 1, 'Catalog delivery copy should use the News flash emoji.');
  assert.equal(countCustomEmojiId(catalogCall, newsEmojiIds.auto247), 1, 'Catalog delivery copy should use the News auto-247 emoji.');
  assert.equal(countCustomEmojiId(catalogCall, newsEmojiIds.party), 1, 'Catalog call-to-action should use the News party emoji.');
  assert.equal(hasCustomEmojiId(catalogCall, 'ce_ui_instant-delivery'), false, 'Catalog delivery copy should not fall back to the UI lightning emoji.');
  assert.match(catalogCall.body.text, /🔥 Sản phẩm hot/);
  assert.ok(hasCustomEmojiId(catalogCall, newsEmojiIds.adminfire), 'Catalog hot heading should use the live News admin-fire emoji.');
  assert.equal(catalogCall.body.text.includes('ChatGPT Plus - 1 tháng'), false, 'Hot product details should move out of the catalog message text.');
  const catalogRows = catalogCall.body.reply_markup.inline_keyboard;
  const catalogHotButtons = catalogRows.flat().filter((button) => button.callback_data?.startsWith('pkg:'));
  for (const expectedName of [
    'ChatGPT Business Seat 1M',
    'Claude Business Seat 1x 1M',
    'Claude Business Seat 6.5x 1M'
  ]) {
    assert.ok(
      catalogHotButtons.some((button) => button.text.includes(expectedName)),
      `${expectedName} should appear as a hot product button below the categories.`
    );
  }
  const chatGptHotButton = catalogHotButtons.find((button) => button.text.includes('ChatGPT Business Seat 1M'));
  assert.equal(chatGptHotButton.icon_custom_emoji_id, 'ce_chatgpt_file', 'ChatGPT hot product should use its animated brand emoji.');
  const lastCatalogCategoryRow = catalogRows.reduce((lastIndex, row, index) => (
    row.some((button) => button.callback_data?.startsWith('cat:')) ? index : lastIndex
  ), -1);
  const firstCatalogHotRow = catalogRows.findIndex((row) => row[0]?.callback_data?.startsWith('pkg:'));
  const catalogRefreshRow = catalogRows.findIndex((row) => row[0]?.callback_data === 'catalog:all');
  assert.ok(firstCatalogHotRow > lastCatalogCategoryRow, 'Live catalog hot products should render below all category rows.');
  assert.ok(catalogRefreshRow > firstCatalogHotRow, 'Live catalog navigation should remain below the hot product list.');
  assertEveryEmojiAnimated(catalogCall, 'catalog message');
  assertAllKeyboardButtonsAnimated(catalogCall.body.reply_markup, 'catalog callback keyboard');
  assert.equal(calls.some((call) => call.body.reply_markup?.inline_keyboard?.flat().some((button) => /^(buy|confirm):/.test(button.callback_data || ''))), false);

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_start_menu_1',
      data: 'start:menu',
      message: { chat: { id: 9001 }, message_id: 44 },
      from: { id: 9001, username: 'buyer' }
    }
  });

  const startMenuMessage = calls.find((call) => isTelegramTextCall(call) && String(call.body.chat_id) === '9001' && call.body.text?.includes('Admin: @kaitoukit'));
  assert.ok(startMenuMessage, 'Back-to-menu callback should present the main menu message.');
  for (const id of dailyUpdateTileIds) {
    assert.ok(hasCustomEmojiId(startMenuMessage, id), `Back-to-menu callback should animate Daily Update slogan tile ${id}.`);
  }
  assert.ok(hasCustomEmojiId(startMenuMessage, 'ce_retro_k'), 'Back-to-menu callback should animate the KAITO title.');
  assert.ok(hasCustomEmojiId(startMenuMessage, 'ce_robo_wave'), 'Back-to-menu callback should animate the trailing wave with Robo Emoji.');
  assertEveryEmojiAnimated(startMenuMessage, 'back-to-menu message');
  assertAllKeyboardButtonsAnimated(startMenuMessage.body.reply_markup, 'back-to-menu keyboard');

  const animatedCatalogProducts = catalog.DEFAULT_CATALOG_PRODUCTS.map((product, index) => ({
    ...product,
    id: `animated_product_${index}`,
    stock: { available: 1 }
  }));
  const defaultCatalogKeyboard = buildCatalogKeyboard(animatedCatalogProducts);
  const defaultButtons = defaultCatalogKeyboard.inline_keyboard.flat();
  const expectedCategoryEmojiIds = new Map([
    ['AI Accounts', newsEmojiIds.idea],
    ['Design Accounts', newsEmojiIds.diamond],
    ['Work & Cloud Accounts', newsEmojiIds.settings],
    ['Social/MMO Accounts', newsEmojiIds.chat]
  ]);
  for (const [category, customEmojiId] of expectedCategoryEmojiIds) {
    const button = defaultButtons.find((item) => (
      item.callback_data?.startsWith('cat:') && item.text.includes(category)
    ));
    assert.ok(button, `Catalog keyboard should include ${category}.`);
    assert.equal(
      button.icon_custom_emoji_id,
      customEmojiId,
      `${category} should use its semantic News emoji instead of borrowing a brand pack.`
    );
  }
  assertAllKeyboardButtonsAnimated(defaultCatalogKeyboard, 'default catalog keyboard');
  for (const category of [...new Set(animatedCatalogProducts.map((product) => product.category))]) {
    assertAllKeyboardButtonsAnimated(
      buildBrandKeyboard(animatedCatalogProducts, category),
      `${category} brand keyboard`
    );
  }
  for (const brand of [...new Set(animatedCatalogProducts.map((product) => product.brand))]) {
    assertAllKeyboardButtonsAnimated(
      buildPackageKeyboard(animatedCatalogProducts.filter((product) => product.brand === brand)),
      `${brand} package keyboard`
    );
  }
  assert.equal(defaultButtons.some((button) => button.callback_data?.startsWith('brand:')), false);
  assert.equal(defaultButtons.some((button) => button.callback_data?.startsWith('buy:')), false);

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_brand_soldout_1',
      data: 'brand_soldout:Design%20Accounts:Canva',
      message: { chat: { id: 9001 }, message_id: 44 },
      from: { id: 9001, username: 'buyer' }
    }
  });
  const soldOutBrandAnswer = calls.find((call) => call.url.includes('/answerCallbackQuery'));
  assert.ok(soldOutBrandAnswer?.body.text.includes('Canva'), 'Sold-out brand callback should tell users which brand is unavailable.');
  assert.equal(calls.some((call) => call.url.includes('/sendMessage')), false, 'Sold-out brand callback should not open a package chooser.');

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_brand_1',
      data: 'brand:AI%20Accounts:ChatGPT',
      message: { chat: { id: 9001 }, message_id: 45 },
      from: { id: 9001, username: 'buyer' }
    }
  });

  const brandCall = calls.find((call) => isTelegramMediaCall(call));
  assert.ok(brandCall, 'Brand callback should present a package chooser.');
  assert.match(brandCall.body.caption, /AI Accounts \/ ChatGPT/);
  assert.ok(hasEntityType(brandCall, 'bold'));
  assert.equal(countCustomEmojiId(brandCall, newsEmojiIds.idea), 1, 'AI category should use the semantic News idea emoji.');
  assert.equal(countCustomEmojiId(brandCall, 'ce_chatgpt_file'), 1, 'ChatGPT should keep its own brand emoji.');
  assertEveryEmojiAnimated(brandCall, 'brand package chooser message');
  assert.match(brandCall.body.caption, /Seat không cần tồn kho/i);
  assert.equal(brandCall.body.caption.includes('SKU:'), false, 'Brand chooser text should not expose SKU; buying should be button-first.');
  assert.equal(calls.some((call) => call.url.includes('/sendSticker') || call.url.includes('/sendAnimation')), false);
  assert.equal(
    calls.some((call) => call.url.includes('/sendSticker') && call.body.sticker === 'sticker_chatgpt_motion'),
    false,
    'Brand callback must not send file_ids from a custom emoji pack as stickers.'
  );
  assert.ok(brandCall.body.reply_markup.inline_keyboard.flat().some((button) => button.callback_data?.startsWith('pkg:')));
  assertAllKeyboardButtonsAnimated(brandCall.body.reply_markup, 'brand package chooser keyboard');
  assert.equal(brandCall.body.reply_markup.inline_keyboard.flat().some((button) => button.callback_data?.startsWith('buy:')), false);
  assert.equal(
    brandCall.body.reply_markup.inline_keyboard.flat().some((button) => button.text.includes('\uFE0F')),
    false,
    'Brand chooser buttons should avoid variation-selector-only emoji glitches.'
  );
  const livePackageButton = brandCall.body.reply_markup.inline_keyboard
    .flat()
    .find((button) => button.callback_data?.startsWith('pkg:'));
  assert.ok(livePackageButton, 'Brand chooser should expose a product-detail action.');

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_brand_figma_emoji',
      data: 'brand:Design%20Accounts:Figma',
      message: { chat: { id: 9001 }, message_id: 46, photo: [{ file_id: 'figma-brand-photo' }] },
      from: { id: 9001, username: 'buyer' }
    }
  });
  const figmaBrandCall = calls.find((call) => (
    isTelegramMediaCall(call)
    && call.body.caption?.includes('Design Accounts / Figma')
  ));
  assert.ok(figmaBrandCall, 'Figma callback should present its brand package chooser.');
  assert.equal(
    countCustomEmojiId(figmaBrandCall, newsEmojiIds.diamond),
    2,
    'Figma category and brand fallback should both use the semantic Design emoji.'
  );
  assert.equal(
    hasCustomEmojiId(figmaBrandCall, 'ce_ui_reviews'),
    false,
    'Figma must not fall back to the KAITO/review emoji pack.'
  );
  assertEveryEmojiAnimated(figmaBrandCall, 'Figma brand package chooser message');

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_product_detail_news',
      data: livePackageButton.callback_data,
      message: { chat: { id: 9001 }, message_id: 45, photo: [{ file_id: 'brand-card-photo' }] },
      from: { id: 9001, username: 'buyer' }
    }
  });
  const productDetailCall = calls.find((call) => (
    isTelegramMediaCall(call)
    && call.body.caption?.includes('Mô tả:')
  ));
  assert.ok(productDetailCall, 'Package callback should present product details.');
  for (const id of [
    newsEmojiIds['shopping-bag'],
    newsEmojiIds.info,
    newsEmojiIds.settings,
    newsEmojiIds.shield,
    newsEmojiIds.refresh,
    newsEmojiIds.download,
    newsEmojiIds.dollar
  ]) {
    assert.ok(hasCustomEmojiId(productDetailCall, id), `Product details should animate News ID ${id}.`);
  }
  const productStockNewsId = productDetailCall.body.caption.includes('Cách đặt:')
    ? newsEmojiIds.tracking
    : productDetailCall.body.caption.includes('Tồn kho: Còn')
      ? newsEmojiIds.chart
      : newsEmojiIds.warning;
  assert.ok(
    hasCustomEmojiId(productDetailCall, productStockNewsId),
    `Product stock state should animate News ID ${productStockNewsId}.`
  );
  assertEveryEmojiAnimated(productDetailCall, 'product-detail message');
  assertAllKeyboardButtonsAnimated(productDetailCall.body.reply_markup, 'product-detail callback keyboard');

  const liveGeminiProduct = (await shop.listProducts())
    .find((product) => product.sku === 'gemini-advanced-1m');
  assert.ok(liveGeminiProduct, 'Live catalog should expose the Gemini plan.');
  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_product_detail_gemini_emoji',
      data: `pkg:${liveGeminiProduct.id || liveGeminiProduct.sku}`,
      message: { chat: { id: 9001 }, message_id: 46, photo: [{ file_id: 'gemini-plan-photo' }] },
      from: { id: 9001, username: 'buyer' }
    }
  });
  const geminiProductCall = calls.find((call) => (
    isTelegramMediaCall(call)
    && call.body.caption?.includes('Gemini Advanced')
  ));
  assert.ok(geminiProductCall, 'Gemini package callback should present product details.');
  assert.equal(
    countCustomEmojiId(geminiProductCall, 'ce_gemini_motion'),
    2,
    'Both Gemini marks should use the Gemini brand pack instead of the generic review emoji.'
  );
  assertEveryEmojiAnimated(geminiProductCall, 'Gemini product-detail message');

  const liveSeatProduct = (await shop.listProducts())
    .find((product) => product.sku === 'chatgpt-business-seat-1m');
  assert.ok(liveSeatProduct, 'Live catalog should expose the ChatGPT Business Seat flow.');
  assert.match(liveSeatProduct.usagePolicy, /9Router/i, 'The live ChatGPT Seat should expose its usage rules.');
  assert.ok(Buffer.byteLength(productDetailMessage(liveSeatProduct), 'utf8') < 4096, 'Seat usage rules should keep product details within Telegram limits.');
  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_seat_prompt_animated',
      data: `buy:${liveSeatProduct.id}:1`,
      message: { chat: { id: 9005 }, message_id: 47 },
      from: { id: 9005, username: 'seat-animated-buyer' }
    }
  });
  const liveSeatPrompt = calls.find((call) => (
    isTelegramTextCall(call) && call.body.text?.includes('Nhập email nhận Seat')
  ));
  assert.ok(liveSeatPrompt);
  assertEveryEmojiAnimated(liveSeatPrompt, 'seat email prompt message');
  assertAllKeyboardButtonsAnimated(liveSeatPrompt.body.reply_markup, 'seat email prompt keyboard');

  calls.length = 0;
  await handleTelegramUpdate({
    message: {
      chat: { id: 9005 },
      message_id: 48,
      text: 'animated-one@example.com\nanimated-two@example.com',
      from: { id: 9005, username: 'seat-animated-buyer' }
    }
  });
  const liveSeatReview = calls.find((call) => (
    isTelegramTextCall(call) && call.body.text?.includes('Xác nhận email mua Seat')
  ));
  assert.ok(liveSeatReview);
  assertEveryEmojiAnimated(liveSeatReview, 'seat email review message');
  assertAllKeyboardButtonsAnimated(liveSeatReview.body.reply_markup, 'seat email review keyboard');

  const trackedDb = await storage.readStore();
  assert.ok(
    trackedDb.auditLogs.some((log) => log.action === 'telegram.click.brand' && log.details?.brand === 'ChatGPT'),
    'Telegram brand clicks should be tracked in audit logs for behavior analytics.'
  );

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_topup_1',
      data: 'topup',
      message: { chat: { id: 9001 }, message_id: 46 },
      from: { id: 9001, username: 'buyer' }
    }
  });

  assert.equal(calls.some((call) => call.url.includes('/sendSticker') || call.url.includes('/sendAnimation')), false);
  const topupCall = calls.find((call) => isTelegramTextCall(call));
  assert.ok(topupCall?.body.text.includes('🤑'));
  assert.ok(topupCall?.body.text.includes('👌'));
  assert.ok(hasCustomEmojiId(topupCall, 'ce_flame_moneyface'));
  assert.ok(hasCustomEmojiId(topupCall, newsEmojiIds.dollar));
  assert.ok(hasCustomEmojiId(topupCall, 'ce_robo_ok'));
  assertEveryEmojiAnimated(topupCall, 'top-up message');
  assertAllKeyboardButtonsAnimated(topupCall.body.reply_markup, 'top-up keyboard');

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_support_1',
      data: 'support',
      message: { chat: { id: 9001 }, message_id: 47 },
      from: { id: 9001, username: 'buyer' }
    }
  });

  assert.equal(calls.some((call) => call.url.includes('/sendSticker') || call.url.includes('/sendAnimation')), false);
  const supportCall = calls.find((call) => isTelegramTextCall(call));
  assert.ok(supportCall?.body.text.includes('@kaitoukit'));
  assert.ok(supportCall?.body.text.includes('💬'));
  assert.ok(supportCall?.body.text.includes('🙏'));
  assert.ok(supportCall?.body.text.includes('🫡'));
  assert.ok(hasCustomEmojiId(supportCall, newsEmojiIds.chat));
  assert.ok(hasCustomEmojiId(supportCall, 'ce_robo_please'));
  assert.ok(hasCustomEmojiId(supportCall, 'ce_robo_salute'));
  assertEveryEmojiAnimated(supportCall, 'support message');
  assertAllKeyboardButtonsAnimated(supportCall.body.reply_markup, 'support keyboard');

  const menuNewsEmojiIds = {
    language: newsEmojiIds.globe,
    security: newsEmojiIds.shield,
    'instant-delivery': newsEmojiIds.fast,
    'automation-247': newsEmojiIds.auto247,
    quality: newsEmojiIds.hundred,
    member: newsEmojiIds.crown,
    offers: newsEmojiIds.diamond,
    notifications: newsEmojiIds.bell,
    promotions: newsEmojiIds.boom,
    reviews: newsEmojiIds['thumbs-up'],
    academy: newsEmojiIds.idea,
    news: newsEmojiIds.megaphone,
    events: newsEmojiIds.party,
    policy: newsEmojiIds.lock,
    logout: newsEmojiIds.cross
  };
  for (const menuData of [
    'language',
    'security',
    'instant-delivery',
    'automation-247',
    'quality',
    'member',
    'offers',
    'notifications',
    'promotions',
    'reviews',
    'academy',
    'news',
    'events',
    'policy',
    'logout'
  ]) {
    calls.length = 0;
    await handleTelegramUpdate({
      callback_query: {
        id: `cb_${menuData}`,
        data: menuData,
        message: { chat: { id: 9001 }, message_id: 48 },
        from: { id: 9001, username: 'buyer' }
      }
    });
    const menuCall = calls.find((call) => isTelegramTextCall(call));
    assert.ok(menuCall, `${menuData} menu item should respond with a message.`);
    assert.equal(menuCall.body.text.includes('Mình chưa hiểu'), false, `${menuData} should not fall through to unknown command.`);
    assertEveryEmojiAnimated(menuCall, `${menuData} menu message`);
    if (menuNewsEmojiIds[menuData]) {
      assert.equal(
        countCustomEmojiId(menuCall, menuNewsEmojiIds[menuData]),
        1,
        `${menuData} info heading should use its explicit News emoji.`
      );
    }
    if (menuData === 'quality') {
      assert.equal(
        hasCustomEmojiId(menuCall, 'ce_robo_hundred'),
        false,
        'Quality info should use News admin-hundred without changing the Robo hundred on /start.'
      );
    }
    if (menuCall.body.reply_markup) {
      assertAllKeyboardButtonsAnimated(menuCall.body.reply_markup, `${menuData} menu keyboard`);
    }
  }

  const trackingOrderProduct = await shop.createProduct('telegram-message-test', {
    sku: 'telegram-news-tracking-order',
    name: 'Telegram News Tracking Order',
    description: 'Regression product for News emoji order headings',
    category: 'AI Accounts',
    brand: 'ChatGPT',
    packageType: 'Tracking Test',
    accountType: 'Test account',
    warrantyPolicy: 'Test warranty',
    replacementPolicy: 'Test replacement',
    deliveryMode: 'text',
    price: 12000,
    currency: 'VND'
  });
  await shop.importInventory('telegram-message-test', trackingOrderProduct.id, ['tracking-test-secret']);

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_confirmation_news',
      data: `buy:${trackingOrderProduct.id}:1`,
      message: { chat: { id: 9001 }, message_id: 148 },
      from: { id: 9001, username: 'buyer' }
    }
  });
  const confirmationCall = calls.find((call) => (
    isTelegramTextCall(call)
    && call.body.text?.includes('Xác nhận mua')
  ));
  assert.ok(confirmationCall, 'An in-stock buy-review callback should present confirmation details.');
  assert.equal(countCustomEmojiId(confirmationCall, newsEmojiIds.check), 1);
  assert.equal(countCustomEmojiId(confirmationCall, newsEmojiIds['shopping-bag']), 1);
  assert.equal(countCustomEmojiId(confirmationCall, newsEmojiIds.chart), 1);
  assert.equal(countCustomEmojiId(confirmationCall, newsEmojiIds.dollar), 2);
  assert.equal(countCustomEmojiId(confirmationCall, newsEmojiIds.download), 1);
  assert.equal(countCustomEmojiId(confirmationCall, newsEmojiIds.lock), 1);
  assertEveryEmojiAnimated(confirmationCall, 'confirmation message');
  assertAllKeyboardButtonsAnimated(confirmationCall.body.reply_markup, 'confirmation callback keyboard');
  const confirmationBuyButton = confirmationCall.body.reply_markup.inline_keyboard
    .flat()
    .find((button) => button.callback_data === `confirm:${trackingOrderProduct.id}:1`);
  assert.ok(confirmationBuyButton, 'In-stock confirmation should expose the buy-confirm action.');
  assert.equal(confirmationBuyButton.icon_custom_emoji_id, newsEmojiIds.check);

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_tracking_confirm',
      data: `confirm:${trackingOrderProduct.id}:1`,
      message: { chat: { id: 9001 }, message_id: 149 },
      from: { id: 9001, username: 'buyer' }
    }
  });
  const createdOrderCall = calls.find((call) => (
    isTelegramTextCall(call)
    && call.body.text?.includes('Đơn đã tạo - đã giữ hàng')
  ));
  assert.ok(createdOrderCall, 'Confirming a purchase should present the created order.');
  assert.equal(countCustomEmojiId(createdOrderCall, newsEmojiIds.tracking), 1, 'Created-order heading should use News tracking.');
  assert.equal(hasCustomEmojiId(createdOrderCall, 'ce_robo_party'), false, 'Created-order heading should not fall back to Robo party.');
  assertEveryEmojiAnimated(createdOrderCall, 'created-order message');
  assertAllKeyboardButtonsAnimated(createdOrderCall.body.reply_markup, 'created-order keyboard');
  assert.ok(createdOrderCall.body.reply_markup.inline_keyboard.flat().some((button) => (
    button.text === 'Đơn của tôi'
    && button.callback_data === 'orders:mine'
    && button.icon_custom_emoji_id === newsEmojiIds.tracking
  )));
  assert.ok(createdOrderCall.body.reply_markup.inline_keyboard.flat().some((button) => (
    button.text === 'Liên hệ hỗ trợ'
    && button.url
    && button.icon_custom_emoji_id === newsEmojiIds.adminchat
  )));
  const createdOrderCancelButton = createdOrderCall.body.reply_markup.inline_keyboard
    .flat()
    .find((button) => button.callback_data?.startsWith('cancel:'));
  assert.ok(createdOrderCancelButton, 'Created order should expose its cancel action.');
  const trackingOrderId = createdOrderCancelButton.callback_data.slice('cancel:'.length);

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_tracking_orders',
      data: 'orders:mine',
      message: { chat: { id: 9001 }, message_id: 150 },
      from: { id: 9001, username: 'buyer' }
    }
  });
  const recentOrdersCall = calls.find((call) => (
    isTelegramTextCall(call)
    && call.body.text?.includes('Đơn hàng gần đây')
  ));
  assert.ok(recentOrdersCall, 'Order-list callback should present recent orders.');
  assert.equal(countCustomEmojiId(recentOrdersCall, newsEmojiIds.tracking), 1, 'Recent-orders heading should use News tracking.');
  assertEveryEmojiAnimated(recentOrdersCall, 'recent-orders message');
  assertAllKeyboardButtonsAnimated(recentOrdersCall.body.reply_markup, 'recent-orders keyboard');

  calls.length = 0;
  await handleTelegramUpdate({
    callback_query: {
      id: 'cb_tracking_order_detail',
      data: `order:${trackingOrderId}`,
      message: { chat: { id: 9001 }, message_id: 151 },
      from: { id: 9001, username: 'buyer' }
    }
  });
  const orderDetailCall = calls.find((call) => (
    isTelegramTextCall(call)
    && call.body.text?.includes('Chi tiết đơn hàng')
  ));
  assert.ok(orderDetailCall, 'Order callback should present order details.');
  assert.equal(countCustomEmojiId(orderDetailCall, newsEmojiIds.tracking), 1, 'Order-detail heading should use News tracking.');
  assertEveryEmojiAnimated(orderDetailCall, 'order-detail message');
  assertAllKeyboardButtonsAnimated(orderDetailCall.body.reply_markup, 'order-detail keyboard');

  calls.length = 0;
  await handleTelegramUpdate({
    message: {
      text: '/support',
      chat: { id: 9001 },
      from: { id: 9001, username: 'buyer' }
    }
  });
  const supportCommandCall = calls.find((call) => call.url.includes('/sendMessage') && call.body.text.includes('Hỗ trợ'));
  assert.ok(supportCommandCall);
  assert.ok(hasEntityType(supportCommandCall, 'bold'), '/support should preserve bold formatting with entity payloads.');
  assert.ok(hasCustomEmojiId(supportCommandCall, newsEmojiIds.chat), '/support should animate the News chat emoji.');
  assertEveryEmojiAnimated(supportCommandCall, '/support command message');
  assertAllKeyboardButtonsAnimated(supportCommandCall.body.reply_markup, '/support keyboard');

  calls.length = 0;
  await handleTelegramUpdate({
    message: {
      text: '/account',
      chat: { id: 9001 },
      from: { id: 9001, username: 'buyer' }
    }
  });
  const accountCall = calls.find((call) => call.url.includes('/sendMessage') && call.body.text.includes('Tài khoản'));
  assert.ok(accountCall);
  assert.ok(hasEntityType(accountCall, 'bold'));
  assert.ok(hasCustomEmojiId(accountCall, newsEmojiIds.settings));
  assertEveryEmojiAnimated(accountCall, '/account message');
  assertAllKeyboardButtonsAnimated(accountCall.body.reply_markup, '/account keyboard');

  calls.length = 0;
  globalThis.fetch = async (url, options) => {
    const body = parseTelegramBody(options.body);
    calls.push({ url: String(url), body });
    const text = String(body.text || body.caption || '');
    const hasCustomEmojiEntity = [
      ...(body.entities || []),
      ...(body.caption_entities || [])
    ].some((entity) => entity.type === 'custom_emoji');
    if (text.includes('<tg-emoji') || hasCustomEmojiEntity) {
      return {
        ok: false,
        status: 400,
        async text() {
          return JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: ENTITY_TEXT_INVALID' });
        }
      };
    }
    return {
      ok: true,
      async json() {
        return { ok: true, result: { message_id: calls.length } };
      }
    };
  };

  await sendTelegramMessage(9001, '<tg-emoji emoji-id="ce_robo_wave">👋</tg-emoji> raw retry');
  assert.equal(calls.length, 1, 'Raw tg-emoji HTML tags without entity payload should still be stripped before sending.');
  assert.equal(calls[0].body.text.includes('<tg-emoji'), false);
  assert.equal(calls[0].body.entities?.some((entity) => entity.type === 'custom_emoji') || false, false);
  assert.equal(calls[0].body.text, '👋 raw retry');
  assert.equal(calls[0].body.parse_mode, 'HTML');

  calls.length = 0;
  await sendTelegramMessage(9001, '👋 raw retry', {
    parse_mode: undefined,
    entities: [{
      type: 'custom_emoji',
      offset: 0,
      length: '👋'.length,
      custom_emoji_id: 'ce_robo_wave'
    }],
    _fallback_text: '<b>Fallback</b> 👋 raw retry',
    _fallback_parse_mode: 'HTML'
  });
  assert.equal(calls.length, 2, 'sendMessage should retry once with plain HTML fallback when Telegram rejects custom emoji entities.');
  assert.equal(calls[0].body.text, '👋 raw retry');
  assert.ok(hasCustomEmojiId(calls[0], 'ce_robo_wave'));
  assert.equal(calls[0].body.parse_mode, undefined);
  assert.equal(calls[1].body.text, '<b>Fallback</b> 👋 raw retry');
  assert.equal(calls[1].body.parse_mode, 'HTML');
  assert.equal(calls[1].body.entities?.some((entity) => entity.type === 'custom_emoji') || false, false);

  calls.length = 0;
  await sendTelegramPhotoFile(9001, startImageFile, {
    caption: '👋 photo retry',
    parse_mode: undefined,
    caption_entities: [{
      type: 'custom_emoji',
      offset: 0,
      length: '👋'.length,
      custom_emoji_id: 'ce_robo_wave'
    }],
    _fallback_caption: '<b>Fallback</b> 👋 photo retry',
    _fallback_parse_mode: 'HTML'
  });
  assert.equal(calls.length, 2, 'sendPhoto should retry once with plain HTML fallback when Telegram rejects caption custom emoji entities.');
  assert.ok(calls.every((call) => call.url.includes('/sendPhoto')));
  assert.equal(calls[0].body.caption, '👋 photo retry');
  assert.ok(hasCustomEmojiId(calls[0], 'ce_robo_wave'));
  assert.equal(calls[0].body.parse_mode, undefined);
  assert.equal(calls[1].body.caption, '<b>Fallback</b> 👋 photo retry');
  assert.equal(calls[1].body.parse_mode, 'HTML');
  assert.equal(calls[1].body.caption_entities?.some((entity) => entity.type === 'custom_emoji') || false, false);

  calls.length = 0;
  await sendTelegramPhotoFile(9001, startImageFile, {
    caption: '<tg-emoji emoji-id="ce_retro_k">🔤</tg-emoji> photo retry',
    parse_mode: 'HTML',
    _fallback_caption: '<b>KAITO KID AI SHOP</b> photo retry',
    _fallback_parse_mode: 'HTML'
  });
  assert.equal(calls.length, 1, 'sendPhoto should ignore internal fallback fields when no custom entity payload is present.');
  assert.ok(calls.every((call) => call.url.includes('/sendPhoto')));
  assert.equal(calls[0].body.caption, '🔤 photo retry');
  assert.equal(calls[0].body.parse_mode, 'HTML');
  assert.equal(calls[0].body._fallback_caption, undefined);
  assert.equal(calls[0].body.caption_entities?.some((entity) => entity.type === 'custom_emoji') || false, false);

  console.log(JSON.stringify({ ok: true, checked: 'telegram html messages' }, null, 2));
} finally {
  await rm(dataFile, { force: true });
  await rm(customEmojiMapFile, { force: true });
  await rm(uiEmojiMapFile, { force: true });
  await rm(sloganEmojiMapFile, { force: true });
  await rm(sloganTileEmojiMapFile, { force: true });
  await rm(bannerEmojiMapFile, { force: true });
  await rm(newsEmojiMapFile, { force: true });
  await rm(flameEmojiMapFile, { force: true });
  await rm(gameEmojiMapFile, { force: true });
  await rm(roboEmojiMapFile, { force: true });
  await rm(retroFontEmojiMapFile, { force: true });
  await rm(regularStickerMapFile, { force: true });
  await rm(startImageFile, { force: true });
}

function parseTelegramBody(body) {
  if (body instanceof FormData) {
    const parsed = {};
    for (const [key, value] of body.entries()) {
      if (key === 'reply_markup' || key === 'caption_entities' || key === 'entities' || key === 'media') {
        parsed[key] = JSON.parse(value);
      } else {
        parsed[key] = value;
      }
    }
    if (parsed.media) {
      parsed.caption = parsed.media.caption;
      parsed.caption_entities = parsed.media.caption_entities;
      parsed.parse_mode = parsed.media.parse_mode;
    }
    return parsed;
  }
  return JSON.parse(body);
}

function isTelegramTextCall(call) {
  return call.url.includes('/sendMessage') || call.url.includes('/editMessageText');
}

function isTelegramMediaCall(call) {
  return call.url.includes('/sendPhoto') || call.url.includes('/editMessageMedia');
}

function hasCustomEmojiId(call, customEmojiId) {
  return [
    ...(call.body.entities || []),
    ...(call.body.caption_entities || [])
  ].some((entity) => entity.type === 'custom_emoji' && entity.custom_emoji_id === customEmojiId);
}

function countCustomEmojiId(call, customEmojiId) {
  return [
    ...(call.body.entities || []),
    ...(call.body.caption_entities || [])
  ].filter((entity) => entity.type === 'custom_emoji' && entity.custom_emoji_id === customEmojiId).length;
}

function hasEntityType(call, type) {
  return [
    ...(call.body.entities || []),
    ...(call.body.caption_entities || [])
  ].some((entity) => entity.type === type);
}
