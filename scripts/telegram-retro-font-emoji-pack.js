import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PACK_NAME = 'RetroFontEmoji';
const DEFAULT_OUTPUT_PATH = resolve(process.cwd(), 'data', 'telegram-retro-font-emoji-map.json');
const DEFAULT_SOURCE_URL = 'https://t.me/addemoji/RetroFontEmoji';
const RETRO_FONT_ALT_EMOJI = '\u{1F524}';

export const RETRO_FONT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const DIGIT_EMOJI_TO_CHARACTER = Object.freeze({
  '0\uFE0F\u20E3': '0',
  '1\uFE0F\u20E3': '1',
  '2\uFE0F\u20E3': '2',
  '3\uFE0F\u20E3': '3',
  '4\uFE0F\u20E3': '4',
  '5\uFE0F\u20E3': '5',
  '6\uFE0F\u20E3': '6',
  '7\uFE0F\u20E3': '7',
  '8\uFE0F\u20E3': '8',
  '9\uFE0F\u20E3': '9'
});

export function buildRetroFontEmojiMap(stickerSet, options = {}) {
  if (!stickerSet || !Array.isArray(stickerSet.stickers)) {
    throw new Error('Telegram getStickerSet did not return a stickers array.');
  }

  const stickers = stickerSet.stickers
    .filter((sticker) => sticker?.custom_emoji_id && sticker?.emoji)
    .map((sticker, index) => ({
      index,
      emoji: sticker.emoji,
      customEmojiId: sticker.custom_emoji_id,
      fileId: sticker.file_id || '',
      fileUniqueId: sticker.file_unique_id || '',
      isAnimated: Boolean(sticker.is_animated),
      isVideo: Boolean(sticker.is_video)
    }));

  const customEmojiIdsByCharacter = {};
  const customEmojiAltByCharacter = {};
  const letterStickers = stickers.filter((sticker) => sticker.emoji === RETRO_FONT_ALT_EMOJI);
  for (const [index, character] of [...RETRO_FONT_LETTERS].entries()) {
    const sticker = letterStickers[index];
    if (!sticker) continue;
    customEmojiIdsByCharacter[character] = sticker.customEmojiId;
    customEmojiAltByCharacter[character] = sticker.emoji;
  }

  for (const sticker of stickers) {
    const character = DIGIT_EMOJI_TO_CHARACTER[sticker.emoji];
    if (!character || customEmojiIdsByCharacter[character]) continue;
    customEmojiIdsByCharacter[character] = sticker.customEmojiId;
    customEmojiAltByCharacter[character] = sticker.emoji;
  }

  if (!customEmojiIdsByCharacter.K || !customEmojiIdsByCharacter.A) {
    throw new Error('RetroFontEmoji letter order could not be mapped from the sticker set.');
  }

  return {
    packName: stickerSet.name || DEFAULT_PACK_NAME,
    title: stickerSet.title || 'Retro Font Emoji',
    stickerType: stickerSet.sticker_type || 'custom_emoji',
    stickerFormat: inferStickerFormat(stickers),
    source: options.sourceUrl || DEFAULT_SOURCE_URL,
    generatedAt: new Date().toISOString(),
    customEmojiIdsByCharacter,
    customEmojiAltByCharacter,
    stickers
  };
}

export async function importRetroFontEmojiPack(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Global fetch is not available in this Node.js runtime.');

  const token = required(options.token, 'TELEGRAM_BOT_TOKEN');
  const packName = options.packName || DEFAULT_PACK_NAME;
  const stickerSet = await telegramJson({
    token,
    method: 'getStickerSet',
    payload: { name: packName },
    fetchImpl
  });

  const result = buildRetroFontEmojiMap(stickerSet, {
    sourceUrl: options.sourceUrl || `https://t.me/addemoji/${packName}`
  });
  if (options.outputPath) await writeJson(options.outputPath, result);
  return result;
}

async function telegramJson({ token, method, payload, fetchImpl }) {
  const response = await fetchImpl(apiUrl(token, method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseTelegramResponse(method, response);
}

async function parseTelegramResponse(method, response) {
  let data;
  try {
    data = await response.json();
  } catch {
    data = { ok: false, description: 'Telegram returned a non-JSON response.' };
  }

  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status || 'unknown'} ${data.description || 'unknown error'}`);
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
  return value;
}

async function writeJson(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function loadDotEnv(envPath = resolve(process.cwd(), '.env')) {
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

function parseArgs(argv) {
  const args = {
    packName: process.env.TELEGRAM_RETRO_FONT_EMOJI_PACK_NAME || DEFAULT_PACK_NAME,
    outputPath: process.env.TELEGRAM_RETRO_FONT_EMOJI_MAP_FILE || DEFAULT_OUTPUT_PATH,
    token: process.env.TELEGRAM_BOT_TOKEN || '',
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
    '  npm.cmd run telegram:import-retro-font-emojis',
    '  npm.cmd run telegram:import-retro-font-emojis -- --name RetroFontEmoji --output data/telegram-retro-font-emoji-map.json',
    '',
    'Required:',
    '  TELEGRAM_BOT_TOKEN',
    '',
    'Options:',
    '  --name <set_name>    Defaults to RetroFontEmoji',
    '  --output <path>      Defaults to data/telegram-retro-font-emoji-map.json',
    '  --token <token>      Bot token, otherwise TELEGRAM_BOT_TOKEN',
    '  --dry-run           Print the character mapping plan without calling Telegram'
  ].join('\n');
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }
  if (args.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      packName: args.packName,
      outputPath: args.outputPath,
      letters: RETRO_FONT_LETTERS
    }, null, 2));
    return;
  }

  const result = await importRetroFontEmojiPack({
    token: args.token,
    packName: args.packName,
    outputPath: args.outputPath
  });
  console.log(JSON.stringify({
    ok: true,
    packName: result.packName,
    outputPath: args.outputPath,
    stickers: result.stickers.length,
    characters: Object.keys(result.customEmojiIdsByCharacter).length
  }, null, 2));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
