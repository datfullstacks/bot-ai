import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), 'public', 'brand', 'slogan-emoji');
const DEFAULT_IMAGE_DIR = resolve(process.cwd(), 'public', 'brand', 'slogan-image');
const DEFAULT_MANIFEST_PATH = resolve(process.cwd(), 'data', 'telegram-slogan-motion-assets.json');

export const SLOGAN_MOTION_EMOJIS = [
  {
    key: 'welcome',
    slogan: 'Chọn nhanh, nhận ngay',
    emoji: '✨',
    theme: 'welcome'
  },
  {
    key: 'catalog',
    slogan: 'Gói đẹp, chọn một chạm',
    emoji: '🛍️',
    theme: 'catalog'
  },
  {
    key: 'checkout',
    slogan: 'Giữ slot giá tốt',
    emoji: '💎',
    theme: 'premium'
  },
  {
    key: 'payment',
    slogan: 'Thanh toán chuẩn, giao tự động',
    emoji: '💳',
    theme: 'payment'
  },
  {
    key: 'delivery',
    slogan: 'Nhận hàng tức thì',
    emoji: '📦',
    theme: 'delivery'
  },
  {
    key: 'support',
    slogan: 'Admin hỗ trợ nhanh',
    emoji: '💬',
    theme: 'support'
  },
  {
    key: 'soldout',
    slogan: 'Hết slot, chờ mở thêm',
    emoji: '⚠️',
    theme: 'soldout'
  }
];

export const SLOGAN_TEXT_MOTION_EMOJIS = [
  {
    key: 'text-shopping-flow',
    slogan: 'Chọn nhanh - thanh toán gọn - nhận hàng liền',
    textLines: ['CHỌN NHANH - THANH TOÁN GỌN - NHẬN HÀNG LIỀN'],
    emoji: '✨',
    theme: 'catalog',
    kind: 'text',
    duration: 2.8
  }
];

const DEFAULT_SLOGAN_MOTION_ENTRIES = [
  ...SLOGAN_MOTION_EMOJIS,
  ...SLOGAN_TEXT_MOTION_EMOJIS
];

const THEME_STYLES = {
  welcome: {
    color: '0xEC4899CC',
    accent: '0xFDE68ADD',
    shine: '0xFFFFFFAA',
    shape: 'spark'
  },
  catalog: {
    color: '0x22C55ECC',
    accent: '0xFACC15DD',
    shine: '0xFFFFFF99',
    shape: 'bag'
  },
  premium: {
    color: '0xA855F7CC',
    accent: '0xFDE68ADD',
    shine: '0xFFFFFFAA',
    shape: 'gem'
  },
  payment: {
    color: '0x0EA5E9CC',
    accent: '0xFDE047DD',
    shine: '0xFFFFFF99',
    shape: 'card'
  },
  delivery: {
    color: '0xF97316CC',
    accent: '0xA3E635DD',
    shine: '0xFFFFFF99',
    shape: 'box'
  },
  support: {
    color: '0x14B8A6CC',
    accent: '0xF9A8D4DD',
    shine: '0xFFFFFFAA',
    shape: 'bubble'
  },
  soldout: {
    color: '0xF59E0BCC',
    accent: '0xF43F5EDD',
    shine: '0xFFFFFF99',
    shape: 'alert'
  }
};

export function inferSloganTheme(slogan, fallbackTheme = 'premium') {
  const text = String(slogan || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (/nhan hang|giao hang|delivery|ship/.test(text)) return 'delivery';
  if (/thanh toan|payment|chuyen khoan|ck|bank|qr|nap tien/.test(text)) return 'payment';
  if (/delivery|ship|tu dong/.test(text)) return 'delivery';
  if (/admin|ho tro|support|chat|tu van/.test(text)) return 'support';
  if (/(^|\s)(het|cho)(\s|$)|soldout|sold out|mo them|restock/.test(text)) return 'soldout';
  if (/san pham|danh muc|catalog|goi dep|chon/.test(text)) return 'catalog';
  if (/chao|welcome|xin chao|bat dau/.test(text)) return 'welcome';
  return THEME_STYLES[fallbackTheme] ? fallbackTheme : 'premium';
}

export function resolveSloganMotionEntries(options = {}) {
  const overrides = normalizeSloganOverrides(options.slogans || {});
  const source = options.entries || DEFAULT_SLOGAN_MOTION_ENTRIES;
  return source.map((entry) => {
    const hasOverride = Object.hasOwn(overrides, entry.key);
    const slogan = hasOverride ? overrides[entry.key] : entry.slogan;
    const theme = hasOverride ? inferSloganTheme(slogan, entry.theme) : entry.theme;
    return {
      ...entry,
      slogan,
      theme,
      textLines: entry.kind === 'text' && hasOverride ? sloganTextLines(slogan) : entry.textLines,
      style: THEME_STYLES[theme] || THEME_STYLES.premium
    };
  });
}

export function buildSloganMotionFfmpegArgs({
  entry,
  outputPath,
  size = 100,
  duration = 2,
  fps = 24,
  crf = 46
}) {
  if (!entry) throw new Error('Missing slogan motion emoji definition.');
  const canvas = Number(size);
  const motionDuration = Number(entry.duration || duration);
  const phase = `sin(2*PI*t/${motionDuration})`;
  const filter = buildSloganVisualFilter({ entry, canvas, phase, fps, duration: motionDuration });

  return [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x00000000:s=${canvas}x${canvas}:d=${motionDuration}:r=${Number(fps)}`,
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

export function buildSloganImageFfmpegArgs({
  entry,
  outputPath,
  size = 100
}) {
  if (!entry) throw new Error('Missing slogan image definition.');
  const canvas = Number(size);
  const filter = buildSloganVisualFilter({ entry, canvas, phase: '0', still: true });

  return [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x00000000:s=${canvas}x${canvas}:d=1:r=1`,
    '-vf', filter,
    '-frames:v', '1',
    outputPath
  ];
}

export async function generateSloganMotionAssets(options = {}) {
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const imageDir = options.imageDir || DEFAULT_IMAGE_DIR;
  const manifestPath = options.manifestPath === false ? '' : (options.manifestPath || DEFAULT_MANIFEST_PATH);
  const ffmpegPath = await resolveFfmpegPath(options.ffmpegPath);
  const runCommand = options.runCommand || runProcess;
  const entries = resolveSloganMotionEntries(options);
  await mkdir(outputDir, { recursive: true });
  await mkdir(imageDir, { recursive: true });

  const files = [];
  for (const entry of entries) {
    const fileName = `${entry.key}.webm`;
    const outputPath = resolve(outputDir, fileName);
    const imageName = `${entry.key}.png`;
    const imagePath = resolve(imageDir, imageName);
    const args = buildSloganMotionFfmpegArgs({
      entry,
      outputPath,
      size: options.size || 100,
      duration: options.duration || 2,
      fps: options.fps || 24,
      crf: options.crf || 46
    });
    await runCommand(ffmpegPath, args);
    const imageArgs = buildSloganImageFfmpegArgs({
      entry,
      outputPath: imagePath,
      size: options.size || 100
    });
    await runCommand(ffmpegPath, imageArgs);
    files.push({
      key: entry.key,
      fileName,
      outputPath,
      motionName: fileName,
      motionPath: outputPath,
      imageName,
      imagePath,
      slogan: entry.slogan,
      textLines: entry.textLines,
      emoji: entry.emoji,
      theme: entry.theme
    });
  }

  const result = {
    ok: true,
    outputDir,
    imageDir,
    generated: files.length,
    files
  };

  if (manifestPath) {
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    result.manifestPath = manifestPath;
  }

  return result;
}

function buildSloganVisualFilter({ entry, canvas, phase, fps, duration = 2, still = false }) {
  if (entry.kind === 'text') {
    return buildSloganTextVisualFilter({ entry, canvas, phase, fps, duration, still });
  }
  const style = entry.style || THEME_STYLES[entry.theme] || THEME_STYLES.premium;
  return [
    'format=rgba',
    ...baseGlowFilters(style, canvas, phase),
    ...shapeFilters(style, canvas, phase),
    ...sparkFilters(style, canvas, phase),
    `rotate='0.025*${phase}':ow=${canvas}:oh=${canvas}:c=none`,
    fps ? `fps=${Number(fps)}` : '',
    fps ? 'format=yuva420p' : 'format=rgba'
  ].filter(Boolean).join(',');
}

function buildSloganTextVisualFilter({ entry, canvas, phase, fps, duration, still }) {
  const style = entry.style || THEME_STYLES[entry.theme] || THEME_STYLES.premium;
  const lines = (entry.textLines?.length ? entry.textLines : sloganTextLines(entry.slogan)).slice(0, 1);
  const lineCount = Math.max(1, lines.length);
  const fontSize = 24;
  const lineGap = 0;
  const totalHeight = lineCount * fontSize + (lineCount - 1) * lineGap;
  const top = Math.round((canvas - totalHeight) / 2);
  const fontFile = normalizeFontFile(process.env.SLOGAN_TEXT_FONT_FILE || 'C:/Windows/Fonts/arialbd.ttf');
  const yPulse = still ? '0' : `1.2*${phase}`;
  const xExpression = still ? '(w-text_w)/2' : `w-(w+text_w)*mod(t\\,${Number(duration)})/${Number(duration)}`;
  const textFilters = lines.map((line, index) => (
    `drawtext=fontfile='${escapeDrawtextValue(fontFile)}':text='${escapeDrawtextValue(line)}':` +
    `x=${xExpression}:y=${top + index * (fontSize + lineGap)}-${yPulse}:fontsize=${fontSize}:` +
    `fontcolor=0xFFFFFF:borderw=2:bordercolor=${style.color}:` +
    'alpha=1'
  ));

  return [
    'format=rgba',
    ...textFilters,
    `rotate='0.012*${phase}':ow=${canvas}:oh=${canvas}:c=none`,
    fps ? `fps=${Number(fps)}` : '',
    fps ? 'format=yuva420p' : 'format=rgba'
  ].filter(Boolean).join(',');
}

function normalizeSloganOverrides(slogans) {
  if (Array.isArray(slogans)) {
    return Object.fromEntries(slogans.map(parseSloganPair));
  }
  return Object.fromEntries(Object.entries(slogans).map(([key, value]) => [normalizeKey(key), String(value || '').trim()]).filter(([, value]) => value));
}

function parseSloganPair(value) {
  const raw = String(value || '');
  const separator = raw.indexOf('=');
  if (separator === -1) throw new Error(`Invalid slogan override: ${raw}. Use key=value.`);
  const key = normalizeKey(raw.slice(0, separator));
  const slogan = raw.slice(separator + 1).trim();
  if (!key || !slogan) throw new Error(`Invalid slogan override: ${raw}. Use key=value.`);
  return [key, slogan];
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function sloganTextLines(value) {
  const compact = String(value || '').trim().replace(/\s+/g, ' ');
  if (!compact) return [];
  return [compact.toUpperCase()];
}

function normalizeFontFile(filePath) {
  return String(filePath || '').replaceAll('\\', '/').replace(/^([A-Za-z]):/, '$1\\:');
}

function escapeDrawtextValue(value) {
  return String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'")
    .replaceAll('%', '\\%');
}

function baseGlowFilters(style, canvas, phase) {
  const pulse = `2*${phase}`;
  return [
    `drawbox=x=13-${pulse}:y=13-${pulse}:w=74+4*${phase}:h=74+4*${phase}:color=0x00000022:t=fill`,
    `drawbox=x=17:y=17:w=66:h=66:color=${style.color}:t=5`,
    `drawbox=x=22:y=22:w=56:h=56:color=0xFFFFFF22:t=2`
  ];
}

function shapeFilters(style, canvas, phase) {
  const bob = `1.5*${phase}`;
  const filters = {
    spark: [
      `drawbox=x=47:y=20+${bob}:w=6:h=60:color=${style.accent}:t=fill`,
      `drawbox=x=20:y=47+${bob}:w=60:h=6:color=${style.accent}:t=fill`,
      `drawbox=x=34:y=34+${bob}:w=32:h=32:color=${style.color}:t=5`,
      `drawbox=x=41:y=41+${bob}:w=18:h=18:color=${style.shine}:t=fill`
    ],
    bag: [
      `drawbox=x=24:y=34+${bob}:w=52:h=43:color=${style.color}:t=6`,
      `drawbox=x=34:y=24+${bob}:w=32:h=20:color=${style.accent}:t=5`,
      `drawbox=x=35:y=52+${bob}:w=30:h=5:color=${style.shine}:t=fill`
    ],
    gem: [
      `drawbox=x=28:y=32+${bob}:w=44:h=36:color=${style.color}:t=fill`,
      `drawbox=x=22:y=40+${bob}:w=56:h=20:color=${style.accent}:t=4`,
      `drawbox=x=37:y=25+${bob}:w=26:h=16:color=${style.shine}:t=fill`,
      `drawbox=x=47:y=32+${bob}:w=6:h=36:color=0xFFFFFFAA:t=fill`
    ],
    card: [
      `drawbox=x=17:y=29+${bob}:w=66:h=44:color=${style.color}:t=6`,
      `drawbox=x=23:y=41+${bob}:w=54:h=8:color=${style.accent}:t=fill`,
      `drawbox=x=29:y=59+${bob}:w=23:h=5:color=${style.shine}:t=fill`
    ],
    box: [
      `drawbox=x=22:y=35+${bob}:w=56:h=41:color=${style.color}:t=6`,
      `drawbox=x=27:y=28+${bob}:w=46:h=17:color=${style.accent}:t=fill`,
      `drawbox=x=48:y=28+${bob}:w=5:h=48:color=${style.shine}:t=fill`,
      `drawbox=x=22:y=46+${bob}:w=56:h=5:color=0xFFFFFF66:t=fill`
    ],
    bubble: [
      `drawbox=x=20:y=30+${bob}:w=60:h=38:color=${style.color}:t=6`,
      `drawbox=x=31:y=44+${bob}:w=8:h=8:color=${style.accent}:t=fill`,
      `drawbox=x=46:y=44+${bob}:w=8:h=8:color=${style.accent}:t=fill`,
      `drawbox=x=61:y=44+${bob}:w=8:h=8:color=${style.accent}:t=fill`,
      `drawbox=x=31:y=66+${bob}:w=21:h=9:color=${style.color}:t=fill`
    ],
    alert: [
      `drawbox=x=31:y=25+${bob}:w=38:h=48:color=${style.color}:t=fill`,
      `drawbox=x=37:y=32+${bob}:w=26:h=34:color=${style.accent}:t=5`,
      `drawbox=x=47:y=37+${bob}:w=6:h=18:color=${style.shine}:t=fill`,
      `drawbox=x=47:y=60+${bob}:w=6:h=6:color=${style.shine}:t=fill`
    ]
  };
  return filters[style.shape] || filters.gem;
}

function sparkFilters(style, canvas, phase) {
  const bob = `1*${phase}`;
  return [
    `drawbox=x=${Math.round(canvas * 0.75)}:y=${Math.round(canvas * 0.17)}+${bob}:w=8:h=8:color=${style.accent}:t=fill`,
    `drawbox=x=${Math.round(canvas * 0.79)}:y=${Math.round(canvas * 0.13)}+${bob}:w=3:h=16:color=${style.accent}:t=fill`,
    `drawbox=x=${Math.round(canvas * 0.72)}:y=${Math.round(canvas * 0.20)}+${bob}:w=16:h=3:color=${style.accent}:t=fill`,
    `drawbox=x=${Math.round(canvas * 0.15)}:y=${Math.round(canvas * 0.76)}-${bob}:w=6:h=6:color=${style.shine}:t=fill`
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
    imageDir: DEFAULT_IMAGE_DIR,
    manifestPath: DEFAULT_MANIFEST_PATH,
    slogans: [],
    size: 100,
    duration: 2,
    fps: 24,
    crf: 46
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.outputDir = resolve(argv[++index]);
    else if (arg === '--image-output') args.imageDir = resolve(argv[++index]);
    else if (arg === '--manifest') args.manifestPath = resolve(argv[++index]);
    else if (arg === '--no-manifest') args.manifestPath = false;
    else if (arg === '--slogan') args.slogans.push(argv[++index]);
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
    '  npm.cmd run telegram:generate-slogan-motion',
    '  npm.cmd run telegram:generate-slogan-motion -- --slogan welcome="Chọn nhanh, nhận ngay"',
    '',
    'Options:',
    '  --slogan <key=text>  Override one slogan. Keys include welcome, catalog, payment, delivery, support, text-shopping-flow',
    '  --output <dir>       Defaults to public/brand/slogan-emoji',
    '  --image-output <dir> Defaults to public/brand/slogan-image',
    '  --manifest <path>    Defaults to data/telegram-slogan-motion-assets.json',
    '  --no-manifest        Skip writing the local slogan manifest',
    '  --size <px>          Defaults to 100 for Telegram custom emoji video',
    '  --duration <sec>     Defaults to 2',
    '  --fps <fps>          Defaults to 24',
    '  --crf <value>        Defaults to 46',
    '  --ffmpeg <path>      Override ffmpeg binary path'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }
  const result = await generateSloganMotionAssets(args);
  console.log(JSON.stringify({
    ok: true,
    outputDir: result.outputDir,
    imageDir: result.imageDir,
    manifestPath: result.manifestPath || '',
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
