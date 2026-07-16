import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SLOGAN_TILE_DEFINITIONS,
  buildSloganTileEmojiMap,
  buildSloganTilePythonArgs,
  generateSloganTileAssets
} from './telegram-slogan-tile-assets.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-slogan-tile-'));

try {
  const dailyUpdate = SLOGAN_TILE_DEFINITIONS.find((item) => item.key === 'daily_update');
  assert.ok(dailyUpdate, 'Daily update slogan tile should be defined.');
  assert.equal(dailyUpdate.text, 'DAILY UPDATE');
  assert.equal(dailyUpdate.fallbackText, '🎫 DAILY UPDATE 🎫');
  assert.equal(dailyUpdate.emoji, '🎫');
  assert.equal(dailyUpdate.tileCount, 6);
  assert.equal(dailyUpdate.effect, 'marquee_text');
  assert.equal(
    SLOGAN_TILE_DEFINITIONS.reduce((sum, item) => sum + item.tileCount, 0) <= 50,
    true,
    'Slogan tile pack must stay within Telegram createNewStickerSet initial limits.'
  );

  const args = buildSloganTilePythonArgs({
    outputDir: join(tempDir, 'out'),
    manifestPath: join(tempDir, 'manifest.json'),
    previewPath: join(tempDir, 'preview.png'),
    size: 100,
    duration: 2,
    fps: 24,
    ffmpegPath: 'ffmpeg-test'
  });
  assert.ok(args[0].endsWith('telegram-slogan-tile-assets.py'));
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
    generated: dailyUpdate.tileCount,
    slogans: {
      daily_update: {
        key: 'daily_update',
        text: 'DAILY UPDATE',
        fallbackText: '🎫 DAILY UPDATE 🎫',
        emoji: '🎫',
        effect: 'marquee_text',
        placeholder: '🎫🎫🎫🎫🎫🎫',
        tiles: Array.from({ length: dailyUpdate.tileCount }, (_, index) => ({
          index,
          key: `daily_update_${String(index).padStart(2, '0')}`,
          emoji: '🎫',
          fileName: `daily_update_${String(index).padStart(2, '0')}.webm`,
          outputPath: join(tempDir, 'out', `daily_update_${String(index).padStart(2, '0')}.webm`)
        }))
      }
    },
    files: Array.from({ length: dailyUpdate.tileCount }, (_, index) => ({
      sloganKey: 'daily_update',
      index,
      key: `daily_update_${String(index).padStart(2, '0')}`,
      emoji: '🎫',
      fileName: `daily_update_${String(index).padStart(2, '0')}.webm`,
      outputPath: join(tempDir, 'out', `daily_update_${String(index).padStart(2, '0')}.webm`)
    }))
  }), 'utf8');

  const commands = [];
  const result = await generateSloganTileAssets({
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
  assert.equal(result.generated, dailyUpdate.tileCount);
  assert.equal(result.slogans.daily_update.placeholder, '🎫🎫🎫🎫🎫🎫');
  assert.equal(result.files.every((file) => file.emoji === '🎫'), true);

  const emojiMap = buildSloganTileEmojiMap({
    assetManifest: result,
    uploadResult: {
      packName: 'kaito_ai_shop_slogan_tiles_by_bot',
      title: 'KAITO AI SHOP Slogan Tiles',
      stickerType: 'custom_emoji',
      stickerFormat: 'video',
      stickers: result.files.map((file, index) => ({
        ...file,
        brandKey: file.key,
        customEmojiId: `ce_daily_update_${index}`
      }))
    }
  });

  assert.equal(emojiMap.packName, 'kaito_ai_shop_slogan_tiles_by_bot');
  assert.equal(emojiMap.slogans.daily_update.fallbackText, '🎫 DAILY UPDATE 🎫');
  assert.equal(emojiMap.slogans.daily_update.effect, 'marquee_text');
  assert.deepEqual(
    emojiMap.slogans.daily_update.tiles.map((tile) => tile.customEmojiId),
    Array.from({ length: dailyUpdate.tileCount }, (_, index) => `ce_daily_update_${index}`)
  );

  console.log(JSON.stringify({ ok: true, checked: 'telegram slogan tile assets' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
