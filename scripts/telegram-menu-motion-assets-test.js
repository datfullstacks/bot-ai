import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MENU_MOTION_ITEMS,
  buildMenuMotionPythonArgs,
  generateMenuMotionAssets
} from './telegram-menu-motion-assets.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-menu-motion-'));

try {
  assert.deepEqual(
    MENU_MOTION_ITEMS.map((item) => item.key),
    [
      'products',
      'topup',
      'account',
      'orders',
      'language',
      'support',
      'security',
      'instant-delivery',
      'automation-247',
      'quality',
      'member',
      'offers',
      'notifications',
      'promotions',
      'reviews',
      'academy',
      'news',
      'events',
      'policy',
      'logout'
    ]
  );

  assert.equal(MENU_MOTION_ITEMS.find((item) => item.key === 'products').effect, 'shake');
  assert.equal(MENU_MOTION_ITEMS.find((item) => item.key === 'topup').effect, 'pulse-glow');
  assert.equal(MENU_MOTION_ITEMS.find((item) => item.key === 'language').effect, 'rotate');
  assert.equal(MENU_MOTION_ITEMS.find((item) => item.key === 'security').effect, 'sweep-glow');
  assert.equal(MENU_MOTION_ITEMS.find((item) => item.key === 'automation-247').effect, 'trail-rotate');
  assert.equal(MENU_MOTION_ITEMS.find((item) => item.key === 'notifications').effect, 'alert-shake');
  assert.equal(MENU_MOTION_ITEMS.find((item) => item.key === 'logout').effect, 'power-fade');

  const args = buildMenuMotionPythonArgs({
    sourceImage: join(tempDir, 'source.png'),
    outputDir: join(tempDir, 'out'),
    cropDir: join(tempDir, 'crops'),
    manifestPath: join(tempDir, 'manifest.json'),
    size: 100,
    duration: 2,
    fps: 24,
    crf: 42,
    ffmpegPath: 'ffmpeg-test'
  });
  assert.equal(args.includes('--source'), true);
  assert.equal(args.includes('--output'), true);
  assert.equal(args.includes('--crops'), true);
  assert.equal(args.includes('--manifest'), true);
  assert.equal(args.includes('--ffmpeg'), true);
  assert.equal(args.at(-1), 'ffmpeg-test');
  assert.ok(args[0].endsWith('telegram-menu-motion-assets.py'));

  const manifestPath = join(tempDir, 'generated-manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    ok: true,
    outputDir: join(tempDir, 'out'),
    cropDir: join(tempDir, 'crops'),
    generated: MENU_MOTION_ITEMS.length,
    files: MENU_MOTION_ITEMS.map((item) => ({
      key: item.key,
      effect: item.effect,
      cropBox: [1, 2, 3, 4],
      motionName: `${item.key}.webm`
    }))
  }), 'utf8');

  const commands = [];
  const result = await generateMenuMotionAssets({
    sourceImage: join(tempDir, 'source.png'),
    outputDir: join(tempDir, 'out'),
    cropDir: join(tempDir, 'crops'),
    manifestPath,
    pythonPath: 'python-test',
    ffmpegPath: 'ffmpeg-test',
    runCommand: async (command, commandArgs) => {
      commands.push({ command, commandArgs });
    }
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].command, 'python-test');
  assert.ok(commands[0].commandArgs.includes('--ffmpeg'));
  assert.equal(result.generated, MENU_MOTION_ITEMS.length);
  assert.deepEqual(result.files.map((file) => file.key), MENU_MOTION_ITEMS.map((item) => item.key));
  assert.deepEqual(result.files.map((file) => file.effect), MENU_MOTION_ITEMS.map((item) => item.effect));

  console.log(JSON.stringify({ ok: true, checked: 'telegram neon menu motion assets' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
