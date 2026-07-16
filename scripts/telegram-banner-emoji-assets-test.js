import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BANNER_EMOJI_ITEMS,
  buildBannerEmojiPythonArgs,
  generateBannerEmojiAssets
} from './telegram-banner-emoji-assets.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-banner-emoji-'));

try {
  assert.deepEqual(
    BANNER_EMOJI_ITEMS.map((item) => item.key),
    [
      'kaito',
      'welcome',
      'products',
      'orders',
      'support',
      'account',
      'checkin',
      'minigame',
      'vip',
      'hot',
      'new',
      'sale',
      'auto247',
      'trusted',
      'delivery',
      'payment',
      'ai',
      'mmo',
      'instant',
      'secure',
      'guide',
      'contact',
      'stock',
      'soldout',
      'review',
      'refund',
      'combo',
      'member',
      'news',
      'event',
      'policy',
      'logout'
    ]
  );
  assert.equal(BANNER_EMOJI_ITEMS.length <= 50, true, 'Banner pack must stay within createNewStickerSet initial sticker limits.');
  assert.equal(BANNER_EMOJI_ITEMS.find((item) => item.key === 'kaito').text, 'KAITO');
  assert.equal(BANNER_EMOJI_ITEMS.find((item) => item.key === 'minigame').text, 'GAME');
  assert.equal(BANNER_EMOJI_ITEMS.find((item) => item.key === 'auto247').text, '24/7');
  assert.equal(BANNER_EMOJI_ITEMS.find((item) => item.key === 'refund').text, 'REFUND');
  assert.equal(BANNER_EMOJI_ITEMS.find((item) => item.key === 'logout').text, 'LOGOUT');
  assert.equal(BANNER_EMOJI_ITEMS.find((item) => item.key === 'ai').emoji, '\u{1F916}');
  assert.equal(BANNER_EMOJI_ITEMS.some((item) => item.emoji === '\u2726'), false, 'Telegram createNewStickerSet rejects text symbols that are not emoji_list Unicode emoji.');

  const args = buildBannerEmojiPythonArgs({
    outputDir: join(tempDir, 'out'),
    manifestPath: join(tempDir, 'manifest.json'),
    previewPath: join(tempDir, 'preview.png'),
    size: 100,
    duration: 2,
    fps: 24,
    ffmpegPath: 'ffmpeg-test'
  });
  assert.ok(args[0].endsWith('telegram-banner-emoji-assets.py'));
  assert.ok(args.includes('--output'));
  assert.ok(args.includes('--manifest'));
  assert.ok(args.includes('--preview'));
  assert.ok(args.includes('--ffmpeg'));
  assert.equal(args.at(-1), 'ffmpeg-test');

  const manifestPath = join(tempDir, 'generated-manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    ok: true,
    outputDir: join(tempDir, 'out'),
    previewPath: join(tempDir, 'preview.png'),
    generated: BANNER_EMOJI_ITEMS.length,
    files: BANNER_EMOJI_ITEMS.map((item) => ({
      key: item.key,
      text: item.text,
      emoji: item.emoji,
      fileName: `${item.key}.webm`,
      outputPath: join(tempDir, 'out', `${item.key}.webm`)
    }))
  }), 'utf8');

  const commands = [];
  const result = await generateBannerEmojiAssets({
    outputDir: join(tempDir, 'out'),
    manifestPath,
    previewPath: join(tempDir, 'preview.png'),
    pythonPath: 'python-test',
    ffmpegPath: 'ffmpeg-test',
    runCommand: async (command, commandArgs) => {
      commands.push({ command, commandArgs });
    }
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0].command, 'python-test');
  assert.ok(commands[0].commandArgs.includes('--ffmpeg'));
  assert.ok(commands[0].commandArgs.includes('--preview'));
  assert.equal(result.generated, BANNER_EMOJI_ITEMS.length);
  assert.deepEqual(result.files.map((file) => file.key), BANNER_EMOJI_ITEMS.map((item) => item.key));
  assert.equal(result.files.every((file) => Boolean(file.emoji)), true);

  console.log(JSON.stringify({ ok: true, checked: 'telegram banner emoji assets' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
