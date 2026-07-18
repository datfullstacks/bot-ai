import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-seat-policy-'));
const dataFile = join(tempDir, 'db.json');
process.env.DATA_FILE = dataFile;
process.env.STORE_DRIVER = 'json';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'seat-policy-test-password';

const snapshot = {
  version: 1,
  admins: [],
  sessions: [],
  users: [],
  catalogPriceLists: [],
  telegramPriceLists: [],
  discountCodes: [],
  notificationCampaigns: [],
  notificationDeliveries: [],
  products: [
    {
      id: 'prd_existing_chatgpt',
      sku: 'chatgpt-business-seat-1m',
      name: 'Custom ChatGPT Seat name',
      brand: 'ChatGPT',
      fulfillmentMode: 'seat_email',
      catalogManagedSeatVersion: 1
    },
    {
      id: 'prd_existing_claude',
      sku: 'claude-business-seat-1x-1m',
      name: 'Custom Claude Seat name',
      brand: 'Claude',
      fulfillmentMode: 'seat_email',
      catalogManagedSeatVersion: 1
    }
  ],
  inventory: [],
  orders: [],
  payments: [],
  auditLogs: [],
  paymentEvents: [],
  botOffsets: { telegram: 0 }
};

try {
  await writeFile(dataFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  const { initStore } = await import('../src/storage.js');
  await initStore();
  const migrated = JSON.parse(await readFile(dataFile, 'utf8'));
  const bySku = new Map(migrated.products.map((product) => [product.sku, product]));

  for (const sku of [
    'chatgpt-business-seat-1m',
    'claude-business-seat-1x-1m',
    'claude-business-seat-6-5x-1m'
  ]) {
    const product = bySku.get(sku);
    assert.ok(product, `${sku} should remain available after startup migration.`);
    assert.equal(product.catalogManagedSeatVersion, 2);
    assert.match(product.usagePolicy, /OAuth\/session token/i);
    assert.match(product.usagePolicy, /Trung Quốc.*Nga.*Iran.*Triều Tiên/is);
  }

  assert.equal(bySku.get('chatgpt-business-seat-1m').name, 'Custom ChatGPT Seat name', 'Migration should preserve existing Admin edits.');
  assert.equal(bySku.get('claude-business-seat-1x-1m').name, 'Custom Claude Seat name', 'Migration should preserve existing Admin edits.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, checked: 'ChatGPT and Claude Seat usage-policy startup migration' }, null, 2));
