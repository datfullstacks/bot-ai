import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SHOP_STICKERS } from './telegram-shop-sticker-assets.js';
import {
  collectShopStickerEntries,
  createShopStickerPack
} from './telegram-shop-sticker-pack.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-shop-sticker-pack-'));
const sourceDir = join(tempDir, 'stickers');
const outputPath = join(tempDir, 'telegram-shop-sticker-map.json');

try {
  await mkdir(sourceDir, { recursive: true });
  for (const sticker of SHOP_STICKERS) {
    await writeFile(join(sourceDir, sticker.fileName), Buffer.from(`fake-${sticker.stage}`));
  }
  await writeFile(join(sourceDir, 'ignore.txt'), 'nope');

  const entries = await collectShopStickerEntries(sourceDir);
  assert.deepEqual(entries.map((entry) => entry.stage), SHOP_STICKERS.map((item) => item.stage));
  assert.deepEqual(entries.map((entry) => entry.emoji), SHOP_STICKERS.map((item) => item.emoji));

  const calls = [];
  let uploadIndex = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/uploadStickerFile')) {
      uploadIndex += 1;
      return telegramOk({ file_id: `uploaded_${uploadIndex}` });
    }
    if (String(url).includes('/createNewStickerSet')) {
      const body = JSON.parse(options.body);
      assert.equal(body.sticker_type, 'regular');
      assert.equal(body.stickers[0].format, 'video');
      assert.equal(body.stickers[0].emoji_list[0], SHOP_STICKERS[0].emoji);
      return telegramOk(true);
    }
    if (String(url).includes('/getStickerSet')) {
      return telegramOk({
        stickers: SHOP_STICKERS.map((sticker, index) => ({
          file_id: `set_${index + 1}`,
          emoji: sticker.emoji,
          type: 'regular'
        }))
      });
    }
    if (String(url).includes('/getMe')) {
      return telegramOk({ username: 'KaitoShopBot' });
    }
    throw new Error(`Unexpected Telegram call: ${url}`);
  };

  const result = await createShopStickerPack({
    sourceDir,
    outputPath,
    token: '123:test',
    ownerUserId: 12345,
    botUsername: 'KaitoShopBot',
    packBase: 'kaito_shop_flow',
    fetchImpl
  });

  assert.equal(result.stickerType, 'regular');
  assert.equal(result.stickerFormat, 'video');
  assert.equal(result.stageFileIds.start, 'set_1');
  assert.equal(result.stageFileIds.support, `set_${SHOP_STICKERS.findIndex((item) => item.stage === 'support') + 1}`);
  assert.equal(calls.filter((call) => call.url.includes('/uploadStickerFile')).length, SHOP_STICKERS.length);
  assert.ok(calls.some((call) => call.url.includes('/createNewStickerSet')));

  const saved = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.equal(saved.stageFileIds.catalog, result.stageFileIds.catalog);

  console.log(JSON.stringify({ ok: true, checked: 'telegram regular shop sticker pack automation' }, null, 2));
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
