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
process.env.SEPAY_ACCOUNT_NUMBER = '1234567890';
process.env.SEPAY_BANK_CODE = 'MBBank';
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
  assert.match(checkout.payment.reference, /^KAITO[A-Z0-9]+$/);
  assert.match(checkout.payment.memo, new RegExp(checkout.payment.reference));
  assert.match(checkout.payment.qrImageUrl, /https:\/\/qr\.sepay\.vn\/img\?/);
  assert.match(checkout.payment.qrImageUrl, /acc=1234567890/);
  assert.match(checkout.payment.qrImageUrl, /bank=MBBank/);
  assert.match(checkout.payment.qrImageUrl, /amount=99000/);

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

  console.log(JSON.stringify({ ok: true, checked: 'sepay automatic payment and review safety' }, null, 2));
} finally {
  await rm(dataFile, { force: true });
}
