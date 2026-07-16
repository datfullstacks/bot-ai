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
process.env.AUTH_SECRET ||= 'smoke-test-auth-secret-with-enough-length';
process.env.PAYMENT_WEBHOOK_SECRET ||= 'smoke-test-payment-secret';

const storage = await import('../src/storage.js');
const shop = await import('../src/shop.js');
const auth = await import('../src/auth.js');
const system = await import('../src/systemStatus.js');

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

  const paidProduct = await createStockedProduct(actorId, `smoke-paid-${runId}`, 2);
  const paidOrder = await shop.createOrderForUser(user, paidProduct.sku, 2);
  assert.equal(paidOrder.order.status, 'pending_payment');

  const paidResult = await shop.applyPaymentEvent(paidEvent('evt_smoke_paid', paidOrder.order, paidOrder.payment));
  assert.equal(paidResult.order.status, 'delivered');
  const delivery = await shop.getDeliveryForOrder(paidOrder.order.id);
  assert.equal(delivery.deliverySecrets.length, 2);

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
  const cancelled = await shop.cancelOrder(actorId, cancelOrder.order.id);
  assert.equal(cancelled.status, 'cancelled');

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
