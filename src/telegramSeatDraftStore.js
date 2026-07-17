import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { config } from './config.js';

const memoryDrafts = new Map();
const discardedDrafts = new Map();
const pendingDeletes = new Map();
const draftTtlSeconds = Math.max(60, config.orders.ttlMinutes * 60);
let redis;
let redisDisabledUntil = 0;

function draftKey(userId, chatId) {
  return `${config.redis.keyPrefix}:telegram:seat-email:${String(userId)}:${String(chatId)}`;
}

function redisRequired() {
  return process.env.NODE_ENV === 'production';
}

function unavailableError() {
  return Object.assign(
    new Error('Seat email flow requires Redis and is temporarily unavailable'),
    { statusCode: 503, code: 'seat_draft_store_unavailable' }
  );
}

function getRedis() {
  if (!config.redis.url || Date.now() < redisDisabledUntil) return null;
  if (redis && ['end', 'close'].includes(redis.status)) redis = undefined;
  if (!redis) {
    const client = new Redis(config.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1200,
      commandTimeout: 1200,
      retryStrategy: () => null
    });
    client.on('error', () => {
      redisDisabledUntil = Date.now() + 30_000;
    });
    client.on('end', () => {
      if (redis === client) redis = undefined;
    });
    redis = client;
  }
  return redis;
}

function liveDraft(value) {
  if (!value || Number(new Date(value.expiresAt)) <= Date.now()) return null;
  return value;
}

async function redisCommand(action) {
  const client = getRedis();
  if (!client) {
    if (redisRequired()) throw unavailableError();
    return null;
  }
  try {
    if (client.status === 'wait') await client.connect();
    return await action(client);
  } catch (error) {
    redisDisabledUntil = Date.now() + 30_000;
    try {
      client.disconnect();
    } catch {
      // The failed connection is already closed.
    }
    if (redis === client) redis = undefined;
    if (redisRequired()) throw unavailableError();
    return null;
  }
}

export async function saveSeatEmailDraft(draft) {
  const normalized = {
    ...draft,
    userId: String(draft.userId),
    chatId: String(draft.chatId),
    expiresAt: draft.expiresAt || new Date(Date.now() + draftTtlSeconds * 1000).toISOString()
  };
  const key = draftKey(normalized.userId, normalized.chatId);
  const pendingDelete = pendingDeletes.get(key);
  if (pendingDelete) await pendingDelete.catch(() => null);
  const remainingTtlSeconds = Math.max(1, Math.ceil(
    (Number(new Date(normalized.expiresAt)) - Date.now()) / 1000
  ));
  discardedDrafts.delete(key);
  if (!redisRequired()) memoryDrafts.set(key, normalized);
  await redisCommand((client) => client.set(key, JSON.stringify(normalized), 'EX', remainingTtlSeconds));
  return normalized;
}

export async function createSeatEmailDraft(input) {
  return saveSeatEmailDraft({
    id: randomBytes(9).toString('base64url'),
    kind: 'seat_email',
    stage: 'awaiting_emails',
    emails: [],
    revision: 1,
    createdAt: new Date().toISOString(),
    ...input
  });
}

export async function getSeatEmailDraft(userId, chatId) {
  const key = draftKey(userId, chatId);
  const discardedUntil = Number(discardedDrafts.get(key) || 0);
  if (discardedUntil > Date.now()) return null;
  if (discardedUntil) discardedDrafts.delete(key);
  const stored = await redisCommand((client) => client.get(key));
  if (stored) {
    try {
      const parsed = liveDraft(JSON.parse(stored));
      if (parsed) {
        if (!redisRequired()) memoryDrafts.set(key, parsed);
        return parsed;
      }
    } catch {
      // Invalid/expired Redis drafts are discarded below.
    }
    await redisCommand((client) => client.del(key)).catch(() => null);
  }

  if (redisRequired()) return null;
  const memory = liveDraft(memoryDrafts.get(key));
  if (!memory) memoryDrafts.delete(key);
  return memory;
}

export async function updateSeatEmailDraft(userId, chatId, draftId, patch) {
  const current = await getSeatEmailDraft(userId, chatId);
  if (!current || current.id !== String(draftId || '')) return null;
  return saveSeatEmailDraft({
    ...current,
    ...patch,
    id: current.id,
    revision: Number(current.revision || 0) + 1
  });
}

export async function deleteSeatEmailDraft(userId, chatId) {
  const key = draftKey(userId, chatId);
  discardedDrafts.set(key, Date.now() + draftTtlSeconds * 1000);
  memoryDrafts.delete(key);
  const deletion = redisCommand((client) => client.del(key));
  pendingDeletes.set(key, deletion);
  try {
    await deletion;
  } finally {
    if (pendingDeletes.get(key) === deletion) pendingDeletes.delete(key);
  }
}
