import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SHOP_STICKERS,
  buildShopStickerFfmpegArgs,
  generateShopStickerAssets
} from './telegram-shop-sticker-assets.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-shop-stickers-'));

try {
  assert.ok(SHOP_STICKERS.some((item) => item.stage === 'catalog'));
  assert.ok(SHOP_STICKERS.some((item) => item.stage === 'topup'));
  assert.ok(SHOP_STICKERS.some((item) => item.stage === 'support'));

  const args = buildShopStickerFfmpegArgs({
    sticker: SHOP_STICKERS.find((item) => item.stage === 'catalog'),
    outputPath: join(tempDir, 'catalog.webm')
  });
  const filter = args[args.indexOf('-vf') + 1];
  assert.ok(args.includes('libvpx-vp9'), 'Telegram video stickers must use VP9.');
  assert.ok(args.includes('-auto-alt-ref'), 'Telegram video stickers need VP9 alt-ref disabled.');
  assert.match(filter, /drawtext=.*SAN PHAM/, 'Catalog sticker should have a readable shop-flow title.');
  assert.match(filter, /rotate=/, 'Shop stickers should have subtle motion.');
  assert.equal(args.at(-1).endsWith('catalog.webm'), true);

  const commands = [];
  const result = await generateShopStickerAssets({
    outputDir: tempDir,
    ffmpegPath: 'ffmpeg-test',
    runCommand: async (command, commandArgs) => {
      commands.push({ command, commandArgs });
    }
  });

  assert.equal(result.generated, SHOP_STICKERS.length);
  assert.deepEqual(result.files.map((file) => file.stage), SHOP_STICKERS.map((item) => item.stage));
  assert.equal(commands.length, SHOP_STICKERS.length);
  assert.equal(commands[0].command, 'ffmpeg-test');
  assert.ok(commands[0].commandArgs.some((arg) => arg.endsWith('.webm')));

  console.log(JSON.stringify({ ok: true, checked: 'telegram shop sticker asset generation' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
