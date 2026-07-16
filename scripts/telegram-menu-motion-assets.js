import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCE_IMAGE = resolve(process.cwd(), 'public', 'brand', 'menu-neon', 'source.png');
const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), 'public', 'brand', 'menu-emoji');
const DEFAULT_CROP_DIR = resolve(process.cwd(), 'public', 'brand', 'menu-emoji-source');
const DEFAULT_MANIFEST_PATH = resolve(process.cwd(), 'data', 'telegram-menu-motion-assets.json');
const PYTHON_HELPER = resolve(process.cwd(), 'scripts', 'telegram-menu-motion-assets.py');

export const MENU_MOTION_ITEMS = [
  { key: 'products', label: 'San pham', emoji: '\u{1F6D2}', effect: 'shake', color: '#facc15' },
  { key: 'topup', label: 'Nap tien', emoji: '\u{1F4B3}', effect: 'pulse-glow', color: '#22c55e' },
  { key: 'account', label: 'Tai khoan', emoji: '\u{1F464}', effect: 'blink', color: '#22d3ee' },
  { key: 'orders', label: 'Don hang', emoji: '\u{1F4E6}', effect: 'pop', color: '#fb923c' },
  { key: 'language', label: 'Doi ngon ngu', emoji: '\u{1F310}', effect: 'rotate', color: '#a855f7' },
  { key: 'support', label: 'Ho tro', emoji: '\u{1F3A7}', effect: 'neon-flicker', color: '#f472b6' },
  { key: 'security', label: 'Bao mat', emoji: '\u{1F6E1}\uFE0F', effect: 'sweep-glow', color: '#38bdf8' },
  { key: 'instant-delivery', label: 'Giao hang tuc thi', emoji: '\u26A1', effect: 'flash', color: '#facc15' },
  { key: 'automation-247', label: 'Tu dong 24/7', emoji: '\u{1F504}', effect: 'trail-rotate', color: '#22c55e' },
  { key: 'quality', label: 'Chat luong uy tin', emoji: '\u2B50', effect: 'soft-pulse', color: '#facc15' },
  { key: 'member', label: 'Thanh vien', emoji: '\u{1F451}', effect: 'neon-glow', color: '#facc15' },
  { key: 'offers', label: 'Uu dai', emoji: '\u{1F381}', effect: 'open-scale', color: '#d946ef' },
  { key: 'notifications', label: 'Thong bao', emoji: '\u{1F4E3}', effect: 'alert-shake', color: '#ef4444' },
  { key: 'promotions', label: 'Khuyen mai', emoji: '\u{1F3AB}', effect: 'slide-glow', color: '#22d3ee' },
  { key: 'reviews', label: 'Danh gia', emoji: '\u2728', effect: 'sparkle', color: '#f472b6' },
  { key: 'academy', label: 'Hoc vien', emoji: '\u{1F393}', effect: 'drop-glow', color: '#84cc16' },
  { key: 'news', label: 'Tin tuc', emoji: '\u{1F4C4}', effect: 'scroll-fade', color: '#f59e0b' },
  { key: 'events', label: 'Su kien', emoji: '\u{1F3AE}', effect: 'pop-glow', color: '#8b5cf6' },
  { key: 'policy', label: 'Chinh sach', emoji: '\u{1F6E1}\uFE0F', effect: 'sweep-glow', color: '#22d3ee' },
  { key: 'logout', label: 'Dang xuat', emoji: '\u23FB', effect: 'power-fade', color: '#ef4444' }
];

export function buildMenuMotionPythonArgs(options = {}) {
  const args = [
    PYTHON_HELPER,
    '--source', options.sourceImage || DEFAULT_SOURCE_IMAGE,
    '--output', options.outputDir || DEFAULT_OUTPUT_DIR,
    '--crops', options.cropDir || DEFAULT_CROP_DIR,
    '--manifest', options.manifestPath === false ? '' : (options.manifestPath || DEFAULT_MANIFEST_PATH),
    '--size', String(options.size || 100),
    '--duration', String(options.duration || 2),
    '--fps', String(options.fps || 24),
    '--crf', String(options.crf || 54)
  ];

  if (options.ffmpegPath) args.push('--ffmpeg', options.ffmpegPath);
  if (options.itemsPath) args.push('--items', options.itemsPath);
  if (options.keepFrames) args.push('--keep-frames');
  return args;
}

export async function generateMenuMotionAssets(options = {}) {
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const cropDir = options.cropDir || DEFAULT_CROP_DIR;
  const manifestPath = options.manifestPath === false ? '' : (options.manifestPath || DEFAULT_MANIFEST_PATH);
  const runCommand = options.runCommand || runProcess;
  await mkdir(outputDir, { recursive: true });
  await mkdir(cropDir, { recursive: true });
  if (manifestPath) await mkdir(dirname(manifestPath), { recursive: true });

  const pythonPath = options.pythonPath || process.env.PYTHON || 'python';
  const args = buildMenuMotionPythonArgs({ ...options, outputDir, cropDir, manifestPath });
  await runCommand(pythonPath, args);

  if (!manifestPath) {
    return { ok: true, outputDir, cropDir, generated: MENU_MOTION_ITEMS.length };
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
    sourceImage: DEFAULT_SOURCE_IMAGE,
    outputDir: DEFAULT_OUTPUT_DIR,
    cropDir: DEFAULT_CROP_DIR,
    manifestPath: DEFAULT_MANIFEST_PATH,
    size: 100,
    duration: 2,
    fps: 24,
    crf: 54
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') args.sourceImage = resolve(argv[++index]);
    else if (arg === '--output') args.outputDir = resolve(argv[++index]);
    else if (arg === '--crops') args.cropDir = resolve(argv[++index]);
    else if (arg === '--manifest') args.manifestPath = argv[++index] ? resolve(argv[index]) : false;
    else if (arg === '--size') args.size = Number(argv[++index]);
    else if (arg === '--duration') args.duration = Number(argv[++index]);
    else if (arg === '--fps') args.fps = Number(argv[++index]);
    else if (arg === '--crf') args.crf = Number(argv[++index]);
    else if (arg === '--ffmpeg') args.ffmpegPath = argv[++index];
    else if (arg === '--python') args.pythonPath = argv[++index];
    else if (arg === '--keep-frames') args.keepFrames = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function helpText() {
  return [
    'Usage:',
    '  npm.cmd run telegram:generate-menu-motion -- --source "<image.png>"',
    '',
    'Options:',
    '  --source <png>      Defaults to public/brand/menu-neon/source.png',
    '  --output <dir>      Defaults to public/brand/menu-emoji',
    '  --crops <dir>       Defaults to public/brand/menu-emoji-source',
    '  --manifest <json>   Defaults to data/telegram-menu-motion-assets.json',
    '  --size <px>         Defaults to 100 for Telegram custom emoji video',
    '  --duration <sec>    Defaults to 2',
    '  --fps <fps>         Defaults to 24',
    '  --crf <value>       Defaults to 54',
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
  const result = await generateMenuMotionAssets(args);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
