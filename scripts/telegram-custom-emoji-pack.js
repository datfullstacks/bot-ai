import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCE_DIR = resolve(process.cwd(), 'public', 'brand', 'emoji');
const DEFAULT_MOTION_SOURCE_DIR = resolve(process.cwd(), 'public', 'brand', 'motion-emoji');
const DEFAULT_OUTPUT_PATH = resolve(process.cwd(), 'data', 'telegram-custom-emoji-map.json');
const DEFAULT_PACK_TITLE = 'KAITO AI SHOP Brands';
const DEFAULT_MOTION_PACK_TITLE = 'KAITO AI SHOP Brand Motion';
const DEFAULT_PACK_BASE = 'kaito_ai_shop_brands';
const DEFAULT_MOTION_PACK_BASE = 'kaito_ai_shop_brand_motion';
const MAX_INITIAL_STICKERS = 50;

const BRAND_EMOJIS = new Map([
  ['products', '\u{1F6D2}'],
  ['kaito', '\u2728'],
  ['welcome', '\u2728'],
  ['catalog', '\u{1F6CD}\uFE0F'],
  ['checkout', '\u{1F48E}'],
  ['payment', '\u{1F4B3}'],
  ['ai', '\u{1F916}'],
  ['mmo', '\u{1F3AF}'],
  ['instant', '\u26A1'],
  ['secure', '\u{1F6E1}\uFE0F'],
  ['guide', '\u{1F4DC}'],
  ['contact', '\u{1F4AC}'],
  ['stock', '\u{1F4E6}'],
  ['review', '\u2728'],
  ['refund', '\u21A9\uFE0F'],
  ['combo', '\u{1F381}'],
  ['event', '\u{1F3AE}'],
  ['delivery', '\u{1F4E6}'],
  ['textshoppingflow', '\u2728'],
  ['soldout', '\u26A0\uFE0F'],
  ['topup', '\u{1F4B3}'],
  ['account', '\u{1F464}'],
  ['orders', '\u{1F4E6}'],
  ['language', '\u{1F310}'],
  ['support', '\u{1F3A7}'],
  ['checkin', '\u{1F4DD}'],
  ['minigame', '\u{1F3AE}'],
  ['vip', '\u{1F451}'],
  ['hot', '\u{1F525}'],
  ['new', '\u{1F195}'],
  ['sale', '\u{1F3AB}'],
  ['trusted', '\u{1F6E1}\uFE0F'],
  ['close', '\u274C'],
  ['security', '\u{1F6E1}\uFE0F'],
  ['instantdelivery', '\u26A1'],
  ['automation247', '\u{1F504}'],
  ['quality', '\u2B50'],
  ['member', '\u{1F451}'],
  ['offers', '\u{1F381}'],
  ['notifications', '\u{1F4E3}'],
  ['promotions', '\u{1F3AB}'],
  ['reviews', '\u2728'],
  ['academy', '\u{1F393}'],
  ['news', '\u{1F4C4}'],
  ['events', '\u{1F3AE}'],
  ['policy', '\u{1F6E1}\uFE0F'],
  ['logout', '\u{1F50C}'],
  ['fast', '\u2604\uFE0F'],
  ['auto247', '\u{1F504}'],
  ['tracking', '\u{1F50D}'],
  ['moneyface', '\u{1F911}'],
  ['admin', '\u{1F6E1}'],
  ['adminchat', '\u{1F4AC}'],
  ['adminshield', '\u{1F6E1}'],
  ['adminboom', '\u{1F4A5}'],
  ['adminfire', '\u{1F525}'],
  ['adminhundred', '\u{1F4AF}'],
  ['treasurechest', '\u{1F4B0}'],
  ['paymentcard', '\u{1F4B3}'],
  ['crystal', '\u{1F48E}'],
  ['helmet', '\u{1F6E1}\uFE0F'],
  ['scroll', '\u{1F4DC}'],
  ['deliverydrone', '\u{1F69A}'],
  ['globe', '\u{1F310}'],
  ['key', '\u{1F511}'],
  ['canva', '\u{1F3A8}'],
  ['capcut', '\u{1F3AC}'],
  ['discord', '\u{1F3AE}'],
  ['facebook', '\u{1F4D8}'],
  ['figma', '\u{1F9E9}'],
  ['gmail', '\u{1F4E7}'],
  ['google', '\u{1F50E}'],
  ['microsoft', '\u{1F4BB}'],
  ['paypal', '\u{1F4B3}'],
  ['telegram', '\u2708\uFE0F'],
  ['tiktok', '\u{1F3B5}'],
  ['antigravity', '🛸'],
  ['appleintelligent', '🍎'],
  ['chatgpt', '🤖'],
  ['claude', '🧠'],
  ['codex', '💻'],
  ['cohere', '🔷'],
  ['cursor', '🖱️'],
  ['deepseek', '🔍'],
  ['fireworksai', '🎆'],
  ['gemini', '✨'],
  ['googleantigravity', '🛸'],
  ['grok', '⚡'],
  ['huggingface', '🤗'],
  ['kimi', '🌙'],
  ['manus', '✍️'],
  ['microsoftcopilot', '🪟'],
  ['minimax', '⚡'],
  ['mistralai', '🌬️'],
  ['notion', '📝'],
  ['perplexity', '🔎'],
  ['poe', '💬'],
  ['qwen', '🧠'],
  ['sai', '🤖'],
  ['yai', '🤖']
]);

export function normalizeBrandKey(brand) {
  return String(brand || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function emojiForBrand(brand) {
  return BRAND_EMOJIS.get(normalizeBrandKey(canonicalBrandName(brand))) || '🤖';
}

export function buildPackName(baseName, botUsername) {
  const cleanBase = String(baseName || DEFAULT_PACK_BASE)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || DEFAULT_PACK_BASE;
  const cleanBot = String(botUsername || '')
    .trim()
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9_]+/g, '');
  if (!cleanBot) throw new Error('Missing bot username. Set TELEGRAM_BOT_USERNAME or allow getMe to resolve it.');
  const suffix = `_by_${cleanBot}`;
  const maxBaseLength = 64 - suffix.length;
  const trimmedBase = cleanBase.slice(0, Math.max(1, maxBaseLength)).replace(/_+$/g, '') || 'kaito';
  const packName = `${trimmedBase}${suffix}`;
  validatePackName(packName, cleanBot);
  return packName;
}

export async function collectEmojiEntries(sourceDir = DEFAULT_SOURCE_DIR, options = {}) {
  const stickerFormat = normalizeStickerFormat(options.stickerFormat || 'static');
  const emojiByBrandKey = options.emojiByBrandKey || {};
  const allowedExtensions = {
    static: ['.png', '.webp'],
    video: ['.webm'],
    animated: ['.tgs']
  }[stickerFormat];
  const entries = [];
  const files = await readdir(sourceDir, { withFileTypes: true });
  for (const file of files.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!file.isFile()) continue;
    const extension = extname(file.name).toLowerCase();
    if (!allowedExtensions.includes(extension)) continue;

    const brand = canonicalBrandName(parse(file.name).name);
    entries.push({
      brand,
      brandKey: normalizeBrandKey(brand),
      fileName: file.name,
      filePath: resolve(sourceDir, file.name),
      emoji: emojiByBrandKey[normalizeBrandKey(brand)] || emojiForBrand(brand),
      keywords: keywordsForBrand(brand),
      contentType: contentTypeForExtension(extension)
    });
  }

  if (!entries.length) {
    throw new Error(`No ${allowedExtensions.join(' or ')} emoji files found in ${sourceDir}`);
  }
  if (entries.length > MAX_INITIAL_STICKERS) {
    throw new Error(`createNewStickerSet accepts at most ${MAX_INITIAL_STICKERS} initial stickers; found ${entries.length}.`);
  }
  return entries;
}

export async function createCustomEmojiPack(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Global fetch is not available in this Node.js runtime.');

  const stickerFormat = normalizeStickerFormat(options.stickerFormat || 'static');
  const sourceDir = options.sourceDir || defaultSourceDir(stickerFormat);
  const title = options.title || defaultPackTitle(stickerFormat);
  const entries = await collectEmojiEntries(sourceDir, {
    stickerFormat,
    emojiByBrandKey: options.emojiByBrandKey
  });

  if (options.dryRun) {
    const dryBotUsername = options.botUsername || 'KaitoShopBot';
    return buildResult({
      packName: options.packName || buildPackName(options.packBase || defaultPackBase(stickerFormat), dryBotUsername),
      title,
      stickers: entries.map((entry) => ({ ...entry, customEmojiId: '' })),
      stickerFormat,
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
  const packName = options.packName || buildPackName(options.packBase || defaultPackBase(stickerFormat), botUsername);

  const uploaded = [];
  for (const entry of entries) {
    const file = await uploadStickerFile({
      token,
      ownerUserId,
      entry,
      stickerFormat,
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
        format: stickerFormat,
        emoji_list: [entry.emoji],
        keywords: entry.keywords
      })),
      sticker_type: 'custom_emoji',
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
    if (!sticker?.custom_emoji_id) {
      throw new Error(`Telegram did not return custom_emoji_id for ${entry.fileName}.`);
    }
    return {
      ...entry,
      fileId: sticker.file_id || entry.fileId,
      customEmojiId: sticker.custom_emoji_id
    };
  });

  const result = buildResult({ packName, title, stickers, stickerFormat, sourceDir, dryRun: false });
  if (options.outputPath) {
    await writeJson(options.outputPath, result);
  }
  return result;
}

function canonicalBrandName(name) {
  return String(name || '').replace(/\s+Brand$/i, '').trim();
}

function keywordsForBrand(brand) {
  const normalizedWords = String(brand || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return [...new Set([normalizeBrandKey(brand), ...normalizedWords])]
    .filter(Boolean)
    .join(' ')
    .slice(0, 64)
    .split(/\s+/)
    .filter(Boolean);
}

function validatePackName(packName, botUsername) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(packName)) {
    throw new Error(`Invalid sticker set name: ${packName}`);
  }
  if (packName.includes('__')) {
    throw new Error(`Sticker set name cannot contain consecutive underscores: ${packName}`);
  }
  if (!packName.toLowerCase().endsWith(`_by_${String(botUsername).toLowerCase().replace(/^@/, '')}`)) {
    throw new Error(`Sticker set name must end with _by_${botUsername}.`);
  }
}

async function resolveBotUsername({ token, fetchImpl }) {
  const bot = await telegramJson({ token, method: 'getMe', payload: {}, fetchImpl });
  if (!bot.username) throw new Error('Telegram getMe did not return a bot username.');
  return bot.username;
}

function normalizeStickerFormat(value) {
  const normalized = String(value || 'static').trim().toLowerCase();
  if (!['static', 'video', 'animated'].includes(normalized)) {
    throw new Error(`Invalid sticker format: ${value}`);
  }
  return normalized;
}

function defaultSourceDir(stickerFormat) {
  return stickerFormat === 'video' ? DEFAULT_MOTION_SOURCE_DIR : DEFAULT_SOURCE_DIR;
}

function defaultPackTitle(stickerFormat) {
  return stickerFormat === 'video' ? DEFAULT_MOTION_PACK_TITLE : DEFAULT_PACK_TITLE;
}

function defaultPackBase(stickerFormat) {
  return stickerFormat === 'video' ? DEFAULT_MOTION_PACK_BASE : DEFAULT_PACK_BASE;
}

function contentTypeForExtension(extension) {
  if (extension === '.webp') return 'image/webp';
  if (extension === '.webm') return 'video/webm';
  if (extension === '.tgs') return 'application/x-tgsticker';
  return 'image/png';
}

async function uploadStickerFile({ token, ownerUserId, entry, stickerFormat, fetchImpl }) {
  const form = new FormData();
  form.append('user_id', String(ownerUserId));
  form.append('sticker_format', stickerFormat);
  const bytes = await readFile(entry.filePath);
  form.append('sticker', new Blob([bytes], { type: entry.contentType }), entry.fileName);

  return telegramMultipart({
    token,
    method: 'uploadStickerFile',
    form,
    fetchImpl
  });
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

function buildResult({ packName, title, stickers, stickerFormat = 'static', sourceDir = DEFAULT_SOURCE_DIR, dryRun }) {
  const customEmojiIdsByFile = {};
  const customEmojiIdsByBrand = {};
  const fileIdsByFile = {};
  const fileIdsByBrand = {};
  const normalized = stickers.map((entry) => {
    const item = {
      brand: entry.brand,
      brandKey: entry.brandKey,
      fileName: entry.fileName,
      emoji: entry.emoji,
      fileId: entry.fileId || '',
      customEmojiId: entry.customEmojiId || ''
    };
    customEmojiIdsByFile[item.fileName] = item.customEmojiId;
    customEmojiIdsByBrand[item.brandKey] ||= [];
    if (item.customEmojiId) customEmojiIdsByBrand[item.brandKey].push(item.customEmojiId);
    fileIdsByFile[item.fileName] = item.fileId;
    fileIdsByBrand[item.brandKey] ||= [];
    if (item.fileId) fileIdsByBrand[item.brandKey].push(item.fileId);
    return item;
  });

  return {
    packName,
    title,
    stickerType: 'custom_emoji',
    stickerFormat,
    source: sourceDir,
    dryRun,
    generatedAt: new Date().toISOString(),
    customEmojiIdsByFile,
    customEmojiIdsByBrand,
    fileIdsByFile,
    fileIdsByBrand,
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
    sourceDir: '',
    outputPath: DEFAULT_OUTPUT_PATH,
    title: process.env.TELEGRAM_CUSTOM_EMOJI_PACK_TITLE || '',
    packName: process.env.TELEGRAM_CUSTOM_EMOJI_PACK_NAME || '',
    packBase: '',
    stickerFormat: process.env.TELEGRAM_CUSTOM_EMOJI_FORMAT || 'static',
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
    else if (arg === '--format') args.stickerFormat = argv[++index];
    else if (arg === '--owner-user-id') args.ownerUserId = argv[++index];
    else if (arg === '--bot-username') args.botUsername = argv[++index];
    else if (arg === '--token') args.token = argv[++index];
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
    '  npm.cmd run telegram:create-custom-emojis -- --dry-run',
    '  npm.cmd run telegram:create-custom-emojis -- --yes',
    '',
    'Required for live run:',
    '  TELEGRAM_BOT_TOKEN',
    '  TELEGRAM_OWNER_USER_ID',
    '',
    'Optional:',
    '  TELEGRAM_BOT_USERNAME (script can resolve it via getMe)',
    '  TELEGRAM_CUSTOM_EMOJI_PACK_NAME',
    '  TELEGRAM_CUSTOM_EMOJI_PACK_TITLE',
    '  TELEGRAM_CUSTOM_EMOJI_FORMAT=static|video|animated',
    '',
    'Options:',
    '  --source <dir>          Defaults to public/brand/emoji',
    '                          For --format video, defaults to public/brand/motion-emoji',
    '  --output <path>         Defaults to data/telegram-custom-emoji-map.json',
    '  --title <title>         Sticker set title',
    '  --name <pack_name>      Explicit sticker set short name',
    '  --base <base_name>      Pack base when --name is omitted',
    '  --format <format>       static, video, or animated',
    '  --owner-user-id <id>    Telegram user id owner',
    '  --bot-username <name>   Bot username without or with @',
    '  --token <token>         Bot token, otherwise TELEGRAM_BOT_TOKEN',
    '  --dry-run              Build manifest without calling Telegram',
    '  --yes                  Required for live Telegram API calls'
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
    throw new Error('Live Telegram API run requires --yes. Use --dry-run to preview without calling Telegram.');
  }

  const result = await createCustomEmojiPack({
    token: args.token || process.env.TELEGRAM_BOT_TOKEN,
    ownerUserId: args.ownerUserId || process.env.TELEGRAM_OWNER_USER_ID,
    botUsername: args.botUsername || process.env.TELEGRAM_BOT_USERNAME,
    sourceDir: args.sourceDir || '',
    title: args.title,
    packName: args.packName || '',
    packBase: args.packBase,
    stickerFormat: args.stickerFormat,
    outputPath: args.dryRun ? '' : args.outputPath,
    dryRun: args.dryRun
  });

  if (args.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      packName: result.packName,
      title: result.title,
      stickers: result.stickers.map((item) => ({
        fileName: item.fileName,
        brand: item.brand,
        emoji: item.emoji
      }))
    }, null, 2));
    return;
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
