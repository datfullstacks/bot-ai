import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PACK_NAME = 'RoboEmoji';
const DEFAULT_OUTPUT_PATH = resolve(process.cwd(), 'data', 'telegram-robo-emoji-map.json');
const DEFAULT_SOURCE_URL = 'https://t.me/addemoji/RoboEmoji';

export const roboAliasEntries = Object.freeze({
  smile: '😊',
  wave: '👋',
  please: '🙏',
  wow: '🤩',
  party: '🥳',
  money: '🤑',
  ok: '👌',
  thumbsup: '👍',
  hundred: '💯',
  salute: '🫡',
  plus: '➕',
  wink: '😉',
  heart: '😍',
  cry: '😭',
  angry: '😡',
  shocked: '🤯',
  cool: '😎',
  sleep: '😴'
});

export function buildRoboEmojiMap(stickerSet, options = {}) {
  if (!stickerSet || !Array.isArray(stickerSet.stickers)) {
    throw new Error('Telegram getStickerSet did not return a stickers array.');
  }

  const customEmojiIdsByEmoji = {};
  const stickers = stickerSet.stickers
    .filter((sticker) => sticker?.custom_emoji_id && sticker?.emoji)
    .map((sticker) => {
      if (!customEmojiIdsByEmoji[sticker.emoji]) {
        customEmojiIdsByEmoji[sticker.emoji] = sticker.custom_emoji_id;
      }
      return {
        emoji: sticker.emoji,
        customEmojiId: sticker.custom_emoji_id,
        fileId: sticker.file_id || '',
        fileUniqueId: sticker.file_unique_id || '',
        isAnimated: Boolean(sticker.is_animated),
        isVideo: Boolean(sticker.is_video)
      };
    });

  const customEmojiIdsByAlias = {};
  for (const [alias, emoji] of Object.entries(roboAliasEntries)) {
    const customEmojiId = customEmojiIdsByEmoji[emoji];
    if (customEmojiId) customEmojiIdsByAlias[alias] = [customEmojiId];
  }

  return {
    packName: stickerSet.name || DEFAULT_PACK_NAME,
    title: stickerSet.title || 'Robo Emoji',
    stickerType: stickerSet.sticker_type || 'custom_emoji',
    stickerFormat: inferStickerFormat(stickers),
    source: options.sourceUrl || DEFAULT_SOURCE_URL,
    generatedAt: new Date().toISOString(),
    customEmojiIdsByEmoji,
    customEmojiIdsByAlias,
    stickers
  };
}

export async function importRoboEmojiPack(options = {}) {
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

  const result = buildRoboEmojiMap(stickerSet, {
    sourceUrl: options.sourceUrl || `https://t.me/addemoji/${packName}`
  });
  if (options.outputPath) {
    await writeJson(options.outputPath, result);
  }
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
    packName: process.env.TELEGRAM_ROBO_EMOJI_PACK_NAME || DEFAULT_PACK_NAME,
    outputPath: process.env.TELEGRAM_ROBO_EMOJI_MAP_FILE || DEFAULT_OUTPUT_PATH,
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
    '  npm.cmd run telegram:import-robo-emojis',
    '  npm.cmd run telegram:import-robo-emojis -- --name RoboEmoji --output data/telegram-robo-emoji-map.json',
    '',
    'Required:',
    '  TELEGRAM_BOT_TOKEN',
    '',
    'Options:',
    '  --name <set_name>    Defaults to RoboEmoji',
    '  --output <path>      Defaults to data/telegram-robo-emoji-map.json',
    '  --token <token>      Bot token, otherwise TELEGRAM_BOT_TOKEN',
    '  --dry-run           Print alias mapping plan without calling Telegram'
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
      aliases: roboAliasEntries
    }, null, 2));
    return;
  }

  const result = await importRoboEmojiPack({
    token: args.token,
    packName: args.packName,
    outputPath: args.outputPath
  });
  console.log(JSON.stringify({
    ok: true,
    packName: result.packName,
    outputPath: args.outputPath,
    stickers: result.stickers.length,
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
