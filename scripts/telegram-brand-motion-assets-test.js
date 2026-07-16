import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildMotionFfmpegArgs,
  collectMotionEntries,
  generateMotionAssets
} from './telegram-brand-motion-assets.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-motion-assets-'));
const sourceDir = join(tempDir, 'source');
const outputDir = join(tempDir, 'out');

try {
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, 'ChatGPT.png'), Buffer.from('fake-png-chatgpt'));
  await writeFile(join(sourceDir, 'Claude Brand.webp'), Buffer.from('fake-webp-claude'));
  await writeFile(join(sourceDir, 'ignore.txt'), 'nope');

  const entries = await collectMotionEntries(sourceDir);
  assert.deepEqual(entries.map((entry) => entry.fileName), ['ChatGPT.png', 'Claude Brand.webp']);
  assert.deepEqual(entries.map((entry) => entry.outputName), ['ChatGPT.webm', 'Claude Brand.webm']);

  const args = buildMotionFfmpegArgs({
    inputPath: 'in.png',
    outputPath: 'out.webm',
    size: 100
  });
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.match(filter, /scale=94:94/, 'motion emoji should zoom the brand mark close to the full 100px canvas.');
  assert.match(filter, /split=48/, 'motion emoji should render one frame per 24fps frame across 2 seconds.');
  assert.match(filter, /scale=6:94/, 'motion emoji should simulate Y-axis depth by shrinking width near the side profile.');
  assert.match(filter, /setsar=1/, 'motion emoji frames should reset sample aspect ratio before concat.');
  assert.match(filter, /hflip/, 'motion emoji should flip the logo on the back half of the 360 degree spin.');
  assert.match(filter, /concat=n=48:v=1:a=0/, 'motion emoji should stitch the precomputed 360 degree spin frames.');
  assert.match(filter, /setpts=N\/\(24\*TB\)/, 'motion emoji should keep the generated spin at 24fps.');
  assert.match(filter, /pad=100:100:\(ow-iw\)\/2:\(oh-ih\)\/2:color=0x00000000/, 'motion emoji should keep the final transparent 100px Telegram canvas.');
  assert.ok(!args.includes('-vf'), 'motion emoji should use filter_complex so every spin frame can be precomputed for older ffmpeg.');
  assert.equal(args[args.indexOf('-map') + 1], '[v]', 'ffmpeg args should map the rendered spin stream.');
  assert.ok(args.includes('-loop'), 'ffmpeg args should loop the static logo image.');
  assert.ok(args.includes('libvpx-vp9'), 'ffmpeg args should encode Telegram WEBM with VP9.');
  assert.ok(args.includes('-an'), 'ffmpeg args should remove audio.');
  assert.ok(args.includes('-auto-alt-ref'), 'ffmpeg args should support VP9 alpha compatibility.');
  assert.ok(args.at(-1).endsWith('out.webm'), 'ffmpeg args should end with the output path.');

  const commands = [];
  const result = await generateMotionAssets({
    sourceDir,
    outputDir,
    logoScale: 0.94,
    ffmpegPath: 'ffmpeg-test',
    runCommand: async (command, commandArgs) => {
      commands.push({ command, commandArgs });
    }
  });

  assert.equal(result.generated, 2);
  assert.deepEqual(result.files.map((file) => file.outputName), ['ChatGPT.webm', 'Claude Brand.webm']);
  assert.equal(commands.length, 2);
  assert.equal(commands[0].command, 'ffmpeg-test');
  assert.ok(commands[0].commandArgs.includes('-filter_complex'));
  assert.match(commands[0].commandArgs[commands[0].commandArgs.indexOf('-filter_complex') + 1], /scale=94:94/);
  assert.match(commands[0].commandArgs[commands[0].commandArgs.indexOf('-filter_complex') + 1], /hflip/);
  assert.ok(commands[0].commandArgs.includes('out') || commands[0].commandArgs.some((arg) => arg.endsWith('ChatGPT.webm')));

  console.log(JSON.stringify({ ok: true, checked: 'telegram brand motion asset generation' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
