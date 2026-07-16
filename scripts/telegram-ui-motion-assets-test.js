import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  UI_MOTION_EMOJIS,
  buildUiMotionFfmpegArgs,
  generateUiMotionAssets
} from './telegram-ui-motion-assets.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-ui-motion-'));

try {
  assert.deepEqual(
    UI_MOTION_EMOJIS.map((item) => item.key),
    ['products', 'topup', 'account', 'orders', 'language', 'support', 'close']
  );

  const args = buildUiMotionFfmpegArgs({
    icon: UI_MOTION_EMOJIS.find((item) => item.key === 'products'),
    outputPath: join(tempDir, 'products.webm')
  });
  const filter = args[args.indexOf('-vf') + 1];
  assert.ok(args.includes('libvpx-vp9'), 'UI custom emoji videos should use VP9.');
  assert.ok(args.includes('-auto-alt-ref'), 'UI custom emoji videos should disable VP9 alt-ref for alpha.');
  assert.match(filter, /drawbox=.*0x22C55E/, 'Products icon should use a strong shop-green neon stroke.');
  assert.match(filter, /drawbox=.*0xFACC15/, 'Products icon should keep a warm premium accent.');
  assert.equal(filter.includes('drawtext'), false, 'UI motion emoji should avoid tiny text inside the icon.');
  assert.match(filter, /rotate='0\.02\*/, 'UI motion emoji should have only a subtle premium tilt.');
  assert.equal(args.at(-1).endsWith('products.webm'), true);

  const commands = [];
  const result = await generateUiMotionAssets({
    outputDir: tempDir,
    ffmpegPath: 'ffmpeg-test',
    runCommand: async (command, commandArgs) => {
      commands.push({ command, commandArgs });
    }
  });

  assert.equal(result.generated, UI_MOTION_EMOJIS.length);
  assert.deepEqual(result.files.map((file) => file.fileName), UI_MOTION_EMOJIS.map((item) => `${item.key}.webm`));
  assert.equal(commands.length, UI_MOTION_EMOJIS.length);
  assert.equal(commands[0].command, 'ffmpeg-test');
  assert.ok(commands[0].commandArgs.some((arg) => arg.endsWith('products.webm')));

  console.log(JSON.stringify({ ok: true, checked: 'telegram UI motion emoji asset generation' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
