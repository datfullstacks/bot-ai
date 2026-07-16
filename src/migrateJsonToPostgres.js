import { config } from './config.js';
import { readJsonSnapshotForMigration, replacePostgresStore } from './postgresStore.js';

if (!config.database.url) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const snapshot = readJsonSnapshotForMigration();
await replacePostgresStore(snapshot);

console.log(JSON.stringify({
  ok: true,
  source: config.dataFile,
  target: 'postgres',
  counts: {
    admins: snapshot.admins.length,
    users: snapshot.users.length,
    products: snapshot.products.length,
    inventory: snapshot.inventory.length,
    orders: snapshot.orders.length,
    payments: snapshot.payments.length,
    auditLogs: snapshot.auditLogs.length
  }
}, null, 2));
