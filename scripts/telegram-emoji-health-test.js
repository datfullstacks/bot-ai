import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildTelegramEmojiRegistry
} from '../src/telegramEmojiRegistry.js';
import {
  buildTelegramEmojiHealthReport,
  writeTelegramEmojiHealthReport
} from '../src/telegramEmojiHealth.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-emoji-health-'));
const reportPath = join(tempDir, 'health.json');

try {
  const registry = buildTelegramEmojiRegistry({
    maps: {
      banner: {
        stickerType: 'custom_emoji',
        customEmojiIdsByFile: {
          'kaito.webm': 'ce_banner_kaito',
          'welcome.webm': 'ce_banner_welcome',
          'products.webm': 'ce_banner_products'
        }
      }
    }
  });

  const calls = [];
  const fetchImpl = async (url, options) => {
    const method = String(url).split('/').at(-1);
    calls.push({ method, body: JSON.parse(options.body) });
    assert.equal(method, 'getCustomEmojiStickers');
    return {
      ok: true,
      async json() {
        return {
          ok: true,
          result: [
            { custom_emoji_id: 'ce_banner_kaito' },
            { custom_emoji_id: 'ce_banner_welcome' },
            { custom_emoji_id: 'ce_banner_products' }
          ]
        };
      }
    };
  };

  const report = await buildTelegramEmojiHealthReport({
    registry,
    token: '123:test',
    chatId: '',
    requiredPacks: ['banner'],
    requiredKeysByPack: {
      banner: ['kaito', 'welcome', 'products', 'refund']
    },
    fetchImpl
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.custom_emoji_ids, ['ce_banner_kaito', 'ce_banner_welcome', 'ce_banner_products']);
  assert.equal(report.ok, false);
  assert.equal(report.telegramValidation.ok, true);
  assert.equal(report.telegramValidation.requested, 3);
  assert.equal(report.telegramValidation.returned, 3);
  assert.deepEqual(report.registry.packs.banner.missingRequiredKeys, ['refund']);

  await writeTelegramEmojiHealthReport(reportPath, report);
  const saved = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(saved.telegramValidation.returned, 3);

  console.log(JSON.stringify({ ok: true, checked: 'telegram emoji health' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
