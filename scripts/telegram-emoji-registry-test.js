import assert from 'node:assert/strict';

import {
  BANNER_EMOJI_REQUIRED_KEYS,
  buildTelegramEmojiRegistry,
  customEmojiCandidateFromRegistry,
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

assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'banner', key: 'kaito' }), 'ce_banner_kaito');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'banner', key: 'auto-247' }), 'ce_banner_auto247');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'banner', key: 'vip' }), 'ce_banner_vip');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'ui', key: 'products' }), 'ce_ui_products');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'robo', key: 'wave' }), 'ce_robo_wave');
assert.equal(resolveTelegramCustomEmojiId(registry, { pack: 'robo', key: 'OK' }), 'ce_robo_ok');
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

console.log(JSON.stringify({ ok: true, checked: 'telegram emoji registry' }, null, 2));
