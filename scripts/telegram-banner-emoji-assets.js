import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), 'public', 'brand', 'banner-emoji');
const DEFAULT_MANIFEST_PATH = resolve(process.cwd(), 'data', 'telegram-banner-emoji-assets.json');
const DEFAULT_PREVIEW_PATH = resolve(process.cwd(), 'public', 'brand', 'banner-emoji-preview.png');
const PYTHON_HELPER = resolve(process.cwd(), 'scripts', 'telegram-banner-emoji-assets.py');

export const BANNER_EMOJI_ITEMS = [
  { key: 'kaito', text: 'KAITO', emoji: '\u2728' },
  { key: 'welcome', text: 'HI', emoji: '\u{1F44B}' },
  { key: 'products', text: 'SHOP', emoji: '\u{1F6D2}' },
  { key: 'orders', text: 'ORD', emoji: '\u{1F4E6}' },
  { key: 'support', text: 'SUP', emoji: '\u{1F3A7}' },
  { key: 'account', text: 'USER', emoji: '\u{1F464}' },
  { key: 'checkin', text: 'CHECK', emoji: '\u{1F4DD}' },
  { key: 'minigame', text: 'GAME', emoji: '\u{1F3AE}' },
  { key: 'vip', text: 'VIP', emoji: '\u{1F451}' },
  { key: 'hot', text: 'HOT', emoji: '\u{1F525}' },
  { key: 'new', text: 'NEW', emoji: '\u{1F195}' },
  { key: 'sale', text: 'SALE', emoji: '\u{1F3AB}' },
  { key: 'auto247', text: '24/7', emoji: '\u26A1' },
  { key: 'trusted', text: 'TRUST', emoji: '\u{1F6E1}\uFE0F' },
  { key: 'delivery', text: 'SHIP', emoji: '\u{1F4E6}' },
  { key: 'payment', text: 'PAY', emoji: '\u{1F4B3}' },
  { key: 'ai', text: 'AI', emoji: '\u{1F916}' },
  { key: 'mmo', text: 'MMO', emoji: '\u{1F3AF}' },
  { key: 'instant', text: 'NOW', emoji: '\u26A1' },
  { key: 'secure', text: 'SAFE', emoji: '\u{1F6E1}\uFE0F' },
  { key: 'guide', text: 'GUIDE', emoji: '\u{1F4DC}' },
  { key: 'contact', text: 'CHAT', emoji: '\u{1F4AC}' },
  { key: 'stock', text: 'STOCK', emoji: '\u{1F4E6}' },
  { key: 'soldout', text: 'SOLD', emoji: '\u26A0\uFE0F' },
  { key: 'review', text: 'RATE', emoji: '\u2728' },
  { key: 'refund', text: 'REFUND', emoji: '\u21A9\uFE0F' },
  { key: 'combo', text: 'COMBO', emoji: '\u{1F381}' },
  { key: 'member', text: 'MEMBER', emoji: '\u{1F451}' },
  { key: 'news', text: 'NEWS', emoji: '\u{1F4C4}' },
  { key: 'event', text: 'EVENT', emoji: '\u{1F3AE}' },
  { key: 'policy', text: 'RULE', emoji: '\u{1F6E1}\uFE0F' },
  { key: 'logout', text: 'LOGOUT', emoji: '\u{1F50C}' }
];

export function buildBannerEmojiPythonArgs(options = {}) {
  const args = [
    PYTHON_HELPER,
    '--output', options.outputDir || DEFAULT_OUTPUT_DIR,
    '--manifest', options.manifestPath === false ? '' : (options.manifestPath || DEFAULT_MANIFEST_PATH),
    '--preview', options.previewPath === false ? '' : (options.previewPath || DEFAULT_PREVIEW_PATH),
    '--size', String(options.size || 100),
    '--duration', String(options.duration || 2),
    '--fps', String(options.fps || 24),
    '--crf', String(options.crf || 48)
  ];
  if (options.ffmpegPath) args.push('--ffmpeg', options.ffmpegPath);
  return args;
}

export async function generateBannerEmojiAssets(options = {}) {
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const manifestPath = options.manifestPath === false ? '' : (options.manifestPath || DEFAULT_MANIFEST_PATH);
  const previewPath = options.previewPath === false ? '' : (options.previewPath || DEFAULT_PREVIEW_PATH);
  const runCommand = options.runCommand || runProcess;
  await mkdir(outputDir, { recursive: true });
  if (manifestPath) await mkdir(dirname(manifestPath), { recursive: true });
  if (previewPath) await mkdir(dirname(previewPath), { recursive: true });

  const pythonPath = options.pythonPath || process.env.PYTHON || 'python';
  const args = buildBannerEmojiPythonArgs({ ...options, outputDir, manifestPath, previewPath });
  await runCommand(pythonPath, args);

  if (!manifestPath) {
    return { ok: true, outputDir, previewPath, generated: BANNER_EMOJI_ITEMS.length };
  }
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

function runProcess(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

function parseArgs(argv) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
    manifestPath: DEFAULT_MANIFEST_PATH,
    previewPath: DEFAULT_PREVIEW_PATH,
    size: 100,
    duration: 2,
    fps: 24,
    crf: 48
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.outputDir = resolve(argv[++index]);
    else if (arg === '--manifest') args.manifestPath = argv[++index] ? resolve(argv[index]) : false;
    else if (arg === '--preview') args.previewPath = argv[++index] ? resolve(argv[index]) : false;
    else if (arg === '--size') args.size = Number(argv[++index]);
    else if (arg === '--duration') args.duration = Number(argv[++index]);
    else if (arg === '--fps') args.fps = Number(argv[++index]);
    else if (arg === '--crf') args.crf = Number(argv[++index]);
    else if (arg === '--ffmpeg') args.ffmpegPath = argv[++index];
    else if (arg === '--python') args.pythonPath = argv[++index];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function helpText() {
  return [
    'Usage:',
    '  npm.cmd run telegram:generate-banner-emojis',
    '',
    'Options:',
    '  --output <dir>      Defaults to public/brand/banner-emoji',
    '  --manifest <json>   Defaults to data/telegram-banner-emoji-assets.json',
    '  --preview <png>     Defaults to public/brand/banner-emoji-preview.png',
    '  --size <px>         Defaults to 100 for Telegram custom emoji video',
    '  --duration <sec>    Defaults to 2',
    '  --fps <fps>         Defaults to 24',
    '  --crf <value>       Defaults to 48',
    '  --ffmpeg <path>     Override ffmpeg binary path',
    '  --python <path>     Override Python executable'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }
  const result = await generateBannerEmojiAssets(args);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
