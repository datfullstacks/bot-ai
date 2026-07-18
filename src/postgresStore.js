import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

const collections = {
  admins: 'admins',
  sessions: 'sessions',
  users: 'users',
  catalogPriceLists: 'catalogPriceLists',
  telegramPriceLists: 'telegramPriceLists',
  products: 'products',
  inventory: 'inventory',
  orders: 'orders',
  payments: 'payments',
  auditLogs: 'auditLogs',
  paymentEvents: 'paymentEvents'
};

const collectionFields = Object.keys(collections);
const advisoryLockKey = 684463218;
let pool;
let schemaReady = false;

export function emptyDb() {
  return {
    version: 1,
    admins: [],
    sessions: [],
    users: [],
    catalogPriceLists: [],
    telegramPriceLists: [],
    products: [],
    inventory: [],
    orders: [],
    payments: [],
    auditLogs: [],
    paymentEvents: [],
    botOffsets: { telegram: 0 }
  };
}

function getPool() {
  if (!pool) {
    if (!config.database.url) {
      throw Object.assign(new Error('DATABASE_URL is required when STORE_DRIVER=postgres'), { statusCode: 500 });
    }
    pool = new Pool({
      connectionString: config.database.url,
      max: config.database.poolMax,
      idleTimeoutMillis: 30_000
    });
  }
  return pool;
}

export async function ensurePostgresSchema(client = getPool()) {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_documents (
      collection text NOT NULL,
      id text NOT NULL,
      doc jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (collection, id)
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS seat_access_fences (
      provider text NOT NULL,
      account_ref text NOT NULL,
      email text NOT NULL,
      fence jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (provider, account_ref, email)
    );

    CREATE INDEX IF NOT EXISTS idx_app_documents_collection
      ON app_documents (collection);

    CREATE INDEX IF NOT EXISTS idx_app_documents_doc_status
      ON app_documents ((doc->>'status'));

    CREATE INDEX IF NOT EXISTS idx_app_documents_doc_order_id
      ON app_documents ((doc->>'orderId'));

    CREATE INDEX IF NOT EXISTS idx_app_documents_doc_product_id
      ON app_documents ((doc->>'productId'));

    CREATE INDEX IF NOT EXISTS idx_app_documents_collection_status
      ON app_documents (collection, (doc->>'status'));

    CREATE INDEX IF NOT EXISTS idx_app_documents_collection_product_status
      ON app_documents (collection, (doc->>'productId'), (doc->>'status'));

    CREATE INDEX IF NOT EXISTS idx_app_documents_collection_order_status
      ON app_documents (collection, (doc->>'orderId'), (doc->>'status'));

    CREATE INDEX IF NOT EXISTS idx_app_documents_collection_user_status
      ON app_documents (collection, (doc->>'userId'), (doc->>'status'));

    CREATE INDEX IF NOT EXISTS idx_app_documents_products_sku
      ON app_documents (collection, (doc->>'sku'));

    CREATE INDEX IF NOT EXISTS idx_app_documents_payments_provider_id
      ON app_documents (collection, (doc->>'providerPaymentId'));

    CREATE INDEX IF NOT EXISTS idx_app_documents_collection_created_at
      ON app_documents (collection, (doc->>'createdAt'));
  `);
  schemaReady = true;
}

function sortDb(db) {
  const ascCreated = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  db.admins.sort(ascCreated);
  db.sessions.sort(ascCreated);
  db.users.sort(ascCreated);
  db.catalogPriceLists.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  db.telegramPriceLists.sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));
  db.products.sort(ascCreated);
  db.inventory.sort(ascCreated);
  db.orders.sort(ascCreated);
  db.payments.sort(ascCreated);
  db.paymentEvents.sort((a, b) => String(a.receivedAt || a.createdAt || '').localeCompare(String(b.receivedAt || b.createdAt || '')));
  db.auditLogs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return db;
}

async function loadDb(client) {
  const db = emptyDb();
  const docs = await client.query('SELECT collection, doc FROM app_documents');
  for (const row of docs.rows) {
    const field = collections[row.collection];
    if (field) db[field].push(row.doc);
  }

  const meta = await client.query('SELECT key, value FROM app_meta');
  for (const row of meta.rows) {
    if (row.key === 'version') db.version = Number(row.value || 1);
    if (row.key === 'botOffsets') db.botOffsets = row.value || { telegram: 0 };
  }

  return sortDb(db);
}

async function persistDb(client, db) {
  for (const field of collectionFields) {
    const docs = Array.isArray(db[field]) ? db[field].filter((doc) => doc?.id) : [];
    const ids = docs.map((doc) => String(doc.id));

    if (ids.length) {
      await client.query(
        'DELETE FROM app_documents WHERE collection = $1 AND NOT (id = ANY($2::text[]))',
        [field, ids]
      );
    } else {
      await client.query('DELETE FROM app_documents WHERE collection = $1', [field]);
    }

    for (const doc of docs) {
      await client.query(
        `INSERT INTO app_documents (collection, id, doc, updated_at)
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (collection, id)
         DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
        [field, String(doc.id), JSON.stringify(doc)]
      );
    }
  }

  await client.query(
    `INSERT INTO app_meta (key, value, updated_at)
     VALUES ('version', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(db.version || 1)]
  );
  await client.query(
    `INSERT INTO app_meta (key, value, updated_at)
     VALUES ('botOffsets', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(db.botOffsets || { telegram: 0 })]
  );
}

export async function readPostgresStore() {
  const client = await getPool().connect();
  try {
    await ensurePostgresSchema(client);
    return loadDb(client);
  } finally {
    client.release();
  }
}

export async function withPostgresClient(callback, options = {}) {
  const client = await getPool().connect();
  let discard = false;
  try {
    await ensurePostgresSchema(client);
    return await callback(client);
  } catch (error) {
    discard = options.destroyOnError === true;
    throw error;
  } finally {
    client.release(discard);
  }
}

export async function withPostgresTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await ensurePostgresSchema(client);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function withPostgresWrite(mutator) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await ensurePostgresSchema(client);
    await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLockKey]);

    const db = await loadDb(client);
    const result = await mutator(db);
    db.version = Number(db.version || 0) + 1;
    await persistDb(client, db);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function replacePostgresStore(db) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await ensurePostgresSchema(client);
    await client.query('SELECT pg_advisory_xact_lock($1)', [advisoryLockKey]);
    await client.query('DELETE FROM app_documents');
    await client.query('DELETE FROM app_meta');
    await persistDb(client, { ...emptyDb(), ...db });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function readJsonSnapshotForMigration(path = config.dataFile) {
  if (!existsSync(path)) return emptyDb();
  return { ...emptyDb(), ...JSON.parse(readFileSync(path, 'utf8')) };
}
