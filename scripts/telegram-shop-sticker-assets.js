import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), 'public', 'brand', 'shop-stickers');

export const SHOP_STICKERS = [
  {
    stage: 'start',
    fileName: 'start.webm',
    emoji: '✨',
    title: 'KAITO SHOP',
    subtitle: 'WELCOME',
    color: '0x7C3AEDCC',
    accent: '0x22D3EECC'
  },
  {
    stage: 'catalog',
    fileName: 'catalog.webm',
    emoji: '🛒',
    title: 'SAN PHAM',
    subtitle: 'BRANDS HOT',
    color: '0x16A34ACC',
    accent: '0xF59E0BCC'
  },
  {
    stage: 'brand',
    fileName: 'brand.webm',
    emoji: '🏷',
    title: 'BRAND',
    subtitle: 'CHON GOI',
    color: '0x2563EBCC',
    accent: '0xA855F7CC'
  },
  {
    stage: 'topup',
    fileName: 'topup.webm',
    emoji: '💳',
    title: 'NAP TIEN',
    subtitle: 'THANH TOAN',
    color: '0x0891B2CC',
    accent: '0xF97316CC'
  },
  {
    stage: 'account',
    fileName: 'account.webm',
    emoji: '👤',
    title: 'TAI KHOAN',
    subtitle: 'BUYER',
    color: '0x4F46E5CC',
    accent: '0x10B981CC'
  },
  {
    stage: 'language',
    fileName: 'language.webm',
    emoji: '🌍',
    title: 'NGON NGU',
    subtitle: 'VI / EN',
    color: '0x0F766ECC',
    accent: '0x38BDF8CC'
  },
  {
    stage: 'support',
    fileName: 'support.webm',
    emoji: '🛟',
    title: 'HO TRO',
    subtitle: 'ONLINE',
    color: '0xDB2777CC',
    accent: '0xFACC15CC'
  },
  {
    stage: 'order',
    fileName: 'order.webm',
    emoji: '📦',
    title: 'DON HANG',
    subtitle: 'DA GIU',
    color: '0xEA580CCC',
    accent: '0x22C55ECC'
  },
  {
    stage: 'delivery',
    fileName: 'delivery.webm',
    emoji: '🚚',
    title: 'GIAO HANG',
    subtitle: 'TU DONG',
    color: '0x0284C7CC',
    accent: '0xF472B6CC'
  }
];

export function buildShopStickerFfmpegArgs({
  sticker,
  outputPath,
  size = 512,
  duration = 2.6,
  fps = 30,
  crf = 34
}) {
  if (!sticker) throw new Error('Missing sticker definition.');
  const canvas = Number(size);
  const card = Math.round(canvas * 0.78);
  const cardX = Math.round((canvas - card) / 2);
  const cardY = Math.round(canvas * 0.23);
  const cardH = Math.round(canvas * 0.52);
  const title = drawText(sticker.title);
  const subtitle = drawText(sticker.subtitle);
  const phase = `sin(2*PI*t/${Number(duration)})`;
  const filter = [
    'format=rgba',
    `drawbox=x=${cardX}:y=${cardY}:w=${card}:h=${cardH}:color=${sticker.color}:t=fill`,
    `drawbox=x=${cardX}:y=${cardY}:w=${card}:h=${cardH}:color=${sticker.accent}:t=10`,
    `drawbox=x=${Math.round(canvas * 0.17)}:y=${Math.round(canvas * 0.29)}:w=${Math.round(canvas * 0.66)}:h=18:color=0xFFFFFF44:t=fill`,
    `drawbox=x=${Math.round(canvas * 0.2)}:y=${Math.round(canvas * 0.63)}:w=${Math.round(canvas * 0.6)}:h=42:color=0x00000033:t=fill`,
    `drawtext=text='${title}':x=(w-text_w)/2:y=${Math.round(canvas * 0.42)}+6*${phase}:fontsize=${Math.round(canvas * 0.1)}:fontcolor=white`,
    `drawtext=text='${subtitle}':x=(w-text_w)/2:y=${Math.round(canvas * 0.64)}:fontsize=${Math.round(canvas * 0.052)}:fontcolor=white`,
    `rotate='0.035*${phase}':ow=${canvas}:oh=${canvas}:c=none`,
    `fps=${Number(fps)}`,
    'format=yuva420p'
  ].join(',');

  return [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x00000000:s=${canvas}x${canvas}:d=${Number(duration)}:r=${Number(fps)}`,
    '-vf', filter,
    '-an',
    '-c:v', 'libvpx-vp9',
    '-b:v', '0',
    '-crf', String(crf),
    '-pix_fmt', 'yuva420p',
    '-auto-alt-ref', '0',
    outputPath
  ];
}

export async function generateShopStickerAssets(options = {}) {
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const ffmpegPath = await resolveFfmpegPath(options.ffmpegPath);
  const runCommand = options.runCommand || runProcess;
  await mkdir(outputDir, { recursive: true });

  const files = [];
  for (const sticker of SHOP_STICKERS) {
    const outputPath = resolve(outputDir, sticker.fileName);
    const args = buildShopStickerFfmpegArgs({
      sticker,
      outputPath,
      size: options.size || 512,
      duration: options.duration || 2.6,
      fps: options.fps || 30,
      crf: options.crf || 34
    });
    await runCommand(ffmpegPath, args);
    files.push({
      stage: sticker.stage,
      fileName: sticker.fileName,
      outputPath,
      emoji: sticker.emoji
    });
  }

  return {
    ok: true,
    outputDir,
    generated: files.length,
    files
  };
}

function drawText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .trim();
}

async function resolveFfmpegPath(explicitPath) {
  if (explicitPath) return explicitPath;
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const mod = await import('@ffmpeg-installer/ffmpeg');
    return mod.default?.path || mod.path;
  } catch {
    throw new Error('ffmpeg is required. Install dependencies or set FFMPEG_PATH.');
  }
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
      reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

function parseArgs(argv) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
    size: 512,
    duration: 2.6,
    fps: 30,
    crf: 34
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.outputDir = resolve(argv[++index]);
    else if (arg === '--size') args.size = Number(argv[++index]);
    else if (arg === '--duration') args.duration = Number(argv[++index]);
    else if (arg === '--fps') args.fps = Number(argv[++index]);
    else if (arg === '--crf') args.crf = Number(argv[++index]);
    else if (arg === '--ffmpeg') args.ffmpegPath = argv[++index];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function helpText() {
  return [
    'Usage:',
    '  npm.cmd run telegram:generate-shop-stickers',
    '',
    'Options:',
    '  --output <dir>      Defaults to public/brand/shop-stickers',
    '  --size <px>         Defaults to 512 for Telegram regular video stickers',
    '  --duration <sec>    Defaults to 2.6',
    '  --fps <fps>         Defaults to 30',
    '  --crf <value>       Defaults to 34',
    '  --ffmpeg <path>     Override ffmpeg binary path'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }
  const result = await generateShopStickerAssets(args);
  console.log(JSON.stringify({
    ok: true,
    outputDir: result.outputDir,
    generated: result.generated
  }, null, 2));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
