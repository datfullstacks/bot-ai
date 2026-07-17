import { config } from './config.js';
import { withPostgresClient } from './postgresStore.js';

const localLocks = new Set();
let activePostgresSeatLocks = 0;

function normalizedLockKeys({ provider, accountRef, emails = [] } = {}) {
  const prefix = [
    'seat-access',
    String(provider || '').trim().toLowerCase(),
    String(accountRef || '').trim().toLowerCase()
  ].join(':');
  return [...new Set(emails
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean))]
    .sort()
    .map((email) => `${prefix}:${email}`);
}

export async function lockSeatAccessTransaction(client, scope) {
  if (!client?.query) throw new TypeError('A PostgreSQL client is required for the Seat access transaction lock');
  const keys = normalizedLockKeys(scope);
  for (const key of keys) {
    const result = await client.query(
      'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked',
      [key]
    );
    if (result.rows[0]?.locked !== true) {
      throw Object.assign(new Error('Seat access is being changed; retry this payment transition'), {
        statusCode: 503,
        code: 'SEAT_ACCESS_BUSY',
        retryable: true
      });
    }
  }
  return keys.length;
}

async function withLocalLocks(keys, callback) {
  if (keys.some((key) => localLocks.has(key))) return { acquired: false, value: undefined };
  keys.forEach((key) => localLocks.add(key));
  try {
    return { acquired: true, value: await callback({ storage: 'local', client: null }) };
  } finally {
    keys.forEach((key) => localLocks.delete(key));
  }
}

async function releasePostgresLocks(client, keys) {
  for (const key of keys.slice().reverse()) {
    await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]);
  }
}

export async function withSeatAccessLocks(scope, callback, options = {}) {
  if (typeof callback !== 'function') throw new TypeError('Seat access lock callback is required');
  const keys = normalizedLockKeys(scope);
  if (!keys.length) return { acquired: true, value: await callback({ storage: 'none', client: null }) };

  const usePostgres = options.forceLocal !== true && (options.forcePostgres === true || (
    config.storage.driver === 'postgres'
    && config.storage.postgresWriteMode !== 'document'
    && Boolean(config.database.url)
  ));
  if (!usePostgres) return withLocalLocks(keys, callback);

  const postgresLockCapacity = Math.max(0, Number(config.database.poolMax || 0) - 1);
  if (postgresLockCapacity < 1 || activePostgresSeatLocks >= postgresLockCapacity) {
    return { acquired: false, value: undefined };
  }
  activePostgresSeatLocks += 1;

  let callbackError;
  try {
    const result = await withPostgresClient(async (client) => {
      const acquired = [];
      for (const key of keys) {
        const result = await client.query(
          'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
          [key]
        );
        if (result.rows[0]?.locked !== true) {
          await releasePostgresLocks(client, acquired);
          return { acquired: false, value: undefined };
        }
        acquired.push(key);
      }

      try {
        try {
          return {
            acquired: true,
            value: await callback({ storage: 'postgres', client })
          };
        } catch (error) {
          callbackError = error;
          return { acquired: true, value: undefined };
        }
      } finally {
        await releasePostgresLocks(client, acquired);
      }
    }, { destroyOnError: true });
    if (callbackError) throw callbackError;
    return result;
  } finally {
    activePostgresSeatLocks -= 1;
  }
}
