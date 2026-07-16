import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildPackName,
  collectEmojiEntries,
  createCustomEmojiPack,
  emojiForBrand,
  normalizeBrandKey
} from './telegram-custom-emoji-pack.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-emoji-pack-'));
const outputPath = join(tempDir, 'map.json');

try {
  await writeFile(join(tempDir, 'ChatGPT.png'), Buffer.from('fake-png-chatgpt'));
  await writeFile(join(tempDir, 'Claude Brand.png'), Buffer.from('fake-png-claude'));
  await writeFile(join(tempDir, 'Notion.webp'), Buffer.from('fake-webp-notion'));
  await writeFile(join(tempDir, 'ignore.txt'), 'nope');

  assert.equal(normalizeBrandKey('Claude Brand'), 'claudebrand');
  assert.equal(emojiForBrand('ChatGPT'), '🤖');
  assert.equal(emojiForBrand('Claude Brand'), '🧠');
  assert.equal(emojiForBrand('Notion'), '📝');
  assert.equal(emojiForBrand('Canva'), '🎨');
  assert.equal(emojiForBrand('CapCut'), '🎬');
  assert.equal(emojiForBrand('Microsoft'), '💻');
  assert.equal(emojiForBrand('TikTok'), '🎵');
  assert.equal(emojiForBrand('products'), '🛒');
  assert.equal(emojiForBrand('welcome'), '✨');
  assert.equal(emojiForBrand('catalog'), '🛍️');
  assert.equal(emojiForBrand('checkout'), '💎');
  assert.equal(emojiForBrand('payment'), '💳');
  assert.equal(emojiForBrand('delivery'), '📦');
  assert.equal(emojiForBrand('soldout'), '⚠️');
  assert.equal(emojiForBrand('topup'), '💳');
  assert.equal(emojiForBrand('support'), '🎧');
  assert.equal(emojiForBrand('treasure-chest'), '💰');
  assert.equal(emojiForBrand('payment-card'), '💳');
  assert.equal(emojiForBrand('crystal'), '💎');
  assert.equal(emojiForBrand('helmet'), '🛡️');
  assert.equal(emojiForBrand('scroll'), '📜');
  assert.equal(emojiForBrand('delivery-drone'), '🚚');
  assert.equal(emojiForBrand('globe'), '🌐');
  assert.equal(emojiForBrand('key'), '🔑');
  assert.equal(emojiForBrand('security'), '\u{1F6E1}\uFE0F');
  assert.equal(emojiForBrand('fast'), '\u2604\uFE0F');
  assert.equal(emojiForBrand('auto247'), '\u{1F504}');
  assert.equal(emojiForBrand('tracking'), '\u{1F50D}');
  assert.equal(emojiForBrand('moneyface'), '\u{1F911}');
  assert.equal(emojiForBrand('admin'), '\u{1F6E1}');
  assert.equal(emojiForBrand('adminchat'), '\u{1F4AC}');
  assert.equal(emojiForBrand('adminshield'), '\u{1F6E1}');
  assert.equal(emojiForBrand('adminboom'), '\u{1F4A5}');
  assert.equal(emojiForBrand('adminfire'), '\u{1F525}');
  assert.equal(emojiForBrand('adminhundred'), '\u{1F4AF}');
  assert.equal(emojiForBrand('instant-delivery'), '\u26A1');
  assert.equal(emojiForBrand('automation-247'), '\u{1F504}');
  assert.equal(emojiForBrand('quality'), '\u2B50');
  assert.equal(emojiForBrand('member'), '\u{1F451}');
  assert.equal(emojiForBrand('offers'), '\u{1F381}');
  assert.equal(emojiForBrand('notifications'), '\u{1F4E3}');
  assert.equal(emojiForBrand('promotions'), '\u{1F3AB}');
  assert.equal(emojiForBrand('reviews'), '\u2728');
  assert.equal(emojiForBrand('academy'), '\u{1F393}');
  assert.equal(emojiForBrand('news'), '\u{1F4C4}');
  assert.equal(emojiForBrand('events'), '\u{1F3AE}');
  assert.equal(emojiForBrand('policy'), '\u{1F6E1}\uFE0F');
  assert.equal(emojiForBrand('logout'), '\u{1F50C}');
  assert.equal(buildPackName('KAITO AI SHOP Brands', '@KaitoShopBot'), 'kaito_ai_shop_brands_by_KaitoShopBot');

  const entries = await collectEmojiEntries(tempDir);
  assert.deepEqual(entries.map((entry) => entry.fileName), ['ChatGPT.png', 'Claude Brand.png', 'Notion.webp']);
  assert.deepEqual(entries.map((entry) => entry.brand), ['ChatGPT', 'Claude', 'Notion']);
  assert.deepEqual(entries.map((entry) => entry.emoji), ['🤖', '🧠', '📝']);

  const calls = [];
  const fetchImpl = async (url, options) => {
    const method = String(url).split('/').at(-1);
    calls.push({ method, options });

    if (method === 'getMe') {
      return ok({ id: 99, username: 'KaitoShopBot' });
    }

    if (method === 'uploadStickerFile') {
      const form = options.body;
      const sticker = form.get('sticker');
      return ok({
        file_id: `file_${calls.filter((call) => call.method === 'uploadStickerFile').length}`,
        file_unique_id: `unique_${sticker.name}`
      });
    }

    if (method === 'createNewStickerSet') {
      return ok(true);
    }

    if (method === 'getStickerSet') {
      return ok({
        name: 'kaito_ai_shop_brands_by_KaitoShopBot',
        title: 'KAITO AI SHOP Brands',
        sticker_type: 'custom_emoji',
        stickers: [
          sticker('ce_chatgpt', '🤖'),
          sticker('ce_claude', '🧠'),
          sticker('ce_notion', '📝')
        ]
      });
    }

    throw new Error(`Unexpected method ${method}`);
  };

  const result = await createCustomEmojiPack({
    token: '123:test',
    ownerUserId: 123456,
    sourceDir: tempDir,
    title: 'KAITO AI SHOP Brands',
    outputPath,
    fetchImpl
  });

  assert.equal(result.packName, 'kaito_ai_shop_brands_by_KaitoShopBot');
  assert.equal(result.stickers.length, 3);
  assert.equal(result.stickers[0].customEmojiId, 'ce_chatgpt');
  assert.equal(result.fileIdsByFile['ChatGPT.png'], 'sticker_ce_chatgpt');
  assert.deepEqual(result.fileIdsByBrand.chatgpt, ['sticker_ce_chatgpt']);

  const uploadCalls = calls.filter((call) => call.method === 'uploadStickerFile');
  assert.equal(uploadCalls.length, 3);
  assert.equal(uploadCalls[0].options.body.get('user_id'), '123456');
  assert.equal(uploadCalls[0].options.body.get('sticker_format'), 'static');
  assert.equal(uploadCalls[0].options.body.get('sticker').name, 'ChatGPT.png');

  const createCall = calls.find((call) => call.method === 'createNewStickerSet');
  const createBody = JSON.parse(createCall.options.body);
  assert.equal(createBody.user_id, 123456);
  assert.equal(createBody.name, 'kaito_ai_shop_brands_by_KaitoShopBot');
  assert.equal(createBody.sticker_type, 'custom_emoji');
  assert.deepEqual(createBody.stickers.map((item) => item.format), ['static', 'static', 'static']);
  assert.deepEqual(createBody.stickers.map((item) => item.emoji_list), [['🤖'], ['🧠'], ['📝']]);
  assert.deepEqual(createBody.stickers.map((item) => item.sticker), ['file_1', 'file_2', 'file_3']);

  const saved = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.equal(saved.stickers[1].brand, 'Claude');
  assert.equal(saved.stickers[1].customEmojiId, 'ce_claude');
  assert.equal(saved.stickers[1].fileId, 'sticker_ce_claude');

  calls.length = 0;
  await writeFile(join(tempDir, 'Motion.webm'), Buffer.from('fake-webm-motion'));
  await writeFile(join(tempDir, 'welcome.webm'), Buffer.from('fake-webm-welcome'));
  await writeFile(join(tempDir, 'auto247.webm'), Buffer.from('fake-webm-auto247'));
  const videoEntries = await collectEmojiEntries(tempDir, { stickerFormat: 'video' });
  assert.deepEqual(videoEntries.map((entry) => entry.fileName), ['auto247.webm', 'Motion.webm', 'welcome.webm']);
  assert.equal(videoEntries[0].contentType, 'video/webm');
  const bannerVideoEntries = await collectEmojiEntries(tempDir, {
    stickerFormat: 'video',
    emojiByBrandKey: {
      auto247: '\u26A1',
      welcome: '\u{1F44B}'
    }
  });
  assert.equal(bannerVideoEntries.find((entry) => entry.fileName === 'welcome.webm').emoji, '\u{1F44B}');
  assert.equal(bannerVideoEntries.find((entry) => entry.fileName === 'auto247.webm').emoji, '\u26A1');

  const videoResult = await createCustomEmojiPack({
    token: '123:test',
    ownerUserId: 123456,
    sourceDir: tempDir,
    title: 'KAITO AI SHOP Motion',
    packBase: 'kaito_ai_shop_motion',
    stickerFormat: 'video',
    fetchImpl
  });
  assert.equal(videoResult.stickerFormat, 'video');
  assert.equal(videoResult.source.endsWith('kaito-emoji-pack-'), false);
  const videoUploadCall = calls.find((call) => call.method === 'uploadStickerFile');
  assert.equal(videoUploadCall.options.body.get('sticker_format'), 'video');
  const videoCreateBody = JSON.parse(calls.find((call) => call.method === 'createNewStickerSet').options.body);
  assert.equal(videoCreateBody.stickers[0].format, 'video');

  console.log(JSON.stringify({ ok: true, checked: 'telegram custom emoji pack automation' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function ok(result) {
  return {
    ok: true,
    async json() {
      return { ok: true, result };
    }
  };
}

function sticker(customEmojiId, emoji) {
  return {
    file_id: `sticker_${customEmojiId}`,
    file_unique_id: `unique_${customEmojiId}`,
    type: 'custom_emoji',
    width: 100,
    height: 100,
    is_animated: false,
    is_video: false,
    emoji,
    custom_emoji_id: customEmojiId
  };
}
