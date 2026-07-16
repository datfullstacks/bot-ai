import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { config } from './config.js';
import { brandSortKey, normalizeDeliveryMode, normalizePublicProduct } from './catalog.js';
import {
  cancelOrderForUser,
  createOrderForUser,
  getDeliveryForOrder,
  getOrderCheckoutForUser,
  listOrdersForUser,
  listProducts,
  recordAudit,
  upsertTelegramUser
} from './shop.js';
import { readStore } from './storage.js';
import { consumeRateLimit } from './rateLimit.js';
import { normalizeOrderQuantity } from './salesGuard.js';
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
  sloganTileCustomEmojiCandidates,
  sloganTileFallbackText,
  sloganTilePlaceholder,
  uiCustomEmojiId
} = telegramEmoji;
const {
  answerCallbackQuery,
  editTelegramMessage,
  sendTelegramAnimation,
  sendTelegramMessage,
  sendTelegramPhotoFile,
  sendTelegramPhotoUrl,
  sendTelegramSticker,
  sendTelegramTextDocument,
  stripCustomEmojiTags,
  telegramJson
} = telegramTransport;

export {
  bannerCustomEmojiId,
  brandCustomEmojiId,
  brandStickerFileId,
  editTelegramMessage,
  sendTelegramAnimation,
  sendTelegramMessage,
  sendTelegramPhotoFile,
  sendTelegramPhotoUrl,
  sendTelegramSticker,
  sendTelegramTextDocument,
  sloganCustomEmojiId
};

const regularStickerMap = loadRegularStickerMap();
const telegramChatMenuButtonCache = new Set();
const telegramChatMenuButtonInflight = new Map();
let cachedStartImageFileId = String(config.telegram.startImageFileId || '').trim();

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

const UI_TEXT_EMOJI = Object.freeze({
  products: '🛒',
  catalog: '🛒',
  topup: '💳',
  account: '👤',
  orders: '📦',
  language: '🌐',
  support: '🎧',
  security: '🛡️',
  'instant-delivery': '⚡',
  'automation-247': '🔄',
  quality: '⭐',
  member: '👑',
  offers: '🎁',
  notifications: '📣',
  promotions: '🎫',
  reviews: '✨',
  academy: '🎓',
  news: '📄',
  events: '🎮',
  policy: '🛡️',
  logout: '🔌',
  close: '🔌',
  refresh: '🔄',
  back: '🔌',
  ai: '🤖',
  design: '🎨',
  work: '💻',
  social: '🎮'
});

const SLOGAN_TEXT_EMOJI = Object.freeze({
  welcome: '✨',
  catalog: '🛒',
  checkout: '👌',
  payment: '💳',
  delivery: '📦',
  support: '🎧',
  soldout: '📣',
  'text-shopping-flow': '✨'
});

const BANNER_TEXT_EMOJI = Object.freeze({
  account: '👤',
  ai: '🤖',
  auto247: '⚡',
  checkin: '📝',
  combo: '🎁',
  contact: '💬',
  delivery: '📦',
  event: '🎮',
  guide: '📄',
  hot: '🔥',
  instant: '⚡',
  kaito: '✨',
  logout: '🔌',
  member: '👑',
  minigame: '🎮',
  mmo: '🎮',
  new: '📣',
  news: '📄',
  orders: '📦',
  payment: '💳',
  policy: '🛡️',
  products: '🛒',
  refund: '🔌',
  review: '✨',
  sale: '🎫',
  secure: '🛡️',
  soldout: '📣',
  stock: '📦',
  support: '🎧',
  trusted: '🛡️',
  vip: '👑',
  welcome: '👋'
});

const KNOWN_BRAND_TEXT_EMOJI = new Map([
  ['chatgpt', '🤖'],
  ['claude', '🧠'],
  ['gemini', '✨'],
  ['perplexity', '🔎'],
  ['cursor', '🖱️'],
  ['canva', '🎨'],
  ['capcut', '🎬'],
  ['google', '🔎'],
  ['microsoft', '💻'],
  ['gmail', '📧'],
  ['notion', '📝'],
  ['paypal', '💳'],
  ['facebook', '📘'],
  ['telegram', '✈️'],
  ['tiktok', '🎵'],
  ['discord', '🎮']
]);

const CATEGORY_ICONS = new Map([
  ['AI Accounts', UI_TEXT_EMOJI.ai],
  ['Design Accounts', UI_TEXT_EMOJI.design],
  ['Work & Cloud Accounts', UI_TEXT_EMOJI.work],
  ['Social/MMO Accounts', UI_TEXT_EMOJI.social]
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
  ['pending_payment', '💳 Chờ thanh toán'],
  ['payment_review', '📣 Cần kiểm tra'],
  ['delivered', '📦 Đã giao hàng'],
  ['cancelled', '🔌 Đã hủy'],
  ['expired', '📣 Hết hạn'],
  ['refunded', '🔌 Đã hoàn tiền'],
  ['paid', '📝 Đã thanh toán']
]);

const TELEGRAM_ALL_MENU_COMMANDS = [
  { command: 'start', description: 'Mở menu chính' },
  { command: 'products', description: 'Xem sản phẩm' },
  { command: 'topup', description: 'Đặt gói riêng' },
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
export const BOT_RESTORED_MESSAGE = `${roboEmoji('wave', '👋')} Bot đã hoạt động trở lại`;

export const TELEGRAM_MENU_COMMANDS = TELEGRAM_VISIBLE_COMMAND_ORDER
  .map((command) => TELEGRAM_ALL_MENU_COMMANDS.find((item) => item.command === command))
  .filter(Boolean);

const TELEGRAM_ALL_MAIN_MENU_ITEMS = [
  { key: 'products', label: 'Sản phẩm', callbackData: 'catalog:all', command: 'products' },
  { key: 'topup', label: 'Đặt gói riêng', callbackData: 'topup', command: 'topup' },
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

function uiTextEmoji(key, fallbackEmoji = '✨') {
  return UI_TEXT_EMOJI[key] || fallbackEmoji;
}

function sloganTextEmoji(key, fallbackEmoji = '✨') {
  return SLOGAN_TEXT_EMOJI[key] || fallbackEmoji;
}

function bannerTextEmoji(key, fallbackEmoji = '✨') {
  return BANNER_TEXT_EMOJI[key] || fallbackEmoji;
}

function customEmojiCandidate(emoji, customEmojiId) {
  return { emoji, customEmojiId };
}

function firstCustomEmojiId(...ids) {
  return ids.map((id) => String(id || '').trim()).find(Boolean) || '';
}

function uiCustomEmojiCandidate(key) {
  return customEmojiCandidate(uiTextEmoji(key), uiCustomEmojiId(key));
}

function sloganCustomEmojiCandidate(key) {
  return customEmojiCandidate(sloganTextEmoji(key), sloganCustomEmojiId(key));
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
  return customEmojiCandidate(emoji || bannerTextEmoji(key), bannerCustomEmojiId(key));
}

function brandCustomEmojiAlt(brand) {
  const key = normalizeBrandKey(brand);
  const sticker = (telegramEmoji.customEmojiMap.stickers || []).find((item) => (
    normalizeBrandKey(item?.brand || item?.brandKey || '') === key && item?.emoji
  ));
  return String(sticker?.emoji || KNOWN_BRAND_TEXT_EMOJI.get(key) || '');
}

function brandTextEmoji(brand) {
  return brandCustomEmojiId(brand) && brandCustomEmojiAlt(brand)
    ? brandCustomEmojiAlt(brand)
    : bannerTextEmoji('kaito');
}

function brandTextEmojiCandidate(brand) {
  const customEmojiId = brandCustomEmojiId(brand);
  const emoji = brandCustomEmojiAlt(brand);
  return customEmojiCandidate(
    customEmojiId && emoji ? emoji : bannerTextEmoji('kaito'),
    customEmojiId && emoji ? customEmojiId : bannerCustomEmojiId('kaito')
  );
}

function defaultTextCustomEmojiCandidates() {
  const candidates = [
    sloganCustomEmojiCandidate('catalog'),
    sloganCustomEmojiCandidate('checkout'),
    sloganCustomEmojiCandidate('payment'),
    sloganCustomEmojiCandidate('support'),
    sloganCustomEmojiCandidate('soldout'),
    bannerCustomEmojiCandidate('stock'),
    bannerCustomEmojiCandidate('checkin'),
    bannerCustomEmojiCandidate('contact'),
    bannerCustomEmojiCandidate('guide'),
    bannerCustomEmojiCandidate('refund'),
    bannerCustomEmojiCandidate('kaito'),
    customEmojiCandidate(uiTextEmoji('products'), firstCustomEmojiId(
      gameCustomEmojiId('products'),
      uiCustomEmojiId('products'),
      bannerCustomEmojiId('products')
    )),
    uiCustomEmojiCandidate('topup'),
    uiCustomEmojiCandidate('account'),
    uiCustomEmojiCandidate('orders'),
    uiCustomEmojiCandidate('language'),
    uiCustomEmojiCandidate('support'),
    uiCustomEmojiCandidate('security'),
    uiCustomEmojiCandidate('instant-delivery'),
    uiCustomEmojiCandidate('automation-247'),
    uiCustomEmojiCandidate('quality'),
    uiCustomEmojiCandidate('member'),
    uiCustomEmojiCandidate('offers'),
    uiCustomEmojiCandidate('notifications'),
    uiCustomEmojiCandidate('promotions'),
    uiCustomEmojiCandidate('reviews'),
    uiCustomEmojiCandidate('academy'),
    uiCustomEmojiCandidate('news'),
    uiCustomEmojiCandidate('events'),
    uiCustomEmojiCandidate('policy'),
    uiCustomEmojiCandidate('logout'),
    sloganCustomEmojiCandidate('delivery'),
    bannerCustomEmojiCandidate('hot'),
    bannerCustomEmojiCandidate('mmo'),
    bannerCustomEmojiCandidate('new'),
    newsEmojiCandidate('fast'),
    newsEmojiCandidate('tracking'),
    newsEmojiCandidate('adminshield'),
    newsEmojiCandidate('adminboom'),
    newsEmojiCandidate('adminfire'),
    customEmojiCandidate('🧠', brandCustomEmojiId('Claude')),
    customEmojiCandidate('🔎', brandCustomEmojiId('Google') || brandCustomEmojiId('Perplexity')),
    customEmojiCandidate('🖱️', brandCustomEmojiId('Cursor')),
    customEmojiCandidate('🎨', brandCustomEmojiId('Canva')),
    customEmojiCandidate('🎬', brandCustomEmojiId('CapCut')),
    customEmojiCandidate('💻', brandCustomEmojiId('Microsoft')),
    customEmojiCandidate('📧', brandCustomEmojiId('Gmail')),
    customEmojiCandidate('📘', brandCustomEmojiId('Facebook')),
    customEmojiCandidate('✈️', brandCustomEmojiId('Telegram')),
    customEmojiCandidate('🎵', brandCustomEmojiId('TikTok')),
    customEmojiCandidate(roboEmoji('ok', '👌'), roboCustomEmojiId('ok')),
    customEmojiCandidate(roboEmoji('please', '🙏'), roboCustomEmojiId('please')),
    customEmojiCandidate(roboEmoji('party', '🥳'), roboCustomEmojiId('party')),
    customEmojiCandidate(roboEmoji('money', '🤑'), firstCustomEmojiId(
      flameCustomEmojiId('moneyface'),
      roboCustomEmojiId('money')
    )),
    customEmojiCandidate(roboEmoji('salute', '🫡'), roboCustomEmojiId('salute')),
    customEmojiCandidate(roboEmoji('plus', '➕'), roboCustomEmojiId('plus')),
    customEmojiCandidate(roboEmoji('hundred', '💯'), roboCustomEmojiId('hundred')),
    customEmojiCandidate(roboEmoji('wave', '👋'), firstCustomEmojiId(
      roboCustomEmojiId('wave'),
      bannerCustomEmojiId('welcome')
    ))
  ];

  for (const [brand, emoji] of KNOWN_BRAND_TEXT_EMOJI.entries()) {
    candidates.push(customEmojiCandidate(emoji, brandCustomEmojiId(brand)));
  }
  for (const sticker of telegramEmoji.customEmojiMap.stickers || []) {
    candidates.push(customEmojiCandidate(
      sticker?.emoji,
      brandCustomEmojiId(sticker?.brand || sticker?.brandKey)
    ));
  }

  const byEmoji = new Map();
  for (const candidate of candidates) {
    const emoji = String(candidate?.emoji || '');
    const customEmojiId = String(candidate?.customEmojiId || '');
    if (emoji && customEmojiId && !byEmoji.has(emoji)) byEmoji.set(emoji, candidate);
  }
  return byEmoji;
}

function recognizedEmojiCounts(htmlText, emojis) {
  const text = String(htmlText || '');
  const tokens = [...new Set(emojis.filter(Boolean))].sort((left, right) => right.length - left.length);
  const counts = new Map();

  for (let offset = 0; offset < text.length;) {
    const token = tokens.find((emoji) => text.startsWith(emoji, offset));
    if (!token) {
      offset += 1;
      continue;
    }
    counts.set(token, (counts.get(token) || 0) + 1);
    offset += token.length;
  }
  return counts;
}

function customEmojiCandidatesForText(htmlText, preferredCandidates = []) {
  const preferred = (preferredCandidates || []).filter((candidate) => (
    candidate?.emoji && candidate?.customEmojiId
  ));
  const defaults = defaultTextCustomEmojiCandidates();
  const counts = recognizedEmojiCounts(htmlText, [
    ...defaults.keys(),
    ...preferred.map((candidate) => String(candidate.emoji || ''))
  ]);
  const claimed = new Map();
  const candidates = [];

  for (const candidate of preferred) {
    const emoji = String(candidate.emoji || '');
    const used = claimed.get(emoji) || 0;
    if (used >= (counts.get(emoji) || 0)) continue;
    candidates.push(candidate);
    claimed.set(emoji, used + 1);
  }

  for (const [emoji, count] of counts.entries()) {
    const fallback = defaults.get(emoji);
    if (!fallback) continue;
    for (let index = claimed.get(emoji) || 0; index < count; index += 1) {
      candidates.push(fallback);
    }
  }
  return candidates;
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
  return buildCustomEmojiEntityPayload(htmlText, customEmojiCandidatesForText(htmlText, candidates), {
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

async function sendAnimatedTelegramMessage(chatId, htmlText, options = {}) {
  return sendCustomTelegramMessage(chatId, htmlText, [], options);
}

async function presentTelegramMessage(chatId, messageId, htmlText, options = {}) {
  return presentCustomTelegramMessage(chatId, messageId, htmlText, [], options);
}

async function presentCustomTelegramMessage(chatId, messageId, htmlText, candidates, options = {}) {
  const payload = customMessageOptions(htmlText, candidates, options);
  if (messageId) {
    try {
      return await editTelegramMessage(chatId, messageId, payload.text, payload.options);
    } catch (error) {
      console.warn(`[telegram] edit custom message failed, sending a new message: ${error.message}`);
    }
  }
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
    customEmojiCandidate('👋', roboCustomEmojiId('wave'))
  ];
}

function catalogCustomEmojiCandidates(products = []) {
  return [
    customEmojiCandidate(roboEmoji('ok', '👌'), roboCustomEmojiId('ok')),
    sloganCustomEmojiCandidate('catalog'),
    uiCustomEmojiCandidate('instant-delivery'),
    uiCustomEmojiCandidate('automation-247'),
    sloganCustomEmojiCandidate('soldout'),
    bannerCustomEmojiCandidate('guide'),
    bannerCustomEmojiCandidate('combo'),
    customEmojiCandidate(roboEmoji('please', '🙏'), roboCustomEmojiId('please')),
    bannerCustomEmojiCandidate('contact'),
    bannerCustomEmojiCandidate('review'),
    customEmojiCandidate(roboEmoji('party', '🥳'), roboCustomEmojiId('party')),
    bannerCustomEmojiCandidate('kaito'),
    bannerCustomEmojiCandidate('hot'),
    bannerCustomEmojiCandidate('new'),
    bannerCustomEmojiCandidate('mmo'),
    bannerCustomEmojiCandidate('stock'),
    sloganCustomEmojiCandidate('payment'),
    ...hotProductsForCatalog(products).map((product) => brandTextEmojiCandidate(product.brand))
  ];
}

function supportCustomEmojiCandidates() {
  return [
    customEmojiCandidate(roboEmoji('salute', '🫡'), roboCustomEmojiId('salute')),
    sloganCustomEmojiCandidate('support'),
    customEmojiCandidate(roboEmoji('please', '🙏'), roboCustomEmojiId('please'))
  ];
}

function topupCustomEmojiCandidates() {
  return [
    flameEmojiCandidate('moneyface'),
    sloganCustomEmojiCandidate('payment'),
    customEmojiCandidate(roboEmoji('ok', '👌'), roboCustomEmojiId('ok'))
  ];
}

function orderCustomEmojiCandidates() {
  return [
    customEmojiCandidate(roboEmoji('party', '🥳'), roboCustomEmojiId('party')),
    sloganCustomEmojiCandidate('payment'),
    bannerCustomEmojiCandidate('checkin'),
    bannerCustomEmojiCandidate('guide'),
    bannerCustomEmojiCandidate('stock'),
    bannerCustomEmojiCandidate('stock'),
    flameEmojiCandidate('moneyface'),
    sloganCustomEmojiCandidate('delivery'),
    customEmojiCandidate(roboEmoji('ok', '👌'), roboCustomEmojiId('ok'))
  ];
}

function deliveryCustomEmojiCandidates() {
  return [
    sloganCustomEmojiCandidate('delivery'),
    uiCustomEmojiCandidate('security'),
    bannerCustomEmojiCandidate('guide'),
    bannerCustomEmojiCandidate('stock'),
    uiCustomEmojiCandidate('security')
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

function httpsImageUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function startImagePublicUrl(imagePath = startImageFilePath()) {
  const configuredUrl = httpsImageUrl(config.telegram.startImageUrl);
  if (configuredUrl) return configuredUrl;
  if (!imagePath) return '';

  const baseUrl = httpsImageUrl(config.baseUrl);
  if (!baseUrl) return '';

  const publicDir = resolve(process.cwd(), 'public');
  const relativePath = relative(publicDir, imagePath);
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) return '';

  const url = new URL(baseUrl);
  url.pathname = `/${relativePath.replaceAll('\\', '/')}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function telegramPhotoFileId(result) {
  const photos = result?.result?.photo;
  if (!Array.isArray(photos) || !photos.length) return '';
  return String(photos.at(-1)?.file_id || '').trim();
}

function rememberStartImageFileId(result) {
  const fileId = telegramPhotoFileId(result);
  if (fileId) cachedStartImageFileId = fileId;
  return result;
}

async function sendStartImage(chatId, imagePath = startImageFilePath()) {
  const publicUrl = startImagePublicUrl(imagePath);
  const sources = [
    cachedStartImageFileId
      ? { type: 'file_id', value: cachedStartImageFileId }
      : null,
    publicUrl
      ? { type: 'url', value: publicUrl }
      : null,
    imagePath
      ? { type: 'file', value: imagePath }
      : null
  ].filter(Boolean);

  let lastError;
  for (const source of sources) {
    try {
      const result = source.type === 'file'
        ? await sendTelegramPhotoFile(chatId, source.value)
        : await sendTelegramPhotoUrl(chatId, source.value);
      return rememberStartImageFileId(result);
    } catch (error) {
      lastError = error;
      if (source.type === 'file_id' && cachedStartImageFileId === source.value) {
        cachedStartImageFileId = '';
      }
    }
  }

  if (lastError) throw lastError;
  return { skipped: true };
}

function genericKeyboardCustomEmojiId() {
  return firstCustomEmojiId(
    bannerCustomEmojiId('kaito'),
    gameCustomEmojiId('products'),
    uiCustomEmojiId('products'),
    sloganCustomEmojiId('welcome'),
    brandCustomEmojiId('ChatGPT')
  );
}

function categoryKeyboardCustomEmojiId(category) {
  const label = String(category || '');
  if (/design|canva|capcut|figma/i.test(label)) return brandCustomEmojiId('Canva');
  if (/cloud|work|workspace|mail/i.test(label)) return brandCustomEmojiId('Microsoft');
  if (/social|mmo|telegram|tiktok|discord/i.test(label)) return bannerCustomEmojiId('mmo');
  if (/ai/i.test(label)) return bannerCustomEmojiId('ai');
  return sloganCustomEmojiId('catalog');
}

function orderStatusKeyboardCustomEmojiId(status) {
  switch (String(status || 'pending_payment')) {
    case 'pending_payment':
      return firstCustomEmojiId(sloganCustomEmojiId('payment'), bannerCustomEmojiId('payment'));
    case 'payment_review':
      return firstCustomEmojiId(bannerCustomEmojiId('review'), sloganCustomEmojiId('soldout'));
    case 'delivered':
      return firstCustomEmojiId(sloganCustomEmojiId('delivery'), bannerCustomEmojiId('delivery'));
    case 'cancelled':
    case 'refunded':
      return bannerCustomEmojiId('refund');
    case 'expired':
      return firstCustomEmojiId(bannerCustomEmojiId('soldout'), sloganCustomEmojiId('soldout'));
    case 'paid':
      return firstCustomEmojiId(bannerCustomEmojiId('checkin'), sloganCustomEmojiId('checkout'));
    default:
      return uiCustomEmojiId('orders');
  }
}

function keyboardCustomEmojiId(semantic, preferredCustomEmojiId = '') {
  const semanticId = (() => {
    switch (semantic) {
      case 'products':
      case 'catalog':
      case 'buy':
        return firstCustomEmojiId(
          gameCustomEmojiId('products'),
          uiCustomEmojiId('products'),
          bannerCustomEmojiId('products'),
          sloganCustomEmojiId('catalog')
        );
      case 'topup':
        return firstCustomEmojiId(uiCustomEmojiId('topup'), bannerCustomEmojiId('payment'));
      case 'account':
        return firstCustomEmojiId(uiCustomEmojiId('account'), bannerCustomEmojiId('account'));
      case 'orders':
        return firstCustomEmojiId(uiCustomEmojiId('orders'), bannerCustomEmojiId('orders'));
      case 'language':
        return uiCustomEmojiId('language');
      case 'support':
        return firstCustomEmojiId(uiCustomEmojiId('support'), sloganCustomEmojiId('support'), bannerCustomEmojiId('support'));
      case 'security':
        return firstCustomEmojiId(uiCustomEmojiId('security'), bannerCustomEmojiId('secure'));
      case 'refresh':
        return firstCustomEmojiId(uiCustomEmojiId('automation-247'), newsCustomEmojiId('auto247'));
      case 'back':
      case 'decrease':
        return bannerCustomEmojiId('refund');
      case 'quantity':
        return firstCustomEmojiId(bannerCustomEmojiId('stock'), uiCustomEmojiId('orders'));
      case 'increase':
        return firstCustomEmojiId(roboCustomEmojiId('plus'), bannerCustomEmojiId('stock'));
      case 'confirm':
        return firstCustomEmojiId(sloganCustomEmojiId('checkout'), bannerCustomEmojiId('checkin'));
      case 'payment':
      case 'qr':
        return firstCustomEmojiId(sloganCustomEmojiId('payment'), bannerCustomEmojiId('payment'), uiCustomEmojiId('topup'));
      case 'cancel':
        return firstCustomEmojiId(bannerCustomEmojiId('logout'), bannerCustomEmojiId('refund'), sloganCustomEmojiId('soldout'));
      case 'keep':
        return firstCustomEmojiId(bannerCustomEmojiId('trusted'), bannerCustomEmojiId('checkin'), sloganCustomEmojiId('checkout'));
      case 'delivery':
        return firstCustomEmojiId(sloganCustomEmojiId('delivery'), bannerCustomEmojiId('delivery'), bannerCustomEmojiId('secure'));
      default:
        return '';
    }
  })();
  return firstCustomEmojiId(preferredCustomEmojiId, semanticId, genericKeyboardCustomEmojiId());
}

function stripLeadingButtonEmoji(value) {
  const text = String(value || '').trim();
  const prefixes = [
    ...Object.values(UI_ICONS),
    ...Object.values(UI_TEXT_EMOJI),
    ...Object.values(SLOGAN_TEXT_EMOJI),
    ...Object.values(BANNER_TEXT_EMOJI),
    '✅', '❌', '⛔', '⌛', '⏳', '🟠', '🖼', '🔐', '🔑', '🧾', '➖', '➕', '↩'
  ].filter(Boolean).sort((left, right) => right.length - left.length);
  const prefix = prefixes.find((emoji) => text.startsWith(`${emoji} `));
  return prefix ? text.slice(prefix.length).trimStart() : text;
}

function animatedKeyboardButton(fields, semantic = 'generic', preferredCustomEmojiId = '') {
  const customEmojiId = keyboardCustomEmojiId(semantic, preferredCustomEmojiId);
  const text = customEmojiId ? stripLeadingButtonEmoji(fields.text) : String(fields.text || '');
  return {
    ...fields,
    text,
    ...(customEmojiId ? { icon_custom_emoji_id: customEmojiId } : {})
  };
}

function brandKeyboardButton(brand, fields) {
  return animatedKeyboardButton(fields, 'brand', brandCustomEmojiId(brand));
}

function uiKeyboardButton(key, label, callbackData) {
  return animatedKeyboardButton(
    { text: label, callback_data: callbackData },
    key,
    key === 'products' ? gameCustomEmojiId('products') : uiCustomEmojiId(key)
  );
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
      await sendAnimatedTelegramMessage(chatId, message);
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
  const key = String(chatId);
  if (telegramChatMenuButtonCache.has(key)) return { ok: true, cached: true };
  if (telegramChatMenuButtonInflight.has(key)) return telegramChatMenuButtonInflight.get(key);

  const request = telegramJson('setChatMenuButton', {
    chat_id: chatId,
    menu_button: { type: 'commands' }
  }).then((result) => {
    telegramChatMenuButtonCache.add(key);
    return result;
  }).finally(() => {
    telegramChatMenuButtonInflight.delete(key);
  });
  telegramChatMenuButtonInflight.set(key, request);
  return request;
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
  const hasImage = stage === 'welcome'
    ? Boolean(cachedStartImageFileId || startImagePublicUrl(imagePath) || imagePath)
    : Boolean(imagePath);
  const candidates = options._customEmojiCandidates;
  if (hasImage && candidates?.length) {
    try {
      if (stage === 'welcome') {
        await sendStartImage(chatId, imagePath);
      } else {
        await sendTelegramPhotoFile(chatId, imagePath);
      }
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
  if (!hasImage && candidates?.length) {
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
  if (!hasImage) return sendAnimatedTelegramMessage(chatId, customOptions.caption, customOptions.options);
  try {
    const photoOptions = {
      parse_mode: 'HTML',
      ...customOptions.options,
      caption: customOptions.caption
    };
    if (stage === 'welcome') {
      const source = cachedStartImageFileId || startImagePublicUrl(imagePath);
      if (source) return rememberStartImageFileId(await sendTelegramPhotoUrl(chatId, source, photoOptions));
      return rememberStartImageFileId(await sendTelegramPhotoFile(chatId, imagePath, photoOptions));
    }
    return sendTelegramPhotoFile(chatId, imagePath, photoOptions);
  } catch (error) {
    console.warn(`[telegram] slogan image skipped: ${error.message}`);
    return sendAnimatedTelegramMessage(chatId, customOptions.caption, customOptions.options);
  }
}

function money(amount, currency = 'VND') {
  return `${Number(amount).toLocaleString('vi-VN')} ${currency}`;
}

function categoryIcon(category) {
  const label = String(category || '');
  if (CATEGORY_ICONS.has(label)) return CATEGORY_ICONS.get(label);
  if (/design|canva|capcut|figma/i.test(label)) return UI_TEXT_EMOJI.design;
  if (/cloud|work|workspace|mail/i.test(label)) return UI_TEXT_EMOJI.work;
  if (/social|mmo|telegram|tiktok|discord/i.test(label)) return UI_TEXT_EMOJI.social;
  if (/ai/i.test(label)) return UI_TEXT_EMOJI.ai;
  return SLOGAN_TEXT_EMOJI.catalog;
}

function categoryLabel(category) {
  return `${categoryIcon(category)} ${category}`;
}

function categoryTextEmojiCandidate(category) {
  return customEmojiCandidate(categoryIcon(category), categoryKeyboardCustomEmojiId(category));
}

export function brandIcon(brand) {
  return brandAssetIcon(brand);
}

function brandLabel(brand) {
  return `${brandTextEmoji(brand)} ${brand}`;
}

function brandHtmlLabel(brand) {
  return `${brandTextEmoji(brand)} ${escapeHtml(brand)}`;
}

function brandButtonLabel(brand) {
  return String(brand || 'Other').trim() || 'Other';
}

function brandMenuCustomEmojiCandidates(products, category) {
  const brands = uniqueSorted(products
    .map((product) => normalizePublicProduct(product))
    .filter((product) => product.category === category)
    .map((product) => product.brand));
  return [
    categoryTextEmojiCandidate(category),
    ...brands.map((brand) => brandTextEmojiCandidate(brand))
  ];
}

function brandPackagesCustomEmojiCandidates(category, brand) {
  return [
    categoryTextEmojiCandidate(category),
    brandTextEmojiCandidate(brand)
  ];
}

function productCustomEmojiCandidates(product) {
  const normalized = normalizePublicProduct(product);
  return [brandTextEmojiCandidate(normalized.brand)];
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
  return ORDER_STATUS_LABELS.get(normalized) || `${uiTextEmoji('news')} ${normalized.replaceAll('_', ' ')}`;
}

function orderStatusLine(status) {
  const formatted = formatOrderStatus(status);
  const [icon, ...labelParts] = formatted.split(' ');
  return `${icon} Trạng thái: ${labelParts.join(' ') || formatted}`;
}

export function formatStockStatus(product) {
  const available = Number(product?.stock?.available || 0);
  return available > 0 ? `${bannerTextEmoji('stock')} Còn ${available}` : `${sloganTextEmoji('soldout')} Hết hàng`;
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
  return `${bannerTextEmoji('guide')} Cú pháp: ${code('/buy sku 1')}`;
}

export function unknownCommandMessage() {
  return `Mình chưa hiểu thao tác này. Bấm ${uiTextEmoji('products')} Sản phẩm hoặc ${uiTextEmoji('orders')} Đơn hàng bên dưới.`;
}

function decodePart(value) {
  return decodeURIComponent(String(value || ''));
}

function catalogToken(value) {
  return createHash('sha256').update(String(value || '')).digest('base64url').slice(0, 12);
}

function resolveCatalogPart(token, values) {
  const raw = String(token || '');
  const direct = values.find((value) => catalogToken(value) === raw);
  if (direct) return direct;
  try {
    const decoded = decodePart(raw);
    return values.includes(decoded) ? decoded : '';
  } catch {
    return '';
  }
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
    callback_data: `brand:${catalogToken(product.category)}:${catalogToken(product.brand)}`
  });
}

function supportHandle() {
  return String(config.telegram.supportHandle || '@an_hocha').trim() || '@an_hocha';
}

function supportContactLine() {
  return `Admin: ${escapeHtml(supportHandle())}`;
}

function supportUrl(message = '') {
  const username = supportHandle().replace(/^@+/, '');
  if (!username) return '';
  const url = new URL(`https://t.me/${username}`);
  if (message) url.searchParams.set('text', message);
  return url.toString();
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

export function buildCategoryKeyboard(products) {
  const normalized = products.map((product) => normalizePublicProduct(product));
  const categories = uniqueSorted(normalized.map((product) => product.category));
  const rows = chunkButtons(categories.map((category) => {
    const available = normalized
      .filter((product) => product.category === category)
      .reduce((sum, product) => sum + availableStock(product), 0);
    return animatedKeyboardButton({
      text: `${category}${available > 0 ? ` [${available}]` : ' [Hết]'}`,
      callback_data: `cat:${catalogToken(category)}`
    }, 'category', categoryKeyboardCustomEmojiId(category));
  }), 2);
  rows.push([animatedKeyboardButton({ text: 'Làm mới', callback_data: 'catalog:all' }, 'refresh')]);
  rows.push([animatedKeyboardButton({ text: 'Menu chính', callback_data: 'start:menu' }, 'back')]);
  return { inline_keyboard: rows };
}

export function buildCatalogKeyboard(products) {
  return buildCategoryKeyboard(products);
}

export function buildLegacyCategoryKeyboard(products) {
  return buildCategoryKeyboard(products);
}

export function buildBrandKeyboard(products, category) {
  const buttons = catalogBrandEntries(products
    .map((product) => normalizePublicProduct(product))
    .filter((product) => product.category === category))
    .map((product) => brandChoiceButton(product));
  const rows = chunkButtons(buttons, 2);
  rows.push([animatedKeyboardButton({ text: 'Tất cả danh mục', callback_data: 'catalog:all' }, 'back')]);
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
        ? `Xem gói · ${product.packageType || product.name} · ${money(product.price, product.currency)}`
        : `Hết hàng · ${product.packageType || product.name} · ${money(product.price, product.currency)}`,
      callback_data: `pkg:${product.id || product.sku}`
    })]);
  const category = normalized[0]?.category;
  if (category) rows.push([animatedKeyboardButton(
    { text: 'Nhãn hàng', callback_data: `cat:${catalogToken(category)}` },
    'back'
  )]);
  rows.push([
    animatedKeyboardButton({ text: 'Danh mục', callback_data: 'catalog:all' }, 'catalog'),
    animatedKeyboardButton({ text: 'Đơn hàng', callback_data: 'orders:mine' }, 'orders')
  ]);
  return { inline_keyboard: rows };
}

export function productMessage(products) {
  if (!products.length) return `${sloganTextEmoji('catalog')} Chưa có sản phẩm đang bán.`;
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
      product.packageType ? `${uiTextEmoji('offers')} Gói: ${escapeHtml(product.packageType)}` : '',
      `${uiTextEmoji('promotions')} SKU: ${code(product.sku)}`,
      `${sloganTextEmoji('payment')} Giá: ${escapeHtml(money(product.price, product.currency))}`,
      formatStockStatus(product),
      `${sloganTextEmoji('catalog')} Mua nhanh: ${code(`/buy ${product.sku} 1`)}`
    ].filter(Boolean).join('\n'));
  }

  return [
    `${uiTextEmoji('products')} <b>KAITO KID AI SHOP - Gói đang bán</b>`,
    'Chọn theo danh mục, nhãn hiệu rồi bấm nút mua gói còn hàng.',
    ...grouped
  ].join('\n\n');
}

function hotProductsForCatalog(products, limit = 3) {
  return products
    .map((product) => normalizePublicProduct(product))
    .filter((product) => product.active !== false && product.hot)
    .sort((left, right) => {
      const availabilityCompare = Number(availableStock(right) > 0) - Number(availableStock(left) > 0);
      if (availabilityCompare !== 0) return availabilityCompare;
      const stockCompare = availableStock(right) - availableStock(left);
      if (stockCompare !== 0) return stockCompare;
      const sortCompare = Number(left.sortOrder || 1000) - Number(right.sortOrder || 1000);
      if (sortCompare !== 0) return sortCompare;
      return String(left.name || left.sku || '').localeCompare(String(right.name || right.sku || ''));
    })
    .slice(0, Math.max(0, Number(limit) || 0));
}

function hotProductSummaryLines(products) {
  const hotProducts = hotProductsForCatalog(products);
  if (!hotProducts.length) {
    return [
      `${bannerTextEmoji('hot')} <b>Sản phẩm hot</b>`,
      `${bannerTextEmoji('new')} Đang cập nhật các gói nổi bật.`
    ];
  }

  return [
    `${bannerTextEmoji('hot')} <b>Sản phẩm hot</b>`,
    ...hotProducts.map((product) => {
      const available = availableStock(product);
      const productName = product.name
        || [product.brand, product.packageType].filter(Boolean).join(' ')
        || product.sku
        || 'Gói sản phẩm';
      const price = Number(product.price) > 0
        ? `${sloganTextEmoji('payment')} ${escapeHtml(money(product.price, product.currency))}`
        : `${bannerTextEmoji('contact')} Liên hệ`;
      const stock = available > 0
        ? `${bannerTextEmoji('stock')} Còn ${available}`
        : `${sloganTextEmoji('soldout')} Hết hàng`;
      return `${brandTextEmoji(product.brand)} <b>${escapeHtml(productName)}</b> · ${price} · ${stock}`;
    })
  ];
}

export function categoryMenuMessage(products) {
  const normalized = products.map((product) => normalizePublicProduct(product));
  const categoryCount = uniqueSorted(normalized.map((product) => product.category)).length;
  const brandCount = catalogBrandEntries(normalized).length;
  const availableCount = normalized.filter((product) => Number(product.stock?.available || 0) > 0).length;
  return [
    `${roboEmoji('ok', '👌')} ${sloganTextEmoji('catalog')} <b>Danh mục sản phẩm</b>`,
    config.sales.enabled
      ? `${uiTextEmoji('instant-delivery')} ${uiTextEmoji('automation-247')} Thanh toán khớp sẽ được giao tự động 24/7.`
      : `${uiTextEmoji('security')} Shop đang chuẩn bị tồn kho và thanh toán, chưa mở nhận đơn.`,
    `${sloganTextEmoji('soldout')} ${bannerTextEmoji('guide')} Gói hết vui lòng liên hệ admin để đặt thêm ${bannerTextEmoji('combo')} ${roboEmoji('please', '🙏')}`,
    `${bannerTextEmoji('contact')} ${supportContactLine()}`,
    '',
    ...hotProductSummaryLines(normalized),
    '',
    `${bannerTextEmoji('review')} ${roboEmoji('party', '🥳')} Chọn một danh mục bên dưới ${bannerTextEmoji('kaito')}`,
    `${bannerTextEmoji('mmo')} ${categoryCount} danh mục · ${brandCount} nhãn hàng · ${bannerTextEmoji('stock')} ${availableCount} gói còn hàng.`
  ].join('\n');
}

function topupMessage() {
  return [
    `${roboEmoji('money', '🤑')} ${sloganTextEmoji('payment')} <b>Đặt gói riêng</b>`,
    'Shop thanh toán theo từng đơn để giữ hàng và đối soát chính xác.',
    `${roboEmoji('ok', '👌')} Cần gói chưa có trong danh mục, số lượng lớn hoặc báo giá riêng: ${supportContactLine()}`
  ].join('\n');
}

function accountMessage(user) {
  const display = user.username ? `@${user.username}` : [user.firstName, user.lastName].filter(Boolean).join(' ') || user.telegramId;
  return [
    `${uiTextEmoji('account')} <b>Tài khoản</b>`,
    `Telegram: ${escapeHtml(display)}`,
    'Trạng thái: BUYER',
    'Mua hàng: Sản phẩm → Danh mục → Nhãn hàng → Gói → Xác nhận → Thanh toán.'
  ].join('\n');
}

function languageMessage() {
  return [
    `${uiTextEmoji('language')} <b>Ngôn ngữ</b>`,
    'Ngôn ngữ hiện tại: Tiếng Việt.',
    'Bản tiếng Anh có thể bật thêm khi shop cần bán quốc tế.'
  ].join('\n');
}

function supportMessage() {
  return [
    `${roboEmoji('salute', '🫡')} ${sloganTextEmoji('support')} <b>Hỗ trợ</b>`,
    `${roboEmoji('please', '🙏')} Cần đặt gói hết hàng, mua số lượng lớn hoặc kiểm tra đơn: ${supportContactLine()}`,
    'Gửi mã đơn hoặc tên gói bạn cần để admin xử lý nhanh hơn.'
  ].join('\n');
}

function closeMessage() {
  return `${uiTextEmoji('logout')} Menu đã đóng. Bấm /start để mở lại khi cần mua hàng.`;
}

function memberMessage(user) {
  const display = user.username ? `@${user.username}` : [user.firstName, user.lastName].filter(Boolean).join(' ') || user.telegramId;
  return [
    `${uiTextEmoji('member')} <b>Thành viên</b>`,
    `Telegram: ${escapeHtml(display)}`,
    'Hạng hiện tại: BUYER',
    'Quyền lợi: đặt nhanh, theo dõi đơn, nhận ưu đãi và nhắc hàng mới ngay trong bot.'
  ].join('\n');
}

function menuInfoMessage(key, user) {
  const messages = {
    security: [
      `${uiTextEmoji('security')} <b>Bảo mật</b>`,
      'Thông tin đơn và tài khoản chỉ gửi trong cuộc trò chuyện Telegram này.',
      'Thanh toán dùng đúng nội dung chuyển khoản để bot tự đối soát, tránh gửi nhầm thông tin giao hàng.'
    ],
    'instant-delivery': [
      `${uiTextEmoji('instant-delivery')} <b>Giao hàng tức thì</b>`,
      'Khi thanh toán khớp nội dung và số tiền, bot tự giao tài khoản/key ngay trong chat.',
      'Nếu đơn cần kiểm tra thủ công, trạng thái sẽ chuyển sang cần kiểm tra để admin xử lý.'
    ],
    'automation-247': [
      `${uiTextEmoji('automation-247')} <b>Tự động 24/7</b>`,
      'Bot nhận đơn, giữ hàng, kiểm tra thanh toán và giao hàng tự động cả ngoài giờ.',
      'Các case hết hàng hoặc lệch thanh toán sẽ được chuyển sang luồng hỗ trợ.'
    ],
    quality: [
      `${uiTextEmoji('quality')} <b>Chất lượng uy tín</b>`,
      'Danh mục ưu tiên gói còn hàng, giá rõ ràng và giao đúng loại sản phẩm đã chọn.',
      `Cần kiểm tra trước khi mua số lượng lớn: ${supportContactLine()}`
    ],
    offers: [
      `${uiTextEmoji('offers')} <b>Ưu đãi</b>`,
      'Ưu đãi đang được gắn trực tiếp trong danh mục và các gói nổi bật.',
      'Bấm Sản phẩm để xem các gói còn hàng, giá tốt và slot mới nhất.'
    ],
    notifications: [
      `${uiTextEmoji('notifications')} <b>Thông báo</b>`,
      'Bot sẽ báo trạng thái đơn: đã tạo, chờ thanh toán, cần kiểm tra hoặc đã giao hàng.',
      'Giữ cuộc trò chuyện này để không bỏ lỡ thông tin giao hàng.'
    ],
    promotions: [
      `${uiTextEmoji('promotions')} <b>Khuyến mãi</b>`,
      'Các mã/gói khuyến mãi sẽ được đưa vào danh mục khi shop mở chương trình.',
      `Muốn đặt combo riêng: ${supportContactLine()}`
    ],
    reviews: [
      `${uiTextEmoji('reviews')} <b>Đánh giá</b>`,
      'Sau khi nhận hàng, bạn có thể gửi feedback hoặc ảnh kết quả cho admin.',
      'Đánh giá tốt sẽ giúp shop ưu tiên thêm gói hot và giữ giá ổn định hơn.'
    ],
    academy: [
      `${uiTextEmoji('academy')} <b>Học viện</b>`,
      'Khu hướng dẫn sử dụng tài khoản, bảo quản key và xử lý lỗi đăng nhập.',
      'Các bài hướng dẫn chi tiết sẽ được bổ sung theo từng nhóm sản phẩm.'
    ],
    news: [
      `${uiTextEmoji('news')} <b>Tin tức</b>`,
      'Tin hàng mới, thay đổi giá và slot hot sẽ được cập nhật tại đây.',
      'Bấm Sản phẩm để xem tình trạng còn hàng hiện tại.'
    ],
    events: [
      `${uiTextEmoji('events')} <b>Sự kiện</b>`,
      'Sự kiện săn slot, combo hoặc ưu đãi theo mùa sẽ mở khi shop có hàng phù hợp.',
      `Theo dõi bot hoặc liên hệ ${supportHandle()} để giữ suất.`
    ],
    policy: [
      `${uiTextEmoji('policy')} <b>Chính sách</b>`,
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
  const messageId = options.messageId;
  if (action === 'catalog:all') {
    if (options.track) await trackTelegramClick(user, 'catalog');
    const currentProducts = products || await listProducts();
    await presentCustomTelegramMessage(
      chatId,
      messageId,
      categoryMenuMessage(currentProducts),
      catalogCustomEmojiCandidates(currentProducts),
      { reply_markup: buildCategoryKeyboard(currentProducts) }
    );
    return true;
  }

  if (action === 'orders:mine') {
    if (options.track) await trackTelegramClick(user, 'orders');
    const view = await userOrdersView(user);
    await presentTelegramMessage(chatId, messageId, view.text, { reply_markup: view.reply_markup });
    return true;
  }

  if (action === 'topup') {
    if (options.track) await trackTelegramClick(user, 'topup');
    await presentCustomTelegramMessage(chatId, messageId, topupMessage(), topupCustomEmojiCandidates(), { reply_markup: buildMainMenuKeyboard() });
    return true;
  }

  if (action === 'account') {
    if (options.track) await trackTelegramClick(user, 'account');
    await presentTelegramMessage(chatId, messageId, accountMessage(user), { reply_markup: buildMainMenuKeyboard() });
    return true;
  }

  if (action === 'language') {
    if (options.track) await trackTelegramClick(user, 'language');
    await presentTelegramMessage(chatId, messageId, languageMessage(), { reply_markup: buildMainMenuKeyboard() });
    return true;
  }

  if (action === 'support') {
    if (options.track) await trackTelegramClick(user, 'support');
    await presentCustomTelegramMessage(chatId, messageId, supportMessage(), supportCustomEmojiCandidates(), { reply_markup: buildMainMenuKeyboard() });
    return true;
  }

  if (action === 'logout' || action === 'close') {
    if (options.track) await trackTelegramClick(user, action === 'close' ? 'close' : 'logout');
    await presentTelegramMessage(chatId, messageId, closeMessage());
    return true;
  }

  const infoText = menuInfoMessage(action, user);
  if (infoText) {
    if (options.track) await trackTelegramClick(user, action);
    await presentTelegramMessage(chatId, messageId, infoText, { reply_markup: buildMainMenuKeyboard() });
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
    `${categoryIcon(category)} ${brandTextEmoji(brand)} ${bold(`${category} / ${brand}`)}`,
    'Chọn gói bằng nút bên dưới. Gói còn hàng được ưu tiên ở trên.',
    available > 0
      ? `${bannerTextEmoji('stock')} Bấm Mua ngay để giữ slot và nhận hướng dẫn thanh toán.`
      : `${sloganTextEmoji('soldout')} Tất cả gói hiện hết hàng. Khi có slot mới, nút Mua ngay sẽ giữ slot cho bạn; hiện hãy bấm Nhãn hàng hoặc Danh mục để chọn lựa khác.`,
    '',
    priceNotes.length ? 'Giá hãng tham khảo:' : '',
    ...priceNotes,
    `${bannerTextEmoji('stock')} Còn hàng: ${available}/${selected.length}`
  ].join('\n');
}

function productKey(product) {
  return String(product?.id || product?.sku || '');
}

function findProduct(products, idOrSku) {
  const key = String(idOrSku || '');
  return products
    .map((product) => normalizePublicProduct(product))
    .find((product) => product.id === key || product.sku === key);
}

function policyText(value) {
  return escapeHtml(String(value || '').trim() || 'Chưa cập nhật — vui lòng xác nhận với hỗ trợ trước khi mua.');
}

function deliveryModeLabel(value) {
  return normalizeDeliveryMode(value) === 'file' ? 'Tệp TXT (.txt)' : 'Tin nhắn Telegram';
}

export function productDetailMessage(product) {
  const normalized = normalizePublicProduct(product);
  const available = availableStock(normalized);
  return [
    `${brandHtmlLabel(normalized.brand)} <b>${escapeHtml(normalized.name)}</b>`,
    normalized.packageType ? `${uiTextEmoji('offers')} Gói: ${escapeHtml(normalized.packageType)}` : '',
    '',
    `${bannerTextEmoji('checkin')} Mô tả: ${policyText(normalized.description)}`,
    `${uiTextEmoji('account')} Loại tài khoản: ${policyText(normalized.accountType)}`,
    `${uiTextEmoji('security')} Bảo hành: ${policyText(normalized.warrantyPolicy)}`,
    `${uiTextEmoji('automation-247')} Điều kiện đổi lỗi: ${policyText(normalized.replacementPolicy)}`,
    `${sloganTextEmoji('delivery')} Cách giao hàng: ${deliveryModeLabel(normalized.deliveryMode)}`,
    '',
    `${sloganTextEmoji('payment')} Giá: <b>${escapeHtml(money(normalized.price, normalized.currency))}</b>`,
    available > 0
      ? `${bannerTextEmoji('stock')} Tồn kho: Còn ${available}`
      : `${sloganTextEmoji('soldout')} Tồn kho: Hết hàng`,
    config.sales.enabled
      ? 'Bấm Mua gói này để kiểm tra lại số lượng và tổng tiền trước khi tạo đơn.'
      : `${uiTextEmoji('security')} Shop chưa mở nhận đơn. Bạn vẫn có thể xem thông tin hoặc liên hệ hỗ trợ.`
  ].filter(Boolean).join('\n');
}

export function buildProductDetailKeyboard(product) {
  const normalized = normalizePublicProduct(product);
  const rows = [];
  if (config.sales.enabled && availableStock(normalized) > 0) {
    rows.push([animatedKeyboardButton({
      text: 'Mua gói này',
      callback_data: `buy:${productKey(normalized)}:1`
    }, 'buy')]);
  }
  const support = supportUrl(`Mình cần tư vấn gói ${normalized.name}`);
  const actions = [animatedKeyboardButton({
    text: 'Các gói khác',
    callback_data: `brand:${catalogToken(normalized.category)}:${catalogToken(normalized.brand)}`
  }, 'back')];
  if (support) actions.push(animatedKeyboardButton({ text: 'Liên hệ hỗ trợ', url: support }, 'support'));
  rows.push(actions);
  rows.push([animatedKeyboardButton({ text: 'Danh mục', callback_data: 'catalog:all' }, 'catalog')]);
  return { inline_keyboard: rows };
}

export function confirmationMessage(product, quantity = 1) {
  const normalized = normalizePublicProduct(product);
  const qty = normalizeOrderQuantity(quantity);
  return [
    `${sloganTextEmoji('checkout')} <b>Xác nhận mua</b>`,
    '',
    `${bannerTextEmoji('stock')} Sản phẩm: ${escapeHtml(normalized.name)}`,
    `${bannerTextEmoji('stock')} Số lượng: ${qty}`,
    `${sloganTextEmoji('payment')} Đơn giá: ${escapeHtml(money(normalized.price, normalized.currency))}`,
    `${sloganTextEmoji('payment')} Tổng tiền: <b>${escapeHtml(money(normalized.price * qty, normalized.currency))}</b>`,
    `${sloganTextEmoji('delivery')} Giao hàng: ${deliveryModeLabel(normalized.deliveryMode)}`,
    '',
    `${uiTextEmoji('automation-247')} Sau khi xác nhận, hàng được giữ trong ${config.orders.ttlMinutes} phút.`,
    'Chưa có đơn hàng hoặc tồn kho nào bị giữ ở bước này.'
  ].join('\n');
}

export function buildConfirmationKeyboard(product, quantity = 1) {
  const normalized = normalizePublicProduct(product);
  const key = productKey(normalized);
  const qty = normalizeOrderQuantity(quantity);
  const rows = [];
  if (config.orders.maxQuantity > 1) {
    rows.push([
      animatedKeyboardButton(
        { text: 'Giảm', callback_data: `buy:${key}:${Math.max(1, qty - 1)}` },
        'decrease'
      ),
      animatedKeyboardButton({ text: `Số lượng ${qty}`, callback_data: `buy:${key}:${qty}` }, 'quantity'),
      animatedKeyboardButton(
        { text: 'Tăng', callback_data: `buy:${key}:${Math.min(config.orders.maxQuantity, qty + 1)}` },
        'increase'
      )
    ]);
  }
  rows.push([animatedKeyboardButton({ text: 'Xác nhận mua', callback_data: `confirm:${key}:${qty}` }, 'confirm')]);
  const support = supportUrl(`Mình cần hỗ trợ trước khi mua ${normalized.name}`);
  const actions = [animatedKeyboardButton({ text: 'Xem lại gói', callback_data: `pkg:${key}` }, 'back')];
  if (support) actions.push(animatedKeyboardButton({ text: 'Hỗ trợ', url: support }, 'support'));
  rows.push(actions);
  return { inline_keyboard: rows };
}

export function buildPaymentKeyboard(order, payment) {
  const rows = [];
  if (order.status === 'pending_payment' && payment?.paymentUrl) {
    const paymentRow = [animatedKeyboardButton({ text: 'Thanh toán', url: payment.paymentUrl }, 'payment')];
    if (payment.qrImageUrl) paymentRow.push(animatedKeyboardButton({ text: 'Xem QR', url: payment.qrImageUrl }, 'qr'));
    rows.push(paymentRow);
    rows.push([animatedKeyboardButton({ text: 'Hủy đơn', callback_data: `cancel:${order.id}` }, 'cancel')]);
  }
  if (order.status === 'delivered') {
    rows.push([animatedKeyboardButton(
      { text: 'Xem lại thông tin giao hàng', callback_data: `delivery:${order.id}` },
      'delivery'
    )]);
  }
  const support = supportUrl(`Mình cần hỗ trợ đơn ${order.id}`);
  const actions = [animatedKeyboardButton({ text: 'Đơn của tôi', callback_data: 'orders:mine' }, 'orders')];
  if (support) actions.push(animatedKeyboardButton({ text: 'Liên hệ hỗ trợ', url: support }, 'support'));
  rows.push(actions);
  rows.push([animatedKeyboardButton({ text: 'Tiếp tục mua', callback_data: 'catalog:all' }, 'products')]);
  return { inline_keyboard: rows };
}

export function buildCancelConfirmationKeyboard(order) {
  const support = supportUrl(`Mình cần hỗ trợ hủy đơn ${order.id}`);
  const actions = [
    animatedKeyboardButton({ text: 'Giữ đơn', callback_data: `order:${order.id}` }, 'keep'),
    animatedKeyboardButton({ text: 'Xác nhận hủy', callback_data: `cancel_yes:${order.id}` }, 'cancel')
  ];
  const rows = [actions];
  if (support) rows.push([animatedKeyboardButton({ text: 'Liên hệ hỗ trợ', url: support }, 'support')]);
  return { inline_keyboard: rows };
}

export function orderMessage(order, payment) {
  return [
    `${roboEmoji('party', '🥳')} ${sloganTextEmoji('payment')} ${bannerTextEmoji('checkin')} <b>Đơn đã tạo - đã giữ hàng</b>`,
    `${bannerTextEmoji('guide')} Mã đơn: ${code(order.id)}`,
    `${bannerTextEmoji('stock')} Sản phẩm: ${escapeHtml(order.productName)}`,
    `${bannerTextEmoji('stock')} Số lượng: ${escapeHtml(order.quantity)}`,
    `${roboEmoji('money', '🤑')} ${sloganTextEmoji('payment')} Tổng: ${escapeHtml(money(order.total, order.currency))}`,
    `${sloganTextEmoji('delivery')} Giao hàng: ${deliveryModeLabel(order.productSnapshot?.deliveryMode)}`,
    orderStatusLine(order.status),
    `${sloganTextEmoji('payment')} Nội dung CK: ${code(payment.reference)}`,
    payment.bankCode ? `${sloganTextEmoji('payment')} Ngân hàng: ${escapeHtml(payment.bankCode)}` : '',
    payment.accountNumber ? `${sloganTextEmoji('payment')} Số tài khoản: ${code(payment.accountNumber)}` : '',
    order.expiresAt
      ? `${uiTextEmoji('automation-247')} Giữ hàng đến: ${escapeHtml(new Date(order.expiresAt).toLocaleString('vi-VN'))}`
      : '',
    '',
    `${roboEmoji('ok', '👌')} Dùng các nút bên dưới và chuyển đúng số tiền, đúng nội dung để bot giao tự động tại đây.`
  ].filter(Boolean).join('\n');
}

export function deliveryMessage(order, deliverySecrets) {
  return [
    `${sloganTextEmoji('delivery')} ${uiTextEmoji('security')} <b>Đã giao hàng</b>`,
    `${bannerTextEmoji('guide')} Mã đơn: ${code(order.id)}`,
    `${bannerTextEmoji('stock')} Sản phẩm: ${escapeHtml(order.productName)}`,
    '',
    `${uiTextEmoji('security')} Thông tin nhận hàng:`,
    ...deliverySecrets.map((secret, index) => code(`${index + 1}. ${secret}`)),
    '',
    'Cần mua thêm gói khác, bấm Xem danh mục trong menu để bot lọc gói còn hàng cho bạn.'
  ].join('\n');
}

export function deliveryDocumentFilename(order) {
  const safeOrderId = String(order?.id || 'order')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 80) || 'order';
  return `kaito-delivery-${safeOrderId}.txt`;
}

export function deliveryDocumentText(order, deliverySecrets) {
  const lines = [
    'KAITO AI SHOP — THÔNG TIN GIAO HÀNG',
    `Mã đơn: ${String(order?.id || '')}`,
    `Sản phẩm: ${String(order?.productName || '')}`,
    `Số lượng: ${Number(order?.quantity || deliverySecrets.length || 0)}`,
    ''
  ];
  deliverySecrets.forEach((secret, index) => {
    lines.push(`[ITEM ${index + 1}]`);
    lines.push(String(secret));
    lines.push('');
  });
  return `${lines.join('\r\n').replace(/\r\n+$/, '')}\r\n`;
}

export function deliveryDocumentCaption(order) {
  return [
    `${sloganTextEmoji('delivery')} <b>Đã giao hàng</b>`,
    `${bannerTextEmoji('guide')} Mã đơn: ${code(order?.id || '')}`,
    `${bannerTextEmoji('stock')} Sản phẩm: ${escapeHtml(order?.productName || '')}`,
    `${uiTextEmoji('security')} Thông tin nhận hàng nằm trong tệp TXT đính kèm.`
  ].join('\n');
}

async function sendDeliveryPayload(chatId, order, deliverySecrets, replyMarkup) {
  if (normalizeDeliveryMode(order?.productSnapshot?.deliveryMode) === 'file') {
    try {
      const caption = deliveryDocumentCaption(order);
      const captionPayload = customCaptionOptions(caption, deliveryCustomEmojiCandidates(), {
        caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });
      return await sendTelegramTextDocument(
        chatId,
        deliveryDocumentText(order, deliverySecrets),
        deliveryDocumentFilename(order),
        captionPayload.options
      );
    } catch (error) {
      console.warn(`[telegram] sendDocument failed; falling back to text (${error?.status || 'unknown status'})`);
    }
  }

  return sendCustomTelegramMessage(
    chatId,
    deliveryMessage(order, deliverySecrets),
    deliveryCustomEmojiCandidates(),
    { reply_markup: replyMarkup }
  );
}

async function sendWelcome(chatId) {
  await sendSloganCaption(chatId, 'welcome', startPhotoCaptionPayload(), {
    reply_markup: buildMainMenuKeyboard(),
    _fallback_caption: startPhotoCaptionFallbackPayload(),
    _fallback_parse_mode: 'HTML',
    _customEmojiCandidates: startCustomEmojiCandidates()
  });
}

function orderDetailMessage(order, payment) {
  return [
    `${bannerTextEmoji('guide')} <b>Chi tiết đơn hàng</b>`,
    `Mã đơn: ${code(order.id)}`,
    `${bannerTextEmoji('stock')} Sản phẩm: ${escapeHtml(order.productName)}`,
    `${bannerTextEmoji('stock')} Số lượng: ${escapeHtml(order.quantity)}`,
    `${sloganTextEmoji('payment')} Tổng: ${escapeHtml(money(order.total, order.currency))}`,
    `${sloganTextEmoji('delivery')} Giao hàng: ${deliveryModeLabel(order.productSnapshot?.deliveryMode)}`,
    orderStatusLine(order.status),
    payment?.reference ? `${sloganTextEmoji('payment')} Nội dung CK: ${code(payment.reference)}` : '',
    order.expiresAt && order.status === 'pending_payment'
      ? `${uiTextEmoji('automation-247')} Giữ hàng đến: ${escapeHtml(new Date(order.expiresAt).toLocaleString('vi-VN'))}`
      : ''
  ].filter(Boolean).join('\n');
}

async function userOrdersView(user) {
  const contexts = await listOrdersForUser(user.id, { limit: 5 });
  if (!contexts.length) {
    return {
      text: `${bannerTextEmoji('guide')} Bạn chưa có đơn hàng nào.`,
      reply_markup: buildMainMenuKeyboard()
    };
  }

  const text = [
    `${uiTextEmoji('orders')} <b>Đơn hàng gần đây</b>`,
    'Chọn một đơn bên dưới để thanh toán, xem QR, hủy hoặc xem lại thông tin giao hàng.',
    '',
    ...contexts.map(({ order }) => [
      bold(order.productName),
      `Mã: ${code(order.id)}`,
      `${orderStatusLine(order.status)} · ${escapeHtml(money(order.total, order.currency))}`
    ].join('\n'))
  ].join('\n\n');

  const rows = contexts.map(({ order }) => [animatedKeyboardButton({
    text: `${formatOrderStatus(order.status).split(' ').slice(1).join(' ')} · ${String(order.productName || '').slice(0, 32)}`,
    callback_data: `order:${order.id}`
  }, 'order-status', orderStatusKeyboardCustomEmojiId(order.status))]);
  rows.push([animatedKeyboardButton({ text: 'Xem sản phẩm', callback_data: 'catalog:all' }, 'products')]);
  return { text, reply_markup: { inline_keyboard: rows } };
}

function customerFacingOrderError(error) {
  const message = String(error?.message || '');
  if (/not enough stock/i.test(message)) return 'Gói này vừa hết hàng. Vui lòng chọn gói khác hoặc liên hệ hỗ trợ.';
  if (/too many pending orders/i.test(message)) return 'Bạn đang có quá nhiều đơn chờ thanh toán. Hãy thanh toán hoặc hủy một đơn cũ trước.';
  if (/shop chưa mở bán|sales/i.test(message)) return 'Shop chưa mở nhận đơn. Vui lòng quay lại sau hoặc liên hệ hỗ trợ.';
  if (/product is not available/i.test(message)) return 'Gói này hiện không còn mở bán.';
  return 'Không thể tạo đơn lúc này. Vui lòng thử lại hoặc liên hệ hỗ trợ.';
}

async function handleTextMessage(message) {
  const chatId = message.chat.id;
  const text = String(message.text || '').trim();
  void ensureTelegramChatMenuButton(chatId)
    .catch((error) => console.warn(`[telegram] chat menu setup failed: ${error.message}`));
  const user = await upsertTelegramUser(message.from);
  const baseLimit = await consumeRateLimit(`tg:user:${user.telegramId}`, config.traffic.telegramUserPerMinute);
  if (!baseLimit.allowed) {
    await sendAnimatedTelegramMessage(
      chatId,
      `${uiTextEmoji('automation-247')} Thao tác quá nhanh. Thử lại sau ${baseLimit.retryAfterSeconds}s.`
    );
    return;
  }

  const startMatch = text.match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/i);
  if (startMatch) {
    const payload = String(startMatch[1] || '').trim();
    if (payload.startsWith('p_')) {
      const products = await listProducts();
      const product = findProduct(products, payload.slice(2));
      if (product) {
        await sendCustomTelegramMessage(chatId, productDetailMessage(product), productCustomEmojiCandidates(product), {
          reply_markup: buildProductDetailKeyboard(product)
        });
        return;
      }
    }
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
      await sendAnimatedTelegramMessage(
        chatId,
        `${uiTextEmoji('automation-247')} Tạo đơn quá nhanh. Thử lại sau ${buyLimit.retryAfterSeconds}s.`
      );
      return;
    }

    const [, sku, qtyRaw] = text.split(/\s+/);
    if (!sku) {
      await sendAnimatedTelegramMessage(chatId, usageMessage());
      return;
    }

    const products = await listProducts();
    const product = findProduct(products, sku);
    if (!product) {
      await sendAnimatedTelegramMessage(
        chatId,
        `${sloganTextEmoji('soldout')} Không tìm thấy gói sản phẩm này.`,
        { reply_markup: buildMainMenuKeyboard() }
      );
      return;
    }
    const quantity = normalizeOrderQuantity(qtyRaw || 1);
    await sendAnimatedTelegramMessage(chatId, confirmationMessage(product, quantity), {
      reply_markup: buildConfirmationKeyboard(product, quantity)
    });
    return;
  }

  await sendAnimatedTelegramMessage(chatId, unknownCommandMessage(), { reply_markup: buildMainMenuKeyboard() });
}

async function handleCallbackQuery(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  const data = String(callbackQuery.data || '');
  if (!chatId) return;

  const user = await upsertTelegramUser(callbackQuery.from);
  const products = await listProducts();
  const categories = uniqueSorted(products.map((product) => normalizePublicProduct(product).category));

  if (data.startsWith('soldout:')) {
    await trackTelegramClick(user, 'soldout', { sku: data.slice('soldout:'.length) });
    await answerCallbackQuery(callbackQuery.id, 'Gói này đang hết hàng. Chọn gói còn hàng hoặc quay lại danh mục.');
    return;
  }

  if (data.startsWith('brand_soldout:')) {
    const [, rawCategory, rawBrand] = data.split(':');
    const category = resolveCatalogPart(rawCategory, categories);
    const brands = uniqueSorted(products
      .filter((product) => product.category === category)
      .map((product) => product.brand));
    const brand = resolveCatalogPart(rawBrand, brands);
    await trackTelegramClick(user, 'brand_soldout', { category, brand });
    await answerCallbackQuery(
      callbackQuery.id,
      `${brand || 'Nhãn hàng này'} đang hết hàng. Chọn gói khác hoặc liên hệ admin để đặt trước.`
    );
    return;
  }

  await answerCallbackQuery(
    callbackQuery.id,
    data.startsWith('confirm:') ? 'Đang tạo đơn và giữ hàng...' : ''
  );

  if (data === 'start:menu') {
    await trackTelegramClick(user, 'menu');
    await presentCustomTelegramMessage(chatId, messageId, startPhotoCaptionPayload(), startCustomEmojiCandidates(), {
      reply_markup: buildMainMenuKeyboard(),
      _fallback_text: startPhotoCaptionFallbackPayload(),
      _fallback_parse_mode: 'HTML'
    });
    return;
  }

  if (await sendMenuAction(chatId, user, data, products, { track: true, messageId })) {
    return;
  }

  if (data.startsWith('cat:')) {
    const category = resolveCatalogPart(data.slice('cat:'.length), categories);
    if (!category) {
      await presentTelegramMessage(chatId, messageId, `${sloganTextEmoji('soldout')} Danh mục không còn tồn tại.`, {
        reply_markup: buildCategoryKeyboard(products)
      });
      return;
    }
    await trackTelegramClick(user, 'category', { category });
    await presentCustomTelegramMessage(
      chatId,
      messageId,
      brandMenuMessage(products, category),
      brandMenuCustomEmojiCandidates(products, category),
      { reply_markup: buildBrandKeyboard(products, category) }
    );
    return;
  }

  if (data.startsWith('brand:')) {
    const [, rawCategory, rawBrand] = data.split(':');
    const category = resolveCatalogPart(rawCategory, categories);
    const brands = uniqueSorted(products
      .filter((product) => product.category === category)
      .map((product) => product.brand));
    const brand = resolveCatalogPart(rawBrand, brands);
    const selected = products.filter((product) => product.category === category && product.brand === brand);
    if (!category || !brand || !selected.length) {
      await presentTelegramMessage(chatId, messageId, `${sloganTextEmoji('soldout')} Nhãn hàng này không còn tồn tại.`, {
        reply_markup: buildCategoryKeyboard(products)
      });
      return;
    }
    await trackTelegramClick(user, 'brand', { category, brand });
    await presentCustomTelegramMessage(
      chatId,
      messageId,
      brandPackagesMessage(products, category, brand),
      brandPackagesCustomEmojiCandidates(category, brand),
      { reply_markup: buildPackageKeyboard(selected) }
    );
    return;
  }

  if (data.startsWith('pkg:')) {
    const product = findProduct(products, data.slice('pkg:'.length));
    if (!product) {
      await presentTelegramMessage(chatId, messageId, `${sloganTextEmoji('soldout')} Gói sản phẩm này không còn tồn tại.`, {
        reply_markup: buildCategoryKeyboard(products)
      });
      return;
    }
    await trackTelegramClick(user, 'package', { sku: product.sku });
    await presentCustomTelegramMessage(
      chatId,
      messageId,
      productDetailMessage(product),
      productCustomEmojiCandidates(product),
      { reply_markup: buildProductDetailKeyboard(product) }
    );
    return;
  }

  if (data.startsWith('buy:')) {
    const [, productId, qtyRaw] = data.split(':');
    const product = findProduct(products, productId);
    if (!product) {
      await presentTelegramMessage(chatId, messageId, `${sloganTextEmoji('soldout')} Gói sản phẩm này không còn tồn tại.`, {
        reply_markup: buildCategoryKeyboard(products)
      });
      return;
    }
    const quantity = normalizeOrderQuantity(qtyRaw || 1);
    await trackTelegramClick(user, 'buy_review', { sku: product.sku, quantity });
    await presentTelegramMessage(chatId, messageId, confirmationMessage(product, quantity), {
      reply_markup: buildConfirmationKeyboard(product, quantity)
    });
    return;
  }

  if (data.startsWith('confirm:')) {
    const [, productId, qtyRaw] = data.split(':');
    const product = findProduct(products, productId);
    if (!product) {
      await presentTelegramMessage(chatId, messageId, `${sloganTextEmoji('soldout')} Gói sản phẩm này không còn tồn tại.`, {
        reply_markup: buildCategoryKeyboard(products)
      });
      return;
    }
    const quantity = normalizeOrderQuantity(qtyRaw || 1);
    const buyLimit = await consumeRateLimit(`tg:buy:${user.telegramId}`, config.traffic.telegramBuyPerMinute);
    if (!buyLimit.allowed) {
      await presentTelegramMessage(
        chatId,
        messageId,
        `${uiTextEmoji('automation-247')} Tạo đơn quá nhanh. Thử lại sau ${buyLimit.retryAfterSeconds}s.`,
        { reply_markup: buildConfirmationKeyboard(product, quantity) }
      );
      return;
    }

    await trackTelegramClick(user, 'buy_confirm', { sku: product.sku, quantity });
    try {
      const checkout = await createOrderForUser(user, product.id || product.sku, quantity, {
        idempotencyKey: `telegram:${user.id}:${chatId}:${messageId || callbackQuery.id}:${productKey(product)}:${quantity}`
      });
      await presentCustomTelegramMessage(
        chatId,
        messageId,
        orderMessage(checkout.order, checkout.payment),
        orderCustomEmojiCandidates(),
        { reply_markup: buildPaymentKeyboard(checkout.order, checkout.payment) }
      );
    } catch (error) {
      await presentTelegramMessage(chatId, messageId, `${sloganTextEmoji('soldout')} ${escapeHtml(customerFacingOrderError(error))}`, {
        reply_markup: buildProductDetailKeyboard(product)
      });
    }
    return;
  }

  if (data.startsWith('order:')) {
    try {
      const context = await getOrderCheckoutForUser(user.id, data.slice('order:'.length));
      await presentTelegramMessage(chatId, messageId, orderDetailMessage(context.order, context.payment), {
        reply_markup: buildPaymentKeyboard(context.order, context.payment)
      });
    } catch {
      await presentTelegramMessage(chatId, messageId, `${sloganTextEmoji('soldout')} Không tìm thấy đơn hàng này.`, {
        reply_markup: (await userOrdersView(user)).reply_markup
      });
    }
    return;
  }

  if (data.startsWith('cancel:')) {
    try {
      const context = await getOrderCheckoutForUser(user.id, data.slice('cancel:'.length));
      if (context.order.status !== 'pending_payment') {
        await presentTelegramMessage(chatId, messageId, orderDetailMessage(context.order, context.payment), {
          reply_markup: buildPaymentKeyboard(context.order, context.payment)
        });
        return;
      }
      await presentTelegramMessage(
        chatId,
        messageId,
        `${sloganTextEmoji('soldout')} <b>Xác nhận hủy đơn</b>\n\n${escapeHtml(context.order.productName)}\nMã đơn: ${code(context.order.id)}\n\nHủy đơn sẽ trả hàng về kho. Khoản chuyển đến sau khi hủy sẽ cần admin kiểm tra thủ công.`,
        { reply_markup: buildCancelConfirmationKeyboard(context.order) }
      );
    } catch {
      await presentTelegramMessage(chatId, messageId, `${sloganTextEmoji('soldout')} Không tìm thấy đơn hàng này.`, {
        reply_markup: buildMainMenuKeyboard()
      });
    }
    return;
  }

  if (data.startsWith('cancel_yes:')) {
    try {
      const context = await cancelOrderForUser(user.id, data.slice('cancel_yes:'.length));
      await trackTelegramClick(user, 'order_cancel', { orderId: context.order.id });
      await presentTelegramMessage(
        chatId,
        messageId,
        `${bannerTextEmoji('checkin')} Đơn ${code(context.order.id)} đã được ${context.order.status === 'expired' ? 'đóng do hết hạn' : 'hủy'} và hàng đã trả về kho.`,
        { reply_markup: buildPaymentKeyboard(context.order, context.payment) }
      );
    } catch (error) {
      await presentTelegramMessage(chatId, messageId, `${sloganTextEmoji('soldout')} ${escapeHtml(
        /only pending/i.test(error.message)
          ? 'Đơn đã được thanh toán hoặc chuyển trạng thái nên không thể hủy tự động. Vui lòng liên hệ hỗ trợ.'
          : 'Không thể hủy đơn này.'
      )}`, { reply_markup: buildMainMenuKeyboard() });
    }
    return;
  }

  if (data.startsWith('delivery:')) {
    const orderId = data.slice('delivery:'.length);
    try {
      const context = await getOrderCheckoutForUser(user.id, orderId);
      if (context.order.status !== 'delivered') throw new Error('Delivery is not ready');
      const delivery = await getDeliveryForOrder(orderId);
      await sendDeliveryPayload(
        chatId,
        delivery.order,
        delivery.deliverySecrets,
        buildPaymentKeyboard(context.order, context.payment)
      );
    } catch {
      await presentTelegramMessage(chatId, messageId, `${sloganTextEmoji('soldout')} Thông tin giao hàng chưa sẵn sàng.`, {
        reply_markup: buildMainMenuKeyboard()
      });
    }
    return;
  }

  await presentTelegramMessage(chatId, messageId, unknownCommandMessage(), {
    reply_markup: buildMainMenuKeyboard()
  });
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

  const context = await getOrderCheckoutForUser(order.userId, order.id);
  await sendDeliveryPayload(
    order.telegramId,
    order,
    deliverySecrets,
    buildPaymentKeyboard(context.order, context.payment)
  );
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
