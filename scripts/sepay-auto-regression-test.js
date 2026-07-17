import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';

const dataFile = resolve(process.cwd(), 'data', `sepay-auto-${process.pid}-${Date.now()}.json`);
const webhookSecret = 'sepay-regression-secret';

process.env.STORE_DRIVER = 'json';
process.env.DATA_FILE = dataFile;
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
process.env.PAYMENT_PROVIDER = 'sepay';
process.env.SALES_ENABLED = 'true';
process.env.INVENTORY_ENCRYPTION_KEY = '33'.repeat(32);
process.env.SEPAY_ACCOUNT_NUMBER = '1234567890';
process.env.SEPAY_BANK_CODE = 'MBBank';
process.env.SEPAY_WEBHOOK_ACCOUNT_NUMBERS = '1234567890';
process.env.SEPAY_WEBHOOK_GATEWAYS = 'MBBank';
process.env.SEPAY_PAYMENT_PREFIX = 'KAITO';
process.env.SEPAY_MEMO_SUFFIX = 'thanh toan don hang';
process.env.SEPAY_WEBHOOK_AUTH = 'hmac';
process.env.SEPAY_WEBHOOK_SECRET = webhookSecret;
process.env.AUTH_SECRET ||= 'sepay-auto-regression-auth-secret';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.TELEGRAM_POLLING = 'false';

const storage = await import('../src/storage.js');
const shop = await import('../src/shop.js');
const { paymentProviders } = await import('../src/payments.js');

function signSePayPayload(rawBody, timestamp) {
  return `sha256=${createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')}`;
}

async function createStockedProduct(actorId, sku, count) {
  const product = await shop.createProduct(actorId, {
    sku,
    name: `SePay ${sku}`,
    description: 'SePay auto-delivery test product',
    accountType: 'Tài khoản riêng',
    warrantyPolicy: 'Bảo hành test',
    replacementPolicy: 'Đổi lỗi test',
    category: 'AI Accounts',
    brand: 'ChatGPT',
    packageType: 'Plus 1M',
    price: 99000,
    currency: 'VND'
  });
  await shop.importInventory(
    actorId,
    product.id,
    Array.from({ length: count }, (_, index) => `${sku}-account-${index + 1}|password`)
  );
  return product;
}

function sepayBody({ id, amount, reference, transferType = 'in' }) {
  return {
    id,
    gateway: 'MBBank',
    accountNumber: '1234567890',
    transferType,
    transferAmount: amount,
    code: '',
    content: `Thanh toan ${reference} cho KAITO AI SHOP`,
    description: `Auto payment ${reference}`
  };
}

async function verifySignedSePayBody(body) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return paymentProviders.sepay.verifyWebhook({
    rawBody,
    body,
    headers: {
      'x-sepay-timestamp': timestamp,
      'x-sepay-signature': signSePayPayload(rawBody, timestamp)
    }
  });
}

try {
  await storage.initStore();

  const actorId = 'sepay-regression-admin';
  const user = await shop.upsertTelegramUser({
    id: '990001',
    username: 'sepay-buyer',
    first_name: 'SePay',
    last_name: 'Buyer'
  });

  const product = await createStockedProduct(actorId, 'sepay-auto-chatgpt', 2);
  const checkout = await shop.createOrderForUser(user, product.sku, 1);

  assert.equal(checkout.payment.provider, 'sepay');
  assert.equal(checkout.payment.currency, 'VND');
  assert.equal(checkout.payment.accountNumber, '1234567890');
  assert.equal(checkout.payment.bankCode, 'MBBank');
  assert.match(checkout.payment.reference, /^KAITO[A-Z0-9]{15}$/);
  assert.match(checkout.payment.memo, new RegExp(checkout.payment.reference));
  assert.match(checkout.payment.qrImageUrl, /https:\/\/qr\.sepay\.vn\/img\?/);
  assert.match(checkout.payment.qrImageUrl, /acc=1234567890/);
  assert.match(checkout.payment.qrImageUrl, /bank=MBBank/);
  assert.match(checkout.payment.qrImageUrl, /amount=99000/);

  await assert.rejects(
    () => paymentProviders.sepay.createPayment({
      amount: 10,
      currency: 'USD',
      expiresAt: checkout.order.expiresAt
    }),
    /require VND currency/
  );
  await assert.rejects(
    () => paymentProviders.sepay.createPayment({
      amount: 10.5,
      currency: 'VND',
      expiresAt: checkout.order.expiresAt
    }),
    /positive integer/
  );

  const dashboardTestEvent = await verifySignedSePayBody({
    ...sepayBody({
      id: 0,
      amount: 0,
      reference: checkout.payment.reference
    }),
    gateway: 'SampleBank',
    accountNumber: '0000000000'
  });
  assert.match(dashboardTestEvent.id, /^sepay_test_[a-f0-9]{24}$/);
  assert.equal(dashboardTestEvent.test, true);
  assert.equal(dashboardTestEvent.status, 'ignored');
  const dashboardTestResult = await shop.applyPaymentEvent(dashboardTestEvent, 'sepay-webhook');
  assert.equal(dashboardTestResult.unmatched, true);
  assert.equal(dashboardTestResult.test, true);
  const stillPending = await shop.getPublicPaymentStatus(checkout.payment.providerPaymentId);
  assert.equal(stillPending.paymentStatus, 'pending');
  assert.equal(stillPending.orderStatus, 'pending_payment');

  const paidEvent = await verifySignedSePayBody(sepayBody({
    id: 'bank_tx_success_1',
    amount: checkout.order.total,
    reference: checkout.payment.reference
  }));
  assert.equal(paidEvent.provider, 'sepay');
  assert.equal(paidEvent.status, 'paid');

  const paidResult = await shop.applyPaymentEvent(paidEvent, 'sepay-webhook');
  assert.equal(paidResult.order.status, 'delivered');
  assert.equal(paidResult.payment.status, 'paid');
  assert.equal(paidResult.payment.reference, checkout.payment.reference);
  assert.equal(paidResult.payment.bankReference, 'bank_tx_success_1');

  const delivery = await shop.getDeliveryForOrder(checkout.order.id);
  assert.deepEqual(delivery.deliverySecrets, ['sepay-auto-chatgpt-account-1|password']);

  const duplicateResult = await shop.applyPaymentEvent(paidEvent, 'sepay-webhook');
  assert.equal(duplicateResult.duplicate, true);

  await assert.rejects(
    () => paymentProviders.sepay.verifyWebhook({
      rawBody: JSON.stringify(sepayBody({
        id: 'bank_tx_invalid_sig',
        amount: checkout.order.total,
        reference: checkout.payment.reference
      })),
      body: sepayBody({
        id: 'bank_tx_invalid_sig',
        amount: checkout.order.total,
        reference: checkout.payment.reference
      }),
      headers: {
        'x-sepay-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-sepay-signature': 'sha256=bad'
      }
    }),
    /Invalid SePay webhook signature/
  );

  await assert.rejects(
    () => paymentProviders.mock.verifyWebhook({
      rawBody: '{}',
      body: {}
    }),
    /Invalid payment signature/
  );

  const unmatchedEvent = await verifySignedSePayBody(sepayBody({
    id: 'bank_tx_unmatched',
    amount: 12345,
    reference: 'NO_MATCH_REFERENCE'
  }));
  const unmatchedResult = await shop.applyPaymentEvent(unmatchedEvent, 'sepay-webhook');
  assert.equal(unmatchedResult.unmatched, true);

  const reviewProduct = await createStockedProduct(actorId, 'sepay-review-chatgpt', 1);
  const reviewCheckout = await shop.createOrderForUser(user, reviewProduct.sku, 1);
  const mismatchEvent = await verifySignedSePayBody(sepayBody({
    id: 'bank_tx_mismatch_1',
    amount: reviewCheckout.order.total - 1000,
    reference: reviewCheckout.payment.reference
  }));
  const mismatchResult = await shop.applyPaymentEvent(mismatchEvent, 'sepay-webhook');
  assert.equal(mismatchResult.order.status, 'payment_review');
  assert.equal(mismatchResult.payment.status, 'amount_mismatch');

  const reviewInventory = await shop.listInventory(reviewProduct.id);
  assert.equal(reviewInventory.filter((item) => item.status === 'available').length, 1);

  const approved = await shop.approveReviewDelivery(actorId, reviewCheckout.order.id, { note: 'manual review ok' });
  assert.equal(approved.order.status, 'delivered');
  assert.equal(approved.delivered, 1);

  const cancelledProduct = await createStockedProduct(actorId, 'sepay-cancelled-chatgpt', 1);
  const cancelledCheckout = await shop.createOrderForUser(user, cancelledProduct.sku, 1);
  const cancelled = await shop.cancelOrderForUser(user.id, cancelledCheckout.order.id);
  assert.equal(cancelled.order.status, 'cancelled');
  const lateEvent = await verifySignedSePayBody(sepayBody({
    id: 'bank_tx_after_cancel',
    amount: cancelledCheckout.order.total,
    reference: cancelledCheckout.payment.reference
  }));
  const lateResult = await shop.applyPaymentEvent(lateEvent, 'sepay-webhook');
  assert.equal(lateResult.order.status, 'payment_review');
  const cancelledDelivery = await shop.getDeliveryForOrder(cancelledCheckout.order.id);
  assert.equal(cancelledDelivery.deliverySecrets.length, 0);
  const cancelledInventory = await shop.listInventory(cancelledProduct.id);
  assert.equal(cancelledInventory.filter((item) => item.status === 'available').length, 1);

  const seatProduct = await shop.createProduct(actorId, {
    sku: 'sepay-chatgpt-business-seat',
    name: 'SePay ChatGPT Business Seat',
    description: 'Seat granted through customer email',
    accountType: 'Business workspace seat',
    warrantyPolicy: 'Seat warranty test',
    replacementPolicy: 'Seat replacement test',
    fulfillmentMode: 'seat_email',
    category: 'AI Accounts',
    brand: 'ChatGPT',
    packageType: 'Business Seat 1M',
    price: 400000,
    currency: 'VND'
  });
  const seatCheckout = await shop.createOrderForUser(user, seatProduct.sku, 1, {
    recipientEmails: 'sepay-seat-one@example.com\nsepay-seat-two@example.com'
  });
  assert.equal(seatCheckout.order.quantity, 2);
  assert.equal(seatCheckout.order.total, 800000);
  assert.match(seatCheckout.payment.qrImageUrl, /amount=800000/);
  assert.equal((await shop.listInventory(seatProduct.id)).length, 0);

  const seatPaidEvent = await verifySignedSePayBody(sepayBody({
    id: 'bank_tx_seat_success_1',
    amount: seatCheckout.order.total,
    reference: seatCheckout.payment.reference
  }));
  const seatPaidResult = await shop.applyPaymentEvent(seatPaidEvent, 'sepay-webhook');
  assert.equal(seatPaidResult.order.status, 'awaiting_fulfillment');
  assert.equal(seatPaidResult.payment.status, 'paid');
  assert.deepEqual((await shop.getDeliveryForOrder(seatCheckout.order.id)).deliverySecrets, []);
  const seatCompleted = await shop.completeSeatFulfillment(actorId, seatCheckout.order.id, {
    note: 'SePay Seat invite sent'
  });
  assert.equal(seatCompleted.order.status, 'delivered');
  assert.deepEqual(
    seatCompleted.order.fulfillment.recipients.map((recipient) => recipient.status),
    ['invited', 'invited']
  );

  console.log(JSON.stringify({ ok: true, checked: 'sepay inventory delivery and Seat email fulfillment' }, null, 2));
} finally {
  await rm(dataFile, { force: true });
}
