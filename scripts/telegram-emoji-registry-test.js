import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BANNER_EMOJI_REQUIRED_KEYS,
  DEFAULT_REQUIRED_EMOJI_PACKS,
  DEFAULT_REQUIRED_MIN_COUNTS_BY_PACK,
  NEWS_EMOJI_REQUIRED_KEYS,
  SLOGAN_TILE_REQUIRED_COUNTS,
  buildTelegramEmojiRegistry,
  customEmojiCandidateFromRegistry,
  parseRequiredEmojiPacks,
  resolveTelegramCustomEmojiId,
  summarizeTelegramEmojiRegistry
} from '../src/telegramEmojiRegistry.js';

const newsMap = JSON.parse(await readFile(
  new URL('../data/telegram-news-emoji-map.json', import.meta.url),
  'utf8'
));
const expectedCompatibilityNewsIds = {
  fast: '5224607267797606837',
  newsflash: '5456140674028019486',
  auto247: '5375338737028841420',
  tracking: '5231012545799666522',
  adminchat: '5443038326535759644',
  adminshield: '5251203410396458957',
  adminboom: '5276032951342088188',
  adminfire: '5424972470023104089',
  adminhundred: '5341498088408234504'
};

const bannerMap = {
  stickerType: 'custom_emoji',
  customEmojiIdsByFile: {
    'kaito.webm': 'ce_banner_kaito',
    'auto247.webm': 'ce_banner_auto247'
  },
  customEmojiIdsByBrand: {
    vip: ['ce_banner_vip']
  }
};

const registry = buildTelegramEmojiRegistry({
  maps: {
    banner: bannerMap,
    ui: {
      customEmojiIdsByFile: {
        'products.webm': 'ce_ui_products'
      }
    },
    news: newsMap,
    sloganTile: {
      slogans: {
        daily_update: {
          tiles: [
            { key: 'daily_update_00', customEmojiId: 'ce_slogan_tile_00' }
          ]
        }
      }
    },
    robo: {
      customEmojiIdsByAlias: {
        wave: ['ce_robo_wave']
      },
      customEmojiIdsByEmoji: {
        'OK': 'ce_robo_ok'
      }
    }
  },
  files: {
    banner: 'data/telegram-banner-emoji-map.json'
  }
});

assert.equal(BANNER_EMOJI_REQUIRED_KEYS.length, 32);
assert.equal(BANNER_EMOJI_REQUIRED_KEYS.includes('refund'), true);
assert.equal(BANNER_EMOJI_REQUIRED_KEYS.includes('logout'), true);
assert.equal(SLOGAN_TILE_REQUIRED_COUNTS.daily_update, 6);
assert.deepEqual(NEWS_EMOJI_REQUIRED_KEYS, [
  'fast',
  'newsflash',
  'auto247',
  'tracking',
  'adminchat',
  'adminshield',
  'adminboom',
  'adminfire',
  'adminhundred'
]);
assert.deepEqual(DEFAULT_REQUIRED_MIN_COUNTS_BY_PACK, { news: 100 });
assert.equal(newsMap.packName, 'NewsEmoji');
assert.equal(newsMap.source, 'https://t.me/addemoji/NewsEmoji');
assert.equal(newsMap.minimumRequiredCustomEmojiIds, 100);
assert.equal(newsMap.stickers.length, 100);
assert.equal(new Set(newsMap.stickers.map((sticker) => sticker.customEmojiId)).size, 100);
assert.equal(new Set(newsMap.stickers.map((sticker) => sticker.alias)).size, 100);
for (const [alias, customEmojiId] of Object.entries(expectedCompatibilityNewsIds)) {
  assert.deepEqual(newsMap.customEmojiIdsByBrand[alias], [customEmojiId]);
}
const newsflashSticker = newsMap.stickers.find((sticker) => sticker.alias === 'lightning');
assert.equal(newsflashSticker.index, 2);
assert.equal(newsflashSticker.emoji, '\u26A1\uFE0F');
assert.equal(newsflashSticker.customEmojiId, expectedCompatibilityNewsIds.newsflash);
assert.deepEqual(newsflashSticker.aliases, ['newsflash']);
assert.deepEqual(newsMap.fileIdsByBrand.newsflash, [newsflashSticker.fileId]);
assert.deepEqual(DEFAULT_REQUIRED_EMOJI_PACKS, [
  'brand',
  'ui',
  'sloganTile',
  'news',
  'flame',
  'game',
  'robo',
  'retro'
]);
assert.deepEqual(parseRequiredEmojiPacks(''), DEFAULT_REQUIRED_EMOJI_PACKS);
assert.deepEqual(parseRequiredEmojiPacks('banner,ui,slogan'), DEFAULT_REQUIRED_EMOJI_PACKS);
assert.deepEqual(parseRequiredEmojiPacks('SLOGAN_TILE,banner'), DEFAULT_REQUIRED_EMOJI_PACKS);
assert.deepEqual(parseRequiredEmojiPacks('sloganTile,slogan'), DEFAULT_REQUIRED_EMOJI_PACKS);
assert.deepEqual(
  parseRequiredEmojiPacks('brand,ui,slogan,sloganTile,banner,news,flame,game,robo,retro'),
  DEFAULT_REQUIRED_EMOJI_PACKS,
  'The previous production baseline must not re-add retired banner or slogan packs.'
);
assert.equal(parseRequiredEmojiPacks('banner,ui,slogan').includes('banner'), false);
assert.equal(parseRequiredEmojiPacks('banner,ui,slogan').includes('slogan'), false);

assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'banner', key: 'kaito' }), 'ce_banner_kaito');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'banner', key: 'auto-247' }), 'ce_banner_auto247');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'banner', key: 'vip' }), 'ce_banner_vip');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'ui', key: 'products' }), 'ce_ui_products');
assert.equal(
  resolveTelegramCustomEmojiId(registry, { pack: 'news', key: 'newsflash' }),
  expectedCompatibilityNewsIds.newsflash
);
assert.equal(
  resolveTelegramCustomEmojiId(registry, { pack: 'news', key: 'shopping-bag' }),
  newsMap.stickers[4].customEmojiId
);
assert.equal(
  resolveTelegramCustomEmojiId(registry, { pack: 'news', key: 'adminhundred' }),
  expectedCompatibilityNewsIds.adminhundred
);
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'robo', key: 'wave' }), 'ce_robo_wave');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'robo', key: 'OK' }), 'ce_robo_ok');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'sloganTile', key: 'daily_update' }), 'ce_slogan_tile_00');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'slogantile', key: 'daily_update' }), 'ce_slogan_tile_00');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'banner', key: 'missing' }), '');

assert.deepEqual(
  customEmojiCandidateFromRegistry(registry, { pack: 'banner', key: 'kaito', fallback: '✨' }),
  { emoji: '✨', customEmojiId: 'ce_banner_kaito', pack: 'banner', key: 'kaito' }
);

const summary = summarizeTelegramEmojiRegistry(registry, {
  requiredPacks: ['banner', 'ui'],
  requiredKeysByPack: {
    banner: ['kaito', 'vip', 'refund'],
    ui: ['products', 'support']
  }
});

assert.equal(summary.requiredPacks.join(','), 'banner,ui');
assert.equal(summary.packs.banner.loaded, true);
assert.equal(summary.packs.banner.availableRequiredKeys, 2);
assert.deepEqual(summary.packs.banner.missingRequiredKeys, ['refund']);
assert.deepEqual(summary.packs.ui.missingRequiredKeys, ['support']);
assert.equal(summary.ready, false);

const completeNewsSummary = summarizeTelegramEmojiRegistry(registry, {
  requiredPacks: ['news']
});
assert.equal(completeNewsSummary.packs.news.customEmojiIdCount, 100);
assert.equal(completeNewsSummary.packs.news.requiredMinimumCustomEmojiIds, 100);
assert.equal(completeNewsSummary.packs.news.missingRequiredCustomEmojiIds, 0);
assert.deepEqual(completeNewsSummary.packs.news.missingRequiredKeys, []);
assert.equal(completeNewsSummary.ready, true);

const incompleteNewsIds = Array.from({ length: 99 }, (_, index) => `ce_news_partial_${index}`);
const incompleteNewsRegistry = buildTelegramEmojiRegistry({
  maps: {
    news: {
      customEmojiIdsByBrand: {
        ...Object.fromEntries(incompleteNewsIds.map((id, index) => [`item${index}`, [id]])),
        ...Object.fromEntries(NEWS_EMOJI_REQUIRED_KEYS.map((key, index) => [key, [incompleteNewsIds[index]]]))
      }
    }
  }
});
const incompleteNewsSummary = summarizeTelegramEmojiRegistry(incompleteNewsRegistry, {
  requiredPacks: ['news']
});
assert.deepEqual(incompleteNewsSummary.packs.news.missingRequiredKeys, []);
assert.equal(incompleteNewsSummary.packs.news.customEmojiIdCount, 99);
assert.equal(incompleteNewsSummary.packs.news.requiredMinimumCustomEmojiIds, 100);
assert.equal(incompleteNewsSummary.packs.news.missingRequiredCustomEmojiIds, 1);
assert.equal(incompleteNewsSummary.ready, false);

const incompleteSloganTileSummary = summarizeTelegramEmojiRegistry(registry, {
  requiredPacks: ['sloganTile'],
  requiredKeysByPack: {
    sloganTile: ['daily_update']
  }
});
assert.deepEqual(
  incompleteSloganTileSummary.packs.sloganTile.missingRequiredKeys,
  ['daily_update'],
  'Daily Update readiness should require all six animated tiles.'
);

const completeSloganTileRegistry = buildTelegramEmojiRegistry({
  maps: {
    sloganTile: {
      slogans: {
        daily_update: {
          tiles: Array.from({ length: 6 }, (_, index) => ({
            key: `daily_update_0${index}`,
            customEmojiId: `ce_slogan_tile_0${index}`
          }))
        }
      }
    }
  }
});
const completeSloganTileSummary = summarizeTelegramEmojiRegistry(completeSloganTileRegistry, {
  requiredPacks: ['sloganTile'],
  requiredKeysByPack: {
    sloganTile: ['daily_update']
  }
});
assert.deepEqual(completeSloganTileSummary.packs.sloganTile.missingRequiredKeys, []);
assert.equal(completeSloganTileSummary.ready, true);

console.log(JSON.stringify({ ok: true, checked: 'telegram emoji registry' }, null, 2));
