import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config, nowIso } from './config.js';
import {
  buildTelegramEmojiRegistry,
  collectCustomEmojiIdsFromRegistry,
  DEFAULT_REQUIRED_KEYS_BY_PACK,
  parseRequiredEmojiPacks,
  summarizeTelegramEmojiRegistry
} from './telegramEmojiRegistry.js';

export function getTelegramEmojiStatus(options = {}) {
  const registry = options.registry || loadTelegramEmojiRegistryFromConfig();
  const requiredPacks = options.requiredPacks || parseRequiredEmojiPacks(config.telegram.emojiRequiredPacks);
  const summary = summarizeTelegramEmojiRegistry(registry, {
    requiredPacks,
    requiredKeysByPack: options.requiredKeysByPack || DEFAULT_REQUIRED_KEYS_BY_PACK
  });
  return {
    enabled: Boolean(config.telegram.customTextEmoji),
    ...summary,
    reportFile: options.healthReportFile || config.telegram.emojiHealthReportFile,
    lastHealth: readJsonIfExists(options.healthReportFile || config.telegram.emojiHealthReportFile)
  };
}

export async function buildTelegramEmojiHealthReport(options = {}) {
  const registry = options.registry || loadTelegramEmojiRegistryFromConfig();
  const requiredPacks = options.requiredPacks || parseRequiredEmojiPacks(config.telegram.emojiRequiredPacks);
  const summary = summarizeTelegramEmojiRegistry(registry, {
    requiredPacks,
    requiredKeysByPack: options.requiredKeysByPack || DEFAULT_REQUIRED_KEYS_BY_PACK
  });
  const ids = collectCustomEmojiIdsFromRegistry(registry, requiredPacks);
  const telegramValidation = await validateCustomEmojiIds({
    ids,
    token: options.token || config.telegram.token,
    fetchImpl: options.fetchImpl || globalThis.fetch
  });

  return {
    ok: summary.ready && telegramValidation.ok !== false,
    generatedAt: nowIso(),
    chatId: options.chatId || '',
    registry: summary,
    telegramValidation
  };
}

export function loadTelegramEmojiRegistryFromConfig() {
  return buildTelegramEmojiRegistry({
    maps: {
      brand: readJsonIfExists(config.telegram.customEmojiMapFile) || {},
      ui: readJsonIfExists(config.telegram.uiEmojiMapFile) || {},
      slogan: readJsonIfExists(config.telegram.sloganEmojiMapFile) || {},
      sloganTile: readJsonIfExists(config.telegram.sloganTileEmojiMapFile) || {},
      banner: readJsonIfExists(config.telegram.bannerEmojiMapFile) || {},
      robo: readJsonIfExists(config.telegram.roboEmojiMapFile) || {},
      retro: readJsonIfExists(config.telegram.retroFontEmojiMapFile) || {}
    },
    files: {
      brand: config.telegram.customEmojiMapFile,
      ui: config.telegram.uiEmojiMapFile,
      slogan: config.telegram.sloganEmojiMapFile,
      sloganTile: config.telegram.sloganTileEmojiMapFile,
      banner: config.telegram.bannerEmojiMapFile,
      robo: config.telegram.roboEmojiMapFile,
      retro: config.telegram.retroFontEmojiMapFile
    }
  });
}

export async function writeTelegramEmojiHealthReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function validateCustomEmojiIds({ ids, token, fetchImpl }) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) {
    return { ok: true, skipped: true, reason: 'no_custom_emoji_ids', requested: 0, returned: 0 };
  }
  if (!token) {
    return { ok: true, skipped: true, reason: 'missing_telegram_token', requested: uniqueIds.length, returned: 0 };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, error: 'fetch_unavailable', requested: uniqueIds.length, returned: 0 };
  }

  const response = await fetchImpl(`https://api.telegram.org/bot${token}/getCustomEmojiStickers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ custom_emoji_ids: uniqueIds.slice(0, 200) })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    return {
      ok: false,
      error: data.description || `HTTP ${response.status || 'unknown'}`,
      requested: uniqueIds.length,
      returned: 0
    };
  }
  return {
    ok: Array.isArray(data.result) && data.result.length === uniqueIds.slice(0, 200).length,
    requested: uniqueIds.length,
    returned: Array.isArray(data.result) ? data.result.length : 0
  };
}

function readJsonIfExists(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
