export const DEFAULT_REQUIRED_EMOJI_PACKS = ['banner', 'ui', 'slogan'];

export const BANNER_EMOJI_REQUIRED_KEYS = [
  'kaito',
  'welcome',
  'products',
  'orders',
  'support',
  'account',
  'checkin',
  'minigame',
  'vip',
  'hot',
  'new',
  'sale',
  'auto247',
  'trusted',
  'delivery',
  'payment',
  'ai',
  'mmo',
  'instant',
  'secure',
  'guide',
  'contact',
  'stock',
  'soldout',
  'review',
  'refund',
  'combo',
  'member',
  'news',
  'event',
  'policy',
  'logout'
];

export const DEFAULT_REQUIRED_KEYS_BY_PACK = {
  banner: BANNER_EMOJI_REQUIRED_KEYS,
  ui: ['products', 'topup', 'account', 'orders', 'language', 'support'],
  slogan: ['welcome', 'catalog', 'payment', 'delivery', 'support', 'soldout']
};

const PACK_NAMES = ['brand', 'ui', 'slogan', 'sloganTile', 'banner', 'news', 'flame', 'game', 'robo', 'retro'];

export function normalizeEmojiKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function parseRequiredEmojiPacks(value) {
  const text = String(value || '').trim();
  if (!text) return [...DEFAULT_REQUIRED_EMOJI_PACKS];
  return [...new Set(text.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

export function buildTelegramEmojiRegistry({ maps = {}, files = {} } = {}) {
  const packs = {};
  for (const name of PACK_NAMES) {
    const map = maps[name] || {};
    packs[name] = {
      name,
      file: files[name] || '',
      map,
      loaded: mapHasCustomEmojiIds(map),
      customEmojiIdCount: collectCustomEmojiIdsFromMap(map).length
    };
  }
  return { packs };
}

export function resolveTelegramCustomEmojiId(registry, { pack, key } = {}) {
  const packName = String(pack || '').trim().toLowerCase();
  const rawKey = String(key || '').trim();
  if (!packName || !rawKey) return '';

  const map = registry?.packs?.[packName]?.map || {};
  if (packName === 'robo') {
    return map.customEmojiIdsByAlias?.[normalizeEmojiKey(rawKey)]?.[0]
      || map.customEmojiIdsByEmoji?.[rawKey]
      || '';
  }
  if (packName === 'retro') {
    return map.customEmojiIdsByCharacter?.[rawKey.toUpperCase()] || '';
  }

  const normalized = normalizeEmojiKey(rawKey);
  const byFile = map.customEmojiIdsByFile || {};
  for (const name of fileCandidates(rawKey, normalized)) {
    if (byFile[name]) return byFile[name];
  }

  const byBrand = map.customEmojiIdsByBrand || {};
  return byBrand[normalized]?.[0] || '';
}

export function customEmojiCandidateFromRegistry(registry, { pack, key, fallback } = {}) {
  return {
    emoji: String(fallback || ''),
    customEmojiId: resolveTelegramCustomEmojiId(registry, { pack, key }),
    pack: String(pack || ''),
    key: String(key || '')
  };
}

export function summarizeTelegramEmojiRegistry(registry, options = {}) {
  const requiredPacks = options.requiredPacks || [...DEFAULT_REQUIRED_EMOJI_PACKS];
  const requiredKeysByPack = options.requiredKeysByPack || DEFAULT_REQUIRED_KEYS_BY_PACK;
  const packs = {};

  for (const pack of requiredPacks) {
    const state = registry?.packs?.[pack] || { map: {}, loaded: false, customEmojiIdCount: 0, file: '' };
    const requiredKeys = requiredKeysByPack[pack] || [];
    const missingRequiredKeys = requiredKeys.filter((key) => !resolveTelegramCustomEmojiId(registry, { pack, key }));
    packs[pack] = {
      file: state.file || '',
      loaded: Boolean(state.loaded),
      customEmojiIdCount: state.customEmojiIdCount || 0,
      requiredKeys,
      availableRequiredKeys: requiredKeys.length - missingRequiredKeys.length,
      missingRequiredKeys
    };
  }

  return {
    ready: Object.values(packs).every((pack) => pack.loaded && pack.missingRequiredKeys.length === 0),
    requiredPacks,
    packs
  };
}

export function collectCustomEmojiIdsFromRegistry(registry, packs = PACK_NAMES) {
  const ids = [];
  for (const pack of packs) {
    ids.push(...collectCustomEmojiIdsFromMap(registry?.packs?.[pack]?.map || {}));
  }
  return [...new Set(ids.filter(Boolean))];
}

function mapHasCustomEmojiIds(map) {
  return collectCustomEmojiIdsFromMap(map).length > 0;
}

function collectCustomEmojiIdsFromMap(map) {
  const ids = [];
  for (const value of Object.values(map.customEmojiIdsByFile || {})) {
    if (value) ids.push(value);
  }
  for (const list of Object.values(map.customEmojiIdsByBrand || {})) {
    if (Array.isArray(list)) ids.push(...list.filter(Boolean));
  }
  for (const list of Object.values(map.customEmojiIdsByAlias || {})) {
    if (Array.isArray(list)) ids.push(...list.filter(Boolean));
  }
  for (const value of Object.values(map.customEmojiIdsByEmoji || {})) {
    if (value) ids.push(value);
  }
  for (const value of Object.values(map.customEmojiIdsByCharacter || {})) {
    if (value) ids.push(value);
  }
  for (const slogan of Object.values(map.slogans || {})) {
    for (const tile of slogan.tiles || []) {
      if (tile?.customEmojiId) ids.push(tile.customEmojiId);
    }
  }
  return [...new Set(ids)];
}

function fileCandidates(rawKey, normalized) {
  const names = [...new Set([rawKey, normalized].filter(Boolean))];
  return names.flatMap((name) => [
    `${name}.webm`,
    `${name}.png`,
    `${name}.webp`,
    `${name}.tgs`
  ]);
}
