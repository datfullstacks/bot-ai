import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../src/config.js';
import { normalizeEmojiKey } from '../src/telegramEmojiRegistry.js';

export const NEWS_EMOJI_PACK_NAME = 'NewsEmoji';
export const NEWS_EMOJI_MINIMUM_ID_COUNT = 100;
export const NEWS_EMOJI_SOURCE_URL = `https://t.me/addemoji/${NEWS_EMOJI_PACK_NAME}`;

export const NEWS_EMOJI_ALIASES_BY_INDEX = Object.freeze([
  'eyes',
  'smile',
  'lightning',
  'comet',
  'shopping-bag',
  'no-entry',
  'prohibited',
  'exclamation',
  'double-exclamation',
  'question-exclamation',
  'question',
  'warning',
  'warning-alt',
  'globe',
  'chat',
  'thought',
  'question-alt',
  'chart',
  'up',
  'down',
  'candle',
  'chart-up',
  'chart-down',
  'check',
  'cross',
  'cool',
  'bell',
  'disguise',
  'clown',
  'lips',
  'pin',
  'dollar',
  'money-fly-1',
  'money-fly-2',
  'money-fly-3',
  'money-fly-4',
  'money-fly-5',
  'exchange',
  'play',
  'red',
  'green',
  'arrow-right',
  'fire',
  'boom',
  'studio-microphone',
  'microphone',
  'megaphone',
  'quiet',
  'thumbs-down',
  'speaking',
  'search',
  'shield',
  'link',
  'desktop',
  'copyright',
  'info',
  'thumbs-up',
  'play-alt',
  'pause',
  'hundred',
  'refresh',
  'top',
  'new',
  'soon',
  'location',
  'plus',
  'diamond',
  'star',
  'sparkle',
  'crown',
  'trash',
  'bookmark',
  'mail',
  'lock',
  'surprised',
  'paperclip',
  'settings',
  'game',
  'speaker',
  'hourglass',
  'download',
  'sun',
  'rain',
  'moon',
  'snow',
  'rainbow',
  'water',
  'calendar',
  'idea',
  'gold',
  'silver',
  'bronze',
  'music',
  'free',
  'edit',
  'alarm',
  'shopping-bag-alt',
  'home',
  'flag',
  'party'
]);

export const NEWS_EMOJI_EXPECTED_EMOJI_BY_INDEX = Object.freeze([
  '👀',
  '🙂',
  '⚡️',
  '☄️',
  '🛍',
  '⛔️',
  '🚫',
  '❗️',
  '‼️',
  '⁉️',
  '❓',
  '⚠️',
  '⚠️',
  '🌐',
  '💬',
  '💭',
  '❓',
  '📊',
  '🔼',
  '🔽',
  '🕯',
  '📈',
  '📉',
  '✔️',
  '❌',
  '🆒',
  '🔔',
  '🥸',
  '🤡',
  '🫦',
  '📌',
  '💵',
  '💸',
  '💸',
  '💸',
  '💸',
  '💸',
  '💱',
  '▶️',
  '🔴',
  '🟢',
  '➡️',
  '🔥',
  '💥',
  '🎙',
  '🎤',
  '📣',
  '🤫',
  '👎',
  '🗣️',
  '🔍',
  '🛡',
  '🔗',
  '🖥',
  '©',
  'ℹ️',
  '👍',
  '▶️',
  '⏸',
  '💯',
  '🔄',
  '🔝',
  '🆕',
  '🔜',
  '📍',
  '➕',
  '💎',
  '⭐️',
  '✨',
  '👑',
  '🗑',
  '🔖',
  '✉️',
  '🔒',
  '😮',
  '📎',
  '⚙️',
  '🎮',
  '🔈',
  '⌛',
  '⬇️',
  '☀️',
  '🌧',
  '🌛',
  '❄️',
  '🌈',
  '💧',
  '🗓',
  '💡',
  '🥇',
  '🥈',
  '🥉',
  '🎵',
  '🆓',
  '✏️',
  '🚨',
  '🛍',
  '🏠',
  '🚩',
  '🎉'
]);

export const NEWS_EMOJI_COMPATIBILITY_ALIASES = Object.freeze({
  fast: 'comet',
  newsflash: 'lightning',
  auto247: 'refresh',
  tracking: 'search',
  adminchat: 'chat',
  adminshield: 'shield',
  adminboom: 'boom',
  adminfire: 'fire',
  adminhundred: 'hundred'
});

export function buildNewsEmojiMap(stickerSet, options = {}) {
  if (!stickerSet || !Array.isArray(stickerSet.stickers)) {
    throw new Error('Telegram getStickerSet did not return a stickers array.');
  }

  const minimumIdCount = nonNegativeInteger(
    options.minimumIdCount,
    NEWS_EMOJI_MINIMUM_ID_COUNT
  );
  validateDefinitionTable();
  const seenAliases = new Set();
  const stickers = stickerSet.stickers.map((sticker, index) => {
    const customEmojiId = String(sticker?.custom_emoji_id || '').trim();
    if (!customEmojiId) {
      throw new Error(`NewsEmoji sticker at index ${index} is missing custom_emoji_id.`);
    }
    const expectedEmoji = NEWS_EMOJI_EXPECTED_EMOJI_BY_INDEX[index];
    const returnedEmoji = String(sticker?.emoji || '');
    if (expectedEmoji !== undefined && returnedEmoji !== expectedEmoji) {
      throw new Error(
        `NewsEmoji sticker order changed at index ${index}: expected ${JSON.stringify(expectedEmoji)}, received ${JSON.stringify(returnedEmoji)}.`
      );
    }

    const alias = uniqueAlias(aliasForIndex(index), seenAliases, index);
    return {
      index,
      alias,
      aliases: [],
      emoji: returnedEmoji,
      customEmojiId,
      fileId: String(sticker?.file_id || ''),
      fileUniqueId: String(sticker?.file_unique_id || ''),
      isAnimated: Boolean(sticker?.is_animated),
      isVideo: Boolean(sticker?.is_video)
    };
  });

  const uniqueIds = new Set(stickers.map((sticker) => sticker.customEmojiId));
  if (uniqueIds.size < minimumIdCount) {
    throw new Error(
      `NewsEmoji requires at least ${minimumIdCount} unique custom emoji IDs; received ${uniqueIds.size}.`
    );
  }

  const byCanonicalAlias = new Map(stickers.map((sticker) => [sticker.alias, sticker]));
  for (const [compatibilityAlias, canonicalAlias] of Object.entries(NEWS_EMOJI_COMPATIBILITY_ALIASES)) {
    const sticker = byCanonicalAlias.get(canonicalAlias);
    if (!sticker) {
      throw new Error(`NewsEmoji compatibility alias ${compatibilityAlias} targets missing alias ${canonicalAlias}.`);
    }
    sticker.aliases.push(compatibilityAlias);
  }

  const customEmojiIdsByAlias = {};
  const customEmojiIdsByBrand = {};
  const fileIdsByAlias = {};
  const fileIdsByBrand = {};
  const customEmojiIdsByEmoji = {};

  for (const sticker of stickers) {
    for (const alias of [sticker.alias, ...sticker.aliases]) {
      customEmojiIdsByAlias[alias] = [sticker.customEmojiId];
      customEmojiIdsByBrand[normalizeEmojiKey(alias)] = [sticker.customEmojiId];
      if (sticker.fileId) {
        fileIdsByAlias[alias] = [sticker.fileId];
        fileIdsByBrand[normalizeEmojiKey(alias)] = [sticker.fileId];
      }
    }
    if (sticker.emoji && !customEmojiIdsByEmoji[sticker.emoji]) {
      customEmojiIdsByEmoji[sticker.emoji] = sticker.customEmojiId;
    }
  }

  return {
    packName: stickerSet.name || options.packName || NEWS_EMOJI_PACK_NAME,
    title: stickerSet.title || 'News Emoji',
    stickerType: stickerSet.sticker_type || 'custom_emoji',
    stickerFormat: inferStickerFormat(stickers),
    source: options.sourceUrl || NEWS_EMOJI_SOURCE_URL,
    generatedAt: generatedAt(options),
    minimumRequiredCustomEmojiIds: NEWS_EMOJI_MINIMUM_ID_COUNT,
    customEmojiIdsByEmoji,
    customEmojiIdsByAlias,
    customEmojiIdsByBrand,
    fileIdsByAlias,
    fileIdsByBrand,
    stickers
  };
}

function validateDefinitionTable() {
  if (NEWS_EMOJI_ALIASES_BY_INDEX.length !== NEWS_EMOJI_MINIMUM_ID_COUNT) {
    throw new Error(
      `NewsEmoji alias table must contain ${NEWS_EMOJI_MINIMUM_ID_COUNT} entries; received ${NEWS_EMOJI_ALIASES_BY_INDEX.length}.`
    );
  }
  if (NEWS_EMOJI_EXPECTED_EMOJI_BY_INDEX.length !== NEWS_EMOJI_ALIASES_BY_INDEX.length) {
    throw new Error('NewsEmoji alias and expected emoji tables must have the same length.');
  }
}

export async function syncNewsEmojiPack(options = {}) {
  validateDefinitionTable();
  const packName = String(options.packName || NEWS_EMOJI_PACK_NAME).trim() || NEWS_EMOJI_PACK_NAME;
  const outputPath = options.outputPath === undefined
    ? config.telegram.newsEmojiMapFile
    : options.outputPath;

  if (options.dryRun) {
    return {
      dryRun: true,
      packName,
      outputPath: outputPath || '',
      source: options.sourceUrl || `https://t.me/addemoji/${packName}`,
      minimumIdCount: NEWS_EMOJI_MINIMUM_ID_COUNT,
      aliasesByIndex: [...NEWS_EMOJI_ALIASES_BY_INDEX],
      compatibilityAliases: { ...NEWS_EMOJI_COMPATIBILITY_ALIASES }
    };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is not available in this Node.js runtime.');
  }

  const token = required(options.token ?? config.telegram.token, 'TELEGRAM_BOT_TOKEN');
  const stickerSet = await telegramJson({
    token,
    method: 'getStickerSet',
    payload: { name: packName },
    fetchImpl
  });
  const result = buildNewsEmojiMap(stickerSet, {
    packName,
    sourceUrl: options.sourceUrl || `https://t.me/addemoji/${packName}`,
    minimumIdCount: options.minimumIdCount,
    generatedAt: options.generatedAt,
    now: options.now
  });

  if (outputPath) await writeJson(outputPath, result);
  return result;
}

function aliasForIndex(index) {
  return NEWS_EMOJI_ALIASES_BY_INDEX[index] || `news-${String(index).padStart(3, '0')}`;
}

function uniqueAlias(value, seenAliases, index) {
  const base = String(value || '').trim() || `news-${String(index).padStart(3, '0')}`;
  let alias = base;
  let suffix = 2;
  while (seenAliases.has(normalizeEmojiKey(alias))) {
    alias = `${base}-${suffix}`;
    suffix += 1;
  }
  seenAliases.add(normalizeEmojiKey(alias));
  return alias;
}

async function telegramJson({ token, method, payload, fetchImpl }) {
  const response = await fetchImpl(apiUrl(token, method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = { ok: false, description: 'Telegram returned a non-JSON response.' };
  }
  if (!response.ok || !data.ok) {
    throw new Error(
      `Telegram ${method} failed: ${response.status || 'unknown'} ${data.description || 'unknown error'}`
    );
  }
  return data.result;
}

function inferStickerFormat(stickers) {
  if (stickers.some((sticker) => sticker.isVideo)) return 'video';
  if (stickers.some((sticker) => sticker.isAnimated)) return 'animated';
  return 'static';
}

function apiUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

function required(value, envName) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing ${envName}.`);
  }
  return String(value);
}

function nonNegativeInteger(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error('minimumIdCount must be a non-negative integer.');
  }
  return number;
}

function generatedAt(options) {
  if (options.generatedAt) return new Date(options.generatedAt).toISOString();
  if (typeof options.now === 'function') return new Date(options.now()).toISOString();
  return new Date().toISOString();
}

async function writeJson(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  const args = {
    packName: NEWS_EMOJI_PACK_NAME,
    outputPath: config.telegram.newsEmojiMapFile,
    token: config.telegram.token,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--name') args.packName = argv[++index];
    else if (arg === '--output') args.outputPath = resolve(argv[++index]);
    else if (arg === '--token') args.token = argv[++index];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function helpText() {
  return [
    'Usage:',
    '  npm.cmd run telegram:sync-news-emojis',
    '  npm.cmd run telegram:sync-news-emojis -- --dry-run',
    '',
    'The command loads TELEGRAM_BOT_TOKEN from .env through src/config.js.',
    '',
    'Options:',
    '  --name <set_name>    Defaults to NewsEmoji',
    '  --output <path>      Defaults to TELEGRAM_NEWS_EMOJI_MAP_FILE',
    '  --token <token>      Override TELEGRAM_BOT_TOKEN',
    '  --dry-run            Print the deterministic alias plan without Telegram or file writes'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }

  const result = await syncNewsEmojiPack(args);
  if (result.dryRun) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(JSON.stringify({
    ok: true,
    packName: result.packName,
    outputPath: args.outputPath,
    stickers: result.stickers.length,
    uniqueCustomEmojiIds: new Set(result.stickers.map((sticker) => sticker.customEmojiId)).size,
    aliases: Object.keys(result.customEmojiIdsByAlias).length
  }, null, 2));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
