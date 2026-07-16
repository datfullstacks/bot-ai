import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { brandSortKey, normalizePublicProduct } from './catalog.js';
import { createOrderForUser, getDeliveryForOrder, listProducts, recordAudit, upsertTelegramUser } from './shop.js';
import { readStore } from './storage.js';
import { consumeRateLimit } from './rateLimit.js';
import { readTelegramOffset, writeTelegramOffset } from './telegramOffsetStore.js';
import { brandIcon as brandAssetIcon } from '../public/brand-assets.js';
import * as telegramEmoji from './telegramEmoji.js';
import * as telegramTransport from './telegramTransport.js';
import { buildCustomEmojiEntityPayload } from './telegramTextEntities.js';

const {
  UI_ICONS,
  bannerCustomEmojiId,
  brandCustomEmojiId,
  brandStickerFileId,
  flameCustomEmojiId,
  gameCustomEmojiId,
  loadRegularStickerMap,
  motionStickerFileId,
  newsCustomEmojiId,
  retroCustomEmojiId,
  retroFontEmoji,
  roboCustomEmojiId,
  roboEmoji,
  sloganCustomEmojiId,
  sloganEmoji,
  sloganTileCustomEmojiCandidates,
  sloganTileFallbackText,
  sloganTilePlaceholder,
  uiCustomEmojiId,
  uiEmoji
} = telegramEmoji;
const {
  answerCallbackQuery,
  sendTelegramAnimation,
  sendTelegramMessage,
  sendTelegramPhotoFile,
  sendTelegramSticker,
  stripCustomEmojiTags,
  telegramJson
} = telegramTransport;

export {
  bannerCustomEmojiId,
  brandCustomEmojiId,
  brandStickerFileId,
  sendTelegramAnimation,
  sendTelegramMessage,
  sendTelegramPhotoFile,
  sendTelegramSticker,
  sloganCustomEmojiId
};

const regularStickerMap = loadRegularStickerMap();

const RETRO_FONT_ALT_EMOJI = '\u{1F524}';
const WELCOME_BRAND_TEXT = 'KAITO KID AI SHOP';
const FLAME_EMOJI = {
  moneyface: { emoji: '🤑' }
};
const NEWS_EMOJI = {
  fast: { emoji: '☄️' },
  auto247: { emoji: '🔄' },
  tracking: { emoji: '🔍' },
  adminchat: { emoji: '💬' },
  adminshield: { emoji: '🛡' },
  adminboom: { emoji: '💥' },
  adminfire: { emoji: '🔥' }
};

const CATEGORY_ICONS = new Map([
  ['AI Accounts', UI_ICONS.ai],
  ['Design Accounts', UI_ICONS.design],
  ['Work & Cloud Accounts', UI_ICONS.work],
  ['Social/MMO Accounts', UI_ICONS.social]
]);

const FLOW_MOTION_BRANDS = new Map([
  ['start', ['chatgpt', 'gemini', 'canva']],
  ['catalog', ['canva', 'chatgpt', 'claude', 'gemini']],
  ['topup', ['google', 'microsoft', 'notion']],
  ['account', ['telegram', 'discord', 'notion']],
  ['language', ['google', 'telegram']],
  ['support', ['telegram', 'discord']],
  ['order', ['notion', 'microsoft', 'telegram']],
  ['delivery', ['telegram', 'chatgpt']]
]);

const ORDER_STATUS_LABELS = new Map([
  ['pending_payment', '⏳ Chờ thanh toán'],
  ['payment_review', '🟠 Cần kiểm tra'],
  ['delivered', '✅ Đã giao hàng'],
  ['cancelled', '⛔ Đã hủy'],
  ['expired', '⌛ Hết hạn'],
  ['refunded', '↩️ Đã hoàn tiền'],
  ['paid', '✅ Đã thanh toán']
]);

const TELEGRAM_ALL_MENU_COMMANDS = [
  { command: 'start', description: 'Mở menu chính' },
  { command: 'products', description: 'Xem sản phẩm' },
  { command: 'topup', description: 'Nạp tiền/đặt gói riêng' },
  { command: 'account', description: 'Xem tài khoản' },
  { command: 'orders', description: 'Xem đơn hàng' },
  { command: 'language', description: 'Đổi ngôn ngữ' },
  { command: 'support', description: 'Liên hệ hỗ trợ' },
  { command: 'security', description: 'Xem bảo mật' },
  { command: 'instant_delivery', description: 'Giao hàng tức thì' },
  { command: 'automation_247', description: 'Tự động 24/7' },
  { command: 'quality', description: 'Chất lượng uy tín' },
  { command: 'member', description: 'Thông tin thành viên' },
  { command: 'offers', description: 'Ưu đãi' },
  { command: 'notifications', description: 'Thông báo' },
  { command: 'promotions', description: 'Khuyến mãi' },
  { command: 'reviews', description: 'Đánh giá' },
  { command: 'academy', description: 'Học viện' },
  { command: 'news', description: 'Tin tức' },
  { command: 'events', description: 'Sự kiện' },
  { command: 'policy', description: 'Chính sách' },
  { command: 'logout', description: 'Đóng menu' }
];

const TELEGRAM_VISIBLE_COMMAND_ORDER = ['start', 'products', 'orders', 'support', 'account'];
export const BOT_RESTORED_MESSAGE = 'Bot đã hoạt động trở lại';

export const TELEGRAM_MENU_COMMANDS = TELEGRAM_VISIBLE_COMMAND_ORDER
  .map((command) => TELEGRAM_ALL_MENU_COMMANDS.find((item) => item.command === command))
  .filter(Boolean);

const TELEGRAM_ALL_MAIN_MENU_ITEMS = [
  { key: 'products', label: 'Sản phẩm', callbackData: 'catalog:all', command: 'products' },
  { key: 'topup', label: 'Nạp tiền', callbackData: 'topup', command: 'topup' },
  { key: 'account', label: 'Tài khoản', callbackData: 'account', command: 'account' },
  { key: 'orders', label: 'Đơn hàng', callbackData: 'orders:mine', command: 'orders' },
  { key: 'language', label: 'Đổi ngôn ngữ', callbackData: 'language', command: 'language' },
  { key: 'support', label: 'Hỗ trợ', callbackData: 'support', command: 'support' },
  { key: 'security', label: 'Bảo mật', callbackData: 'security', command: 'security' },
  { key: 'instant-delivery', label: 'Giao hàng tức thì', callbackData: 'instant-delivery', command: 'instant_delivery' },
  { key: 'automation-247', label: 'Tự động 24/7', callbackData: 'automation-247', command: 'automation_247' },
  { key: 'quality', label: 'Chất lượng uy tín', callbackData: 'quality', command: 'quality' },
  { key: 'member', label: 'Thành viên', callbackData: 'member', command: 'member' },
  { key: 'offers', label: 'Ưu đãi', callbackData: 'offers', command: 'offers' },
  { key: 'notifications', label: 'Thông báo', callbackData: 'notifications', command: 'notifications' },
  { key: 'promotions', label: 'Khuyến mãi', callbackData: 'promotions', command: 'promotions' },
  { key: 'reviews', label: 'Đánh giá', callbackData: 'reviews', command: 'reviews' },
  { key: 'academy', label: 'Học viện', callbackData: 'academy', command: 'academy' },
  { key: 'news', label: 'Tin tức', callbackData: 'news', command: 'news' },
  { key: 'events', label: 'Sự kiện', callbackData: 'events', command: 'events' },
  { key: 'policy', label: 'Chính sách', callbackData: 'policy', command: 'policy' },
  { key: 'logout', label: 'Đăng xuất', callbackData: 'logout', command: 'logout' }
];

export const TELEGRAM_MAIN_MENU_ITEMS = TELEGRAM_ALL_MAIN_MENU_ITEMS.filter((item) => (
  ['products', 'topup', 'account', 'orders', 'support'].includes(item.key)
));

const TELEGRAM_MENU_COMMAND_ACTIONS = new Map(
  TELEGRAM_MAIN_MENU_ITEMS.map((item) => [item.command, item.callbackData])
);

export const TELEGRAM_MENU_LANGUAGE_CODES = [
  'vi',
  'en',
  'id',
  'th',
  'zh',
  'ja',
  'ko',
  'ru',
  'uk',
  'de',
  'es',
  'fr',
  'pt',
  'it',
  'tr',
  'ar',
  'hi',
  'ms',
  'nl',
  'pl',
  'tl',
  'fa'
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function bold(value) {
  return `<b>${escapeHtml(value)}</b>`;
}

function code(value) {
  return `<code>${escapeHtml(value)}</code>`;
}

function normalizeBrandKey(brand) {
  return String(brand || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function welcomeBrandTitle({ retroFont = false } = {}) {
  if (retroFont) {
    return Array.from(WELCOME_BRAND_TEXT)
      .map((character) => (character === ' ' ? ' ' : retroFontEmoji(character)))
      .join('');
  }
  return `<b>${escapeHtml(WELCOME_BRAND_TEXT)}</b>`;
}

function sloganTextEmoji(key, fallbackText, fallbackEmoji) {
  return escapeHtml(fallbackText || fallbackEmoji || key);
}

function customEmojiCandidate(emoji, customEmojiId) {
  return { emoji, customEmojiId };
}

function flameEmoji(key) {
  return FLAME_EMOJI[key]?.emoji || '';
}

function flameEmojiCandidate(key) {
  const item = FLAME_EMOJI[key] || {};
  return customEmojiCandidate(item.emoji || '', flameCustomEmojiId(key));
}

function newsEmoji(key) {
  return NEWS_EMOJI[key]?.emoji || '';
}

function newsEmojiCandidate(key) {
  const item = NEWS_EMOJI[key] || {};
  return customEmojiCandidate(item.emoji || '', newsCustomEmojiId(key));
}

function newsEmojiCandidates(key, count = 1) {
  return Array.from({ length: count }, () => newsEmojiCandidate(key));
}

function bannerCustomEmojiCandidate(key, emoji) {
  return customEmojiCandidate(emoji, bannerCustomEmojiId(key));
}

function retroBrandCustomEmojiCandidates() {
  return Array.from(WELCOME_BRAND_TEXT)
    .filter((character) => character !== ' ')
    .map((character) => customEmojiCandidate(retroFontEmoji(character), retroCustomEmojiId(character)));
}

function sloganTileText(key, options = {}) {
  return options.custom
    ? sloganTilePlaceholder(key, options.fallbackText || '')
    : sloganTileFallbackText(key, options.fallbackText || '');
}

function customTextPayload(htmlText, candidates) {
  return buildCustomEmojiEntityPayload(htmlText, candidates, {
    enabled: config.telegram.customTextEmoji
  });
}

function customMessageOptions(htmlText, candidates, options = {}) {
  const payload = customTextPayload(htmlText, candidates);
  if (!payload) return { text: htmlText, options };
  const fallbackText = options._fallback_text || htmlText;
  return {
    text: payload.text,
    options: {
      ...options,
      parse_mode: undefined,
      entities: payload.entities,
      _fallback_text: fallbackText,
      _fallback_parse_mode: 'HTML'
    }
  };
}

function customCaptionOptions(caption, candidates, options = {}) {
  const payload = customTextPayload(caption, candidates);
  if (!payload) return { caption, options };
  return {
    caption: payload.text,
    options: {
      ...options,
      caption: payload.text,
      parse_mode: undefined,
      caption_entities: payload.entities,
      _fallback_caption: caption,
      _fallback_parse_mode: 'HTML'
    }
  };
}

async function sendCustomTelegramMessage(chatId, htmlText, candidates, options = {}) {
  const payload = customMessageOptions(htmlText, candidates, options);
  return sendTelegramMessage(chatId, payload.text, payload.options);
}

function startCustomEmojiCandidates() {
  return [
    ...retroBrandCustomEmojiCandidates(),
    flameEmojiCandidate('moneyface'),
    ...sloganTileCustomEmojiCandidates('daily_update'),
    ...newsEmojiCandidates('fast', 2),
    ...newsEmojiCandidates('auto247', 2),
    ...newsEmojiCandidates('tracking', 2),
    newsEmojiCandidate('adminchat'),
    newsEmojiCandidate('adminshield'),
    newsEmojiCandidate('adminboom'),
    newsEmojiCandidate('adminfire'),
    customEmojiCandidate(roboEmoji('hundred', '💯'), roboCustomEmojiId('hundred')),
    customEmojiCandidate('👋', roboCustomEmojiId('wave')),
    bannerCustomEmojiCandidate('payment', '💳'),
    bannerCustomEmojiCandidate('delivery', '📦'),
    bannerCustomEmojiCandidate('products', '🛒'),
    bannerCustomEmojiCandidate('instant', '⚡'),
    bannerCustomEmojiCandidate('orders', '📦'),
    bannerCustomEmojiCandidate('contact', '💬')
  ];
}

function catalogCustomEmojiCandidates() {
  return [
    bannerCustomEmojiCandidate('instant', '⚡'),
    bannerCustomEmojiCandidate('soldout', '⚠️'),
    bannerCustomEmojiCandidate('combo', '🎁'),
    bannerCustomEmojiCandidate('contact', '💬'),
    bannerCustomEmojiCandidate('review', '✨'),
    bannerCustomEmojiCandidate('kaito', '✨'),
    bannerCustomEmojiCandidate('delivery', '📦')
  ];
}

function supportCustomEmojiCandidates() {
  return [
    bannerCustomEmojiCandidate('contact', '💬')
  ];
}

function topupCustomEmojiCandidates() {
  return [
    bannerCustomEmojiCandidate('payment', '💳')
  ];
}

function orderCustomEmojiCandidates() {
  return [
    bannerCustomEmojiCandidate('payment', '💳'),
    bannerCustomEmojiCandidate('delivery', '📦')
  ];
}

function deliveryCustomEmojiCandidates() {
  return [
    bannerCustomEmojiCandidate('delivery', '📦')
  ];
}

function salesStickerFileId(stage) {
  const configured = config.telegram.stickers?.[stage];
  if (configured) return configured;
  const mapped = regularStickerMap.stageFileIds?.[stage];
  if (mapped) return mapped;
  return motionStickerFileId(FLOW_MOTION_BRANDS.get(stage) || []);
}

function sloganImageFilePath(stage) {
  const name = String(stage || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  if (!name) return '';
  const filePath = resolve(process.cwd(), 'public', 'brand', 'slogan-image', `${name}.png`);
  return existsSync(filePath) ? filePath : '';
}

function configuredImageFilePath(filePath) {
  const value = String(filePath || '').trim();
  if (!value) return '';
  const resolved = resolve(process.cwd(), value);
  return existsSync(resolved) ? resolved : '';
}

function startImageFilePath() {
  return configuredImageFilePath(config.telegram.startImageFile) || sloganImageFilePath('welcome');
}

function brandKeyboardButton(brand, fields) {
  const customEmojiId = brandCustomEmojiId(brand);
  return customEmojiId
    ? { ...fields, icon_custom_emoji_id: customEmojiId }
    : fields;
}

function uiKeyboardButton(key, label, callbackData) {
  const customEmojiId = (key === 'products' ? gameCustomEmojiId('products') : '') || uiCustomEmojiId(key);
  const fallbackIcon = UI_ICONS[key] || '';
  const text = customEmojiId ? label : `${fallbackIcon} ${label}`.trim();
  return customEmojiId
    ? { text, callback_data: callbackData, icon_custom_emoji_id: customEmojiId }
    : { text, callback_data: callbackData };
}

function knownTelegramChatIds(db) {
  return [...new Set(
    db.users
      .map((user) => String(user.telegramId || '').trim())
      .filter(Boolean)
  )];
}

export async function notifyBotRestoredToUsers(message = BOT_RESTORED_MESSAGE) {
  if (!config.telegram.token) {
    return { skipped: true, attempted: 0, sent: 0, failed: 0, failures: [] };
  }

  const db = await readStore();
  const chatIds = knownTelegramChatIds(db);
  const failures = [];
  let sent = 0;

  for (const chatId of chatIds) {
    try {
      await sendTelegramMessage(chatId, message);
      sent += 1;
    } catch (error) {
      failures.push({ chatId, error: error.message });
      console.warn(`[telegram] startup broadcast failed for ${chatId}: ${error.message}`);
    }
  }

  return {
    ok: failures.length === 0,
    attempted: chatIds.length,
    sent,
    failed: failures.length,
    failures
  };
}

export async function configureTelegramMenu() {
  if (!config.telegram.token) return { skipped: true };
  await telegramJson('setMyCommands', {
    commands: TELEGRAM_MENU_COMMANDS,
    scope: { type: 'default' }
  });
  for (const languageCode of TELEGRAM_MENU_LANGUAGE_CODES) {
    await telegramJson('setMyCommands', {
      commands: TELEGRAM_MENU_COMMANDS,
      scope: { type: 'default' },
      language_code: languageCode
    });
  }
  await telegramJson('setChatMenuButton', {
    menu_button: { type: 'commands' }
  });
  return { ok: true, commands: TELEGRAM_MENU_COMMANDS.length, languages: TELEGRAM_MENU_LANGUAGE_CODES.length };
}

export async function ensureTelegramChatMenuButton(chatId) {
  if (!config.telegram.token || !chatId) return { skipped: true };
  return telegramJson('setChatMenuButton', {
    chat_id: chatId,
    menu_button: { type: 'commands' }
  });
}

async function sendSalesSticker(chatId, stage) {
  const sticker = salesStickerFileId(stage);
  if (!sticker) return { skipped: true };
  try {
    return await sendTelegramSticker(chatId, sticker);
  } catch (error) {
    console.warn(`[telegram] sales sticker skipped: ${error.message}`);
    return { skipped: true, error: error.message };
  }
}

async function sendBrandSalesSticker(chatId, brand) {
  const sticker = brandStickerFileId(brand) || salesStickerFileId('brand');
  if (!sticker) return { skipped: true };
  try {
    return await sendTelegramSticker(chatId, sticker);
  } catch (error) {
    console.warn(`[telegram] brand sticker skipped: ${error.message}`);
    return { skipped: true, error: error.message };
  }
}

async function sendSloganCaption(chatId, stage, caption, options = {}) {
  const imagePath = stage === 'welcome' ? startImageFilePath() : sloganImageFilePath(stage);
  const candidates = options._customEmojiCandidates;
  if (imagePath && candidates?.length) {
    try {
      await sendTelegramPhotoFile(chatId, imagePath);
    } catch (error) {
      console.warn(`[telegram] slogan image skipped: ${error.message}`);
    }
    const messageOptions = { ...options };
    if (options._fallback_caption && !messageOptions._fallback_text) {
      messageOptions._fallback_text = options._fallback_caption;
    }
    delete messageOptions._customEmojiCandidates;
    delete messageOptions._fallback_caption;
    delete messageOptions._fallback_parse_mode;
    return sendCustomTelegramMessage(chatId, caption, candidates, messageOptions);
  }
  if (!imagePath && candidates?.length) {
    const messageOptions = { ...options };
    if (options._fallback_caption && !messageOptions._fallback_text) {
      messageOptions._fallback_text = options._fallback_caption;
    }
    delete messageOptions._customEmojiCandidates;
    delete messageOptions._fallback_caption;
    delete messageOptions._fallback_parse_mode;
    return sendCustomTelegramMessage(chatId, caption, candidates, messageOptions);
  }

  const customOptions = options._customEmojiCandidates
    ? customCaptionOptions(caption, options._customEmojiCandidates, options)
    : { caption, options };
  delete customOptions.options._customEmojiCandidates;
  if (!imagePath) return sendTelegramMessage(chatId, customOptions.caption, customOptions.options);
  try {
    return await sendTelegramPhotoFile(chatId, imagePath, {
      parse_mode: 'HTML',
      ...customOptions.options,
      caption: customOptions.caption
    });
  } catch (error) {
    console.warn(`[telegram] slogan image skipped: ${error.message}`);
    return sendTelegramMessage(chatId, customOptions.caption, customOptions.options);
  }
}

function money(amount, currency = 'VND') {
  return `${Number(amount).toLocaleString('vi-VN')} ${currency}`;
}

function categoryIcon(category) {
  const label = String(category || '');
  if (CATEGORY_ICONS.has(label)) return CATEGORY_ICONS.get(label);
  if (/ai/i.test(label)) return UI_ICONS.ai;
  if (/design|canva|capcut/i.test(label)) return UI_ICONS.design;
  if (/cloud|work|workspace|mail/i.test(label)) return UI_ICONS.work;
  if (/social|mmo|telegram|tiktok|discord/i.test(label)) return UI_ICONS.social;
  return UI_ICONS.catalog;
}

function categoryLabel(category) {
  return `${categoryIcon(category)} ${category}`;
}

export function brandIcon(brand) {
  return brandAssetIcon(brand);
}

function brandLabel(brand) {
  return `${brandIcon(brand)} ${brand}`;
}

function brandHtmlLabel(brand) {
  return `${brandIcon(brand)} ${escapeHtml(brand)}`;
}

function brandButtonLabel(brand) {
  const name = String(brand || 'Other').trim() || 'Other';
  if (brandCustomEmojiId(name)) return name;

  const icon = brandIcon(name);
  return icon && icon !== '#' ? `${icon} ${name}` : name;
}

async function trackTelegramClick(user, action, details = {}) {
  try {
    await recordAudit(user.id, `telegram.click.${action}`, 'telegram_user', user.telegramId || user.id, details);
  } catch (error) {
    console.warn(`[telegram] click tracking skipped: ${error.message}`);
  }
}

export function formatOrderStatus(status = 'pending_payment') {
  const normalized = String(status || 'pending_payment');
  return ORDER_STATUS_LABELS.get(normalized) || `ℹ️ ${normalized.replaceAll('_', ' ')}`;
}

function orderStatusLine(status) {
  const formatted = formatOrderStatus(status);
  const [icon, ...labelParts] = formatted.split(' ');
  return `${icon} Trạng thái: ${labelParts.join(' ') || formatted}`;
}

export function formatStockStatus(product) {
  const available = Number(product?.stock?.available || 0);
  return available > 0 ? `📦 Còn ${available}` : '⛔ Hết hàng';
}

export function startMessage({ retroFontBrand = false, sloganTiles = false } = {}) {
  return [
    `${welcomeBrandTitle({ retroFont: retroFontBrand })} ${flameEmoji('moneyface')} chào bạn ${roboEmoji('wave', '👋')}`,
    '',
    sloganTileText('daily_update', { custom: sloganTiles, fallbackText: '🎫 DAILY UPDATE 🎫' }),
    '',
    `${newsEmoji('fast')} Giao nhanh ${newsEmoji('fast')}`,
    `${newsEmoji('auto247')} Tự động 24/7, bot xử lý liên tục ${newsEmoji('auto247')}`,
    `${newsEmoji('tracking')} Theo dõi đơn hàng ngay trong bot ${newsEmoji('tracking')}`,
    `${newsEmoji('adminchat')} ${supportContactLine()} ${newsEmoji('adminshield')} ${newsEmoji('adminboom')}${newsEmoji('adminfire')}${roboEmoji('hundred', '💯')}`
  ].join('\n');
}

function startPhotoCaptionPayload() {
  return startMessage({ retroFontBrand: true, sloganTiles: true });
}

function startPhotoCaptionFallbackPayload() {
  return stripCustomEmojiTags(startMessage({ retroFontBrand: false, sloganTiles: false }));
}

export function usageMessage() {
  return `Cú pháp: ${code('/buy sku 1')}`;
}

export function unknownCommandMessage() {
  return `Mình chưa hiểu thao tác này. Bấm ${UI_ICONS.products} Sản phẩm hoặc ${UI_ICONS.orders} Đơn hàng bên dưới.`;
}

function encodePart(value) {
  return encodeURIComponent(String(value || ''));
}

function decodePart(value) {
  return decodeURIComponent(String(value || ''));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function chunkButtons(buttons, size) {
  const rows = [];
  for (let index = 0; index < buttons.length; index += size) {
    rows.push(buttons.slice(index, index + size));
  }
  return rows;
}

function compactButtonText(text, maxLength = 62) {
  const value = String(text || '').trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function availableStock(product) {
  return Number(product.stock?.available || 0);
}

function brandHasStock(product) {
  return Number(product.brandAvailable ?? availableStock(product)) > 0;
}

function brandChoiceButton(product) {
  const available = brandHasStock(product);
  const label = `${available ? '' : '[Hết] '}${brandButtonLabel(product.brand)}`;
  return brandKeyboardButton(product.brand, {
    text: label,
    callback_data: available
      ? `brand:${encodePart(product.category)}:${encodePart(product.brand)}`
      : `brand_soldout:${encodePart(product.category)}:${encodePart(product.brand)}`
  });
}

function supportHandle() {
  return String(config.telegram.supportHandle || '@an_hocha').trim() || '@an_hocha';
}

function supportContactLine() {
  return `Admin: ${escapeHtml(supportHandle())}`;
}

function officialPriceNoteLines(products, limit = 4) {
  return products
    .filter((product) => product.officialPriceNote)
    .slice(0, limit)
    .map((product) => `• ${escapeHtml(product.packageType || product.name)}: ${escapeHtml(product.officialPriceNote)}`);
}

export function buildMainMenuKeyboard() {
  return {
    inline_keyboard: chunkButtons(
      TELEGRAM_MAIN_MENU_ITEMS.map((item) => uiKeyboardButton(item.key, item.label, item.callbackData)),
      2
    )
  };
}

function catalogBrandEntries(products) {
  const entries = new Map();
  for (const product of products.map((item) => normalizePublicProduct(item))) {
    const key = normalizeBrandKey(product.brand);
    const entry = entries.get(key) || {
      ...product,
      brandAvailable: 0,
      brandProducts: 0
    };
    entry.brandAvailable += availableStock(product);
    entry.brandProducts += 1;
    entries.set(key, entry);
  }
  return [...entries.values()].sort((left, right) => left.brand.localeCompare(right.brand));
}

function featuredCatalogProducts(products) {
  const normalized = products
    .map((product) => normalizePublicProduct(product))
    .sort((left, right) => {
      const hotCompare = Number(right.hot === true) - Number(left.hot === true);
      if (hotCompare !== 0) return hotCompare;
      const stockCompare = Number(right.stock?.available || 0) - Number(left.stock?.available || 0);
      if (stockCompare !== 0) return stockCompare;
      return brandSortKey(left).localeCompare(brandSortKey(right));
    });
  const available = normalized.filter((product) => Number(product.stock?.available || 0) > 0);
  const pool = available.length ? available : normalized;
  const hot = pool.filter((product) => product.hot === true);
  return (hot.length ? hot : pool).slice(0, 4);
}

function catalogPackageButton(product) {
  const available = Number(product.stock?.available || 0);
  const packageName = `${product.hot ? '🔥 ' : ''}${product.name || `${product.brand} ${product.packageType}`.trim()}`;
  const label = compactButtonText(`${available > 0 ? '' : '[Hết] '}${packageName} - ${money(product.price, product.currency)} [${available}]`);
  return brandKeyboardButton(product.brand, {
    text: label,
    callback_data: available > 0 ? `buy:${product.sku}:1` : `soldout:${product.sku}`
  });
}

export function buildCatalogKeyboard(products) {
  const brandButtons = catalogBrandEntries(products).map((product) => brandChoiceButton(product));
  const rows = chunkButtons(brandButtons, 3);

  for (const product of featuredCatalogProducts(products)) {
    rows.push([catalogPackageButton(product)]);
  }

  rows.push([{ text: `${UI_ICONS.refresh} Làm mới`, callback_data: 'catalog:all' }]);
  rows.push([{ text: `${UI_ICONS.back} Quay lại`, callback_data: 'start:menu' }]);
  return { inline_keyboard: rows };
}

export function buildCategoryKeyboard(products) {
  return buildCatalogKeyboard(products);
}

export function buildLegacyCategoryKeyboard(products) {
  const rows = uniqueSorted(products.map((product) => normalizePublicProduct(product).category))
    .map((category) => [{ text: categoryLabel(category), callback_data: `cat:${encodePart(category)}` }]);
  rows.push([{ text: `${UI_ICONS.orders} Đơn hàng`, callback_data: 'orders:mine' }]);
  return { inline_keyboard: rows };
}

export function buildBrandKeyboard(products, category) {
  const rows = catalogBrandEntries(products
    .map((product) => normalizePublicProduct(product))
    .filter((product) => product.category === category))
    .map((product) => [brandChoiceButton(product)]);
  rows.push([{ text: `${UI_ICONS.back} Tất cả danh mục`, callback_data: 'catalog:all' }]);
  return { inline_keyboard: rows };
}

export function buildPackageKeyboard(products) {
  const normalized = products
    .map((product) => normalizePublicProduct(product))
    .sort((left, right) => {
      const stockCompare = Number(right.stock?.available || 0) - Number(left.stock?.available || 0);
      if (stockCompare !== 0) return stockCompare;
      const groupCompare = brandSortKey(left).localeCompare(brandSortKey(right));
      if (groupCompare !== 0) return groupCompare;
      return left.sku.localeCompare(right.sku);
    });
  const rows = normalized.map((product) => [brandKeyboardButton(product.brand, {
      text: Number(product.stock?.available || 0) > 0
        ? `Mua ngay · ${product.packageType || product.name} · ${money(product.price, product.currency)}`
        : `Hết hàng · ${product.packageType || product.name} · ${money(product.price, product.currency)}`,
      callback_data: Number(product.stock?.available || 0) > 0
        ? `buy:${product.sku}:1`
        : `soldout:${product.sku}`
    })]);
  const category = normalized[0]?.category;
  if (category) rows.push([{ text: '↩ Nhãn hàng', callback_data: `cat:${encodePart(category)}` }]);
  rows.push([
    { text: `${UI_ICONS.catalog} Danh mục`, callback_data: 'catalog:all' },
    { text: `${UI_ICONS.orders} Đơn hàng`, callback_data: 'orders:mine' }
  ]);
  return { inline_keyboard: rows };
}

export function productMessage(products) {
  if (!products.length) return `${UI_ICONS.catalog} Chưa có sản phẩm đang bán.`;
  const grouped = [];
  const sorted = products
    .map((product) => normalizePublicProduct(product))
    .sort((left, right) => {
      const groupCompare = brandSortKey(left).localeCompare(brandSortKey(right));
      if (groupCompare !== 0) return groupCompare;
      return left.sku.localeCompare(right.sku);
    });

  let currentGroup = '';
  for (const product of sorted) {
    const group = `${product.category}\x00${product.brand}`;
    if (group !== currentGroup) {
      currentGroup = group;
      grouped.push('', bold(categoryLabel(product.category)), bold(brandLabel(product.brand)));
    }
    grouped.push([
      bold(product.name),
      product.packageType ? `🎁 Gói: ${escapeHtml(product.packageType)}` : '',
      `🏷️ SKU: ${code(product.sku)}`,
      `💰 Giá: ${escapeHtml(money(product.price, product.currency))}`,
      formatStockStatus(product),
      `🛍️ Mua nhanh: ${code(`/buy ${product.sku} 1`)}`
    ].filter(Boolean).join('\n'));
  }

  return [
    `${UI_ICONS.catalog} <b>KAITO KID AI SHOP - Gói đang bán</b>`,
    'Chọn theo danh mục, nhãn hiệu rồi bấm nút mua gói còn hàng.',
    ...grouped
  ].join('\n\n');
}

export function categoryMenuMessage(products) {
  const normalized = products.map((product) => normalizePublicProduct(product));
  const brandCount = catalogBrandEntries(normalized).length;
  const availableCount = normalized.filter((product) => Number(product.stock?.available || 0) > 0).length;
  return [
    `${roboEmoji('ok', '👌')} ${sloganEmoji('catalog', '🛍️')} ${uiEmoji('instant-delivery', UI_ICONS['instant-delivery'])} ${uiEmoji('automation-247', UI_ICONS['automation-247'])} Thanh toán xong giao hàng tự động 24/7.`,
    `${sloganEmoji('soldout', '⚠️')} 🧾 Gói hết vui lòng liên hệ admin để đặt thêm 🎁 ${roboEmoji('please', '🙏')}`,
    `👉 ${supportContactLine()} 💬`,
    '',
    `🔹✨ ${roboEmoji('party', '🥳')} Vui lòng chọn danh mục bên dưới ✨🔹`,
    `🎯 Có ${brandCount} nhãn hàng, 📦 ${availableCount} gói đang còn hàng.`
  ].join('\n');
}

function topupMessage() {
  return [
    `${roboEmoji('money', '🤑')} ${sloganEmoji('payment', '💳')} <b>Nạp tiền</b>`,
    'Shop đang ưu tiên thanh toán theo từng đơn để giữ hàng chính xác.',
    `${roboEmoji('ok', '👌')} Cần nạp ví, đặt gói riêng hoặc xử lý giao dịch lớn: ${supportContactLine()}`
  ].join('\n');
}

function accountMessage(user) {
  const display = user.username ? `@${user.username}` : [user.firstName, user.lastName].filter(Boolean).join(' ') || user.telegramId;
  return [
    `${UI_ICONS.account} <b>Tài khoản</b>`,
    `Telegram: ${escapeHtml(display)}`,
    'Trạng thái: BUYER',
    'Mua hàng nhanh: Sản phẩm → chọn brand → chọn gói → thanh toán.'
  ].join('\n');
}

function languageMessage() {
  return [
    `${UI_ICONS.language} <b>Ngôn ngữ</b>`,
    'Ngôn ngữ hiện tại: Tiếng Việt.',
    'Bản tiếng Anh có thể bật thêm khi shop cần bán quốc tế.'
  ].join('\n');
}

function supportMessage() {
  return [
    `${roboEmoji('salute', '🫡')} ${sloganEmoji('support', '💬')} <b>Hỗ trợ</b>`,
    `${roboEmoji('please', '🙏')} Cần đặt gói hết hàng, mua số lượng lớn hoặc kiểm tra đơn: ${supportContactLine()}`,
    'Gửi mã đơn hoặc tên gói bạn cần để admin xử lý nhanh hơn.'
  ].join('\n');
}

function closeMessage() {
  return `${uiEmoji('logout', UI_ICONS.logout)} Menu đã đóng. Bấm /start để mở lại khi cần mua hàng.`;
}

function memberMessage(user) {
  const display = user.username ? `@${user.username}` : [user.firstName, user.lastName].filter(Boolean).join(' ') || user.telegramId;
  return [
    `${uiEmoji('member')} <b>Thành viên</b>`,
    `Telegram: ${escapeHtml(display)}`,
    'Hạng hiện tại: BUYER',
    'Quyền lợi: đặt nhanh, theo dõi đơn, nhận ưu đãi và nhắc hàng mới ngay trong bot.'
  ].join('\n');
}

function menuInfoMessage(key, user) {
  const messages = {
    security: [
      `${uiEmoji('security')} <b>Bảo mật</b>`,
      'Thông tin đơn và tài khoản chỉ gửi trong cuộc trò chuyện Telegram này.',
      'Thanh toán dùng đúng nội dung chuyển khoản để bot tự đối soát, tránh gửi nhầm thông tin giao hàng.'
    ],
    'instant-delivery': [
      `${uiEmoji('instant-delivery')} <b>Giao hàng tức thì</b>`,
      'Khi thanh toán khớp nội dung và số tiền, bot tự giao tài khoản/key ngay trong chat.',
      'Nếu đơn cần kiểm tra thủ công, trạng thái sẽ chuyển sang cần kiểm tra để admin xử lý.'
    ],
    'automation-247': [
      `${uiEmoji('automation-247')} <b>Tự động 24/7</b>`,
      'Bot nhận đơn, giữ hàng, kiểm tra thanh toán và giao hàng tự động cả ngoài giờ.',
      'Các case hết hàng hoặc lệch thanh toán sẽ được chuyển sang luồng hỗ trợ.'
    ],
    quality: [
      `${uiEmoji('quality')} <b>Chất lượng uy tín</b>`,
      'Danh mục ưu tiên gói còn hàng, giá rõ ràng và giao đúng loại sản phẩm đã chọn.',
      `Cần kiểm tra trước khi mua số lượng lớn: ${supportContactLine()}`
    ],
    offers: [
      `${uiEmoji('offers')} <b>Ưu đãi</b>`,
      'Ưu đãi đang được gắn trực tiếp trong danh mục và các gói nổi bật.',
      'Bấm Sản phẩm để xem các gói còn hàng, giá tốt và slot mới nhất.'
    ],
    notifications: [
      `${uiEmoji('notifications')} <b>Thông báo</b>`,
      'Bot sẽ báo trạng thái đơn: đã tạo, chờ thanh toán, cần kiểm tra hoặc đã giao hàng.',
      'Giữ cuộc trò chuyện này để không bỏ lỡ thông tin giao hàng.'
    ],
    promotions: [
      `${uiEmoji('promotions')} <b>Khuyến mãi</b>`,
      'Các mã/gói khuyến mãi sẽ được đưa vào danh mục khi shop mở chương trình.',
      `Muốn đặt combo riêng: ${supportContactLine()}`
    ],
    reviews: [
      `${uiEmoji('reviews')} <b>Đánh giá</b>`,
      'Sau khi nhận hàng, bạn có thể gửi feedback hoặc ảnh kết quả cho admin.',
      'Đánh giá tốt sẽ giúp shop ưu tiên thêm gói hot và giữ giá ổn định hơn.'
    ],
    academy: [
      `${uiEmoji('academy')} <b>Học viện</b>`,
      'Khu hướng dẫn sử dụng tài khoản, bảo quản key và xử lý lỗi đăng nhập.',
      'Các bài hướng dẫn chi tiết sẽ được bổ sung theo từng nhóm sản phẩm.'
    ],
    news: [
      `${uiEmoji('news')} <b>Tin tức</b>`,
      'Tin hàng mới, thay đổi giá và slot hot sẽ được cập nhật tại đây.',
      'Bấm Sản phẩm để xem tình trạng còn hàng hiện tại.'
    ],
    events: [
      `${uiEmoji('events')} <b>Sự kiện</b>`,
      'Sự kiện săn slot, combo hoặc ưu đãi theo mùa sẽ mở khi shop có hàng phù hợp.',
      `Theo dõi bot hoặc liên hệ ${supportHandle()} để giữ suất.`
    ],
    policy: [
      `${uiEmoji('policy')} <b>Chính sách</b>`,
      'Mua đúng gói, đúng số lượng và thanh toán đúng nội dung để được giao tự động.',
      'Hàng đã giao cần kiểm tra ngay. Nếu có lỗi, gửi mã đơn cho admin để xử lý.'
    ]
  };

  if (key === 'member') return memberMessage(user);
  return messages[key]?.join('\n') || '';
}

function menuCommandAction(text) {
  const command = String(text || '')
    .trim()
    .split(/\s+/)[0]
    .replace(/^\/+/, '')
    .split('@')[0]
    .toLowerCase();
  return TELEGRAM_MENU_COMMAND_ACTIONS.get(command) || '';
}

async function sendMenuAction(chatId, user, action, products, options = {}) {
  if (action === 'catalog:all') {
    if (options.track) await trackTelegramClick(user, 'catalog');
    const currentProducts = products || await listProducts();
    await sendCustomTelegramMessage(chatId, categoryMenuMessage(currentProducts), catalogCustomEmojiCandidates(), { reply_markup: buildCatalogKeyboard(currentProducts) });
    return true;
  }

  if (action === 'orders:mine') {
    if (options.track) await trackTelegramClick(user, 'orders');
    await sendTelegramMessage(chatId, await userOrdersMessage(user), { reply_markup: buildMainMenuKeyboard() });
    return true;
  }

  if (action === 'topup') {
    if (options.track) await trackTelegramClick(user, 'topup');
    await sendCustomTelegramMessage(chatId, topupMessage(), topupCustomEmojiCandidates(), { reply_markup: buildMainMenuKeyboard() });
    return true;
  }

  if (action === 'account') {
    if (options.track) await trackTelegramClick(user, 'account');
    await sendTelegramMessage(chatId, accountMessage(user), { reply_markup: buildMainMenuKeyboard() });
    return true;
  }

  if (action === 'language') {
    if (options.track) await trackTelegramClick(user, 'language');
    await sendTelegramMessage(chatId, languageMessage(), { reply_markup: buildMainMenuKeyboard() });
    return true;
  }

  if (action === 'support') {
    if (options.track) await trackTelegramClick(user, 'support');
    await sendCustomTelegramMessage(chatId, supportMessage(), supportCustomEmojiCandidates(), { reply_markup: buildMainMenuKeyboard() });
    return true;
  }

  if (action === 'logout' || action === 'close') {
    if (options.track) await trackTelegramClick(user, action === 'close' ? 'close' : 'logout');
    await sendTelegramMessage(chatId, closeMessage());
    return true;
  }

  const infoText = menuInfoMessage(action, user);
  if (infoText) {
    if (options.track) await trackTelegramClick(user, action);
    await sendTelegramMessage(chatId, infoText, { reply_markup: buildMainMenuKeyboard() });
    return true;
  }

  return false;
}

function brandMenuMessage(products, category) {
  const brands = uniqueSorted(products
    .map((product) => normalizePublicProduct(product))
    .filter((product) => product.category === category)
    .map((product) => product.brand));
  return [
    bold(categoryLabel(category)),
    'Chọn nhãn hiệu bằng nút bên dưới. Mỗi nhãn hiệu sẽ mở danh sách gói, giá và tình trạng còn hàng.',
    '',
    ...brands.map((brand) => brandHtmlLabel(brand))
  ].join('\n');
}

function brandPackagesMessage(products, category, brand) {
  const selected = products
    .map((product) => normalizePublicProduct(product))
    .filter((product) => product.category === category && product.brand === brand)
    .sort((left, right) => Number(left.sortOrder || 1000) - Number(right.sortOrder || 1000));
  if (!selected.length) return 'Chưa có gói nào trong nhãn hiệu này.';

  const available = selected.filter((product) => Number(product.stock?.available || 0) > 0).length;
  const priceNotes = officialPriceNoteLines(selected);
  return [
    bold(`${category} / ${brand}`),
    'Chọn gói bằng nút bên dưới. Gói còn hàng được ưu tiên ở trên.',
    available > 0
      ? 'Bấm Mua ngay để giữ slot và nhận hướng dẫn thanh toán.'
      : 'Tất cả gói hiện hết hàng. Khi có slot mới, nút Mua ngay sẽ giữ slot cho bạn; hiện hãy bấm Nhãn hàng hoặc Danh mục để chọn lựa khác.',
    '',
    priceNotes.length ? 'Giá hãng tham khảo:' : '',
    ...priceNotes,
    `Còn hàng: ${available}/${selected.length}`
  ].join('\n');
}

export function orderMessage(order, payment) {
  return [
    `${roboEmoji('party', '🥳')} ${sloganEmoji('payment', '💳')} ✅ <b>Đơn đã tạo - đã giữ hàng</b>`,
    `🧾 Mã đơn: ${code(order.id)}`,
    `📦 Sản phẩm: ${escapeHtml(order.productName)}`,
    `🔢 Số lượng: ${escapeHtml(order.quantity)}`,
    `${roboEmoji('money', '🤑')} 💰 Tổng: ${escapeHtml(money(order.total, order.currency))}`,
    orderStatusLine(order.status),
    `🏦 Nội dung CK: ${code(payment.reference)}`,
    `💳 Link thanh toán: ${escapeHtml(payment.paymentUrl)}`,
    payment.qrImageUrl ? `🖼️ QR: ${escapeHtml(payment.qrImageUrl)}` : '',
    order.expiresAt ? `⏱️ Giữ hàng đến: ${escapeHtml(new Date(order.expiresAt).toLocaleString('vi-VN'))}` : '',
    '',
    `${roboEmoji('ok', '👌')} Thanh toán đúng nội dung để bot giao tự động tại đây. Nếu cần đổi gói, quay lại danh mục trước khi chuyển khoản.`
  ].filter(Boolean).join('\n');
}

export function deliveryMessage(order, deliverySecrets) {
  return [
    `${sloganEmoji('delivery', '📦')} 🔐 <b>Đã giao hàng</b>`,
    `🧾 Mã đơn: ${code(order.id)}`,
    `📦 Sản phẩm: ${escapeHtml(order.productName)}`,
    '',
    '🔑 Thông tin nhận hàng:',
    ...deliverySecrets.map((secret, index) => code(`${index + 1}. ${secret}`)),
    '',
    'Cần mua thêm gói khác, bấm Xem danh mục trong menu để bot lọc gói còn hàng cho bạn.'
  ].join('\n');
}

async function sendWelcome(chatId) {
  await sendSloganCaption(chatId, 'welcome', startPhotoCaptionPayload(), {
    reply_markup: buildMainMenuKeyboard(),
    _fallback_caption: startPhotoCaptionFallbackPayload(),
    _fallback_parse_mode: 'HTML',
    _customEmojiCandidates: startCustomEmojiCandidates()
  });
}

async function userOrdersMessage(user) {
  const db = await readStore();
  const orders = db.orders.filter((order) => order.userId === user.id).slice(-5).reverse();
  if (!orders.length) return '🧾 Bạn chưa có đơn hàng nào.';
  return orders.map((order) => [
    bold(order.productName),
    `🧾 Mã đơn: ${code(order.id)}`,
    orderStatusLine(order.status),
    `💰 Tổng: ${escapeHtml(money(order.total, order.currency))}`
  ].join('\n')).join('\n\n');
}

async function handleTextMessage(message) {
  const chatId = message.chat.id;
  const text = String(message.text || '').trim();
  await ensureTelegramChatMenuButton(chatId).catch((error) => console.warn(`[telegram] chat menu setup failed: ${error.message}`));
  const user = await upsertTelegramUser(message.from);
  const baseLimit = await consumeRateLimit(`tg:user:${user.telegramId}`, config.traffic.telegramUserPerMinute);
  if (!baseLimit.allowed) {
    await sendTelegramMessage(chatId, `⏳ Thao tác quá nhanh. Thử lại sau ${baseLimit.retryAfterSeconds}s.`);
    return;
  }

  if (text === '/start') {
    await sendWelcome(chatId);
    return;
  }

  const menuAction = menuCommandAction(text);
  if (menuAction) {
    await sendMenuAction(chatId, user, menuAction);
    return;
  }

  if (text.startsWith('/buy')) {
    const buyLimit = await consumeRateLimit(`tg:buy:${user.telegramId}`, config.traffic.telegramBuyPerMinute);
    if (!buyLimit.allowed) {
      await sendTelegramMessage(chatId, `⏳ Tạo đơn quá nhanh. Thử lại sau ${buyLimit.retryAfterSeconds}s.`);
      return;
    }

    const [, sku, qtyRaw] = text.split(/\s+/);
    if (!sku) {
      await sendTelegramMessage(chatId, usageMessage());
      return;
    }

    try {
      const { order, payment } = await createOrderForUser(user, sku, Number(qtyRaw || 1));
      await sendCustomTelegramMessage(chatId, orderMessage(order, payment), orderCustomEmojiCandidates(), { reply_markup: buildMainMenuKeyboard() });
    } catch (error) {
      await sendTelegramMessage(chatId, `⚠️ Không tạo được đơn: ${escapeHtml(error.message)}`, { reply_markup: buildMainMenuKeyboard() });
    }
    return;
  }

  await sendTelegramMessage(chatId, unknownCommandMessage(), { reply_markup: buildMainMenuKeyboard() });
}

async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  const data = String(callbackQuery.data || '');
  if (!chatId) return;

  const user = await upsertTelegramUser(callbackQuery.from);
  const products = await listProducts();

  if (data.startsWith('soldout:')) {
    await trackTelegramClick(user, 'soldout', { sku: data.slice('soldout:'.length) });
    await answerCallbackQuery(callbackQuery.id, 'Gói này đang hết hàng. Chọn gói còn hàng hoặc quay lại danh mục.');
    return;
  }

  if (data.startsWith('brand_soldout:')) {
    const [, rawCategory, rawBrand] = data.split(':');
    const category = decodePart(rawCategory);
    const brand = decodePart(rawBrand);
    await trackTelegramClick(user, 'brand_soldout', { category, brand });
    await answerCallbackQuery(callbackQuery.id, `Nhãn hàng ${brand} đang hết hàng. Chọn brand còn hàng hoặc liên hệ admin để đặt trước.`);
    return;
  }

  await answerCallbackQuery(callbackQuery.id);

  if (data === 'start:menu') {
    await trackTelegramClick(user, 'menu');
    await sendCustomTelegramMessage(chatId, startPhotoCaptionPayload(), startCustomEmojiCandidates(), {
      reply_markup: buildMainMenuKeyboard(),
      _fallback_text: startPhotoCaptionFallbackPayload(),
      _fallback_parse_mode: 'HTML'
    });
    return;
  }

  if (await sendMenuAction(chatId, user, data, products, { track: true })) {
    return;
  }

  if (data.startsWith('cat:')) {
    const category = decodePart(data.slice('cat:'.length));
    await trackTelegramClick(user, 'category', { category });
    await sendTelegramMessage(chatId, brandMenuMessage(products, category), { reply_markup: buildBrandKeyboard(products, category) });
    return;
  }

  if (data.startsWith('brand:')) {
    const [, rawCategory, rawBrand] = data.split(':');
    const category = decodePart(rawCategory);
    const brand = decodePart(rawBrand);
    const selected = products.filter((product) => product.category === category && product.brand === brand);
    await trackTelegramClick(user, 'brand', { category, brand });
    await sendTelegramMessage(chatId, brandPackagesMessage(products, category, brand), { reply_markup: buildPackageKeyboard(selected) });
    return;
  }

  if (data.startsWith('buy:')) {
    const [, sku, qtyRaw] = data.split(':');
    await trackTelegramClick(user, 'buy', { sku, quantity: Number(qtyRaw || 1) });
    try {
      const { order, payment } = await createOrderForUser(user, sku, Number(qtyRaw || 1));
      await sendCustomTelegramMessage(chatId, orderMessage(order, payment), orderCustomEmojiCandidates(), { reply_markup: buildMainMenuKeyboard() });
    } catch (error) {
      await sendTelegramMessage(chatId, `⚠️ Không tạo được đơn: ${escapeHtml(error.message)}`, { reply_markup: buildMainMenuKeyboard() });
    }
    return;
  }

  if (data === 'orders:mine') {
    await trackTelegramClick(user, 'orders');
    await sendTelegramMessage(chatId, await userOrdersMessage(user), { reply_markup: buildMainMenuKeyboard() });
    return;
  }

  await sendTelegramMessage(chatId, unknownCommandMessage(), { reply_markup: buildMainMenuKeyboard() });
}

export async function handleTelegramUpdate(update) {
  if (update.message?.text) {
    await handleTextMessage(update.message);
  }
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
  }
}

export async function notifyDelivery(orderId) {
  const { order, deliverySecrets } = await getDeliveryForOrder(orderId);
  if (!order.telegramId || !deliverySecrets.length) return;

  await sendCustomTelegramMessage(order.telegramId, deliveryMessage(order, deliverySecrets), deliveryCustomEmojiCandidates());
}

export function startTelegramPolling() {
  if (!config.telegram.token || !config.telegram.polling) return;

  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      const offset = await readTelegramOffset();
      const response = await fetch(telegramTransport.telegramUpdatesUrl(offset));
      const data = await response.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          try {
            await handleTelegramUpdate(update);
          } catch (error) {
            console.error('[telegram] update failed:', error.message);
          } finally {
            await writeTelegramOffset(update.update_id + 1);
          }
        }
      }
    } catch (error) {
      console.error('[telegram] polling failed:', error.message);
    } finally {
      running = false;
    }
  };

  setInterval(poll, 1500);
  poll();
}
