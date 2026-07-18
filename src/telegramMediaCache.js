import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { config } from './config.js';

const memoryFileIds = new Map();
let redis;
let redisDisabledUntil = 0;

function cacheEnabled() {
  return Boolean(config.telegram.mediaFileIdCache && config.telegram.token);
}

function getRedis() {
  if (!cacheEnabled() || !config.redis.url || Date.now() < redisDisabledUntil) return null;
  if (redis && ['end', 'close'].includes(redis.status)) redis = undefined;
  if (!redis) {
    const client = new Redis(config.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 800,
      commandTimeout: 800,
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

async function redisCommand(action) {
  const client = getRedis();
  if (!client) return null;
  try {
    if (client.status === 'wait') await client.connect();
    return await action(client);
  } catch {
    redisDisabledUntil = Date.now() + 30_000;
    try {
      client.disconnect();
    } catch {
      // The failed connection is already closed.
    }
    if (redis === client) redis = undefined;
    return null;
  }
}

function normalizedFileId(value) {
  const fileId = String(value || '').trim();
  return fileId && fileId.length <= 1024 ? fileId : '';
}

export function telegramPhotoCacheKey(photoBytes) {
  if (!cacheEnabled() || !photoBytes?.length) return '';
  const botScope = createHash('sha256')
    .update(String(config.telegram.token))
    .digest('hex')
    .slice(0, 16);
  const assetDigest = createHash('sha256')
    .update(photoBytes)
    .digest('hex');
  return `${config.redis.keyPrefix}:telegram:photo-file-id:v1:${botScope}:${assetDigest}`;
}

export async function getTelegramPhotoFileId(cacheKey) {
  if (!cacheKey) return '';
  const memoryValue = normalizedFileId(memoryFileIds.get(cacheKey));
  if (memoryValue) return memoryValue;

  const redisValue = normalizedFileId(await redisCommand((client) => client.get(cacheKey)));
  if (redisValue) memoryFileIds.set(cacheKey, redisValue);
  return redisValue;
}

export async function setTelegramPhotoFileId(cacheKey, fileId) {
  const normalized = normalizedFileId(fileId);
  if (!cacheKey || !normalized) return false;
  memoryFileIds.set(cacheKey, normalized);
  await redisCommand((client) => client.set(
    cacheKey,
    normalized,
    'EX',
    config.telegram.mediaFileIdCacheTtlSeconds
  ));
  return true;
}

export async function deleteTelegramPhotoFileId(cacheKey) {
  if (!cacheKey) return false;
  memoryFileIds.delete(cacheKey);
  await redisCommand((client) => client.del(cacheKey));
  return true;
}

export function telegramPhotoFileId(response) {
  const message = response?.result || response;
  const photos = Array.isArray(message?.photo) ? message.photo : [];
  return normalizedFileId(photos.at(-1)?.file_id);
}

export function resetTelegramMediaMemoryCache() {
  memoryFileIds.clear();
}
