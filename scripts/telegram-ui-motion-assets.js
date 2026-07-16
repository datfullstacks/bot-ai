import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), 'public', 'brand', 'ui-emoji');

export const UI_MOTION_EMOJIS = [
  {
    key: 'products',
    emoji: '\u{1F6CD}\uFE0F',
    color: '0x22C55ECC',
    accent: '0xFACC15DD',
    shape: 'bag'
  },
  {
    key: 'topup',
    emoji: '\u{1F4B3}',
    color: '0x0EA5E9CC',
    accent: '0xFDE047DD',
    shape: 'card'
  },
  {
    key: 'account',
    emoji: '\u{1F464}',
    color: '0x8B5CF6CC',
    accent: '0x34D399DD',
    shape: 'profile'
  },
  {
    key: 'orders',
    emoji: '\u{1F4E6}',
    color: '0xF97316CC',
    accent: '0xA3E635DD',
    shape: 'box'
  },
  {
    key: 'language',
    emoji: '\u{1F310}',
    color: '0x2DD4BFCC',
    accent: '0x60A5FADD',
    shape: 'globe'
  },
  {
    key: 'support',
    emoji: '\u{1F6DF}',
    color: '0xF472B6CC',
    accent: '0xFDE047DD',
    shape: 'support'
  },
  {
    key: 'close',
    emoji: '\u274C',
    color: '0xF87171CC',
    accent: '0xCBD5E1DD',
    shape: 'close'
  }
];

export function buildUiMotionFfmpegArgs({
  icon,
  outputPath,
  size = 100,
  duration = 2,
  fps = 24,
  crf = 48
}) {
  if (!icon) throw new Error('Missing UI motion emoji definition.');
  const canvas = Number(size);
  const phase = `sin(2*PI*t/${Number(duration)})`;
  const filter = [
    'format=rgba',
    ...shapeFilters(icon, canvas, phase),
    ...sparkFilters(icon, canvas, phase),
    `rotate='0.02*${phase}':ow=${canvas}:oh=${canvas}:c=none`,
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

export async function generateUiMotionAssets(options = {}) {
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const ffmpegPath = await resolveFfmpegPath(options.ffmpegPath);
  const runCommand = options.runCommand || runProcess;
  await mkdir(outputDir, { recursive: true });

  const files = [];
  for (const icon of UI_MOTION_EMOJIS) {
    const fileName = `${icon.key}.webm`;
    const outputPath = resolve(outputDir, fileName);
    const args = buildUiMotionFfmpegArgs({
      icon,
      outputPath,
      size: options.size || 100,
      duration: options.duration || 2,
      fps: options.fps || 24,
      crf: options.crf || 48
    });
    await runCommand(ffmpegPath, args);
    files.push({
      key: icon.key,
      fileName,
      outputPath,
      emoji: icon.emoji
    });
  }

  return {
    ok: true,
    outputDir,
    generated: files.length,
    files
  };
}

function shapeFilters(icon, canvas, phase) {
  const bounce = `1.5*${phase}`;
  const filters = {
    bag: [
      `drawbox=x=21:y=34+${bounce}:w=58:h=44:color=0x00000044:t=fill`,
      `drawbox=x=24:y=32+${bounce}:w=52:h=46:color=${icon.color}:t=6`,
      `drawbox=x=34:y=22+${bounce}:w=32:h=20:color=${icon.accent}:t=6`,
      `drawbox=x=35:y=49+${bounce}:w=30:h=5:color=0xFFFFFF99:t=fill`
    ],
    card: [
      `drawbox=x=14:y=30+${bounce}:w=72:h=45:color=0x00000044:t=fill`,
      `drawbox=x=17:y=27+${bounce}:w=66:h=44:color=${icon.color}:t=6`,
      `drawbox=x=23:y=40+${bounce}:w=54:h=8:color=${icon.accent}:t=fill`,
      `drawbox=x=28:y=58+${bounce}:w=22:h=5:color=0xFFFFFFAA:t=fill`
    ],
    profile: [
      `drawbox=x=33:y=20+${bounce}:w=34:h=34:color=${icon.accent}:t=fill`,
      `drawbox=x=27:y=26+${bounce}:w=46:h=46:color=${icon.color}:t=5`,
      `drawbox=x=21:y=61+${bounce}:w=58:h=18:color=${icon.color}:t=fill`,
      `drawbox=x=27:y=61+${bounce}:w=46:h=18:color=0xFFFFFF55:t=3`
    ],
    box: [
      `drawbox=x=21:y=35+${bounce}:w=58:h=41:color=${icon.color}:t=6`,
      `drawbox=x=26:y=27+${bounce}:w=48:h=17:color=${icon.accent}:t=fill`,
      `drawbox=x=48:y=27+${bounce}:w=5:h=49:color=0xFFFFFF88:t=fill`,
      `drawbox=x=21:y=46+${bounce}:w=58:h=5:color=0xFFFFFF66:t=fill`
    ],
    globe: [
      `drawbox=x=20:y=20+${bounce}:w=60:h=60:color=${icon.color}:t=6`,
      `drawbox=x=34:y=20+${bounce}:w=5:h=60:color=${icon.accent}:t=fill`,
      `drawbox=x=61:y=20+${bounce}:w=5:h=60:color=${icon.accent}:t=fill`,
      `drawbox=x=20:y=48+${bounce}:w=60:h=5:color=0xFFFFFF99:t=fill`,
      `drawbox=x=27:y=31+${bounce}:w=46:h=5:color=0xFFFFFF66:t=fill`,
      `drawbox=x=27:y=64+${bounce}:w=46:h=5:color=0xFFFFFF66:t=fill`
    ],
    support: [
      `drawbox=x=20:y=30+${bounce}:w=60:h=38:color=${icon.color}:t=6`,
      `drawbox=x=17:y=47+${bounce}:w=17:h=26:color=${icon.accent}:t=fill`,
      `drawbox=x=66:y=47+${bounce}:w=17:h=26:color=${icon.accent}:t=fill`,
      `drawbox=x=52:y=72+${bounce}:w=27:h=5:color=0xFFFFFFBB:t=fill`,
      `drawbox=x=74:y=67+${bounce}:w=8:h=8:color=0xFFFFFFCC:t=fill`
    ],
    close: [
      `drawbox=x=20:y=20+${bounce}:w=60:h=60:color=${icon.color}:t=5`,
      `drawbox=x=30:y=45+${bounce}:w=40:h=10:color=${icon.accent}:t=fill`,
      `drawbox=x=45:y=30+${bounce}:w=10:h=40:color=${icon.accent}:t=fill`,
      `drawbox=x=25:y=25+${bounce}:w=50:h=50:color=0xFFFFFF44:t=3`
    ]
  };
  return filters[icon.shape] || filters.bag;
}

function sparkFilters(icon, canvas, phase) {
  const bob = `1*${phase}`;
  return [
    `drawbox=x=${Math.round(canvas * 0.75)}:y=${Math.round(canvas * 0.18)}+${bob}:w=8:h=8:color=${icon.accent}:t=fill`,
    `drawbox=x=${Math.round(canvas * 0.79)}:y=${Math.round(canvas * 0.14)}+${bob}:w=3:h=16:color=${icon.accent}:t=fill`,
    `drawbox=x=${Math.round(canvas * 0.72)}:y=${Math.round(canvas * 0.21)}+${bob}:w=16:h=3:color=${icon.accent}:t=fill`,
    `drawbox=x=${Math.round(canvas * 0.16)}:y=${Math.round(canvas * 0.77)}-${bob}:w=6:h=6:color=0xFFFFFF88:t=fill`
  ];
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
    size: 100,
    duration: 2,
    fps: 24,
    crf: 48
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
    '  npm.cmd run telegram:generate-ui-motion',
    '',
    'Options:',
    '  --output <dir>      Defaults to public/brand/ui-emoji',
    '  --size <px>         Defaults to 100 for Telegram custom emoji video',
    '  --duration <sec>    Defaults to 2',
    '  --fps <fps>         Defaults to 24',
    '  --crf <value>       Defaults to 48',
    '  --ffmpeg <path>     Override ffmpeg binary path'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }
  const result = await generateUiMotionAssets(args);
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
