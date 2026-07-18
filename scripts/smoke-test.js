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

async function createStockedProduct(actorId, sku, count, overrides = {}) {
  const product = await shop.createProduct(actorId, {
    sku,
    name: `Smoke ${sku}`,
    description: 'Smoke test product',
    accountType: 'Smoke private account',
    warrantyPolicy: 'Smoke warranty',
    replacementPolicy: 'Smoke replacement policy',
    price: 10000,
    currency: 'VND',
    ...overrides
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

  const defaultCanvaSeat = (await shop.listProducts({ includeInactive: true }))
    .find((product) => product.sku === 'canva-pro-1m');
  assert.equal(defaultCanvaSeat.fulfillmentMode, 'seat_email');
  assert.equal(defaultCanvaSeat.catalogManagedSeatVersion, 1);
  await shop.updateProduct('smoke-admin', defaultCanvaSeat.id, { fulfillmentMode: 'inventory' });
  await storage.initStore();
  const canvaAfterRestart = (await shop.listProducts({ includeInactive: true }))
    .find((product) => product.sku === 'canva-pro-1m');
  assert.equal(canvaAfterRestart.fulfillmentMode, 'inventory', 'A later admin choice must survive restart after the one-time Seat migration.');
  await shop.updateProduct('smoke-admin', defaultCanvaSeat.id, { fulfillmentMode: 'seat_email' });

  const actorId = 'smoke-admin';
  const user = await shop.upsertTelegramUser({
    id: `700001${process.pid}`,
    username: `smoke_user_${process.pid}`,
    first_name: 'Smoke',
    last_name: 'User'
  });

  const controlledProduct = await createStockedProduct(actorId, `smoke-controlled-${runId}`, 1);
  const otherUser = await shop.upsertTelegramUser({
    id: `700002${process.pid}`,
    username: `smoke_other_${process.pid}`,
    first_name: 'Other',
    last_name: 'User'
  });
  await shop.setTelegramPriceList(actorId, `@${user.username.toUpperCase()}`, {
    prices: { [controlledProduct.sku]: 7500 }
  });
  const pricingOverview = await shop.getTelegramPricingOverview();
  assert.ok(
    pricingOverview.priceLists.some((item) => item.username === user.username && item.prices[controlledProduct.sku] === 7500),
    'Telegram pricing overview should expose the configured username price list.'
  );
  const publicControlledProduct = (await shop.listProducts()).find((product) => product.sku === controlledProduct.sku);
  const personalizedControlledProduct = (await shop.listProducts({ user })).find((product) => product.sku === controlledProduct.sku);
  assert.equal(publicControlledProduct.price, 10000, 'Public catalog pricing should remain unchanged.');
  assert.equal(personalizedControlledProduct.price, 7500, 'Matching Telegram username should receive its custom SKU price.');
  assert.equal(personalizedControlledProduct.basePrice, 10000);
  assert.equal(personalizedControlledProduct.personalizedPrice, true);
  await shop.setCatalogPriceList(actorId, {
    prices: { [controlledProduct.sku]: 11000 }
  });
  const pricingOverviewAfterBaseUpdate = await shop.getTelegramPricingOverview();
  const catalogProductAfterBaseUpdate = (await shop.listProducts())
    .find((product) => product.sku === controlledProduct.sku);
  const defaultProductAfterBaseUpdate = (await shop.listProducts({ user: otherUser }))
    .find((product) => product.sku === controlledProduct.sku);
  const personalizedAfterBaseUpdate = (await shop.listProducts({ user }))
    .find((product) => product.sku === controlledProduct.sku);
  assert.equal(
    pricingOverviewAfterBaseUpdate.basePriceList.prices[controlledProduct.sku],
    11000,
    'The pricing overview should expose the independent base price list.'
  );
  assert.equal(catalogProductAfterBaseUpdate.price, 10000, 'Saving a base price must not overwrite product.price.');
  assert.equal(defaultProductAfterBaseUpdate.price, 11000, 'Telegram users without an override should receive the configured base price.');
  assert.equal(defaultProductAfterBaseUpdate.basePriceConfigured, true);
  assert.equal(defaultProductAfterBaseUpdate.personalizedPrice, false);
  assert.equal(personalizedAfterBaseUpdate.price, 7500, 'A custom username price should override the updated base price.');
  assert.equal(personalizedAfterBaseUpdate.basePrice, 11000);
  assert.equal(personalizedAfterBaseUpdate.catalogPrice, 10000);
  const originalSalesEnabled = config.sales.enabled;
  const originalTestTelegramIds = config.sales.testTelegramIds;
  try {
    config.sales.enabled = false;
    config.sales.testTelegramIds = [user.telegramId];
    const controlledOrder = await shop.createOrderForUser(user, controlledProduct.sku, 1);
    assert.equal(controlledOrder.order.status, 'pending_payment');
    assert.equal(controlledOrder.order.unitPrice, 7500, 'Checkout must enforce the username-specific price.');
    assert.equal(controlledOrder.order.total, 7500);
    assert.equal(controlledOrder.order.productSnapshot.pricing.source, 'telegram_username');
    await shop.cancelOrderForUser(user.id, controlledOrder.order.id);
    await assert.rejects(
      () => shop.createOrderForUser(otherUser, controlledProduct.sku, 1),
      /Shop/
    );
    config.sales.testTelegramIds = [user.telegramId, otherUser.telegramId];
    const basePriceOrder = await shop.createOrderForUser(otherUser, controlledProduct.sku, 1);
    assert.equal(basePriceOrder.order.unitPrice, 11000, 'Checkout should use the independent base price without a username override.');
    assert.equal(basePriceOrder.order.productSnapshot.pricing.source, 'catalog_base');
    assert.equal(basePriceOrder.order.productSnapshot.pricing.catalogPrice, 10000);
    await shop.cancelOrderForUser(otherUser.id, basePriceOrder.order.id);
  } finally {
    config.sales.enabled = originalSalesEnabled;
    config.sales.testTelegramIds = originalTestTelegramIds;
  }
  const userWithoutUsername = await shop.upsertTelegramUser({
    id: user.telegramId,
    first_name: 'Smoke',
    last_name: 'User'
  });
  const productAfterUsernameRemoval = (await shop.listProducts({ user: userWithoutUsername }))
    .find((product) => product.sku === controlledProduct.sku);
  assert.equal(
    productAfterUsernameRemoval.price,
    11000,
    'A removed Telegram username must not keep receiving pricing for the old username.'
  );
  await shop.deleteTelegramPriceList(actorId, user.username);
  const catalogAfterPricingDelete = (await shop.listProducts({ user }))
    .find((product) => product.sku === controlledProduct.sku);
  assert.equal(catalogAfterPricingDelete.price, 11000, 'Removing a price list should restore the current base price.');

  const paidProduct = await createStockedProduct(actorId, `smoke-paid-${runId}`, 2, {
    deliveryMode: 'file'
  });
  assert.equal(paidProduct.deliveryMode, 'file');
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
  assert.equal(paidOrder.order.productSnapshot.deliveryMode, 'file');
  await assert.rejects(
    () => shop.updateProduct(actorId, paidProduct.id, { deliveryMode: 'archive' }),
    /Delivery mode must be text or file/
  );
  await shop.updateProduct(actorId, paidProduct.id, { deliveryMode: 'text' });
  const snapshottedCheckout = await shop.getOrderCheckoutForUser(user.id, paidOrder.order.id);
  assert.equal(snapshottedCheckout.order.productSnapshot.deliveryMode, 'file');
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

  const seatProduct = await shop.createProduct(actorId, {
    sku: `smoke-seat-${runId}`,
    name: 'Smoke Business Seat',
    description: 'Seat supplied to customer email without inventory',
    accountType: 'Business workspace seat',
    warrantyPolicy: 'Smoke seat warranty',
    replacementPolicy: 'Smoke seat replacement policy',
    fulfillmentMode: 'seat_email',
    seatTermMonths: 3,
    price: 400000,
    currency: 'VND'
  });
  assert.equal(seatProduct.fulfillmentMode, 'seat_email');
  assert.equal(seatProduct.seatTermMonths, 3);
  const updatedSeatProduct = await shop.updateProduct(actorId, seatProduct.id, { seatTermMonths: 6 });
  assert.equal(updatedSeatProduct.seatTermMonths, 6, 'Seat term updates should be persisted.');
  await assert.rejects(
    () => shop.updateProduct(actorId, seatProduct.id, { seatTermMonths: 0 }),
    /integer between 1 and 120/
  );
  assert.equal(seatProduct.stock.available, 0);
  await assert.rejects(
    () => shop.importInventory(actorId, seatProduct.id, ['seat-secret-that-must-not-be-stored']),
    /do not use inventory/
  );
  await assert.rejects(
    () => shop.createOrderForUser(user, seatProduct.sku, 1, {
      recipientEmails: ['not-an-email']
    }),
    /Invalid seat email/
  );
  for (const invalidEmail of ['a,b@example.com', '.leading@example.com', 'double..dot@example.com', 'user@-example.com']) {
    await assert.rejects(
      () => shop.createOrderForUser(user, seatProduct.sku, 1, {
        recipientEmails: [invalidEmail]
      }),
      /Invalid seat email/
    );
  }
  await assert.rejects(
    () => shop.createOrderForUser(user, seatProduct.sku, 1, {
      recipientEmails: ['seat-one@example.com', 'SEAT-ONE@example.com']
    }),
    /Duplicate seat email/
  );

  const seatCheckout = await shop.createOrderForUser(user, seatProduct.sku, 1, {
    recipientEmails: 'seat-one@example.com\nseat-two@example.com',
    idempotencyKey: `smoke-seat-${runId}`
  });
  assert.equal(seatCheckout.order.quantity, 2, 'Seat quantity should come from the number of email lines.');
  assert.equal(seatCheckout.order.total, 800000);
  assert.equal(seatCheckout.order.productSnapshot.fulfillmentMode, 'seat_email');
  assert.equal(seatCheckout.order.productSnapshot.seatTermMonths, 6);
  assert.deepEqual(
    seatCheckout.order.fulfillment.recipients.map((recipient) => [recipient.email, recipient.status]),
    [
      ['seat-one@example.com', 'pending'],
      ['seat-two@example.com', 'pending']
    ]
  );
  assert.equal((await shop.listInventory(seatProduct.id)).length, 0, 'Seat checkout must not reserve inventory.');

  const seatPaid = await shop.applyPaymentEvent(
    paidEvent(`evt_smoke_seat_paid_${runId}`, seatCheckout.order, seatCheckout.payment)
  );
  assert.equal(seatPaid.order.status, 'awaiting_fulfillment');
  assert.equal(seatPaid.payment.status, 'paid');
  assert.equal(seatPaid.order.deliveredAt, null);
  assert.equal(
    (await shop.listSeatOrdersForEmails(['SEAT-ONE@example.com'])).some((order) => order.id === seatCheckout.order.id),
    true,
    'Targeted Seat entitlement reads must find active orders without OFFSET pagination.'
  );
  const seatBeforeCompletion = await shop.getDeliveryForOrder(seatCheckout.order.id);
  assert.deepEqual(seatBeforeCompletion.deliverySecrets, []);
  const awaitingSeatSummary = await shop.getDashboardSummary();
  assert.equal(awaitingSeatSummary.awaitingFulfillmentOrders, 1);
  assert.ok(awaitingSeatSummary.revenue >= 830000, 'Paid Seat revenue should be counted before manual fulfillment.');

  const duplicateSeatPayment = await shop.applyPaymentEvent(
    paidEvent(`evt_smoke_seat_paid_duplicate_${runId}`, seatCheckout.order, seatCheckout.payment)
  );
  assert.equal(duplicateSeatPayment.duplicate, true);
  assert.equal(duplicateSeatPayment.order.status, 'awaiting_fulfillment');

  const automatedSeat = await shop.updateSeatFulfillmentAutomation('member-service:smoke', seatCheckout.order.id, {
    provider: 'chatgpt',
    status: 'processing',
    attempt: 1,
    idempotencyKey: 'seat-chatgpt-smoke-g0',
    operationId: 'op_smoke_automation',
    targetFingerprint: 'b'.repeat(64),
    error: null
  });
  assert.equal(automatedSeat.fulfillment.automation.provider, 'chatgpt');
  assert.equal(automatedSeat.fulfillment.automation.status, 'processing');
  assert.equal(automatedSeat.fulfillment.automation.operationId, 'op_smoke_automation');
  assert.equal(automatedSeat.fulfillment.automation.entitlementTargetFingerprint, undefined);

  await assert.rejects(
    () => shop.completeSeatFulfillment(actorId, seatCheckout.order.id, { note: 'Too early' }),
    /Automatic Seat fulfillment is still active/
  );
  const chatgptIntegration = config.memberFulfillment.integrations.chatgpt;
  const originalChatgptEnabled = chatgptIntegration.enabled;
  const originalChatgptSkus = chatgptIntegration.skus;
  chatgptIntegration.enabled = true;
  chatgptIntegration.skus = [...originalChatgptSkus, seatProduct.sku];
  try {
    await assert.rejects(
      () => shop.markOrderRefunded(actorId, seatCheckout.order.id, { note: 'Unsafe refund' }),
      /may already be running/
    );
  } finally {
    chatgptIntegration.enabled = originalChatgptEnabled;
    chatgptIntegration.skus = originalChatgptSkus;
  }

  const succeededAutomation = await shop.updateSeatFulfillmentAutomation(
    'member-service:smoke',
    seatCheckout.order.id,
    {
      provider: 'chatgpt',
      status: 'succeeded',
      attempt: 1,
      retryCount: 0,
      idempotencyKey: 'seat-chatgpt-smoke-g0',
      operationId: 'op_smoke_automation',
      error: null
    }
  );
  assert.equal(succeededAutomation.fulfillment.automation.status, 'succeeded');
  const protectedSucceededAutomation = await shop.updateSeatFulfillmentAutomation(
    'member-service:smoke',
    seatCheckout.order.id,
    {
      status: 'failed',
      attempt: 2,
      retryCount: 1,
      operationId: 'op_smoke_late_failure',
      error: { code: 'LATE_FAILURE', message: 'Must not replace success', retryable: false }
    }
  );
  assert.equal(
    protectedSucceededAutomation.fulfillment.automation.status,
    'succeeded',
    'A succeeded automation result must not be downgraded by a later stale update.'
  );
  assert.equal(protectedSucceededAutomation.fulfillment.automation.attempt, 1);
  assert.equal(protectedSucceededAutomation.fulfillment.automation.operationId, 'op_smoke_automation');
  assert.equal(protectedSucceededAutomation.fulfillment.automation.error, null);
  await assert.rejects(
    () => shop.completeSeatFulfillment(actorId, seatCheckout.order.id, { note: 'Success still belongs to automation' }),
    /Automatic Seat fulfillment is still active/
  );

  const completedSeat = await shop.completeSeatFulfillment('member-service:smoke', seatCheckout.order.id, {
    note: 'Smoke invitations sent'
  });
  assert.equal(completedSeat.order.status, 'delivered');
  assert.equal(completedSeat.fulfilled, 2);
  assert.ok(completedSeat.order.deliveredAt);
  assert.deepEqual(
    completedSeat.order.fulfillment.recipients.map((recipient) => recipient.status),
    ['invited', 'invited']
  );
  assert.equal(completedSeat.order.fulfillment.automation.operationId, 'op_smoke_automation');
  assert.equal(completedSeat.order.fulfillment.automation.status, 'succeeded');
  const legacyTargetBackfill = await shop.backfillSeatEntitlementTarget(
    'seat-entitlement-backfill',
    seatCheckout.order.id,
    {
      expectedTargetFingerprint: 'b'.repeat(64),
      entitlementTargetFingerprint: 'a'.repeat(64)
    }
  );
  assert.equal(legacyTargetBackfill.updated, true);
  assert.equal(
    legacyTargetBackfill.order.fulfillment.automation.entitlementTargetFingerprint,
    'a'.repeat(64)
  );
  assert.deepEqual((await shop.getDeliveryForOrder(seatCheckout.order.id)).deliverySecrets, []);
  assert.equal((await shop.completeSeatFulfillment(actorId, seatCheckout.order.id)).duplicate, true);

  for (const cleanupStatus of ['failed', 'blocked', 'verification_required']) {
    const cleanupCheckout = await shop.createOrderForUser(user, seatProduct.sku, 1, {
      recipientEmails: [`cleanup-${cleanupStatus.replaceAll('_', '-')}@example.com`],
      idempotencyKey: `smoke-seat-cleanup-${cleanupStatus}-${runId}`
    });
    await shop.applyPaymentEvent(
      paidEvent(
        `evt_smoke_seat_cleanup_${cleanupStatus}_${runId}`,
        cleanupCheckout.order,
        cleanupCheckout.payment
      )
    );
    await shop.updateSeatFulfillmentAutomation('member-service:smoke', cleanupCheckout.order.id, {
      provider: 'chatgpt',
      status: cleanupStatus,
      attempt: 1,
      operationId: `op_smoke_cleanup_${cleanupStatus}`,
      error: { code: 'MEMBER_OPERATION_FAILED', message: 'Smoke cleanup required', retryable: false }
    });
    await assert.rejects(
      () => shop.completeSeatFulfillment(actorId, cleanupCheckout.order.id, { note: 'Not verified yet' }),
      /Automatic Seat fulfillment is still active/
    );
    await assert.rejects(
      () => shop.markOrderRefunded(actorId, cleanupCheckout.order.id, {
        note: `Missing cleanup confirmation for ${cleanupStatus}`
      }),
      /verify or remove the external invitation/
    );
    const cleanupRefund = await shop.markOrderRefunded(actorId, cleanupCheckout.order.id, {
      note: `External invitation removed for ${cleanupStatus}`,
      confirmExternalCleanup: true
    });
    assert.equal(cleanupRefund.order.status, 'refunded');
  }

  const unknownSubmissionCheckout = await shop.createOrderForUser(user, seatProduct.sku, 1, {
    recipientEmails: ['unknown-submission@example.com'],
    idempotencyKey: `smoke-seat-unknown-submission-${runId}`
  });
  await shop.applyPaymentEvent(
    paidEvent(
      `evt_smoke_seat_unknown_submission_${runId}`,
      unknownSubmissionCheckout.order,
      unknownSubmissionCheckout.payment
    )
  );
  await shop.updateSeatFulfillmentAutomation('member-service:smoke', unknownSubmissionCheckout.order.id, {
    provider: 'chatgpt',
    status: 'verification_required',
    attempt: 1,
    operationId: '',
    error: { code: 'MEMBER_OUTCOME_UNKNOWN', message: 'Submission outcome is unknown', retryable: false }
  });
  await assert.rejects(
    () => shop.completeSeatFulfillment(actorId, unknownSubmissionCheckout.order.id, {
      note: 'Unknown outcome must be verified before manual completion'
    }),
    /Automatic Seat fulfillment is still active/
  );
  await assert.rejects(
    () => shop.markOrderRefunded(actorId, unknownSubmissionCheckout.order.id, {
      note: 'Unknown outcome without cleanup'
    }),
    /verify or remove the external invitation/
  );
  const unknownSubmissionRefund = await shop.markOrderRefunded(actorId, unknownSubmissionCheckout.order.id, {
    note: 'External service checked before refund',
    confirmExternalCleanup: true
  });
  assert.equal(unknownSubmissionRefund.order.status, 'refunded');

  const verifiedCheckout = await shop.createOrderForUser(user, seatProduct.sku, 1, {
    recipientEmails: ['verified-external@example.com'],
    idempotencyKey: `smoke-seat-verified-external-${runId}`
  });
  await shop.applyPaymentEvent(
    paidEvent(`evt_smoke_seat_verified_external_${runId}`, verifiedCheckout.order, verifiedCheckout.payment)
  );
  await shop.updateSeatFulfillmentAutomation('member-service:smoke', verifiedCheckout.order.id, {
    provider: 'chatgpt',
    status: 'verification_required',
    attempt: 1,
    operationId: '',
    targetFingerprint: 'c'.repeat(64),
    error: { code: 'MEMBER_OUTCOME_UNKNOWN', message: 'External verification required', retryable: false }
  });
  const verifiedCompletion = await shop.completeSeatFulfillment(actorId, verifiedCheckout.order.id, {
    note: 'External invitation verified',
    confirmExternalVerification: true
  });
  assert.equal(verifiedCompletion.order.status, 'delivered');
  const unsafeManualBackfill = await shop.backfillSeatEntitlementTarget(
    'seat-entitlement-backfill',
    verifiedCheckout.order.id,
    {
      expectedTargetFingerprint: 'c'.repeat(64),
      entitlementTargetFingerprint: 'd'.repeat(64)
    }
  );
  assert.equal(unsafeManualBackfill.updated, false);
  assert.equal(unsafeManualBackfill.order.fulfillment.automation.entitlementTargetFingerprint, undefined);

  const summary = await shop.getDashboardSummary();
  assert.ok(summary.deliveredOrders >= 2, 'summary should count delivered smoke orders');
  assert.ok(summary.revenue >= 30000, 'summary should include delivered smoke revenue');
  assert.equal(summary.analytics.daily.length, 30, 'dashboard should expose a 30-day trend series');
  assert.ok(summary.analytics.topProducts.length >= 1, 'dashboard should rank products with recent revenue');
  assert.equal(summary.analytics.products.total, summary.products, 'dashboard product detail should match the headline count');
  assert.equal(summary.analytics.inventory.available, summary.availableInventory, 'dashboard inventory detail should match the headline count');

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
