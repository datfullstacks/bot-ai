import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from '../src/config.js';
import { replaceStore } from '../src/storage.js';

function argValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function counts(db) {
  return {
    admins: db.admins.length,
    users: db.users.length,
    products: db.products.length,
    inventory: db.inventory.length,
    orders: db.orders.length,
    payments: db.payments.length,
    paymentEvents: db.paymentEvents.length,
    auditLogs: db.auditLogs.length
  };
}

function normalizeBackup(payload) {
  const db = payload?.format === 'telegram-mmo-shop-backup/v1' ? payload.data : payload;
  const requiredArrays = ['admins', 'users', 'products', 'inventory', 'orders', 'payments', 'auditLogs', 'paymentEvents'];
  for (const field of requiredArrays) {
    if (!Array.isArray(db?.[field])) {
      throw new Error(`Invalid backup: missing array ${field}`);
    }
  }
  return db;
}

const file = argValue('--file') || process.env.RESTORE_FILE;
if (!file) {
  console.error('Restore file is required. Use --file <path> and --yes.');
  process.exit(1);
}

if (!hasFlag('--yes')) {
  console.error('Restore is destructive. Re-run with --yes to replace the current store.');
  process.exit(1);
}

const filePath = resolve(process.cwd(), file);
const payload = JSON.parse(await readFile(filePath, 'utf8'));
const db = normalizeBackup(payload);
const restored = await replaceStore(db);

console.log(JSON.stringify({
  ok: true,
  file: filePath,
  targetStorage: config.storage.driver,
  counts: counts(restored)
}, null, 2));
