import { createHash } from 'node:crypto';
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

const DEFAULT_HEALTH_MAX_AGE_HOURS = 24;
const TELEGRAM_CUSTOM_EMOJI_BATCH_SIZE = 200;
const HEALTH_IDENTITY_VERSION = 1;

export function getTelegramEmojiStatus(options = {}) {
  const registry = options.registry || loadTelegramEmojiRegistryFromConfig();
  const requiredPacks = options.requiredPacks || parseRequiredEmojiPacks(config.telegram.emojiRequiredPacks);
  const summary = summarizeTelegramEmojiRegistry(registry, {
    requiredPacks,
    requiredKeysByPack: options.requiredKeysByPack || DEFAULT_REQUIRED_KEYS_BY_PACK
  });
  const reportFile = options.healthReportFile || config.telegram.emojiHealthReportFile;
  const lastHealth = readJsonIfExists(reportFile);
  const enabled = options.enabled ?? Boolean(config.telegram.customTextEmoji);
  const token = options.token ?? config.telegram.token;
  const expectations = collectCustomEmojiExpectations(registry, summary.requiredPacks);
  const identity = buildTelegramEmojiHealthIdentity({
    token,
    expectations
  });
  const liveHealth = evaluateTelegramEmojiLiveHealth({
    report: lastHealth,
    required: options.requireLiveHealth ?? Boolean(enabled && token),
    requiredPacks: summary.requiredPacks,
    identity,
    maxAgeMs: options.maxAgeMs ?? configuredHealthMaxAgeMs(),
    now: options.now
  });

  return {
    enabled,
    ...summary,
    registryReady: summary.ready,
    ready: summary.ready && liveHealth.ok,
    reportFile,
    lastHealth,
    liveHealth
  };
}

export async function buildTelegramEmojiHealthReport(options = {}) {
  const registry = options.registry || loadTelegramEmojiRegistryFromConfig();
  const requiredPacks = options.requiredPacks || parseRequiredEmojiPacks(config.telegram.emojiRequiredPacks);
  const summary = summarizeTelegramEmojiRegistry(registry, {
    requiredPacks,
    requiredKeysByPack: options.requiredKeysByPack || DEFAULT_REQUIRED_KEYS_BY_PACK
  });
  const expectations = collectCustomEmojiExpectations(registry, summary.requiredPacks);
  const token = options.token || config.telegram.token;
  const identity = buildTelegramEmojiHealthIdentity({
    token,
    expectations
  });
  const telegramValidation = await validateCustomEmojiIds({
    expectations,
    token,
    fetchImpl: options.fetchImpl || globalThis.fetch
  });

  return {
    ok: summary.ready && telegramValidation.ok !== false,
    generatedAt: nowIso(),
    chatId: options.chatId || '',
    identity,
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
      news: readJsonIfExists(config.telegram.newsEmojiMapFile) || {},
      flame: readJsonIfExists(config.telegram.flameEmojiMapFile) || {},
      game: readJsonIfExists(config.telegram.gameEmojiMapFile) || {},
      robo: readJsonIfExists(config.telegram.roboEmojiMapFile) || {},
      retro: readJsonIfExists(config.telegram.retroFontEmojiMapFile) || {}
    },
    files: {
      brand: config.telegram.customEmojiMapFile,
      ui: config.telegram.uiEmojiMapFile,
      slogan: config.telegram.sloganEmojiMapFile,
      sloganTile: config.telegram.sloganTileEmojiMapFile,
      banner: config.telegram.bannerEmojiMapFile,
      news: config.telegram.newsEmojiMapFile,
      flame: config.telegram.flameEmojiMapFile,
      game: config.telegram.gameEmojiMapFile,
      robo: config.telegram.roboEmojiMapFile,
      retro: config.telegram.retroFontEmojiMapFile
    }
  });
}

export async function writeTelegramEmojiHealthReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export function evaluateTelegramEmojiLiveHealth(options = {}) {
  const required = Boolean(options.required);
  const maxAgeMs = positiveNumber(options.maxAgeMs, DEFAULT_HEALTH_MAX_AGE_HOURS * 60 * 60 * 1000);
  if (!required) {
    return {
      required: false,
      ok: true,
      status: 'not_required',
      reason: 'telegram_token_missing',
      maxAgeMs
    };
  }

  const report = options.report;
  if (!report || typeof report !== 'object') {
    return {
      required: true,
      ok: false,
      status: 'missing',
      reason: 'health_report_missing',
      maxAgeMs
    };
  }

  const generatedAt = String(report.generatedAt || '');
  const generatedAtMs = Date.parse(generatedAt);
  const nowMs = normalizeNow(options.now);
  if (!Number.isFinite(generatedAtMs)) {
    return {
      required: true,
      ok: false,
      status: 'failed',
      reason: 'health_report_timestamp_invalid',
      generatedAt,
      maxAgeMs
    };
  }

  const identityMismatch = compareTelegramEmojiHealthIdentity(report.identity, options.identity);
  if (identityMismatch) {
    return {
      required: true,
      ok: false,
      status: 'failed',
      reason: identityMismatch.reason,
      identityMismatch: identityMismatch.fields,
      generatedAt,
      ageMs: Math.max(0, nowMs - generatedAtMs),
      maxAgeMs
    };
  }

  const validation = report.telegramValidation || {};
  if (report.ok !== true || validation.ok !== true || validation.skipped === true) {
    return {
      required: true,
      ok: false,
      status: 'failed',
      reason: validation.error || validation.reason || 'telegram_validation_failed',
      generatedAt,
      ageMs: Math.max(0, nowMs - generatedAtMs),
      maxAgeMs
    };
  }

  const reportRequiredPacks = new Set(report.registry?.requiredPacks || []);
  const missingRequiredPacks = (options.requiredPacks || [])
    .filter((pack) => !reportRequiredPacks.has(pack));
  if (missingRequiredPacks.length) {
    return {
      required: true,
      ok: false,
      status: 'failed',
      reason: 'health_report_pack_coverage_incomplete',
      generatedAt,
      ageMs: Math.max(0, nowMs - generatedAtMs),
      maxAgeMs,
      missingRequiredPacks
    };
  }

  const ageMs = Math.max(0, nowMs - generatedAtMs);
  if (ageMs > maxAgeMs) {
    return {
      required: true,
      ok: false,
      status: 'stale',
      reason: 'health_report_stale',
      generatedAt,
      ageMs,
      maxAgeMs
    };
  }

  return {
    required: true,
    ok: true,
    status: 'healthy',
    reason: 'telegram_validation_passed',
    generatedAt,
    ageMs,
    maxAgeMs
  };
}

async function validateCustomEmojiIds({ expectations, token, fetchImpl }) {
  const normalizedExpectations = normalizeCustomEmojiExpectations(expectations);
  const uniqueIds = normalizedExpectations.map((entry) => entry.id);
  if (!uniqueIds.length) {
    return { ok: true, skipped: true, reason: 'no_custom_emoji_ids', requested: 0, returned: 0 };
  }
  if (!token) {
    return { ok: true, skipped: true, reason: 'missing_telegram_token', requested: uniqueIds.length, returned: 0 };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, error: 'fetch_unavailable', requested: uniqueIds.length, returned: 0 };
  }

  const expectedById = new Map(normalizedExpectations.map((entry) => [entry.id, entry]));
  const returnedStickers = [];
  let checkedBatches = 0;

  for (let offset = 0; offset < uniqueIds.length; offset += TELEGRAM_CUSTOM_EMOJI_BATCH_SIZE) {
    const batchIds = uniqueIds.slice(offset, offset + TELEGRAM_CUSTOM_EMOJI_BATCH_SIZE);
    let response;
    let data;
    try {
      response = await fetchImpl(`https://api.telegram.org/bot${token}/getCustomEmojiStickers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ custom_emoji_ids: batchIds })
      });
      data = await response.json();
    } catch (error) {
      return {
        ok: false,
        error: safeTelegramError(error, token),
        requested: uniqueIds.length,
        returned: returnedStickers.length,
        checkedBatches
      };
    }
    checkedBatches += 1;
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: safeTelegramError(
          data?.description || `HTTP ${response.status || 'unknown'}`,
          token
        ),
        requested: uniqueIds.length,
        returned: returnedStickers.length,
        checkedBatches
      };
    }
    if (!Array.isArray(data.result)) {
      return {
        ok: false,
        error: 'telegram_result_invalid',
        requested: uniqueIds.length,
        returned: returnedStickers.length,
        checkedBatches
      };
    }
    returnedStickers.push(...data.result);
  }

  const returnedById = new Map();
  const duplicateIds = [];
  const unexpectedIds = [];
  for (const sticker of returnedStickers) {
    const id = String(sticker?.custom_emoji_id || '');
    if (!id || !expectedById.has(id)) {
      if (id) unexpectedIds.push(id);
      continue;
    }
    if (returnedById.has(id)) duplicateIds.push(id);
    else returnedById.set(id, sticker);
  }

  const missingIds = uniqueIds.filter((id) => !returnedById.has(id));
  const altMismatches = [];
  for (const expectation of normalizedExpectations) {
    const sticker = returnedById.get(expectation.id);
    if (!sticker || !expectation.expectedAlts.length) continue;
    const returnedAlt = String(sticker.emoji || '');
    const normalizedReturnedAlt = normalizeEmojiAlt(returnedAlt);
    const matches = expectation.expectedAlts.some((alt) => normalizeEmojiAlt(alt) === normalizedReturnedAlt);
    if (!matches) {
      altMismatches.push({
        id: expectation.id,
        expected: expectation.expectedAlts,
        returned: returnedAlt
      });
    }
  }

  const ok = missingIds.length === 0
    && unexpectedIds.length === 0
    && duplicateIds.length === 0
    && altMismatches.length === 0;
  return {
    ok,
    error: ok ? undefined : 'telegram_custom_emoji_mismatch',
    requested: uniqueIds.length,
    returned: returnedStickers.length,
    checkedBatches,
    missingIds,
    unexpectedIds: [...new Set(unexpectedIds)],
    duplicateIds: [...new Set(duplicateIds)],
    altMismatches
  };
}

function collectCustomEmojiExpectations(registry, packs) {
  const ids = collectCustomEmojiIdsFromRegistry(registry, packs);
  const expectedAltsById = new Map(ids.map((id) => [id, new Set()]));

  for (const pack of packs || []) {
    const map = registry?.packs?.[pack]?.map || {};
    for (const sticker of map.stickers || []) {
      addExpectedAlt(expectedAltsById, sticker?.customEmojiId || sticker?.custom_emoji_id, sticker?.emoji);
    }
    for (const [emoji, id] of Object.entries(map.customEmojiIdsByEmoji || {})) {
      addExpectedAlt(expectedAltsById, id, emoji);
    }
    for (const [character, id] of Object.entries(map.customEmojiIdsByCharacter || {})) {
      addExpectedAlt(expectedAltsById, id, map.customEmojiAltByCharacter?.[character]);
    }
    for (const slogan of Object.values(map.slogans || {})) {
      for (const tile of slogan?.tiles || []) {
        addExpectedAlt(expectedAltsById, tile?.customEmojiId, tile?.emoji || slogan?.emoji);
      }
    }
  }

  return ids.map((id) => ({
    id,
    expectedAlts: [...(expectedAltsById.get(id) || [])].sort()
  }));
}

function addExpectedAlt(expectedAltsById, id, alt) {
  const normalizedId = String(id || '');
  const normalizedAlt = String(alt || '');
  if (!normalizedId || !normalizedAlt || !expectedAltsById.has(normalizedId)) return;
  expectedAltsById.get(normalizedId).add(normalizedAlt);
}

function normalizeCustomEmojiExpectations(expectations) {
  const byId = new Map();
  for (const expectation of expectations || []) {
    const id = String(expectation?.id || '');
    if (!id) continue;
    const existing = byId.get(id) || new Set();
    for (const alt of expectation?.expectedAlts || []) {
      if (String(alt || '')) existing.add(String(alt));
    }
    byId.set(id, existing);
  }
  return [...byId.entries()].map(([id, expectedAlts]) => ({
    id,
    expectedAlts: [...expectedAlts].sort()
  }));
}

function buildTelegramEmojiHealthIdentity({ token, expectations }) {
  const normalizedToken = String(token || '').trim();
  const canonicalExpectations = normalizeCustomEmojiExpectations(expectations)
    .map((entry) => ({
      id: entry.id,
      expectedAlts: entry.expectedAlts.map(normalizeEmojiAlt).sort()
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    version: HEALTH_IDENTITY_VERSION,
    botId: telegramBotIdFromToken(normalizedToken),
    botTokenFingerprint: normalizedToken
      ? sha256Fingerprint('telegram-bot-token', normalizedToken)
      : '',
    customEmojiSetFingerprint: sha256Fingerprint(
      'telegram-custom-emoji-set',
      JSON.stringify(canonicalExpectations)
    ),
    customEmojiIdCount: canonicalExpectations.length,
    customEmojiAltCount: canonicalExpectations
      .filter((entry) => entry.expectedAlts.length > 0)
      .length
  };
}

function compareTelegramEmojiHealthIdentity(reportIdentity, expectedIdentity) {
  if (!expectedIdentity || typeof expectedIdentity !== 'object') return null;
  if (!reportIdentity || typeof reportIdentity !== 'object') {
    return {
      reason: 'health_report_identity_missing',
      fields: ['identity']
    };
  }

  const fields = [
    'version',
    'botId',
    'botTokenFingerprint',
    'customEmojiSetFingerprint'
  ].filter((field) => reportIdentity[field] !== expectedIdentity[field]);
  if (!fields.length) return null;
  return {
    reason: fields.some((field) => ['botId', 'botTokenFingerprint'].includes(field))
      ? 'health_report_bot_identity_mismatch'
      : 'health_report_custom_emoji_set_mismatch',
    fields
  };
}

function telegramBotIdFromToken(token) {
  const match = String(token || '').match(/^(\d+):/);
  return match?.[1] || '';
}

function sha256Fingerprint(namespace, value) {
  return `sha256:${createHash('sha256')
    .update(`${namespace}\0${String(value || '')}`, 'utf8')
    .digest('hex')}`;
}

function normalizeEmojiAlt(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\uFE0F/g, '');
}

function safeTelegramError(error, token) {
  const message = String(error?.message || error || 'telegram_request_failed');
  return String(token || '') ? message.split(String(token)).join('[redacted]') : message;
}

function readJsonIfExists(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function configuredHealthMaxAgeMs() {
  const hours = positiveNumber(config.telegram.emojiHealthMaxAgeHours, DEFAULT_HEALTH_MAX_AGE_HOURS);
  return hours * 60 * 60 * 1000;
}

function normalizeNow(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
