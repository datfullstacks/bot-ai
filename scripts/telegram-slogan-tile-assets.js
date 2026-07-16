import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), 'public', 'brand', 'slogan-tiles');
const DEFAULT_MANIFEST_PATH = resolve(process.cwd(), 'data', 'telegram-slogan-tile-assets.json');
const DEFAULT_PREVIEW_PATH = resolve(process.cwd(), 'public', 'brand', 'slogan-tile-preview.png');
const PYTHON_HELPER = resolve(process.cwd(), 'scripts', 'telegram-slogan-tile-assets.py');

export const SLOGAN_TILE_DEFINITIONS = [
  {
    key: 'daily_update',
    text: 'DAILY UPDATE',
    fallbackText: '🎫 DAILY UPDATE 🎫',
    emoji: '🎫',
    tileCount: 6,
    effect: 'marquee_text'
  }
];

export function buildSloganTilePythonArgs(options = {}) {
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

export async function generateSloganTileAssets(options = {}) {
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const manifestPath = options.manifestPath === false ? '' : (options.manifestPath || DEFAULT_MANIFEST_PATH);
  const previewPath = options.previewPath === false ? '' : (options.previewPath || DEFAULT_PREVIEW_PATH);
  const runCommand = options.runCommand || runProcess;
  await mkdir(outputDir, { recursive: true });
  if (manifestPath) await mkdir(dirname(manifestPath), { recursive: true });
  if (previewPath) await mkdir(dirname(previewPath), { recursive: true });

  const pythonPath = options.pythonPath || process.env.PYTHON || 'python';
  const args = buildSloganTilePythonArgs({ ...options, outputDir, manifestPath, previewPath });
  await runCommand(pythonPath, args);

  if (!manifestPath) {
    const generated = SLOGAN_TILE_DEFINITIONS.reduce((sum, item) => sum + item.tileCount, 0);
    return { ok: true, outputDir, previewPath, generated };
  }
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

export function buildSloganTileEmojiMap({ assetManifest, uploadResult }) {
  const uploadByFile = new Map((uploadResult.stickers || []).map((sticker) => [sticker.fileName, sticker]));
  const slogans = {};
  for (const [key, slogan] of Object.entries(assetManifest.slogans || {})) {
    slogans[key] = {
      key,
      text: slogan.text,
      fallbackText: slogan.fallbackText,
      emoji: slogan.emoji,
      effect: slogan.effect || '',
      placeholder: slogan.placeholder,
      tiles: (slogan.tiles || []).map((tile) => {
        const uploaded = uploadByFile.get(tile.fileName) || {};
        return {
          ...tile,
          customEmojiId: uploaded.customEmojiId || tile.customEmojiId || ''
        };
      })
    };
  }

  return {
    packName: uploadResult.packName || '',
    title: uploadResult.title || 'KAITO AI SHOP Slogan Tiles',
    stickerType: 'custom_emoji',
    stickerFormat: uploadResult.stickerFormat || 'video',
    source: uploadResult.source || uploadResult.sourceDir || assetManifest.outputDir || '',
    generatedAt: uploadResult.generatedAt || new Date().toISOString(),
    customEmojiIdsByFile: Object.fromEntries(
      (uploadResult.stickers || []).map((sticker) => [sticker.fileName, sticker.customEmojiId]).filter(([, id]) => id)
    ),
    customEmojiIdsByBrand: Object.fromEntries(
      (uploadResult.stickers || []).map((sticker) => [sticker.brandKey, [sticker.customEmojiId]]).filter(([, ids]) => ids[0])
    ),
    slogans
  };
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
    '  npm.cmd run telegram:generate-slogan-tiles',
    '',
    'Options:',
    '  --output <dir>      Defaults to public/brand/slogan-tiles',
    '  --manifest <json>   Defaults to data/telegram-slogan-tile-assets.json',
    '  --preview <png>     Defaults to public/brand/slogan-tile-preview.png',
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
  const result = await generateSloganTileAssets(args);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
