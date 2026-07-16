import { existsSync, readFileSync } from 'node:fs';
import { config } from './config.js';
import {
  buildTelegramEmojiRegistry,
  normalizeEmojiKey,
  resolveTelegramCustomEmojiId
} from './telegramEmojiRegistry.js';

export const UI_ICONS = {
  catalog: '▣',
  products: '🛒',
  topup: '💳',
  account: '👤',
  orders: '📦',
  language: '🌍',
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
  news: '📰',
  events: '🎮',
  policy: '🛡️',
  logout: '⏻',
  close: '✖',
  refresh: '🔄',
  back: '↩',
  ai: '✦',
  design: '✎',
  work: '☁',
  social: '◇'
};

function loadCustomEmojiMap(filePath) {
  if (!filePath || !existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`[telegram] custom emoji map skipped: ${error.message}`);
    return {};
  }
}

export const customEmojiMap = loadCustomEmojiMap(config.telegram.customEmojiMapFile);
export const uiEmojiMap = loadCustomEmojiMap(config.telegram.uiEmojiMapFile);
export const sloganEmojiMap = loadCustomEmojiMap(config.telegram.sloganEmojiMapFile);
export const sloganTileEmojiMap = loadCustomEmojiMap(config.telegram.sloganTileEmojiMapFile);
export const bannerEmojiMap = loadCustomEmojiMap(config.telegram.bannerEmojiMapFile);
export const newsEmojiMap = loadCustomEmojiMap(config.telegram.newsEmojiMapFile);
export const flameEmojiMap = loadCustomEmojiMap(config.telegram.flameEmojiMapFile);
export const gameEmojiMap = loadCustomEmojiMap(config.telegram.gameEmojiMapFile);
export const roboEmojiMap = loadCustomEmojiMap(config.telegram.roboEmojiMapFile);
export const retroFontEmojiMap = loadCustomEmojiMap(config.telegram.retroFontEmojiMapFile);
export const telegramEmojiRegistry = buildTelegramEmojiRegistry({
  maps: {
    brand: customEmojiMap,
    ui: uiEmojiMap,
    slogan: sloganEmojiMap,
    sloganTile: sloganTileEmojiMap,
    banner: bannerEmojiMap,
    news: newsEmojiMap,
    flame: flameEmojiMap,
    game: gameEmojiMap,
    robo: roboEmojiMap,
    retro: retroFontEmojiMap
  },
  files: {
    brand: config.telegram.customEmojiMapFile,
    ui: config.telegram.uiEmojiMapFile,
    slogan: config.telegram.sloganEmojiMapFile,
    sloganTile: config.telegram.sloganTileEmojiMapFile,
    banner: config.telegram.bannerEmojiMapFile,
    news: config.telegram.newsEmojiMapFile,
    flame: config.telegram.flameEmojiMapFile,
    game: config.telegram.gameEmojiMapFile,
    robo: config.telegram.roboEmojiMapFile,
    retro: config.telegram.retroFontEmojiMapFile
  }
});

export function loadRegularStickerMap() {
  const filePath = config.telegram.stickerMapFile;
  if (!filePath || !existsSync(filePath)) return {};
  try {
    const payload = JSON.parse(readFileSync(filePath, 'utf8'));
    return payload.stickerType === 'regular' ? payload : {};
  } catch (error) {
    console.warn(`[telegram] regular sticker map skipped: ${error.message}`);
    return {};
  }
}

export function brandCustomEmojiId(brand) {
  const name = String(brand || '').trim();
  if (!name) return '';

  const byFile = customEmojiMap.customEmojiIdsByFile || {};
  const videoFile = byFile[`${name}.webm`];
  if (videoFile) return videoFile;

  const directFile = byFile[`${name}.png`] || byFile[`${name}.webp`];
  if (directFile) return directFile;

  const brandFile = byFile[`${name} Brand.png`] || byFile[`${name} Brand.webp`];
  if (brandFile) return brandFile;

  const byBrand = customEmojiMap.customEmojiIdsByBrand || {};
  return byBrand[normalizeEmojiKey(name)]?.[0] || '';
}

export function uiCustomEmojiId(key) {
  return resolveTelegramCustomEmojiId(telegramEmojiRegistry, { pack: 'ui', key });
}

export function sloganCustomEmojiId(key) {
  return resolveTelegramCustomEmojiId(telegramEmojiRegistry, { pack: 'slogan', key });
}

export function bannerCustomEmojiId(key) {
  return resolveTelegramCustomEmojiId(telegramEmojiRegistry, { pack: 'banner', key });
}

export function newsCustomEmojiId(key) {
  return resolveTelegramCustomEmojiId(telegramEmojiRegistry, { pack: 'news', key });
}

export function flameCustomEmojiId(key) {
  return resolveTelegramCustomEmojiId(telegramEmojiRegistry, { pack: 'flame', key });
}

export function gameCustomEmojiId(key) {
  return resolveTelegramCustomEmojiId(telegramEmojiRegistry, { pack: 'game', key });
}

export function sloganTileCustomEmojiCandidates(key) {
  const slogan = sloganTileDefinition(key);
  return (slogan.tiles || []).map((tile) => ({
    emoji: String(tile.emoji || slogan.emoji || ''),
    customEmojiId: String(tile.customEmojiId || ''),
    pack: 'sloganTile',
    key: tile.key || key
  })).filter((candidate) => candidate.emoji && candidate.customEmojiId);
}

export function sloganTilePlaceholder(key, fallbackText = '') {
  const slogan = sloganTileDefinition(key);
  return slogan.placeholder || (slogan.tiles || []).map((tile) => tile.emoji || slogan.emoji || '').join('') || fallbackText;
}

export function sloganTileFallbackText(key, fallbackText = '') {
  const slogan = sloganTileDefinition(key);
  return slogan.fallbackText || fallbackText;
}

export function roboCustomEmojiId(aliasOrEmoji) {
  return resolveTelegramCustomEmojiId(telegramEmojiRegistry, { pack: 'robo', key: aliasOrEmoji });
}

export function retroCustomEmojiId(character) {
  return retroFontEmojiMap.customEmojiIdsByCharacter?.[String(character || '').toUpperCase()] || '';
}

export function retroFontEmoji(character, fallbackEmoji = '🔤') {
  return retroFontEmojiMap.customEmojiAltByCharacter?.[String(character || '').toUpperCase()]
    || fallbackEmoji
    || String(character || '');
}

export function sloganEmoji(_key, fallbackEmoji = '✨') {
  return String(fallbackEmoji || '✨');
}

export function roboEmoji(_aliasOrEmoji, fallbackEmoji = '') {
  return String(fallbackEmoji || _aliasOrEmoji || '😊');
}

export function uiEmoji(key, fallbackEmoji = '') {
  return String(fallbackEmoji || UI_ICONS[key] || '•');
}

function sloganTileDefinition(key) {
  const rawKey = String(key || '').trim();
  const normalized = normalizeEmojiKey(rawKey);
  return sloganTileEmojiMap.slogans?.[rawKey]
    || sloganTileEmojiMap.slogans?.[normalized]
    || {};
}

export function brandStickerFileId(brand) {
  if (customEmojiMap.stickerType === 'custom_emoji') return '';

  const name = String(brand || '').trim();
  if (!name) return '';

  const byFile = customEmojiMap.fileIdsByFile || {};
  const videoFile = byFile[`${name}.webm`];
  if (videoFile) return videoFile;

  const directFile = byFile[`${name}.png`] || byFile[`${name}.webp`];
  if (directFile) return directFile;

  const brandVideoFile = byFile[`${name} Brand.webm`];
  if (brandVideoFile) return brandVideoFile;

  const brandFile = byFile[`${name} Brand.png`] || byFile[`${name} Brand.webp`];
  if (brandFile) return brandFile;

  const byBrand = customEmojiMap.fileIdsByBrand || {};
  return byBrand[normalizeEmojiKey(name)]?.[0] || '';
}

export function motionStickerFileId(preferredBrands = []) {
  if (customEmojiMap.stickerType === 'custom_emoji') return '';

  const byBrand = customEmojiMap.fileIdsByBrand || {};
  for (const brand of preferredBrands) {
    const sticker = byBrand[normalizeEmojiKey(brand)]?.[0];
    if (sticker) return sticker;
  }

  const byFile = customEmojiMap.fileIdsByFile || {};
  return Object.values(byFile).find(Boolean) || '';
}
