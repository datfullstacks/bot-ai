import assert from 'node:assert/strict';

import {
  BANNER_EMOJI_REQUIRED_KEYS,
  DEFAULT_REQUIRED_EMOJI_PACKS,
  SLOGAN_TILE_REQUIRED_COUNTS,
  buildTelegramEmojiRegistry,
  customEmojiCandidateFromRegistry,
  parseRequiredEmojiPacks,
  resolveTelegramCustomEmojiId,
  summarizeTelegramEmojiRegistry
} from '../src/telegramEmojiRegistry.js';

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
assert.deepEqual(DEFAULT_REQUIRED_EMOJI_PACKS, [
  'brand',
  'ui',
  'slogan',
  'sloganTile',
  'banner',
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

assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'banner', key: 'kaito' }), 'ce_banner_kaito');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'banner', key: 'auto-247' }), 'ce_banner_auto247');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'banner', key: 'vip' }), 'ce_banner_vip');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'ui', key: 'products' }), 'ce_ui_products');
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
