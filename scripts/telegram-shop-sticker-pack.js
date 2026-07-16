import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHOP_STICKERS } from './telegram-shop-sticker-assets.js';
import { buildPackName } from './telegram-custom-emoji-pack.js';

const DEFAULT_SOURCE_DIR = resolve(process.cwd(), 'public', 'brand', 'shop-stickers');
const DEFAULT_OUTPUT_PATH = resolve(process.cwd(), 'data', 'telegram-shop-sticker-map.json');
const DEFAULT_PACK_TITLE = 'KAITO AI SHOP Flow Stickers';
const DEFAULT_PACK_BASE = 'kaito_ai_shop_flow_stickers';

export async function collectShopStickerEntries(sourceDir = DEFAULT_SOURCE_DIR) {
  const files = await readdir(sourceDir, { withFileTypes: true });
  const existing = new Set(files
    .filter((file) => file.isFile())
    .filter((file) => extname(file.name).toLowerCase() === '.webm')
    .map((file) => file.name));

  const entries = SHOP_STICKERS
    .filter((sticker) => existing.has(sticker.fileName))
    .map((sticker) => ({
      ...sticker,
      filePath: resolve(sourceDir, sticker.fileName),
      contentType: 'video/webm'
    }));

  if (entries.length !== SHOP_STICKERS.length) {
    const missing = SHOP_STICKERS
      .filter((sticker) => !existing.has(sticker.fileName))
      .map((sticker) => sticker.fileName)
      .join(', ');
    throw new Error(`Missing shop sticker WEBM files in ${sourceDir}: ${missing}`);
  }
  return entries;
}

export async function createShopStickerPack(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Global fetch is not available in this Node.js runtime.');

  const sourceDir = options.sourceDir || DEFAULT_SOURCE_DIR;
  const title = options.title || DEFAULT_PACK_TITLE;
  const entries = await collectShopStickerEntries(sourceDir);

  if (options.dryRun) {
    const dryBotUsername = options.botUsername || 'KaitoShopBot';
    return buildResult({
      packName: options.packName || buildPackName(options.packBase || DEFAULT_PACK_BASE, dryBotUsername),
      title,
      stickers: entries,
      sourceDir,
      dryRun: true
    });
  }

  const token = required(options.token, 'TELEGRAM_BOT_TOKEN');
  const ownerUserId = Number(required(options.ownerUserId, 'TELEGRAM_OWNER_USER_ID'));
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
    throw new Error('TELEGRAM_OWNER_USER_ID must be a positive Telegram user id.');
  }

  const botUsername = options.botUsername || await resolveBotUsername({ token, fetchImpl });
  const packName = options.packName || buildPackName(options.packBase || DEFAULT_PACK_BASE, botUsername);

  const uploaded = [];
  for (const entry of entries) {
    const file = await uploadStickerFile({
      token,
      ownerUserId,
      entry,
      fetchImpl
    });
    uploaded.push({ ...entry, fileId: file.file_id });
  }

  await telegramJson({
    token,
    method: 'createNewStickerSet',
    payload: {
      user_id: ownerUserId,
      name: packName,
      title,
      stickers: uploaded.map((entry) => ({
        sticker: entry.fileId,
        format: 'video',
        emoji_list: [entry.emoji]
      })),
      sticker_type: 'regular',
      needs_repainting: false
    },
    fetchImpl
  });

  const stickerSet = await telegramJson({
    token,
    method: 'getStickerSet',
    payload: { name: packName },
    fetchImpl
  });

  const stickers = uploaded.map((entry, index) => {
    const sticker = stickerSet.stickers?.[index];
    return {
      ...entry,
      fileId: sticker?.file_id || entry.fileId
    };
  });

  const result = buildResult({ packName, title, stickers, sourceDir, dryRun: false });
  if (options.outputPath) {
    await writeJson(options.outputPath, result);
  }
  return result;
}

async function uploadStickerFile({ token, ownerUserId, entry, fetchImpl }) {
  const form = new FormData();
  form.append('user_id', String(ownerUserId));
  form.append('sticker_format', 'video');
  const bytes = await readFile(entry.filePath);
  form.append('sticker', new Blob([bytes], { type: entry.contentType }), entry.fileName);

  return telegramMultipart({
    token,
    method: 'uploadStickerFile',
    form,
    fetchImpl
  });
}

async function resolveBotUsername({ token, fetchImpl }) {
  const bot = await telegramJson({ token, method: 'getMe', payload: {}, fetchImpl });
  if (!bot.username) throw new Error('Telegram getMe did not return a bot username.');
  return bot.username;
}

async function telegramJson({ token, method, payload, fetchImpl }) {
  const response = await fetchImpl(apiUrl(token, method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseTelegramResponse(method, response);
}

async function telegramMultipart({ token, method, form, fetchImpl }) {
  const response = await fetchImpl(apiUrl(token, method), {
    method: 'POST',
    body: form
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

function apiUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

function buildResult({ packName, title, stickers, sourceDir = DEFAULT_SOURCE_DIR, dryRun }) {
  const stageFileIds = {};
  const normalized = stickers.map((entry) => {
    const item = {
      stage: entry.stage,
      fileName: entry.fileName,
      emoji: entry.emoji,
      fileId: entry.fileId || ''
    };
    if (item.fileId) stageFileIds[item.stage] = item.fileId;
    return item;
  });

  return {
    packName,
    title,
    stickerType: 'regular',
    stickerFormat: 'video',
    source: sourceDir,
    dryRun,
    generatedAt: new Date().toISOString(),
    stageFileIds,
    stickers: normalized
  };
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
    sourceDir: DEFAULT_SOURCE_DIR,
    outputPath: DEFAULT_OUTPUT_PATH,
    title: process.env.TELEGRAM_SHOP_STICKER_PACK_TITLE || DEFAULT_PACK_TITLE,
    packName: process.env.TELEGRAM_SHOP_STICKER_PACK_NAME || '',
    packBase: '',
    dryRun: false,
    yes: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') args.sourceDir = resolve(argv[++index]);
    else if (arg === '--output') args.outputPath = resolve(argv[++index]);
    else if (arg === '--title') args.title = argv[++index];
    else if (arg === '--name') args.packName = argv[++index];
    else if (arg === '--base') args.packBase = argv[++index];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--yes') args.yes = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function helpText() {
  return [
    'Usage:',
    '  npm.cmd run telegram:create-shop-stickers -- --yes',
    '',
    'Options:',
    '  --source <dir>     Defaults to public/brand/shop-stickers',
    '  --output <path>    Defaults to data/telegram-shop-sticker-map.json',
    '  --title <title>    Sticker set title',
    '  --name <name>      Exact sticker set name',
    '  --base <name>      Base name before _by_<bot>',
    '  --dry-run          Validate inputs without calling Telegram',
    '  --yes              Required for live Telegram writes'
  ].join('\n');
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }
  if (!args.dryRun && !args.yes) {
    throw new Error('Refusing to create a live Telegram sticker set without --yes. Use --dry-run to preview.');
  }

  const result = await createShopStickerPack({
    token: process.env.TELEGRAM_BOT_TOKEN,
    ownerUserId: process.env.TELEGRAM_OWNER_USER_ID,
    botUsername: process.env.TELEGRAM_BOT_USERNAME,
    sourceDir: args.sourceDir,
    outputPath: args.outputPath,
    title: args.title,
    packName: args.packName,
    packBase: args.packBase,
    dryRun: args.dryRun
  });
  if (args.outputPath && args.dryRun) {
    await writeJson(args.outputPath, result);
  }
  console.log(JSON.stringify({
    ok: true,
    packName: result.packName,
    outputPath: args.outputPath,
    stickers: result.stickers.length
  }, null, 2));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
