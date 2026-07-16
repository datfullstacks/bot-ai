export const DEFAULT_REQUIRED_EMOJI_PACKS = [
  'brand',
  'ui',
  'slogan',
  'sloganTile',
  'banner',
  'news',
  'flame',
  'game',
  'robo',
  'retro'
];

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

export const UI_EMOJI_REQUIRED_KEYS = [
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

export const NEWS_EMOJI_REQUIRED_KEYS = [
  'fast',
  'auto247',
  'tracking',
  'adminchat',
  'adminshield',
  'adminboom',
  'adminfire'
];

export const ROBO_EMOJI_REQUIRED_KEYS = [
  'wave',
  'please',
  'party',
  'money',
  'ok',
  'hundred',
  'salute',
  'plus'
];

export const RETRO_EMOJI_REQUIRED_KEYS = ['K', 'A', 'I', 'T', 'O', 'D', 'S', 'H', 'P'];

export const DEFAULT_REQUIRED_KEYS_BY_PACK = {
  brand: [],
  ui: UI_EMOJI_REQUIRED_KEYS,
  sloganTile: ['daily_update'],
  banner: BANNER_EMOJI_REQUIRED_KEYS,
  news: NEWS_EMOJI_REQUIRED_KEYS,
  flame: ['moneyface'],
  game: ['products'],
  robo: ROBO_EMOJI_REQUIRED_KEYS,
  retro: RETRO_EMOJI_REQUIRED_KEYS,
  slogan: ['welcome', 'catalog', 'checkout', 'payment', 'delivery', 'support', 'soldout']
};

export const SLOGAN_TILE_REQUIRED_COUNTS = Object.freeze({
  daily_update: 6
});

const PACK_NAMES = ['brand', 'ui', 'slogan', 'sloganTile', 'banner', 'news', 'flame', 'game', 'robo', 'retro'];
const PACK_NAME_BY_NORMALIZED_NAME = new Map(PACK_NAMES.map((name) => [normalizeEmojiKey(name), name]));
const LEGACY_REQUIRED_PACKS = new Set(['banner', 'ui', 'slogan']);

export function normalizeEmojiKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function parseRequiredEmojiPacks(value) {
  const text = String(value || '').trim();
  if (!text) return [...DEFAULT_REQUIRED_EMOJI_PACKS];

  const configuredPacks = [...new Set(text
    .split(',')
    .map(canonicalEmojiPackName)
    .filter(Boolean))];
  const legacyConfig = configuredPacks.length === LEGACY_REQUIRED_PACKS.size
    && configuredPacks.every((pack) => LEGACY_REQUIRED_PACKS.has(pack));
  if (legacyConfig) return [...DEFAULT_REQUIRED_EMOJI_PACKS];

  return [...new Set([...DEFAULT_REQUIRED_EMOJI_PACKS, ...configuredPacks])];
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
  const packName = canonicalEmojiPackName(pack);
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
  if (packName === 'sloganTile') {
    const normalized = normalizeEmojiKey(rawKey);
    const slogan = Object.entries(map.slogans || {})
      .find(([name]) => normalizeEmojiKey(name) === normalized)?.[1];
    const sloganTileId = slogan?.tiles?.find((tile) => tile?.customEmojiId)?.customEmojiId;
    if (sloganTileId) return sloganTileId;
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
  const requiredPacks = [...new Set((options.requiredPacks || DEFAULT_REQUIRED_EMOJI_PACKS)
    .map(canonicalEmojiPackName)
    .filter(Boolean))];
  const requiredKeysByPack = options.requiredKeysByPack || DEFAULT_REQUIRED_KEYS_BY_PACK;
  const packs = {};

  for (const pack of requiredPacks) {
    const state = registry?.packs?.[pack] || { map: {}, loaded: false, customEmojiIdCount: 0, file: '' };
    const requiredKeys = requiredKeysByPack[pack] || [];
    const missingRequiredKeys = requiredKeys.filter((key) => !hasRequiredEmojiKey(registry, pack, key));
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
  for (const rawPack of packs) {
    const pack = canonicalEmojiPackName(rawPack);
    ids.push(...collectCustomEmojiIdsFromMap(registry?.packs?.[pack]?.map || {}));
  }
  return [...new Set(ids.filter(Boolean))];
}

function canonicalEmojiPackName(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return PACK_NAME_BY_NORMALIZED_NAME.get(normalizeEmojiKey(text)) || text.toLowerCase();
}

function hasRequiredEmojiKey(registry, pack, key) {
  if (pack !== 'sloganTile') {
    return Boolean(resolveTelegramCustomEmojiId(registry, { pack, key }));
  }

  const map = registry?.packs?.sloganTile?.map || {};
  const normalized = normalizeEmojiKey(key);
  const slogan = Object.entries(map.slogans || {})
    .find(([name]) => normalizeEmojiKey(name) === normalized)?.[1];
  const requiredCount = Object.entries(SLOGAN_TILE_REQUIRED_COUNTS)
    .find(([name]) => normalizeEmojiKey(name) === normalized)?.[1] || 1;
  const availableCount = (slogan?.tiles || [])
    .filter((tile) => Boolean(tile?.customEmojiId))
    .length;
  return availableCount >= requiredCount;
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
