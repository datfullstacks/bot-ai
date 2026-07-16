import { config, nowIso } from '../config.js';
import { normalizeDeliveryMode, normalizeProductInput } from '../catalog.js';
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
import { addAudit, makeId, publicProduct, readStore, withWrite } from '../storage.js';
import { paymentProvider } from '../payments.js';

const orderTtlMs = config.orders.ttlMinutes * 60 * 1000;
const finalOrderStatuses = new Set(['delivered', 'refunded']);
const closedPaymentStatuses = new Set(['paid', 'amount_mismatch', 'paid_needs_review']);

function sanitizeInventoryItem(item) {
  const { secret, secretFingerprint, ...safe } = item;
  return { ...safe, secretPreview: inventorySecretPreview(item) };
}

export function publicOrder(order) {
  return {
    ...order,
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
  const paidOrders = db.orders.filter((order) => order.status === 'delivered');
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  return {
    products: db.products.length,
    availableInventory: db.inventory.filter((item) => item.status === 'available').length,
    pendingOrders: db.orders.filter((order) => order.status === 'pending_payment').length,
    deliveredOrders: db.orders.filter((order) => order.status === 'delivered').length,
    reviewOrders: db.orders.filter((order) => order.status === 'payment_review').length,
    revenue,
    recentOrders: db.orders.slice(-8).reverse().map(publicOrder),
    lowStock: db.products
      .map((product) => publicProduct(product, db))
      .filter((product) => product.active && product.stock.available <= 2)
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

    const qty = normalizeOrderQuantity(quantity);
    const product = db.products.find((item) => item.id === productSkuOrId || item.sku === String(productSkuOrId).toLowerCase());
    if (!product || !product.active) {
      throw Object.assign(new Error('Product is not available'), { statusCode: 404 });
    }
    assertSalesOrderAllowed(product, user);

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

    const availableItems = db.inventory
      .filter((item) => item.productId === product.id && item.status === 'available')
      .slice(0, qty);

    if (availableItems.length < qty) {
      throw Object.assign(new Error('Not enough stock'), { statusCode: 409 });
    }
    assertInventorySecretsReadyForSale(availableItems);

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
        deliveryMode: normalizeDeliveryMode(product.deliveryMode)
      },
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
        details: { sku: product.sku, quantity: qty },
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

    if (closedPaymentStatuses.has(payment.status) && ['paid', 'delivered', 'payment_review'].includes(order.status)) {
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

    if (['paid', 'delivered'].includes(order.status)) {
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
    if (finalOrderStatuses.has(order.status) || ['paid', 'payment_review'].includes(order.status)) {
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
    const deliveryItems = allocateInventoryForReviewDelivery(db, order);
    const note = String(input.note || '').trim();
    const resolution = {
      type: 'delivered',
      actorId,
      note,
      at: nowIso()
    };

    order.reviewResolution = resolution;
    if (payment) {
      if (payment.status === 'paid_needs_review') payment.status = 'paid';
      payment.reviewResolution = resolution;
      payment.updatedAt = nowIso();
    }

    markInventorySold(db, order, deliveryItems, actorId, 'manual_review_delivery', { note });
    addAudit(db, actorId, 'order.review.approve_delivery', 'order', order.id, {
      count: deliveryItems.length,
      note
    });

    return { order: publicOrder(order), payment, delivered: deliveryItems.length };
  });
}

export async function markOrderRefunded(actorId, orderId, input = {}) {
  return withWrite(async (db) => {
    const order = db.orders.find((item) => item.id === orderId);
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (order.status !== 'payment_review') {
      throw Object.assign(new Error('Only review orders can be marked refunded'), { statusCode: 409 });
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
