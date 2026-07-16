import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { config, nowIso } from '../src/config.js';
import { readStore } from '../src/storage.js';

function argValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function compactStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
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

const outPath = resolve(
  process.cwd(),
  argValue('--out') || process.env.BACKUP_FILE || `backups/mmo-shop-backup-${compactStamp()}.json`
);

const db = await readStore();
const backup = {
  format: 'telegram-mmo-shop-backup/v1',
  exportedAt: nowIso(),
  source: {
    storageDriver: config.storage.driver,
    postgresWriteMode: config.storage.driver === 'postgres' ? config.storage.postgresWriteMode : undefined
  },
  counts: counts(db),
  data: db
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: true,
  file: outPath,
  counts: backup.counts
}, null, 2));
