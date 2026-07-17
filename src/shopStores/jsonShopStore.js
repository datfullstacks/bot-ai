import { config, nowIso } from '../config.js';
import {
  isSeatEmailFulfillment,
  normalizeDeliveryMode,
  normalizeFulfillmentMode,
  normalizeProductInput
} from '../catalog.js';
import {
  assertInventoryEncryptionReadyForImport,
  assertInventorySecretsReadyForSale,
  decryptInventorySecret,
  encryptInventorySecret,
  inventorySecretFingerprint,
  inventorySecretPreview
} from '../inventorySecrets.js';
import { publicPaymentCheckout } from '../paymentView.js';
import { assertSalesOrderAllowed, normalizeOrderQuantity } from '../salesGuard.js';
import { parseSeatEmailLines } from '../seatFulfillment.js';
import { addAudit, makeId, publicProduct, readStore, withWrite } from '../storage.js';
import { paymentProvider } from '../payments.js';

const orderTtlMs = config.orders.ttlMinutes * 60 * 1000;
const finalOrderStatuses = new Set(['delivered', 'refunded']);
const closedPaymentStatuses = new Set(['paid', 'amount_mismatch', 'paid_needs_review', 'refunded']);

function seatOrderRecipients(input) {
  const emails = parseSeatEmailLines(input, { maxQuantity: config.orders.maxQuantity });
  return emails.map((email) => ({ email, status: 'pending' }));
}

function isSeatOrder(order = {}) {
  return [order.productSnapshot?.fulfillmentMode, order.fulfillment?.mode]
    .some((value) => String(value || '').trim().toLowerCase() === 'seat_email');
}

function automaticSeatProvider(order = {}) {
  const pinnedProvider = String(order.fulfillment?.automation?.provider || '').trim().toLowerCase();
  if (config.memberFulfillment?.integrations?.[pinnedProvider]) return pinnedProvider;
  const sku = String(order.productSku || '').trim().toLowerCase();
  return Object.entries(config.memberFulfillment?.integrations || {})
    .find(([, integration]) => integration.skus.includes(sku))?.[0] || '';
}

function automaticSeatIntegration(order = {}) {
  const provider = automaticSeatProvider(order);
  return Boolean(provider && config.memberFulfillment.integrations[provider]?.enabled);
}

function automaticSeatRefundUnsafe(order = {}, input = {}) {
  const automation = order.fulfillment?.automation;
  if (automation?.status === 'verification_required') {
    return input.confirmExternalCleanup !== true;
  }
  if (['processing', 'retrying', 'succeeded'].includes(automation?.status)) return true;
  if (automation?.operationId) {
    const cleanupCanBeConfirmed = ['failed', 'blocked', 'verification_required'].includes(automation.status);
    return !(cleanupCanBeConfirmed && input.confirmExternalCleanup === true);
  }
  if (['failed', 'blocked'].includes(automation?.status)) return false;
  return automaticSeatIntegration(order);
}

function sanitizeInventoryItem(item) {
  const { secret, secretFingerprint, ...safe } = item;
  return { ...safe, secretPreview: inventorySecretPreview(item) };
}

export function publicOrder(order) {
  return {
    ...order,
    automaticFulfillmentProvider: automaticSeatProvider(order),
    deliverySecrets: undefined
  };
}

function setOrderStatus(db, order, status, actorId, reason, details = {}) {
  const previousStatus = order.status;
  if (previousStatus === status) return;

  order.status = status;
  order.updatedAt = nowIso();
  order.statusHistory ||= [];
  order.statusHistory.push({
    from: previousStatus,
    to: status,
    actorId,
    reason,
    details,
    at: nowIso()
  });

  addAudit(db, actorId, `order.status.${status}`, 'order', order.id, {
    from: previousStatus,
    to: status,
    reason,
    ...details
  });
}

export async function listProducts({ includeInactive = false } = {}) {
  const db = await readStore();
  return db.products
    .filter((product) => includeInactive || product.active)
    .map((product) => publicProduct(product, db));
}

export async function getDashboardSummary() {
  const db = await readStore();
  const paidOrders = db.orders.filter((order) => ['delivered', 'awaiting_fulfillment'].includes(order.status));
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  return {
    products: db.products.length,
    availableInventory: db.inventory.filter((item) => item.status === 'available').length,
    pendingOrders: db.orders.filter((order) => order.status === 'pending_payment').length,
    awaitingFulfillmentOrders: db.orders.filter((order) => order.status === 'awaiting_fulfillment').length,
    deliveredOrders: db.orders.filter((order) => order.status === 'delivered').length,
    reviewOrders: db.orders.filter((order) => order.status === 'payment_review').length,
    revenue,
    recentOrders: db.orders.slice(-8).reverse().map(publicOrder),
    lowStock: db.products
      .map((product) => publicProduct(product, db))
      .filter((product) => product.active && !isSeatEmailFulfillment(product) && product.stock.available <= 2)
  };
}

export async function upsertTelegramUser(from) {
  return withWrite(async (db) => {
    let user = db.users.find((item) => item.telegramId === String(from.id));
    if (!user) {
      user = {
        id: makeId('usr'),
        telegramId: String(from.id),
        username: from.username || '',
        firstName: from.first_name || '',
        lastName: from.last_name || '',
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      db.users.push(user);
    } else {
      user.username = from.username || user.username;
      user.firstName = from.first_name || user.firstName;
      user.lastName = from.last_name || user.lastName;
      user.updatedAt = nowIso();
    }
    return user;
  });
}

export async function createProduct(actorId, input) {
  return withWrite(async (db) => {
    const normalized = normalizeProductInput(input);
    const sku = normalized.sku;
    if (!sku) throw Object.assign(new Error('SKU is required'), { statusCode: 400 });
    if (db.products.some((product) => product.sku === sku)) {
      throw Object.assign(new Error('SKU already exists'), { statusCode: 409 });
    }

    const product = {
      id: makeId('prd'),
      ...normalized,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    if (!product.name || !Number.isSafeInteger(product.price) || product.price <= 0) {
      throw Object.assign(new Error('Name and positive price are required'), { statusCode: 400 });
    }

    db.products.push(product);
    addAudit(db, actorId, 'product.create', 'product', product.id, { sku: product.sku });
    return publicProduct(product, db);
  });
}

export async function updateProduct(actorId, productId, input) {
  return withWrite(async (db) => {
    const product = db.products.find((item) => item.id === productId);
    if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

    for (const key of [
      'name',
      'description',
      'currency',
      'category',
      'brand',
      'packageType',
      'officialPriceNote',
      'accountType',
      'warrantyPolicy',
      'replacementPolicy'
    ]) {
      if (input[key] !== undefined) product[key] = String(input[key]);
    }
    if (input.price !== undefined) product.price = Number(input.price);
    if (input.sortOrder !== undefined) product.sortOrder = Number(input.sortOrder || 1000);
    if (input.active !== undefined) product.active = Boolean(input.active);
    if (input.hot !== undefined) product.hot = Boolean(input.hot);
    if (input.deliveryMode !== undefined) {
      product.deliveryMode = normalizeDeliveryMode(input.deliveryMode, { strict: true });
    }
    if (input.fulfillmentMode !== undefined) {
      product.fulfillmentMode = normalizeFulfillmentMode(input.fulfillmentMode, {
        strict: true,
        sku: product.sku
      });
    }
    if (isSeatEmailFulfillment(product)) {
      if (input.seatTermMonths !== undefined) {
        const rawSeatTermMonths = String(input.seatTermMonths ?? '').trim();
        const seatTermMonths = rawSeatTermMonths ? Number(rawSeatTermMonths) : null;
        if (
          rawSeatTermMonths
          && (!Number.isInteger(seatTermMonths) || seatTermMonths < 1 || seatTermMonths > 120)
        ) {
          throw Object.assign(
            new Error('Seat term months must be an integer between 1 and 120'),
            { statusCode: 400 }
          );
        }
        product.seatTermMonths = seatTermMonths;
      }
    } else {
      delete product.seatTermMonths;
    }
    if (!product.name || !Number.isSafeInteger(product.price) || product.price <= 0) {
      throw Object.assign(new Error('Name and positive integer price are required'), { statusCode: 400 });
    }
    product.updatedAt = nowIso();

    addAudit(db, actorId, 'product.update', 'product', product.id, { sku: product.sku });
    return publicProduct(product, db);
  });
}

export async function importInventory(actorId, productId, lines) {
  return withWrite(async (db) => {
    const product = db.products.find((item) => item.id === productId);
    if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 });
    if (isSeatEmailFulfillment(product)) {
      throw Object.assign(new Error('Seat-email products do not use inventory'), { statusCode: 409 });
    }

    assertInventoryEncryptionReadyForImport();
    const requested = [...new Set(lines.map((line) => String(line).trim()).filter(Boolean))];
    const existingFingerprints = new Set(
      db.inventory
        .filter((item) => item.productId === productId)
        .map((item) => inventorySecretFingerprint(decryptInventorySecret(item.secret)))
    );
    const secrets = requested.filter((secret) => !existingFingerprints.has(inventorySecretFingerprint(secret)));
    const created = secrets.map((secret) => ({
      id: makeId('inv'),
      productId,
      secret: encryptInventorySecret(secret),
      secretFingerprint: inventorySecretFingerprint(secret),
      status: 'available',
      orderId: null,
      reservedUntil: null,
      soldAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }));

    db.inventory.push(...created);
    addAudit(db, actorId, 'inventory.import', 'product', productId, {
      count: created.length,
      skippedDuplicates: requested.length - created.length
    });
    return {
      imported: created.length,
      skippedDuplicates: requested.length - created.length
    };
  });
}

export async function listInventory(productId) {
  const db = await readStore();
  return db.inventory
    .filter((item) => !productId || item.productId === productId)
    .slice(-500)
    .reverse()
    .map(sanitizeInventoryItem);
}

export async function createOrderForUser(user, productSkuOrId, quantity = 1, options = {}) {
  return withWrite(async (db) => {
    expirePendingOrdersInDb(db, 'system');

    const product = db.products.find((item) => item.id === productSkuOrId || item.sku === String(productSkuOrId).toLowerCase());
    if (!product || !product.active) {
      throw Object.assign(new Error('Product is not available'), { statusCode: 404 });
    }
    assertSalesOrderAllowed(product, user);
    const seatEmailOrder = isSeatEmailFulfillment(product);
    const seatRecipients = seatEmailOrder
      ? seatOrderRecipients(options.recipientEmails)
      : [];
    const qty = seatEmailOrder
      ? normalizeOrderQuantity(seatRecipients.length)
      : normalizeOrderQuantity(quantity);

    const checkoutKey = String(options.idempotencyKey || '').trim().slice(0, 200);
    if (checkoutKey) {
      const existingOrder = db.orders.find((order) => (
        order.userId === user.id && order.checkoutKey === checkoutKey
      ));
      if (existingOrder) {
        const existingPayment = db.payments.find((payment) => (
          payment.id === existingOrder.paymentId || payment.orderId === existingOrder.id
        ));
        return {
          order: publicOrder(existingOrder),
          payment: existingPayment,
          reused: true
        };
      }
    }

    const pendingCount = db.orders.filter((order) => (
      order.userId === user.id &&
      order.status === 'pending_payment' &&
      new Date(order.expiresAt).getTime() > Date.now()
    )).length;
    if (pendingCount >= config.orders.maxPendingPerUser) {
      throw Object.assign(new Error('Too many pending orders. Pay or cancel an existing order first.'), { statusCode: 429 });
    }

    let availableItems = [];
    if (!seatEmailOrder) {
      availableItems = db.inventory
        .filter((item) => item.productId === product.id && item.status === 'available')
        .slice(0, qty);

      if (availableItems.length < qty) {
        throw Object.assign(new Error('Not enough stock'), { statusCode: 409 });
      }
      assertInventorySecretsReadyForSale(availableItems);
    }

    const order = {
      id: makeId('ord'),
      userId: user.id,
      telegramId: user.telegramId || '',
      productId: product.id,
      productSku: product.sku,
      productName: product.name,
      quantity: qty,
      unitPrice: product.price,
      total: product.price * qty,
      currency: product.currency,
      checkoutKey: checkoutKey || null,
      productSnapshot: {
        description: product.description || '',
        category: product.category || '',
        brand: product.brand || '',
        packageType: product.packageType || '',
        accountType: product.accountType || '',
        warrantyPolicy: product.warrantyPolicy || '',
        replacementPolicy: product.replacementPolicy || '',
        seatTermMonths: product.seatTermMonths || null,
        deliveryMode: normalizeDeliveryMode(product.deliveryMode),
        fulfillmentMode: normalizeFulfillmentMode(product.fulfillmentMode, { sku: product.sku })
      },
      ...(seatEmailOrder ? {
        fulfillment: {
          mode: 'seat_email',
          recipients: seatRecipients
        }
      } : {}),
      status: 'pending_payment',
      paymentId: null,
      deliverySecrets: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      paidAt: null,
      deliveredAt: null,
      expiresAt: new Date(Date.now() + orderTtlMs).toISOString(),
      statusHistory: [{
        from: null,
        to: 'pending_payment',
        actorId: user.id,
        reason: 'order_created',
        details: {
          sku: product.sku,
          quantity: qty,
          ...(seatEmailOrder ? { fulfillmentMode: 'seat_email', recipientCount: seatRecipients.length } : {})
        },
        at: nowIso()
      }]
    };

    for (const item of availableItems) {
      item.status = 'reserved';
      item.orderId = order.id;
      item.reservedUntil = order.expiresAt;
      item.updatedAt = nowIso();
    }

    const paymentDetails = await paymentProvider.createPayment({
      orderId: order.id,
      amount: order.total,
      currency: order.currency,
      expiresAt: order.expiresAt
    });

    const payment = {
      id: makeId('pay'),
      orderId: order.id,
      ...paymentDetails,
      events: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    order.paymentId = payment.id;
    db.orders.push(order);
    db.payments.push(payment);
    addAudit(db, user.id, 'order.create', 'order', order.id, { sku: product.sku, quantity: qty });

    return { order: publicOrder(order), payment };
  });
}

function pageItems(items, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 100), 1), 500);
  const offset = Math.max(Number(options.offset || 0), 0);
  const paged = items.slice(offset, offset + limit);
  return {
    items: paged,
    total: items.length,
    limit,
    offset,
    hasMore: offset + paged.length < items.length
  };
}

export async function listOrders(options = {}) {
  const db = await readStore();
  const orders = db.orders
    .filter((order) => !options.status || order.status === options.status)
    .slice()
    .reverse()
    .map(publicOrder);
  return pageItems(orders, options);
}

export async function listSeatOrdersForEmails(emailValues = []) {
  const emails = new Set(emailValues
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean));
  if (!emails.size) return [];
  const db = await readStore();
  const orders = db.orders.filter((order) => (
    ['delivered', 'awaiting_fulfillment'].includes(order.status)
    && (order.fulfillment?.recipients || []).some((recipient) => (
      emails.has(String(recipient?.email || '').trim().toLowerCase())
    ))
  ));
  if (orders.length > 1000) {
    throw Object.assign(new Error('Seat order history is too large to reconcile safely'), { statusCode: 503 });
  }
  return orders.map(publicOrder);
}

export async function listPayments(options = {}) {
  const db = await readStore();
  return pageItems(db.payments.slice().reverse(), options);
}

export async function getPublicPaymentStatus(providerPaymentId) {
  const db = await readStore();
  const payment = db.payments.find((item) => item.providerPaymentId === providerPaymentId);
  if (!payment) return null;
  const order = db.orders.find((item) => item.id === payment.orderId);
  return {
    ok: true,
    paymentStatus: payment.status,
    orderStatus: order?.status || '',
    updatedAt: payment.updatedAt || payment.createdAt || ''
  };
}

function checkoutContext(db, order) {
  const payment = db.payments.find((item) => item.id === order.paymentId || item.orderId === order.id);
  return {
    order: publicOrder(order),
    payment: publicPaymentCheckout(payment)
  };
}

export async function listOrdersForUser(userId, { limit = 5 } = {}) {
  const db = await readStore();
  return db.orders
    .filter((order) => order.userId === userId)
    .slice()
    .reverse()
    .slice(0, Math.min(Math.max(Number(limit || 5), 1), 20))
    .map((order) => checkoutContext(db, order));
}

export async function getOrderCheckoutForUser(userId, orderId) {
  const db = await readStore();
  const order = db.orders.find((item) => item.id === orderId && item.userId === userId);
  if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  return checkoutContext(db, order);
}

export async function cancelOrderForUser(userId, orderId) {
  return withWrite(async (db) => {
    const order = db.orders.find((item) => item.id === orderId && item.userId === userId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (order.status === 'cancelled') return checkoutContext(db, order);
    if (order.status !== 'pending_payment') {
      throw Object.assign(new Error('Only pending orders can be cancelled'), { statusCode: 409 });
    }

    releaseReservedInventory(db, order.id);
    const expired = new Date(order.expiresAt).getTime() < Date.now();
    setOrderStatus(
      db,
      order,
      expired ? 'expired' : 'cancelled',
      userId,
      expired ? 'payment_timeout' : 'buyer_cancelled',
      expired ? { expiresAt: order.expiresAt } : {}
    );
    return checkoutContext(db, order);
  });
}

export async function listAuditLogs(options = {}) {
  const db = await readStore();
  return pageItems(db.auditLogs, { limit: options.limit || 300, offset: options.offset || 0 });
}

export async function recordAudit(actorId, action, entityType, entityId, details = {}) {
  return withWrite(async (db) => {
    addAudit(db, actorId, action, entityType, entityId, details);
    return { ok: true };
  });
}

export async function applyPaymentEvent(event, actorId = 'payment-webhook') {
  return withWrite(async (db) => {
    if (db.paymentEvents.some((item) => item.id === event.id)) {
      return { duplicate: true };
    }

    db.paymentEvents.push(event);
    if (event.test === true) {
      addAudit(db, actorId, 'payment.test', 'payment_event', event.id, {
        provider: event.provider
      });
      return { unmatched: true, test: true };
    }
    const payment = findPaymentForEvent(db, event);
    if (!payment) {
      addAudit(db, actorId, 'payment.unmatched', 'payment_event', event.id, {
        provider: event.provider,
        reference: event.reference || '',
        bankReference: event.bankReference || ''
      });
      return { unmatched: true };
    }

    const order = db.orders.find((item) => item.id === payment.orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });

    payment.events ||= [];
    payment.events.push(event.id);
    payment.updatedAt = nowIso();

    if (event.status !== 'paid') {
      payment.status = event.status;
      addAudit(db, actorId, 'payment.event', 'payment', payment.id, { status: event.status });
      return { order: publicOrder(order), payment };
    }

    if (
      closedPaymentStatuses.has(payment.status)
      && ['paid', 'delivered', 'payment_review', 'awaiting_fulfillment'].includes(order.status)
    ) {
      return { duplicate: true, order: publicOrder(order), payment };
    }

    if (Number(event.amount) !== Number(order.total)) {
      payment.status = 'amount_mismatch';
      setOrderStatus(db, order, 'payment_review', actorId, 'amount_mismatch', {
        expected: order.total,
        actual: event.amount
      });
      releaseReservedInventory(db, order.id);
      addAudit(db, actorId, 'payment.amount_mismatch', 'order', order.id, {
        expected: order.total,
        actual: event.amount
      });
      return { order: publicOrder(order), payment };
    }

    if (['paid', 'delivered', 'awaiting_fulfillment'].includes(order.status)) {
      return { duplicate: true, order: publicOrder(order), payment };
    }

    if (order.status !== 'pending_payment') {
      const priorStatus = order.status;
      payment.status = 'paid_needs_review';
      setOrderStatus(db, order, 'payment_review', actorId, 'payment_for_closed_order', {
        priorStatus
      });
      addAudit(db, actorId, 'payment.needs_review.closed_order', 'order', order.id, {
        priorStatus,
        amount: event.amount
      });
      return { order: publicOrder(order), payment };
    }

    if (new Date(order.expiresAt).getTime() < Date.now()) {
      payment.status = 'paid_needs_review';
      setOrderStatus(db, order, 'payment_review', actorId, 'payment_after_expiry', {
        expiresAt: order.expiresAt
      });
      releaseReservedInventory(db, order.id);
      addAudit(db, actorId, 'payment.needs_review.expired', 'order', order.id, {
        amount: event.amount,
        expiresAt: order.expiresAt
      });
      return { order: publicOrder(order), payment };
    }

    if (isSeatOrder(order)) {
      payment.status = 'paid';
      payment.bankReference = event.bankReference || payment.bankReference || '';
      order.paidAt = nowIso();
      setOrderStatus(db, order, 'awaiting_fulfillment', actorId, 'payment_confirmed', {
        amount: order.total,
        fulfillmentMode: 'seat_email',
        recipientCount: order.fulfillment?.recipients?.length || 0
      });
      addAudit(db, actorId, 'payment.paid', 'order', order.id, {
        amount: order.total,
        fulfillmentMode: 'seat_email'
      });
      return { order: publicOrder(order), payment };
    }

    const reserved = db.inventory.filter((item) => item.orderId === order.id && item.status === 'reserved');
    if (reserved.length !== order.quantity) {
      payment.status = 'paid_needs_review';
      setOrderStatus(db, order, 'payment_review', actorId, 'reserved_inventory_mismatch', {
        expected: order.quantity,
        actual: reserved.length
      });
      addAudit(db, actorId, 'payment.needs_review.inventory_mismatch', 'order', order.id, {
        expected: order.quantity,
        actual: reserved.length
      });
      return { order: publicOrder(order), payment };
    }

    payment.status = 'paid';
    payment.bankReference = event.bankReference || payment.bankReference || '';
    order.paidAt = nowIso();
    setOrderStatus(db, order, 'paid', actorId, 'payment_confirmed', { amount: order.total });

    deliverReservedInventory(db, order, actorId);
    addAudit(db, actorId, 'payment.paid', 'order', order.id, { amount: order.total });

    return { order: publicOrder(order), payment };
  });
}

function findPaymentForEvent(db, event) {
  const candidates = [
    event.providerPaymentId,
    event.reference,
    event.raw?.code
  ].map((value) => String(value || '').trim()).filter(Boolean);

  let payment = db.payments.find((item) => (
    item.provider === event.provider
    && (candidates.includes(item.providerPaymentId) || candidates.includes(item.reference))
  ));
  if (payment) return payment;

  const searchable = [
    event.raw?.content,
    event.raw?.description
  ].map((value) => String(value || '').toUpperCase()).join(' ');

  if (!searchable.trim()) return null;

  return db.payments.find((item) => {
    if (item.provider !== event.provider || item.status !== 'pending') return false;
    const reference = String(item.reference || '').toUpperCase();
    return reference && searchable.includes(reference);
  }) || null;
}

function releaseReservedInventory(db, orderId) {
  for (const item of db.inventory.filter((inv) => inv.orderId === orderId && inv.status === 'reserved')) {
    item.status = 'available';
    item.orderId = null;
    item.reservedUntil = null;
    item.updatedAt = nowIso();
  }
}

function findPaymentForOrder(db, order) {
  return db.payments.find((item) => item.id === order.paymentId || item.orderId === order.id) || null;
}

function markInventorySold(db, order, items, actorId, reason, details = {}) {
  assertInventorySecretsReadyForSale(items);
  const soldAt = nowIso();
  order.deliverySecrets = items.map((item) => item.secret);

  for (const item of items) {
    item.status = 'sold';
    item.orderId = order.id;
    item.soldAt = soldAt;
    item.reservedUntil = null;
    item.updatedAt = soldAt;
  }

  order.paidAt ||= soldAt;
  order.deliveredAt = soldAt;
  setOrderStatus(db, order, 'delivered', actorId, reason, {
    count: items.length,
    ...details
  });
}

function deliverReservedInventory(db, order, actorId) {
  const reserved = db.inventory.filter((item) => item.orderId === order.id && item.status === 'reserved');
  markInventorySold(db, order, reserved, actorId, 'inventory_delivered');
}

function allocateInventoryForReviewDelivery(db, order) {
  const reserved = db.inventory.filter((item) => item.orderId === order.id && item.status === 'reserved');
  const selected = reserved.slice(0, order.quantity);
  const needed = order.quantity - selected.length;

  if (needed > 0) {
    selected.push(...db.inventory
      .filter((item) => item.productId === order.productId && item.status === 'available')
      .slice(0, needed));
  }

  if (selected.length < order.quantity) {
    throw Object.assign(new Error('Not enough stock to approve this review order'), { statusCode: 409 });
  }

  for (const item of reserved) {
    if (selected.includes(item)) continue;
    item.status = 'available';
    item.orderId = null;
    item.reservedUntil = null;
    item.updatedAt = nowIso();
  }

  return selected;
}

export async function markOrderPaidManually(actorId, orderId) {
  const db = await readStore();
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  if (order.status !== 'pending_payment') {
    throw Object.assign(new Error('Only pending orders can be marked paid manually'), { statusCode: 409 });
  }
  if (new Date(order.expiresAt).getTime() < Date.now()) {
    throw Object.assign(new Error('Expired orders require manual review, not auto-delivery'), { statusCode: 409 });
  }

  const payment = db.payments.find((item) => item.orderId === orderId);
  if (!payment) throw Object.assign(new Error('Payment not found'), { statusCode: 404 });
  return applyPaymentEvent({
    id: makeId('evt'),
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    reference: payment.reference,
    amount: payment.amount,
    currency: payment.currency,
    status: 'paid',
    raw: { manual: true },
    receivedAt: nowIso()
  }, actorId);
}

export async function cancelOrder(actorId, orderId) {
  return withWrite(async (db) => {
    const order = db.orders.find((item) => item.id === orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (finalOrderStatuses.has(order.status) || ['paid', 'payment_review', 'awaiting_fulfillment'].includes(order.status)) {
      throw Object.assign(new Error('This order cannot be cancelled from the normal flow'), { statusCode: 409 });
    }
    releaseReservedInventory(db, order.id);
    setOrderStatus(db, order, 'cancelled', actorId, 'admin_cancelled');
    return publicOrder(order);
  });
}

export async function approveReviewDelivery(actorId, orderId, input = {}) {
  return withWrite(async (db) => {
    const order = db.orders.find((item) => item.id === orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (order.status !== 'payment_review') {
      throw Object.assign(new Error('Only review orders can be approved manually'), { statusCode: 409 });
    }

    const payment = findPaymentForOrder(db, order);
    const seatEmailOrder = isSeatOrder(order);
    const deliveryItems = seatEmailOrder ? [] : allocateInventoryForReviewDelivery(db, order);
    const note = String(input.note || '').trim();
    const resolution = {
      type: seatEmailOrder ? 'awaiting_fulfillment' : 'delivered',
      actorId,
      note,
      at: nowIso()
    };

    order.reviewResolution = resolution;
    if (payment) {
      if (seatEmailOrder || payment.status === 'paid_needs_review') payment.status = 'paid';
      payment.reviewResolution = resolution;
      payment.updatedAt = nowIso();
    }

    if (seatEmailOrder) {
      order.paidAt ||= nowIso();
      setOrderStatus(db, order, 'awaiting_fulfillment', actorId, 'manual_review_approved', {
        note,
        fulfillmentMode: 'seat_email',
        recipientCount: order.fulfillment?.recipients?.length || 0
      });
      addAudit(db, actorId, 'order.review.approve_fulfillment', 'order', order.id, {
        recipientCount: order.fulfillment?.recipients?.length || 0,
        note
      });
      return { order: publicOrder(order), payment, delivered: 0, awaitingFulfillment: true };
    }

    markInventorySold(db, order, deliveryItems, actorId, 'manual_review_delivery', { note });
    addAudit(db, actorId, 'order.review.approve_delivery', 'order', order.id, {
      count: deliveryItems.length,
      note
    });

    return { order: publicOrder(order), payment, delivered: deliveryItems.length };
  });
}

export async function completeSeatFulfillment(actorId, orderId, input = {}) {
  return withWrite(async (db) => {
    const order = db.orders.find((item) => item.id === orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (!isSeatOrder(order)) {
      throw Object.assign(new Error('Only seat-email orders use this fulfillment flow'), { statusCode: 409 });
    }

    const recipients = Array.isArray(order.fulfillment?.recipients)
      ? order.fulfillment.recipients
      : [];
    if (order.status === 'delivered') {
      return { order: publicOrder(order), fulfilled: recipients.length, duplicate: true };
    }
    if (order.status !== 'awaiting_fulfillment') {
      throw Object.assign(new Error('Only orders awaiting fulfillment can be completed'), { statusCode: 409 });
    }
    if (!recipients.length) {
      throw Object.assign(new Error('Seat order has no fulfillment recipients'), { statusCode: 409 });
    }
    const automation = order.fulfillment?.automation;
    const automationStatus = automation?.status;
    const memberServiceActor = String(actorId || '').startsWith('member-service:');
    const externalVerificationRequired = automationStatus === 'verification_required'
      || Boolean(automation?.operationId && ['failed', 'blocked'].includes(automationStatus));
    const externalVerificationConfirmed = input.confirmExternalVerification === true;
    const automaticManualBlocked = [
      'processing',
      'retrying',
      'retry_requested',
      'succeeded'
    ].includes(automationStatus)
      || (automation?.operationId && !['failed', 'blocked', 'verification_required'].includes(automationStatus))
      || (externalVerificationRequired && !externalVerificationConfirmed)
      || (automaticSeatIntegration(order) && !['failed', 'blocked', 'verification_required'].includes(automationStatus));
    if (!memberServiceActor && automaticManualBlocked) {
      throw Object.assign(new Error('Automatic Seat fulfillment is still active; wait for it to finish before manual completion'), { statusCode: 409 });
    }

    const completedAt = nowIso();
    const note = String(input.note || '').trim();
    order.fulfillment = {
      ...order.fulfillment,
      mode: 'seat_email',
      recipients: recipients.map((recipient) => ({
        ...recipient,
        status: 'invited',
        invitedAt: recipient.invitedAt || completedAt
      })),
      completedAt,
      note
    };
    order.deliverySecrets = [];
    order.deliveredAt = completedAt;
    setOrderStatus(db, order, 'delivered', actorId, 'seat_fulfillment_completed', {
      count: recipients.length,
      note,
      externalVerificationConfirmed: !memberServiceActor && externalVerificationRequired && externalVerificationConfirmed
    });
    addAudit(db, actorId, 'order.fulfillment.complete', 'order', order.id, {
      count: recipients.length,
      note,
      externalVerificationConfirmed: !memberServiceActor && externalVerificationRequired && externalVerificationConfirmed
    });
    return { order: publicOrder(order), fulfilled: recipients.length };
  });
}

export async function updateSeatFulfillmentAutomation(actorId, orderId, input = {}) {
  return withWrite(async (db) => {
    const order = db.orders.find((item) => item.id === orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (!isSeatOrder(order)) {
      throw Object.assign(new Error('Only seat-email orders use automation state'), { statusCode: 409 });
    }
    if (order.status !== 'awaiting_fulfillment') {
      throw Object.assign(new Error('Only orders awaiting fulfillment can update automation state'), { statusCode: 409 });
    }

    const current = order.fulfillment?.automation || {};
    if (current.status === 'succeeded' && input.status && input.status !== 'succeeded') {
      return publicOrder(order);
    }
    const automation = { ...current };
    const stringFields = [
      'provider',
      'status',
      'operationId',
      'idempotencyKey',
      'targetFingerprint',
      'entitlementTargetFingerprint'
    ];
    for (const key of stringFields) {
      if (input[key] !== undefined) automation[key] = String(input[key] || '').trim().slice(0, 160);
    }
    if (input.attempt !== undefined) {
      automation.attempt = Math.max(1, Math.min(100, Number.parseInt(input.attempt, 10) || 1));
    }
    if (input.retryCount !== undefined) {
      automation.retryCount = Math.max(0, Math.min(100, Number.parseInt(input.retryCount, 10) || 0));
    }
    for (const key of ['startedAt', 'updatedAt', 'nextRetryAt', 'completedAt']) {
      if (input[key] !== undefined) automation[key] = input[key] ? String(input[key]) : null;
    }
    if (input.error !== undefined) {
      automation.error = input.error ? {
        code: String(input.error.code || 'MEMBER_FULFILLMENT_FAILED').slice(0, 120),
        message: String(input.error.message || 'Member fulfillment failed').slice(0, 500),
        retryable: Boolean(input.error.retryable)
      } : null;
    }
    automation.updatedAt = nowIso();
    order.fulfillment = {
      ...order.fulfillment,
      mode: 'seat_email',
      automation
    };
    order.updatedAt = nowIso();
    addAudit(db, actorId, `order.fulfillment.automation.${automation.status || 'updated'}`, 'order', order.id, {
      provider: automation.provider || '',
      operationId: automation.operationId || '',
      attempt: automation.attempt || 0,
      retryCount: automation.retryCount || 0,
      errorCode: automation.error?.code || ''
    });
    return publicOrder(order);
  });
}

export async function backfillSeatEntitlementTarget(actorId, orderId, input = {}) {
  const expectedTargetFingerprint = String(input.expectedTargetFingerprint || '').trim();
  const entitlementTargetFingerprint = String(input.entitlementTargetFingerprint || '').trim();
  if (!/^[a-f0-9]{64}$/.test(expectedTargetFingerprint) || !/^[a-f0-9]{64}$/.test(entitlementTargetFingerprint)) {
    throw new TypeError('Valid Seat target fingerprints are required');
  }
  return withWrite(async (db) => {
    const order = db.orders.find((item) => item.id === orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (!isSeatOrder(order) || order.status !== 'delivered') return { updated: false, order: publicOrder(order) };
    const automation = order.fulfillment?.automation || {};
    if (automation.status !== 'succeeded') return { updated: false, order: publicOrder(order) };
    if (automation.entitlementTargetFingerprint) return { updated: false, order: publicOrder(order) };
    if (automation.targetFingerprint !== expectedTargetFingerprint) return { updated: false, order: publicOrder(order) };
    automation.entitlementTargetFingerprint = entitlementTargetFingerprint;
    automation.updatedAt = nowIso();
    order.fulfillment = { ...order.fulfillment, automation };
    order.updatedAt = nowIso();
    addAudit(db, actorId, 'order.fulfillment.entitlement_target_backfill', 'order', order.id, {
      provider: automation.provider || ''
    });
    return { updated: true, order: publicOrder(order) };
  });
}

export async function markOrderRefunded(actorId, orderId, input = {}) {
  return withWrite(async (db) => {
    const order = db.orders.find((item) => item.id === orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (!['payment_review', 'awaiting_fulfillment'].includes(order.status)) {
      throw Object.assign(new Error('Only review or awaiting-fulfillment orders can be marked refunded'), { statusCode: 409 });
    }
    if (order.status === 'awaiting_fulfillment' && automaticSeatRefundUnsafe(order, input)) {
      throw Object.assign(new Error('Automatic Seat fulfillment may already be running; verify or remove the external invitation before refunding'), { statusCode: 409 });
    }

    const payment = findPaymentForOrder(db, order);
    const note = String(input.note || '').trim();
    const resolution = {
      type: 'refunded',
      actorId,
      note,
      at: nowIso()
    };

    releaseReservedInventory(db, order.id);
    order.reviewResolution = resolution;
    if (payment) {
      payment.status = 'refunded';
      payment.reviewResolution = resolution;
      payment.updatedAt = nowIso();
    }

    setOrderStatus(db, order, 'refunded', actorId, 'manual_refund', { note });
    addAudit(db, actorId, 'order.review.refund', 'order', order.id, { note });

    return { order: publicOrder(order), payment };
  });
}

export async function getDeliveryForOrder(orderId) {
  const db = await readStore();
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  return {
    order: publicOrder(order),
    deliverySecrets: (order.deliverySecrets || []).map((secret) => decryptInventorySecret(secret))
  };
}

export async function expireOrders() {
  return withWrite(async (db) => {
    return expirePendingOrdersInDb(db, 'system');
  });
}

function expirePendingOrdersInDb(db, actorId) {
  let expired = 0;
  const now = Date.now();
  for (const order of db.orders) {
    if (order.status === 'pending_payment' && new Date(order.expiresAt).getTime() < now) {
      releaseReservedInventory(db, order.id);
      setOrderStatus(db, order, 'expired', actorId, 'payment_timeout', { expiresAt: order.expiresAt });
      expired += 1;
    }
  }
  if (expired) {
    addAudit(db, actorId, 'orders.expired', 'order', 'bulk', { count: expired });
  }
  return expired;
}
