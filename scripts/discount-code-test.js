import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const runId = `${process.pid}-${Date.now()}`;
const dataFile = resolve(process.cwd(), 'data', `discount-test-${runId}.json`);

process.env.STORE_DRIVER = 'json';
process.env.DATA_FILE = dataFile;
process.env.PAYMENT_PROVIDER = 'mock';
process.env.SALES_ENABLED = 'true';
process.env.INVENTORY_ENCRYPTION_KEY ||= '33'.repeat(32);
process.env.AUTH_SECRET ||= 'discount-test-auth-secret-with-enough-length';
process.env.PAYMENT_WEBHOOK_SECRET ||= 'discount-test-payment-secret';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'admin123';

const storage = await import('../src/storage.js');
const shop = await import('../src/shop.js');

function paidEvent(id, checkout) {
  return {
    id,
    provider: checkout.payment.provider,
    providerPaymentId: checkout.payment.providerPaymentId,
    reference: checkout.payment.reference,
    amount: checkout.order.total,
    currency: checkout.order.currency,
    status: 'paid',
    raw: { discountTest: true },
    receivedAt: new Date().toISOString()
  };
}

try {
  await storage.initStore();
  const actorId = 'discount-test-admin';
  const product = await shop.createProduct(actorId, {
    sku: `discount-product-${runId}`,
    name: 'Discount test product',
    price: 100000,
    currency: 'VND'
  });
  await shop.importInventory(actorId, product.id, [
    `discount-secret-${runId}-1`,
    `discount-secret-${runId}-2`,
    `discount-secret-${runId}-3`,
    `discount-secret-${runId}-4`
  ]);
  const firstUser = await shop.upsertTelegramUser({ id: `discount-user-a-${runId}`, username: 'discount_a' });
  const secondUser = await shop.upsertTelegramUser({ id: `discount-user-b-${runId}`, username: 'discount_b' });

  const code = await shop.createDiscountCode(actorId, {
    code: 'ONCE-20K',
    type: 'fixed',
    value: 20000,
    minOrderTotal: 50000
  });
  assert.equal(code.usageLimit, 1);
  assert.equal(code.usedAt, null);

  const preview = await shop.previewDiscountForUser(firstUser, product.id, 1, { discountCode: 'once-20k' });
  assert.equal(preview.subtotal, 100000);
  assert.equal(preview.discount.amount, 20000);
  assert.equal(preview.total, 80000);

  const firstCheckout = await shop.createOrderForUser(firstUser, product.id, 1, {
    discountCode: 'ONCE-20K',
    idempotencyKey: `discount-first-${runId}`
  });
  assert.equal(firstCheckout.order.subtotal, 100000);
  assert.equal(firstCheckout.order.total, 80000);
  assert.equal(firstCheckout.payment.amount, 80000);
  await assert.rejects(
    () => shop.previewDiscountForUser(secondUser, product.id, 1, { discountCode: 'ONCE-20K' }),
    (error) => error.code === 'discount_reserved'
  );

  await shop.cancelOrderForUser(firstUser.id, firstCheckout.order.id);
  const secondCheckout = await shop.createOrderForUser(secondUser, product.id, 1, {
    discountCode: 'ONCE-20K',
    idempotencyKey: `discount-second-${runId}`
  });
  const paid = await shop.applyPaymentEvent(paidEvent(`discount-paid-${runId}`, secondCheckout));
  assert.equal(paid.order.status, 'delivered');

  const usedCode = (await shop.listDiscountCodes()).find((item) => item.id === code.id);
  assert.equal(usedCode.usedByOrderId, secondCheckout.order.id);
  assert.ok(usedCode.usedAt);
  assert.equal(usedCode.reservedByOrderId, null);
  await assert.rejects(
    () => shop.createOrderForUser(firstUser, product.id, 1, { discountCode: 'ONCE-20K' }),
    (error) => error.code === 'discount_already_used'
  );

  const expiringCode = await shop.createDiscountCode(actorId, {
    code: 'EXPIRE-10',
    type: 'percent',
    value: 10
  });
  const expiringCheckout = await shop.createOrderForUser(firstUser, product.id, 1, {
    discountCode: expiringCode.code,
    idempotencyKey: `discount-expire-${runId}`
  });
  await storage.withWrite(async (db) => {
    const order = db.orders.find((item) => item.id === expiringCheckout.order.id);
    const discount = db.discountCodes.find((item) => item.id === expiringCode.id);
    order.expiresAt = new Date(Date.now() - 1000).toISOString();
    discount.reservedUntil = order.expiresAt;
  });
  await shop.expireOrders();
  const releasedCode = (await shop.listDiscountCodes()).find((item) => item.id === expiringCode.id);
  assert.equal(releasedCode.reservedByOrderId, null);

  await shop.updateDiscountCode(actorId, expiringCode.id, { active: false });
  await assert.rejects(
    () => shop.previewDiscountForUser(firstUser, product.id, 1, { discountCode: expiringCode.code }),
    (error) => error.code === 'discount_not_active'
  );

  console.log(JSON.stringify({
    ok: true,
    checked: 'one-time discount reservation, release and consumption'
  }, null, 2));
} finally {
  await rm(dataFile, { force: true });
}
