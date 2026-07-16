import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  NEWS_EMOJI_ALIASES_BY_INDEX,
  NEWS_EMOJI_COMPATIBILITY_ALIASES,
  NEWS_EMOJI_EXPECTED_EMOJI_BY_INDEX,
  NEWS_EMOJI_MINIMUM_ID_COUNT,
  buildNewsEmojiMap,
  syncNewsEmojiPack
} from './telegram-news-emoji-sync.js';

const generatedAt = '2026-07-17T12:00:00.000Z';
const stickerSet = newsStickerSet();
const tempDir = await mkdtemp(join(tmpdir(), 'kaito-news-emoji-sync-'));
const outputPath = join(tempDir, 'telegram-news-emoji-map.json');
const dryRunOutputPath = join(tempDir, 'dry-run-map.json');

try {
  assert.equal(NEWS_EMOJI_ALIASES_BY_INDEX.length, 100);
  assert.equal(NEWS_EMOJI_EXPECTED_EMOJI_BY_INDEX.length, 100);
  assert.equal(NEWS_EMOJI_EXPECTED_EMOJI_BY_INDEX[2], '\u26A1\uFE0F');
  assert.equal(NEWS_EMOJI_ALIASES_BY_INDEX[4], 'shopping-bag');
  assert.equal(NEWS_EMOJI_ALIASES_BY_INDEX[50], 'search');
  assert.equal(NEWS_EMOJI_ALIASES_BY_INDEX[99], 'party');
  assert.deepEqual(NEWS_EMOJI_COMPATIBILITY_ALIASES, {
    fast: 'comet',
    newsflash: 'lightning',
    auto247: 'refresh',
    tracking: 'search',
    adminchat: 'chat',
    adminshield: 'shield',
    adminboom: 'boom',
    adminfire: 'fire',
    adminhundred: 'hundred'
  });

  const built = buildNewsEmojiMap(stickerSet, { generatedAt });
  assert.equal(built.packName, 'NewsEmoji');
  assert.equal(built.title, 'News Emoji');
  assert.equal(built.stickerType, 'custom_emoji');
  assert.equal(built.stickerFormat, 'animated');
  assert.equal(built.source, 'https://t.me/addemoji/NewsEmoji');
  assert.equal(built.generatedAt, generatedAt);
  assert.equal(built.minimumRequiredCustomEmojiIds, NEWS_EMOJI_MINIMUM_ID_COUNT);
  assert.equal(built.stickers.length, 100);
  assert.equal(new Set(built.stickers.map((sticker) => sticker.customEmojiId)).size, 100);
  assert.equal(Object.keys(built.customEmojiIdsByBrand).length, 109);
  assert.equal(Object.keys(built.customEmojiIdsByAlias).length, 109);
  assert.deepEqual(built.customEmojiIdsByAlias['shopping-bag'], ['ce_news_004']);
  assert.deepEqual(built.customEmojiIdsByBrand.shoppingbag, ['ce_news_004']);
  assert.deepEqual(built.customEmojiIdsByBrand.fast, ['ce_news_003']);
  assert.deepEqual(built.customEmojiIdsByBrand.newsflash, ['ce_news_002']);
  assert.deepEqual(built.customEmojiIdsByBrand.auto247, ['ce_news_060']);
  assert.deepEqual(built.customEmojiIdsByBrand.tracking, ['ce_news_050']);
  assert.deepEqual(built.customEmojiIdsByBrand.adminchat, ['ce_news_014']);
  assert.deepEqual(built.customEmojiIdsByBrand.adminshield, ['ce_news_051']);
  assert.deepEqual(built.customEmojiIdsByBrand.adminboom, ['ce_news_043']);
  assert.deepEqual(built.customEmojiIdsByBrand.adminfire, ['ce_news_042']);
  assert.deepEqual(built.customEmojiIdsByBrand.adminhundred, ['ce_news_059']);
  assert.deepEqual(built.stickers[2].aliases, ['newsflash']);
  assert.equal(built.stickers[2].emoji, '\u26A1\uFE0F');

  const reorderedStickerSet = newsStickerSet();
  reorderedStickerSet.stickers[2].emoji = '\u26A1';
  assert.throws(
    () => buildNewsEmojiMap(reorderedStickerSet, { generatedAt }),
    /sticker order changed at index 2/
  );

  const duplicateIdStickerSet = newsStickerSet();
  duplicateIdStickerSet.stickers[99].custom_emoji_id = duplicateIdStickerSet.stickers[98].custom_emoji_id;
  assert.throws(
    () => buildNewsEmojiMap(duplicateIdStickerSet, { generatedAt }),
    /at least 100 unique custom emoji IDs; received 99/
  );

  let dryRunFetchCalled = false;
  const dryRun = await syncNewsEmojiPack({
    dryRun: true,
    token: '',
    outputPath: dryRunOutputPath,
    fetchImpl: async () => {
      dryRunFetchCalled = true;
      throw new Error('dry-run must not fetch');
    }
  });
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRunFetchCalled, false);
  assert.equal(dryRun.aliasesByIndex.length, 100);
  await assert.rejects(access(dryRunOutputPath));

  const calls = [];
  const synced = await syncNewsEmojiPack({
    token: '123:test',
    outputPath,
    generatedAt,
    fetchImpl: async (url, options) => {
      calls.push({
        url: String(url),
        method: options.method,
        body: JSON.parse(options.body)
      });
      return telegramOk(stickerSet);
    }
  });
  assert.equal(synced.stickers.length, 100);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/getStickerSet$/);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { name: 'NewsEmoji' });

  const saved = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.equal(saved.stickers.length, 100);
  assert.equal(saved.stickers[2].emoji, '\u26A1\uFE0F');
  assert.deepEqual(saved.customEmojiIdsByBrand.newsflash, ['ce_news_002']);

  console.log(JSON.stringify({ ok: true, checked: 'telegram NewsEmoji sync' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function newsStickerSet() {
  return {
    name: 'NewsEmoji',
    title: 'News Emoji',
    sticker_type: 'custom_emoji',
    stickers: NEWS_EMOJI_EXPECTED_EMOJI_BY_INDEX.map((emoji, index) => ({
      file_id: `file_news_${String(index).padStart(3, '0')}`,
      file_unique_id: `unique_news_${String(index).padStart(3, '0')}`,
      type: 'custom_emoji',
      width: 100,
      height: 100,
      is_animated: true,
      is_video: false,
      emoji,
      custom_emoji_id: `ce_news_${String(index).padStart(3, '0')}`
    }))
  };
}

function telegramOk(result) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { ok: true, result };
    }
  };
}
