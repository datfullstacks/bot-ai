import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  RETRO_FONT_LETTERS,
  buildRetroFontEmojiMap,
  importRetroFontEmojiPack
} from './telegram-retro-font-emoji-pack.js';

const letterStickers = [...RETRO_FONT_LETTERS].map((letter, index) => ({
  emoji: '\u{1F524}',
  custom_emoji_id: `ce_retro_${letter.toLowerCase()}`,
  file_id: `file_${index}`,
  file_unique_id: `unique_${index}`,
  is_animated: true,
  is_video: false
}));

const digitStickers = ['1', '2', '0'].map((digit, index) => ({
  emoji: `${digit}\uFE0F\u20E3`,
  custom_emoji_id: `ce_retro_${digit}`,
  file_id: `digit_${index}`,
  file_unique_id: `digit_unique_${index}`,
  is_animated: true,
  is_video: false
}));

const stickerSet = {
  name: 'RetroFontEmoji',
  title: 'Retro Font Emoji',
  sticker_type: 'custom_emoji',
  stickers: [...letterStickers, ...digitStickers]
};

const built = buildRetroFontEmojiMap(stickerSet);
assert.equal(built.packName, 'RetroFontEmoji');
assert.equal(built.stickerFormat, 'animated');
assert.equal(built.source, 'https://t.me/addemoji/RetroFontEmoji');
assert.equal(built.customEmojiIdsByCharacter.K, 'ce_retro_k');
assert.equal(built.customEmojiIdsByCharacter.A, 'ce_retro_a');
assert.equal(built.customEmojiIdsByCharacter.P, 'ce_retro_p');
assert.equal(built.customEmojiAltByCharacter.K, '\u{1F524}');
assert.equal(built.customEmojiIdsByCharacter['1'], 'ce_retro_1');
assert.equal(built.stickers.length, RETRO_FONT_LETTERS.length + digitStickers.length);

const tempDir = await mkdtemp(join(tmpdir(), 'telegram-retro-font-'));
const outputPath = join(tempDir, 'telegram-retro-font-emoji-map.json');
const calls = [];
try {
  const imported = await importRetroFontEmojiPack({
    token: '123:test',
    outputPath,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, result: stickerSet };
        }
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/getStickerSet'));
  assert.deepEqual(calls[0].body, { name: 'RetroFontEmoji' });
  assert.equal(imported.customEmojiIdsByCharacter.S, 'ce_retro_s');

  const saved = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.equal(saved.customEmojiIdsByCharacter.T, 'ce_retro_t');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, checked: 'telegram retro font emoji pack' }, null, 2));
