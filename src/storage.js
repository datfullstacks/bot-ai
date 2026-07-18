import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { config, nowIso } from './config.js';
import { DEFAULT_CATALOG_PRODUCTS, normalizePublicProduct } from './catalog.js';
import { hashPassword } from './passwords.js';
import { emptyDb, readPostgresStore, replacePostgresStore, withPostgresWrite } from './postgresStore.js';

let writeQueue = Promise.resolve();

export function makeId(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 18)}`;
}

async function ensureDataDir() {
  await mkdir(dirname(config.dataFile), { recursive: true });
}

async function readDbFile() {
  await ensureDataDir();
  try {
    const raw = await readFile(config.dataFile, 'utf8');
    return { ...emptyDb(), ...JSON.parse(raw) };
  } catch (error) {
    if (error.code === 'ENOENT') return emptyDb();
    throw error;
  }
}

async function writeDbFile(db) {
  await ensureDataDir();
  const tmp = `${config.dataFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  await rename(tmp, config.dataFile);
}

export async function initStore() {
  await withWrite(async (db) => {
    if (!db.admins.some((admin) => admin.username === config.admin.username)) {
      const password = hashPassword(config.admin.password);
      db.admins.push({
        id: makeId('adm'),
        username: config.admin.username,
        passwordHash: password.hash,
        passwordSalt: password.salt,
        role: 'owner',
        createdAt: nowIso()
      });
      db.auditLogs.push({
        id: makeId('aud'),
        actorId: 'system',
        action: 'admin.bootstrap',
        entityType: 'admin',
        entityId: config.admin.username,
        details: { username: config.admin.username },
        createdAt: nowIso()
      });
    }

    if (db.products.length === 0) {
      const createdAt = nowIso();
      for (const catalogProduct of DEFAULT_CATALOG_PRODUCTS) {
        db.products.push({
          id: makeId('prd'),
          ...catalogProduct,
          createdAt,
          updatedAt: createdAt
        });
      }

      db.auditLogs.push({
        id: makeId('aud'),
        actorId: 'system',
        action: 'catalog.seed',
        entityType: 'product',
        entityId: 'default-catalog',
        details: { products: DEFAULT_CATALOG_PRODUCTS.length },
        createdAt
      });
    }

    const seatCatalog = DEFAULT_CATALOG_PRODUCTS.filter((product) => product.fulfillmentMode === 'seat_email');
    let addedSeatProducts = 0;
    let upgradedSeatProducts = 0;
    for (const catalogProduct of seatCatalog) {
      const product = db.products.find((item) => item.sku === catalogProduct.sku);
      const targetVersion = catalogProduct.usagePolicy ? 2 : 1;
      if (!product) {
        const createdAt = nowIso();
        db.products.push({
          id: makeId('prd'),
          ...catalogProduct,
          catalogManagedSeatVersion: targetVersion,
          createdAt,
          updatedAt: createdAt
        });
        addedSeatProducts += 1;
        continue;
      }
      const currentVersion = Number(product.catalogManagedSeatVersion || 0);
      if (currentVersion >= targetVersion) continue;
      if (currentVersion < 1 && product.fulfillmentMode !== 'seat_email') {
        for (const key of [
          'name',
          'description',
          'category',
          'brand',
          'packageType',
          'officialPriceNote',
          'accountType',
          'warrantyPolicy',
          'replacementPolicy',
          'fulfillmentMode',
          'deliveryMode'
        ]) {
          product[key] = catalogProduct[key];
        }
      }
      if (targetVersion >= 2 && catalogProduct.usagePolicy && !String(product.usagePolicy || '').trim()) {
        product.usagePolicy = catalogProduct.usagePolicy;
      }
      product.catalogManagedSeatVersion = targetVersion;
      product.updatedAt = nowIso();
      upgradedSeatProducts += 1;
    }
    if (addedSeatProducts || upgradedSeatProducts) {
      db.auditLogs.unshift({
        id: makeId('aud'),
        actorId: 'system',
        action: 'catalog.seat_email.upgrade',
        entityType: 'product',
        entityId: 'default-seat-catalog',
        details: { addedSeatProducts, upgradedSeatProducts },
        createdAt: nowIso()
      });
    }
  });
}

export async function readStore() {
  if (config.storage.driver === 'postgres') {
    return readPostgresStore();
  }
  return readDbFile();
}

export async function replaceStore(snapshot) {
  const db = { ...emptyDb(), ...snapshot };
  db.version = Number(db.version || 0) + 1;

  if (config.storage.driver === 'postgres') {
    await replacePostgresStore(db);
    return db;
  }

  await writeDbFile(db);
  return db;
}

export async function withWrite(mutator) {
  if (config.storage.driver === 'postgres') {
    return withPostgresWrite(mutator);
  }

  const run = async () => {
    const db = await readDbFile();
    const result = await mutator(db);
    db.version = Number(db.version || 0) + 1;
    await writeDbFile(db);
    return result;
  };

  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

export function publicProduct(product, db) {
  const available = db.inventory.filter((item) => item.productId === product.id && item.status === 'available').length;
  const reserved = db.inventory.filter((item) => item.productId === product.id && item.status === 'reserved').length;
  const sold = db.inventory.filter((item) => item.productId === product.id && item.status === 'sold').length;
  return { ...normalizePublicProduct(product), stock: { available, reserved, sold } };
}

export function addAudit(db, actorId, action, entityType, entityId, details = {}) {
  db.auditLogs.unshift({
    id: makeId('aud'),
    actorId,
    action,
    entityType,
    entityId,
    details,
    createdAt: nowIso()
  });
  db.auditLogs = db.auditLogs.slice(0, 1000);
}
