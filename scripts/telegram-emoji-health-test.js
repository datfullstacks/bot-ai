import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_REQUIRED_EMOJI_PACKS,
  NEWS_EMOJI_REQUIRED_KEYS,
  buildTelegramEmojiRegistry,
  parseRequiredEmojiPacks
} from '../src/telegramEmojiRegistry.js';
import {
  buildTelegramEmojiHealthReport,
  getTelegramEmojiStatus,
  writeTelegramEmojiHealthReport
} from '../src/telegramEmojiHealth.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-emoji-health-'));
const reportPath = join(tempDir, 'health.json');
const statusReportPath = join(tempDir, 'status-health.json');
const token = '123:test';
const bannerAltById = {
  ce_banner_kaito: '✨',
  ce_banner_welcome: '👋',
  ce_banner_products: '🛒'
};
const newsMap = JSON.parse(await readFile(
  new URL('../data/telegram-news-emoji-map.json', import.meta.url),
  'utf8'
));
const newsAltById = Object.fromEntries(
  newsMap.stickers.map((sticker) => [sticker.customEmojiId, sticker.emoji])
);
const newsflashId = newsMap.customEmojiIdsByBrand.newsflash[0];

assert.equal(DEFAULT_REQUIRED_EMOJI_PACKS.includes('banner'), false);
assert.equal(DEFAULT_REQUIRED_EMOJI_PACKS.includes('slogan'), false);
assert.deepEqual(parseRequiredEmojiPacks('banner,ui,slogan'), DEFAULT_REQUIRED_EMOJI_PACKS);

try {
  const registry = buildTelegramEmojiRegistry({
    maps: {
      banner: bannerMap()
    }
  });

  const calls = [];
  const fetchImpl = telegramSuccessFetch({ calls, altById: bannerAltById });
  const report = await buildTelegramEmojiHealthReport({
    registry,
    token,
    chatId: '',
    requiredPacks: ['banner'],
    requiredKeysByPack: {
      banner: ['kaito', 'welcome', 'products', 'refund']
    },
    fetchImpl
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].custom_emoji_ids, [
    'ce_banner_kaito',
    'ce_banner_welcome',
    'ce_banner_products'
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.telegramValidation.ok, true);
  assert.equal(report.telegramValidation.requested, 3);
  assert.equal(report.telegramValidation.returned, 3);
  assert.equal(report.telegramValidation.checkedBatches, 1);
  assert.deepEqual(report.telegramValidation.missingIds, []);
  assert.deepEqual(report.telegramValidation.altMismatches, []);
  assert.deepEqual(report.registry.packs.banner.missingRequiredKeys, ['refund']);
  assert.equal(report.identity.botId, '123');
  assert.match(report.identity.botTokenFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.match(report.identity.customEmojiSetFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(report.identity.customEmojiIdCount, 3);
  assert.equal(report.identity.customEmojiAltCount, 3);
  assert.equal(JSON.stringify(report).includes(token), false);

  const newsCalls = [];
  const newsRegistry = buildTelegramEmojiRegistry({
    maps: {
      news: newsMap
    }
  });
  const newsReport = await buildTelegramEmojiHealthReport({
    registry: newsRegistry,
    token,
    requiredPacks: ['news'],
    requiredKeysByPack: {
      news: NEWS_EMOJI_REQUIRED_KEYS
    },
    fetchImpl: telegramSuccessFetch({ calls: newsCalls, altById: newsAltById })
  });
  assert.equal(newsReport.ok, true);
  assert.equal(newsReport.registry.packs.news.availableRequiredKeys, 9);
  assert.deepEqual(newsReport.registry.packs.news.missingRequiredKeys, []);
  assert.equal(newsReport.registry.packs.news.requiredMinimumCustomEmojiIds, 100);
  assert.equal(newsReport.registry.packs.news.missingRequiredCustomEmojiIds, 0);
  assert.equal(newsReport.telegramValidation.requested, 100);
  assert.equal(newsReport.telegramValidation.returned, 100);
  assert.equal(newsReport.identity.customEmojiIdCount, 100);
  assert.equal(newsReport.identity.customEmojiAltCount, 100);
  assert.deepEqual(
    [...newsCalls[0].custom_emoji_ids].sort(),
    newsMap.stickers.map((sticker) => sticker.customEmojiId).sort()
  );

  const wrongNewsflashAltReport = await buildTelegramEmojiHealthReport({
    registry: newsRegistry,
    token,
    requiredPacks: ['news'],
    requiredKeysByPack: {
      news: NEWS_EMOJI_REQUIRED_KEYS
    },
    fetchImpl: telegramSuccessFetch({
      altById: {
        ...newsAltById,
        [newsflashId]: '🔥'
      }
    })
  });
  assert.equal(wrongNewsflashAltReport.telegramValidation.ok, false);
  assert.deepEqual(wrongNewsflashAltReport.telegramValidation.altMismatches, [{
    id: newsflashId,
    expected: ['\u26A1\uFE0F'],
    returned: '🔥'
  }]);

  const incompleteNewsMap = withoutLastNewsSticker(newsMap);
  const incompleteNewsReport = await buildTelegramEmojiHealthReport({
    registry: buildTelegramEmojiRegistry({
      maps: {
        news: incompleteNewsMap
      }
    }),
    token,
    requiredPacks: ['news'],
    requiredKeysByPack: {
      news: NEWS_EMOJI_REQUIRED_KEYS
    },
    fetchImpl: telegramSuccessFetch({
      altById: Object.fromEntries(
        incompleteNewsMap.stickers.map((sticker) => [sticker.customEmojiId, sticker.emoji])
      )
    })
  });
  assert.equal(incompleteNewsReport.registry.packs.news.availableRequiredKeys, 9);
  assert.equal(incompleteNewsReport.registry.packs.news.customEmojiIdCount, 99);
  assert.equal(incompleteNewsReport.registry.packs.news.missingRequiredCustomEmojiIds, 1);
  assert.equal(incompleteNewsReport.telegramValidation.ok, true);
  assert.equal(incompleteNewsReport.telegramValidation.requested, 99);
  assert.equal(incompleteNewsReport.ok, false);

  await writeTelegramEmojiHealthReport(reportPath, report);
  const saved = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(saved.telegramValidation.returned, 3);
  assert.equal(JSON.stringify(saved).includes(token), false);

  const wrongIdReport = await buildTelegramEmojiHealthReport({
    registry,
    token,
    requiredPacks: ['banner'],
    requiredKeysByPack: { banner: ['kaito', 'welcome', 'products'] },
    fetchImpl: async (_url, options) => {
      const ids = JSON.parse(options.body).custom_emoji_ids;
      return telegramResponse([
        { custom_emoji_id: ids[0], emoji: bannerAltById[ids[0]] },
        { custom_emoji_id: ids[1], emoji: bannerAltById[ids[1]] },
        { custom_emoji_id: 'ce_banner_not_requested', emoji: '🛒' }
      ]);
    }
  });
  assert.equal(wrongIdReport.telegramValidation.returned, 3);
  assert.equal(wrongIdReport.telegramValidation.ok, false);
  assert.equal(wrongIdReport.telegramValidation.error, 'telegram_custom_emoji_mismatch');
  assert.deepEqual(wrongIdReport.telegramValidation.missingIds, ['ce_banner_products']);
  assert.deepEqual(wrongIdReport.telegramValidation.unexpectedIds, ['ce_banner_not_requested']);

  const wrongAltReport = await buildTelegramEmojiHealthReport({
    registry,
    token,
    requiredPacks: ['banner'],
    requiredKeysByPack: { banner: ['kaito', 'welcome', 'products'] },
    fetchImpl: telegramSuccessFetch({
      altById: {
        ...bannerAltById,
        ce_banner_products: '❌'
      }
    })
  });
  assert.equal(wrongAltReport.telegramValidation.ok, false);
  assert.deepEqual(wrongAltReport.telegramValidation.altMismatches, [{
    id: 'ce_banner_products',
    expected: ['🛒'],
    returned: '❌'
  }]);

  const redactedErrorReport = await buildTelegramEmojiHealthReport({
    registry,
    token,
    requiredPacks: ['banner'],
    requiredKeysByPack: { banner: ['kaito', 'welcome', 'products'] },
    fetchImpl: async () => {
      throw new Error(`request failed for ${token}`);
    }
  });
  assert.equal(redactedErrorReport.telegramValidation.ok, false);
  assert.equal(redactedErrorReport.telegramValidation.error, 'request failed for [redacted]');
  assert.equal(JSON.stringify(redactedErrorReport).includes(token), false);

  const manyIds = Array.from({ length: 201 }, (_, index) => `ce_many_${index}`);
  const batchCalls = [];
  const batchRegistry = buildTelegramEmojiRegistry({
    maps: {
      banner: {
        customEmojiIdsByFile: Object.fromEntries(
          manyIds.map((id, index) => [`item-${index}.webm`, id])
        )
      }
    }
  });
  const batchReport = await buildTelegramEmojiHealthReport({
    registry: batchRegistry,
    token,
    requiredPacks: ['banner'],
    requiredKeysByPack: { banner: [] },
    fetchImpl: telegramSuccessFetch({ calls: batchCalls })
  });
  assert.equal(batchReport.telegramValidation.ok, true);
  assert.equal(batchReport.telegramValidation.requested, 201);
  assert.equal(batchReport.telegramValidation.returned, 201);
  assert.equal(batchReport.telegramValidation.checkedBatches, 2);
  assert.deepEqual(batchCalls.map((body) => body.custom_emoji_ids.length), [200, 1]);

  const readyRegistry = buildTelegramEmojiRegistry({
    maps: {
      banner: bannerMap()
    }
  });
  const statusOptions = {
    registry: readyRegistry,
    requiredPacks: ['banner'],
    requiredKeysByPack: {
      banner: ['kaito', 'welcome', 'products']
    },
    healthReportFile: statusReportPath,
    maxAgeMs: 60_000,
    now: '2026-07-17T12:00:00.000Z'
  };

  const noTokenStatus = getTelegramEmojiStatus({
    ...statusOptions,
    token: ''
  });
  assert.equal(noTokenStatus.registryReady, true);
  assert.equal(noTokenStatus.liveHealth.status, 'not_required');
  assert.equal(noTokenStatus.ready, true);

  const missingStatus = getTelegramEmojiStatus({
    ...statusOptions,
    token
  });
  assert.equal(missingStatus.liveHealth.status, 'missing');
  assert.equal(missingStatus.ready, false);

  await writeTelegramEmojiHealthReport(statusReportPath, {
    ok: true,
    generatedAt: '2026-07-17T11:59:30.000Z',
    registry: { requiredPacks: ['banner'] },
    telegramValidation: { ok: true, requested: 3, returned: 3 }
  });
  const identityMissingStatus = getTelegramEmojiStatus({
    ...statusOptions,
    token
  });
  assert.equal(identityMissingStatus.liveHealth.status, 'failed');
  assert.equal(identityMissingStatus.liveHealth.reason, 'health_report_identity_missing');
  assert.equal(identityMissingStatus.ready, false);

  const healthyReport = await buildTelegramEmojiHealthReport({
    registry: readyRegistry,
    token,
    requiredPacks: ['banner'],
    requiredKeysByPack: statusOptions.requiredKeysByPack,
    fetchImpl: telegramSuccessFetch({ altById: bannerAltById })
  });

  await writeTelegramEmojiHealthReport(statusReportPath, {
    ...healthyReport,
    generatedAt: '2026-07-17T11:00:00.000Z'
  });
  const staleStatus = getTelegramEmojiStatus({
    ...statusOptions,
    token
  });
  assert.equal(staleStatus.liveHealth.status, 'stale');
  assert.equal(staleStatus.ready, false);

  await writeTelegramEmojiHealthReport(statusReportPath, {
    ...healthyReport,
    ok: false,
    generatedAt: '2026-07-17T11:59:30.000Z',
    telegramValidation: {
      ...healthyReport.telegramValidation,
      ok: false,
      error: 'telegram_rejected_ids',
      returned: 0
    }
  });
  const failedStatus = getTelegramEmojiStatus({
    ...statusOptions,
    token
  });
  assert.equal(failedStatus.liveHealth.status, 'failed');
  assert.equal(failedStatus.liveHealth.reason, 'telegram_rejected_ids');
  assert.equal(failedStatus.ready, false);

  await writeTelegramEmojiHealthReport(statusReportPath, {
    ...healthyReport,
    generatedAt: '2026-07-17T11:59:30.000Z',
    registry: {
      ...healthyReport.registry,
      requiredPacks: []
    }
  });
  const incompleteStatus = getTelegramEmojiStatus({
    ...statusOptions,
    token
  });
  assert.equal(incompleteStatus.liveHealth.status, 'failed');
  assert.equal(incompleteStatus.liveHealth.reason, 'health_report_pack_coverage_incomplete');
  assert.deepEqual(incompleteStatus.liveHealth.missingRequiredPacks, ['banner']);

  await writeTelegramEmojiHealthReport(statusReportPath, {
    ...healthyReport,
    generatedAt: '2026-07-17T11:59:30.000Z'
  });
  const changedTokenStatus = getTelegramEmojiStatus({
    ...statusOptions,
    token: '123:rotated-token'
  });
  assert.equal(changedTokenStatus.liveHealth.status, 'failed');
  assert.equal(changedTokenStatus.liveHealth.reason, 'health_report_bot_identity_mismatch');
  assert.deepEqual(changedTokenStatus.liveHealth.identityMismatch, ['botTokenFingerprint']);
  assert.equal(changedTokenStatus.ready, false);

  const changedRegistry = buildTelegramEmojiRegistry({
    maps: {
      banner: bannerMap({
        products: 'ce_banner_products_v2'
      })
    }
  });
  const changedMapStatus = getTelegramEmojiStatus({
    ...statusOptions,
    registry: changedRegistry,
    token
  });
  assert.equal(changedMapStatus.liveHealth.status, 'failed');
  assert.equal(changedMapStatus.liveHealth.reason, 'health_report_custom_emoji_set_mismatch');
  assert.deepEqual(changedMapStatus.liveHealth.identityMismatch, ['customEmojiSetFingerprint']);
  assert.equal(changedMapStatus.ready, false);

  const healthyStatus = getTelegramEmojiStatus({
    ...statusOptions,
    token
  });
  assert.equal(healthyStatus.liveHealth.status, 'healthy');
  assert.equal(healthyStatus.ready, true);

  console.log(JSON.stringify({ ok: true, checked: 'telegram emoji health' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

function bannerMap(overrides = {}) {
  const ids = {
    kaito: 'ce_banner_kaito',
    welcome: 'ce_banner_welcome',
    products: 'ce_banner_products',
    ...overrides
  };
  const emojiByKey = {
    kaito: '✨',
    welcome: '👋',
    products: '🛒'
  };
  return {
    customEmojiIdsByFile: Object.fromEntries(
      Object.entries(ids).map(([key, id]) => [`${key}.webm`, id])
    ),
    stickers: Object.entries(ids).map(([key, customEmojiId]) => ({
      fileName: `${key}.webm`,
      customEmojiId,
      emoji: emojiByKey[key]
    }))
  };
}

function withoutLastNewsSticker(map) {
  const clone = structuredClone(map);
  const removed = clone.stickers.pop();
  for (const field of [
    'customEmojiIdsByAlias',
    'customEmojiIdsByBrand',
    'fileIdsByAlias',
    'fileIdsByBrand'
  ]) {
    for (const [key, values] of Object.entries(clone[field] || {})) {
      if (values.includes(field.startsWith('file') ? removed.fileId : removed.customEmojiId)) {
        delete clone[field][key];
      }
    }
  }
  if (clone.customEmojiIdsByEmoji?.[removed.emoji] === removed.customEmojiId) {
    delete clone.customEmojiIdsByEmoji[removed.emoji];
  }
  return clone;
}

function telegramSuccessFetch({ calls = [], altById = {} } = {}) {
  return async (url, options) => {
    assert.equal(String(url).split('/').at(-1), 'getCustomEmojiStickers');
    const body = JSON.parse(options.body);
    calls.push(body);
    return telegramResponse(body.custom_emoji_ids.map((id) => ({
      custom_emoji_id: id,
      emoji: altById[id]
    })));
  };
}

function telegramResponse(result) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        result
      };
    }
  };
}
