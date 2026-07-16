import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const usePostgres = process.argv.includes('--postgres');
const runId = `${process.pid}-${Date.now()}`;
const dataFile = usePostgres ? null : resolve(process.cwd(), 'data', `smoke-test-${runId}.json`);

if (usePostgres) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required for --postgres smoke tests.');
    process.exit(1);
  }
  process.env.STORE_DRIVER = 'postgres';
  process.env.POSTGRES_WRITE_MODE ||= 'row';
} else {
  process.env.STORE_DRIVER = 'json';
  process.env.DATA_FILE = dataFile;
}
process.env.PAYMENT_PROVIDER = 'mock';
process.env.SALES_ENABLED = 'true';
process.env.INVENTORY_ENCRYPTION_KEY ||= '22'.repeat(32);
process.env.AUTH_SECRET ||= 'smoke-test-auth-secret-with-enough-length';
process.env.PAYMENT_WEBHOOK_SECRET ||= 'smoke-test-payment-secret';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'admin123';

const storage = await import('../src/storage.js');
const shop = await import('../src/shop.js');
const auth = await import('../src/auth.js');
const system = await import('../src/systemStatus.js');
const inventorySecrets = await import('../src/inventorySecrets.js');
const { config } = await import('../src/config.js');

function paidEvent(id, order, payment, amount = order.total) {
  return {
    id,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    reference: payment.reference,
    amount,
    currency: order.currency,
    status: 'paid',
    raw: { smoke: true },
    receivedAt: new Date().toISOString()
  };
}

async function createStockedProduct(actorId, sku, count) {
  const product = await shop.createProduct(actorId, {
    sku,
    name: `Smoke ${sku}`,
    description: 'Smoke test product',
    accountType: 'Smoke private account',
    warrantyPolicy: 'Smoke warranty',
    replacementPolicy: 'Smoke replacement policy',
    price: 10000,
    currency: 'VND'
  });
  await shop.importInventory(
    actorId,
    product.id,
    Array.from({ length: count }, (_, index) => `${sku}-secret-${index + 1}`)
  );
  return product;
}

try {
  await storage.initStore();

  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  assert.throws(
    () => inventorySecrets.assertInventorySecretsReadyForSale([{ secret: 'legacy-plaintext' }]),
    /legacy plaintext/
  );
  assert.throws(
    () => inventorySecrets.assertInventorySecretsReadyForSale([{ secret: 'enc:v1:bad:bad:bad' }]),
    /Unable to decrypt inventory/
  );
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  const session = await auth.loginForRequest('admin', 'admin123');
  assert.ok(session?.id, 'admin login should create a session');
  await auth.logout(session.id);

  const status = await system.getSystemStatus();
  assert.equal(status.storage.driver, usePostgres ? 'postgres' : 'json');
  assert.ok(status.counts.products >= 1, 'demo product should be seeded');

  const actorId = 'smoke-admin';
  const user = await shop.upsertTelegramUser({
    id: `700001${process.pid}`,
    username: `smoke-user-${runId}`,
    first_name: 'Smoke',
    last_name: 'User'
  });

  const controlledProduct = await createStockedProduct(actorId, `smoke-controlled-${runId}`, 1);
  const otherUser = await shop.upsertTelegramUser({
    id: `700002${process.pid}`,
    username: `smoke-other-${runId}`,
    first_name: 'Other',
    last_name: 'User'
  });
  const originalSalesEnabled = config.sales.enabled;
  const originalTestTelegramIds = config.sales.testTelegramIds;
  try {
    config.sales.enabled = false;
    config.sales.testTelegramIds = [user.telegramId];
    const controlledOrder = await shop.createOrderForUser(user, controlledProduct.sku, 1);
    assert.equal(controlledOrder.order.status, 'pending_payment');
    await shop.cancelOrderForUser(user.id, controlledOrder.order.id);
    await assert.rejects(
      () => shop.createOrderForUser(otherUser, controlledProduct.sku, 1),
      /Shop/
    );
  } finally {
    config.sales.enabled = originalSalesEnabled;
    config.sales.testTelegramIds = originalTestTelegramIds;
  }

  const paidProduct = await createStockedProduct(actorId, `smoke-paid-${runId}`, 2);
  await assert.rejects(
    () => shop.createOrderForUser(user, paidProduct.sku, 'invalid'),
    /Quantity must be an integer/
  );
  await assert.rejects(
    () => shop.createProduct(actorId, {
      sku: `smoke-invalid-price-${runId}`,
      name: 'Invalid price',
      price: Number.NaN,
      currency: 'VND'
    }),
    /positive price/
  );
  const encryptedStore = await storage.readStore();
  const encryptedInventory = encryptedStore.inventory.find((item) => item.productId === paidProduct.id);
  assert.match(encryptedInventory.secret, /^enc:v1:/, 'Inventory should be encrypted at rest when a key is configured.');
  const paidOrder = await shop.createOrderForUser(user, paidProduct.sku, 2, {
    idempotencyKey: `smoke-paid-${runId}`
  });
  assert.equal(paidOrder.order.status, 'pending_payment');
  assert.equal(paidOrder.order.productSnapshot.accountType, 'Smoke private account');
  const reusedPaidOrder = await shop.createOrderForUser(user, paidProduct.sku, 2, {
    idempotencyKey: `smoke-paid-${runId}`
  });
  assert.equal(reusedPaidOrder.reused, true);
  assert.equal(reusedPaidOrder.order.id, paidOrder.order.id);
  assert.equal(reusedPaidOrder.payment.id, paidOrder.payment.id);
  const pendingPaymentStatus = await shop.getPublicPaymentStatus(paidOrder.payment.providerPaymentId);
  assert.equal(pendingPaymentStatus.paymentStatus, 'pending');
  assert.equal(pendingPaymentStatus.orderStatus, 'pending_payment');

  const paidResult = await shop.applyPaymentEvent(paidEvent('evt_smoke_paid', paidOrder.order, paidOrder.payment));
  assert.equal(paidResult.order.status, 'delivered');
  const delivery = await shop.getDeliveryForOrder(paidOrder.order.id);
  assert.equal(delivery.deliverySecrets.length, 2);
  assert.equal(delivery.deliverySecrets[0].startsWith(`${paidProduct.sku}-secret-`), true);
  const duplicateImport = await shop.importInventory(actorId, paidProduct.id, [`${paidProduct.sku}-secret-1`]);
  assert.equal(duplicateImport.imported, 0);
  assert.equal(duplicateImport.skippedDuplicates, 1);

  const duplicate = await shop.applyPaymentEvent(paidEvent('evt_smoke_paid', paidOrder.order, paidOrder.payment));
  assert.equal(duplicate.duplicate, true);

  const reviewApproveProduct = await createStockedProduct(actorId, `smoke-review-approve-${runId}`, 1);
  const reviewApproveOrder = await shop.createOrderForUser(user, reviewApproveProduct.sku, 1);
  const mismatch = await shop.applyPaymentEvent(
    paidEvent('evt_smoke_mismatch_approve', reviewApproveOrder.order, reviewApproveOrder.payment, reviewApproveOrder.order.total + 1)
  );
  assert.equal(mismatch.order.status, 'payment_review');
  const approved = await shop.approveReviewDelivery(actorId, reviewApproveOrder.order.id, { note: 'smoke approve' });
  assert.equal(approved.order.status, 'delivered');
  assert.equal(approved.delivered, 1);

  const refundProduct = await createStockedProduct(actorId, `smoke-refund-${runId}`, 1);
  const refundOrder = await shop.createOrderForUser(user, refundProduct.sku, 1);
  const refundReview = await shop.applyPaymentEvent(
    paidEvent('evt_smoke_mismatch_refund', refundOrder.order, refundOrder.payment, refundOrder.order.total + 1)
  );
  assert.equal(refundReview.order.status, 'payment_review');
  const refunded = await shop.markOrderRefunded(actorId, refundOrder.order.id, { note: 'smoke refund' });
  assert.equal(refunded.order.status, 'refunded');
  assert.equal(refunded.payment.status, 'refunded');

  const cancelProduct = await createStockedProduct(actorId, `smoke-cancel-${runId}`, 1);
  const cancelOrder = await shop.createOrderForUser(user, cancelProduct.sku, 1);
  const checkout = await shop.getOrderCheckoutForUser(user.id, cancelOrder.order.id);
  assert.equal(checkout.payment.reference, cancelOrder.payment.reference);
  await assert.rejects(
    () => shop.getOrderCheckoutForUser('another-user', cancelOrder.order.id),
    /Order not found/
  );
  const cancelled = await shop.cancelOrderForUser(user.id, cancelOrder.order.id);
  assert.equal(cancelled.order.status, 'cancelled');
  const cancelledAgain = await shop.cancelOrderForUser(user.id, cancelOrder.order.id);
  assert.equal(cancelledAgain.order.status, 'cancelled');
  const cancelledInventory = await shop.listInventory(cancelProduct.id);
  assert.equal(cancelledInventory.filter((item) => item.status === 'available').length, 1);

  const crossProvider = await shop.applyPaymentEvent({
    ...paidEvent(`evt_cross_provider_${runId}`, cancelOrder.order, cancelOrder.payment),
    provider: 'sepay'
  });
  assert.equal(crossProvider.unmatched, true);
  const cancelledAfterCrossProvider = await shop.getOrderCheckoutForUser(user.id, cancelOrder.order.id);
  assert.equal(cancelledAfterCrossProvider.order.status, 'cancelled');

  const summary = await shop.getDashboardSummary();
  assert.ok(summary.deliveredOrders >= 2, 'summary should count delivered smoke orders');
  assert.ok(summary.revenue >= 30000, 'summary should include delivered smoke revenue');

  console.log(JSON.stringify({
    ok: true,
    mode: usePostgres ? 'postgres' : 'json',
    dataFile,
    deliveredOrders: summary.deliveredOrders,
    reviewOrders: summary.reviewOrders,
    revenue: summary.revenue
  }, null, 2));
} finally {
  if (dataFile) await rm(dataFile, { force: true });
}
