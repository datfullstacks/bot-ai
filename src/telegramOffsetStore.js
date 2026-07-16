import { readStore, withWrite } from './storage.js';
import { usePostgresRowMode } from './storageMode.js';
import { withPostgresClient, withPostgresTransaction } from './postgresStore.js';

export async function readTelegramOffset() {
  if (usePostgresRowMode()) {
    return withPostgresClient(async (client) => {
      const result = await client.query(`SELECT value FROM app_meta WHERE key = 'botOffsets'`);
      return Number(result.rows[0]?.value?.telegram || 0);
    });
  }

  const db = await readStore();
  return Number(db.botOffsets?.telegram || 0);
}

export async function writeTelegramOffset(offset) {
  const value = Number(offset || 0);
  if (usePostgresRowMode()) {
    await withPostgresTransaction(async (client) => {
      await client.query(
        `INSERT INTO app_meta (key, value, updated_at)
         VALUES ('botOffsets', $1::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify({ telegram: value })]
      );
    });
    return;
  }

  await withWrite(async (db) => {
    db.botOffsets ||= {};
    db.botOffsets.telegram = value;
  });
}
