import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildRoboEmojiMap,
  importRoboEmojiPack,
  roboAliasEntries
} from './telegram-robo-emoji-pack.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-robo-emoji-pack-'));
const outputPath = join(tempDir, 'telegram-robo-emoji-map.json');

try {
  assert.equal(roboAliasEntries.wave, '👋');
  assert.equal(roboAliasEntries.money, '🤑');

  const stickerSet = {
    name: 'RoboEmoji',
    title: 'Robo Emoji',
    sticker_type: 'custom_emoji',
    stickers: [
      sticker('ce_robo_wave', '👋', { is_video: true }),
      sticker('ce_robo_wow', '🤩', { is_video: true }),
      sticker('ce_robo_money', '🤑', { is_video: true }),
      sticker('ce_robo_ok', '👌', { is_video: true }),
      sticker('ce_robo_hundred', '💯', { is_video: true }),
      sticker('ce_robo_salute', '🫡', { is_video: true })
    ]
  };

  const built = buildRoboEmojiMap(stickerSet);
  assert.equal(built.packName, 'RoboEmoji');
  assert.equal(built.title, 'Robo Emoji');
  assert.equal(built.stickerType, 'custom_emoji');
  assert.equal(built.stickerFormat, 'video');
  assert.equal(built.source, 'https://t.me/addemoji/RoboEmoji');
  assert.equal(built.customEmojiIdsByEmoji['👋'], 'ce_robo_wave');
  assert.deepEqual(built.customEmojiIdsByAlias.wave, ['ce_robo_wave']);
  assert.deepEqual(built.customEmojiIdsByAlias.money, ['ce_robo_money']);
  assert.deepEqual(built.customEmojiIdsByAlias.ok, ['ce_robo_ok']);
  assert.deepEqual(built.customEmojiIdsByAlias.hundred, ['ce_robo_hundred']);
  assert.deepEqual(built.customEmojiIdsByAlias.salute, ['ce_robo_salute']);
  assert.equal(built.stickers[0].customEmojiId, 'ce_robo_wave');

  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    assert.ok(String(url).includes('/getStickerSet'));
    return telegramOk(stickerSet);
  };

  const imported = await importRoboEmojiPack({
    token: '123:test',
    packName: 'RoboEmoji',
    outputPath,
    fetchImpl
  });

  assert.equal(imported.customEmojiIdsByEmoji['🤩'], 'ce_robo_wow');
  assert.equal(calls[0].body.name, 'RoboEmoji');

  const saved = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.equal(saved.customEmojiIdsByAlias.wave[0], 'ce_robo_wave');
  assert.equal(saved.customEmojiIdsByAlias.money[0], 'ce_robo_money');

  console.log(JSON.stringify({ ok: true, checked: 'telegram robo emoji pack import' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function telegramOk(result) {
  return {
    ok: true,
    async json() {
      return { ok: true, result };
    }
  };
}

function sticker(customEmojiId, emoji, extra = {}) {
  return {
    file_id: `file_${customEmojiId}`,
    file_unique_id: `unique_${customEmojiId}`,
    type: 'custom_emoji',
    width: 100,
    height: 100,
    is_animated: false,
    is_video: false,
    emoji,
    custom_emoji_id: customEmojiId,
    ...extra
  };
}
