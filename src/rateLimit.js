import { config } from './config.js';
import Redis from 'ioredis';

const buckets = new Map();
const cleanupEveryMs = 60_000;
let lastCleanup = Date.now();
let redis;
let redisDisabledUntil = 0;

function getRedis() {
  if (!config.redis.url || Date.now() < redisDisabledUntil) return null;
  if (!redis) {
    redis = new Redis(config.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });
    redis.on('error', () => {
      redisDisabledUntil = Date.now() + 30_000;
    });
  }
  return redis;
}

function cleanup(now) {
  if (now - lastCleanup < cleanupEveryMs) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function consumeMemoryRateLimit(key, limit, windowMs) {
  const now = Date.now();
  cleanup(now);

  const bucketKey = String(key);
  let bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(bucketKey, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  return {
    allowed: bucket.count <= limit,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  };
}

async function consumeRedisRateLimit(key, limit, windowMs) {
  const client = getRedis();
  if (!client) return null;

  try {
    if (client.status === 'wait') await client.connect();
    const bucketKey = `${config.redis.keyPrefix}:rate:${key}`;
    const count = await client.incr(bucketKey);
    if (count === 1) await client.pexpire(bucketKey, windowMs);
    const ttl = await client.pttl(bucketKey);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((ttl > 0 ? ttl : windowMs) / 1000))
    };
  } catch {
    redisDisabledUntil = Date.now() + 30_000;
    return null;
  }
}

export async function consumeRateLimit(key, limit, windowMs = 60_000) {
  const redisResult = await consumeRedisRateLimit(key, limit, windowMs);
  if (redisResult) return redisResult;
  return consumeMemoryRateLimit(key, limit, windowMs);
}

export async function assertRateLimit(key, limit, windowMs = 60_000) {
  const result = await consumeRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    throw Object.assign(new Error('Too many requests'), {
      statusCode: 429,
      retryAfterSeconds: result.retryAfterSeconds
    });
  }
  return result;
}

export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

export function classifyHttpLimit(pathname) {
  if (pathname === '/api/auth/login') return { bucket: 'auth', limit: config.traffic.authPerMinute };
  if (pathname.startsWith('/api/public/')) return { bucket: 'public', limit: config.traffic.publicPerMinute };
  if (pathname.startsWith('/api/')) return { bucket: 'admin', limit: config.traffic.adminPerMinute };
  return null;
}
