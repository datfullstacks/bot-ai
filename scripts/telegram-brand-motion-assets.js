import { mkdir, readdir } from 'node:fs/promises';
import { extname, parse, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCE_DIR = resolve(process.cwd(), 'public', 'brand', 'emoji');
const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), 'public', 'brand', 'motion-emoji');

export async function collectMotionEntries(sourceDir = DEFAULT_SOURCE_DIR, outputDir = DEFAULT_OUTPUT_DIR) {
  const files = await readdir(sourceDir, { withFileTypes: true });
  return files
    .filter((file) => file.isFile())
    .filter((file) => ['.png', '.webp'].includes(extname(file.name).toLowerCase()))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((file) => {
      const name = parse(file.name).name;
      const outputName = `${name}.webm`;
      return {
        fileName: file.name,
        inputPath: resolve(sourceDir, file.name),
        outputName,
        outputPath: resolve(outputDir, outputName)
      };
    });
}

export function buildMotionFfmpegArgs({
  inputPath,
  outputPath,
  size = 100,
  duration = 2,
  fps = 24,
  crf = 50,
  logoScale = 0.94
}) {
  const normalizedLogoScale = Math.min(1, Math.max(0.1, Number(logoScale) || 0.94));
  const logoSize = Math.max(1, Math.round(Number(size) * normalizedLogoScale));
  const canvas = Number(size);
  const frameRate = Math.max(1, Math.round(Number(fps) || 30));
  const spinFrameCount = Math.max(1, Math.round(frameRate * (Number(duration) || 3)));
  const filter = buildYSpinFilter({ logoSize, canvas, frameRate, spinFrameCount });

  return [
    '-y',
    '-loop', '1',
    '-i', inputPath,
    '-filter_complex', filter,
    '-map', '[v]',
    '-an',
    '-c:v', 'libvpx-vp9',
    '-b:v', '0',
    '-crf', String(crf),
    '-pix_fmt', 'yuva420p',
    '-auto-alt-ref', '0',
    outputPath
  ];
}

function buildYSpinFilter({ logoSize, canvas, frameRate, spinFrameCount }) {
  const splitLabels = Array.from({ length: spinFrameCount }, (_, index) => `[f${index}]`).join('');
  const branches = [];
  const concatInputs = [];

  for (let index = 0; index < spinFrameCount; index += 1) {
    const angle = (2 * Math.PI * index) / spinFrameCount;
    const sideProfileWidth = Math.max(1, Math.round(logoSize * 0.06));
    const width = Math.max(sideProfileWidth, Math.round(logoSize * Math.abs(Math.cos(angle))));
    const backSide = Math.cos(angle) < 0 ? ',hflip' : '';
    branches.push(
      `[f${index}]trim=end_frame=1,scale=${width}:${logoSize},setsar=1${backSide},` +
      `pad=${canvas}:${canvas}:(ow-iw)/2:(oh-ih)/2:color=0x00000000[v${index}]`
    );
    concatInputs.push(`[v${index}]`);
  }

  return [
    `[0:v]format=rgba,scale=${logoSize}:${logoSize}:force_original_aspect_ratio=decrease,` +
      `pad=${logoSize}:${logoSize}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,` +
      'setsar=1,' +
      `split=${spinFrameCount}${splitLabels}`,
    ...branches,
    `${concatInputs.join('')}concat=n=${spinFrameCount}:v=1:a=0,` +
      `setpts=N/(${frameRate}*TB),fps=${frameRate},format=yuva420p[v]`
  ].join(';');
}

export async function generateMotionAssets(options = {}) {
  const sourceDir = options.sourceDir || DEFAULT_SOURCE_DIR;
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const ffmpegPath = await resolveFfmpegPath(options.ffmpegPath);
  const runCommand = options.runCommand || runProcess;
  const entries = await collectMotionEntries(sourceDir, outputDir);
  if (!entries.length) throw new Error(`No .png or .webp source files found in ${sourceDir}.`);

  await mkdir(outputDir, { recursive: true });

  const files = [];
  for (const entry of entries) {
    const args = buildMotionFfmpegArgs({
      inputPath: entry.inputPath,
      outputPath: entry.outputPath,
      size: options.size || 100,
      duration: options.duration || 3,
      fps: options.fps || 30,
      crf: options.crf || 42,
      logoScale: options.logoScale ?? 0.94
    });
    await runCommand(ffmpegPath, args);
    files.push({
      fileName: entry.fileName,
      outputName: entry.outputName,
      outputPath: entry.outputPath
    });
  }

  return {
    ok: true,
    sourceDir,
    outputDir,
    generated: files.length,
    files
  };
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
    sourceDir: DEFAULT_SOURCE_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    size: 100,
    duration: 2,
    fps: 24,
    crf: 50,
    logoScale: 0.94
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') args.sourceDir = resolve(argv[++index]);
    else if (arg === '--output') args.outputDir = resolve(argv[++index]);
    else if (arg === '--size') args.size = Number(argv[++index]);
    else if (arg === '--duration') args.duration = Number(argv[++index]);
    else if (arg === '--fps') args.fps = Number(argv[++index]);
    else if (arg === '--crf') args.crf = Number(argv[++index]);
    else if (arg === '--logo-scale') args.logoScale = Number(argv[++index]);
    else if (arg === '--ffmpeg') args.ffmpegPath = argv[++index];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function helpText() {
  return [
    'Usage:',
    '  npm.cmd run telegram:generate-brand-motion',
    '',
    'Options:',
    '  --source <dir>      Defaults to public/brand/emoji',
    '  --output <dir>      Defaults to public/brand/motion-emoji',
    '  --size <px>         Defaults to 100 for Telegram custom emoji video',
    '  --duration <sec>    Defaults to 2',
    '  --fps <fps>         Defaults to 24',
    '  --crf <value>       Defaults to 50',
    '  --logo-scale <n>    Defaults to 0.94, use lower values for more padding',
    '  --ffmpeg <path>     Override ffmpeg binary path'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }
  const result = await generateMotionAssets(args);
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
