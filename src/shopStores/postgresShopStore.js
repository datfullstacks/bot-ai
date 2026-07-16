import { randomUUID } from 'node:crypto';
import { config, nowIso } from '../config.js';
import { normalizeProductInput, normalizePublicProduct } from '../catalog.js';
import { paymentProvider } from '../payments.js';
import { withPostgresClient, withPostgresTransaction } from '../postgresStore.js';

const orderTtlMs = config.orders.ttlMinutes * 60 * 1000;
const finalOrderStatuses = new Set(['delivered', 'refunded']);
const closedPaymentStatuses = new Set(['paid', 'amount_mismatch', 'paid_needs_review', 'refunded']);

function makeId(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 18)}`;
}

function publicOrder(order) {
  return {
    ...order,
    deliverySecrets: undefined
  };
}

function publicProduct(product, stock) {
  return { ...normalizePublicProduct(product), stock };
}

function sanitizeInventoryItem(item) {
  const { secret, ...safe } = item;
  return { ...safe, secretPreview: secret ? `${secret.slice(0, 6)}...` : '' };
}

function jsonParam(doc) {
  return JSON.stringify(doc);
}

async function getDoc(client, collection, id, { forUpdate = false } = {}) {
  const result = await client.query(
    `SELECT id, doc FROM app_documents WHERE collection = $1 AND id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [collection, id]
  );
  const row = result.rows[0];
  return row ? { id: row.id, doc: row.doc } : null;
}

async function insertDoc(client, collection, doc) {
  await client.query(
    `INSERT INTO app_documents (collection, id, doc, updated_at)
     VALUES ($1, $2, $3::jsonb, now())`,
    [collection, doc.id, jsonParam(doc)]
  );
}

async function upsertDoc(client, collection, doc) {
  await client.query(
    `INSERT INTO app_documents (collection, id, doc, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (collection, id)
     DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
    [collection, doc.id, jsonParam(doc)]
  );
}

async function addAuditDoc(client, actorId, action, entityType, entityId, details = {}) {
  const audit = {
    id: makeId('aud'),
    actorId,
    action,
    entityType,
    entityId,
    details,
    createdAt: nowIso()
  };

  await insertDoc(client, 'auditLogs', audit);
  await client.query(`
    DELETE FROM app_documents
    WHERE collection = 'auditLogs'
      AND id IN (
        SELECT id
        FROM app_documents
        WHERE collection = 'auditLogs'
        ORDER BY doc->>'createdAt' DESC
        OFFSET 1000
      )
  `);
}

async function setOrderStatus(client, order, status, actorId, reason, details = {}) {
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

  await addAuditDoc(client, actorId, `order.status.${status}`, 'order', order.id, {
    from: previousStatus,
    to: status,
    reason,
    ...details
  });
}

async function productStock(client, productId) {
  const result = await client.query(
    `SELECT doc->>'status' AS status, count(*)::int AS count
     FROM app_documents
     WHERE collection = 'inventory' AND doc->>'productId' = $1
     GROUP BY doc->>'status'`,
    [productId]
  );
  const stock = { available: 0, reserved: 0, sold: 0 };
  for (const row of result.rows) {
    if (row.status in stock) stock[row.status] = row.count;
  }
  return stock;
}

export async function listProducts({ includeInactive = false } = {}) {
  return withPostgresClient(async (client) => {
    const result = await client.query(
      `SELECT doc
       FROM app_documents
       WHERE collection = 'products'
         AND ($1::boolean OR (doc->>'active')::boolean IS TRUE)
       ORDER BY doc->>'createdAt' ASC`,
      [includeInactive]
    );

    const products = [];
    for (const row of result.rows) {
      products.push(publicProduct(row.doc, await productStock(client, row.doc.id)));
    }
    return products;
  });
}

export async function getDashboardSummary() {
  return withPostgresClient(async (client) => {
    const counts = await client.query(`
      SELECT collection, doc->>'status' AS status, count(*)::int AS count
      FROM app_documents
      WHERE collection IN ('products', 'inventory', 'orders')
      GROUP BY collection, doc->>'status'
    `);
    const deliveredRevenue = await client.query(`
      SELECT COALESCE(sum((doc->>'total')::numeric), 0)::float AS revenue
      FROM app_documents
      WHERE collection = 'orders' AND doc->>'status' = 'delivered'
    `);
    const recentOrders = await client.query(`
      SELECT doc
      FROM app_documents
      WHERE collection = 'orders'
      ORDER BY doc->>'createdAt' DESC
      LIMIT 8
    `);
    const products = await listProducts({ includeInactive: true });

    const count = (collection, status = null) => {
      const row = counts.rows.find((item) => item.collection === collection && (status === null || item.status === status));
      if (status !== null) return row?.count || 0;
      return counts.rows.filter((item) => item.collection === collection).reduce((sum, item) => sum + item.count, 0);
    };

    return {
      products: count('products'),
      availableInventory: count('inventory', 'available'),
      pendingOrders: count('orders', 'pending_payment'),
      deliveredOrders: count('orders', 'delivered'),
      reviewOrders: count('orders', 'payment_review'),
      revenue: deliveredRevenue.rows[0]?.revenue || 0,
      recentOrders: recentOrders.rows.map((row) => publicOrder(row.doc)),
      lowStock: products.filter((product) => product.active && product.stock.available <= 2)
    };
  });
}

export async function upsertTelegramUser(from) {
  return withPostgresTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id, doc
       FROM app_documents
       WHERE collection = 'users' AND doc->>'telegramId' = $1
       LIMIT 1
       FOR UPDATE`,
      [String(from.id)]
    );

    let user = existing.rows[0]?.doc;
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
      await insertDoc(client, 'users', user);
    } else {
      user.username = from.username || user.username;
      user.firstName = from.first_name || user.firstName;
      user.lastName = from.last_name || user.lastName;
      user.updatedAt = nowIso();
      await upsertDoc(client, 'users', user);
    }
    return user;
  });
}

export async function createProduct(actorId, input) {
  return withPostgresTransaction(async (client) => {
    const normalized = normalizeProductInput(input);
    const sku = normalized.sku;
    if (!sku) throw Object.assign(new Error('SKU is required'), { statusCode: 400 });

    const duplicate = await client.query(
      `SELECT id FROM app_documents WHERE collection = 'products' AND doc->>'sku' = $1 LIMIT 1`,
      [sku]
    );
    if (duplicate.rows.length) {
      throw Object.assign(new Error('SKU already exists'), { statusCode: 409 });
    }

    const product = {
      id: makeId('prd'),
      ...normalized,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    if (!product.name || product.price <= 0) {
      throw Object.assign(new Error('Name and positive price are required'), { statusCode: 400 });
    }

    await insertDoc(client, 'products', product);
    await addAuditDoc(client, actorId, 'product.create', 'product', product.id, { sku: product.sku });
    return publicProduct(product, { available: 0, reserved: 0, sold: 0 });
  });
}

export async function updateProduct(actorId, productId, input) {
  return withPostgresTransaction(async (client) => {
    const productRow = await getDoc(client, 'products', productId, { forUpdate: true });
    if (!productRow) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

    const product = productRow.doc;
    for (const key of ['name', 'description', 'currency', 'category', 'brand', 'packageType', 'officialPriceNote']) {
      if (input[key] !== undefined) product[key] = String(input[key]);
    }
    if (input.price !== undefined) product.price = Number(input.price);
    if (input.sortOrder !== undefined) product.sortOrder = Number(input.sortOrder || 1000);
    if (input.active !== undefined) product.active = Boolean(input.active);
    if (input.hot !== undefined) product.hot = Boolean(input.hot);
    product.updatedAt = nowIso();

    await upsertDoc(client, 'products', product);
    await addAuditDoc(client, actorId, 'product.update', 'product', product.id, { sku: product.sku });
    return publicProduct(product, await productStock(client, product.id));
  });
}

export async function importInventory(actorId, productId, lines) {
  return withPostgresTransaction(async (client) => {
    const productRow = await getDoc(client, 'products', productId);
    if (!productRow) throw Object.assign(new Error('Product not found'), { statusCode: 404 });

    const secrets = lines.map((line) => String(line).trim()).filter(Boolean);
    for (const secret of secrets) {
      await insertDoc(client, 'inventory', {
        id: makeId('inv'),
        productId,
        secret,
        status: 'available',
        orderId: null,
        reservedUntil: null,
        soldAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    }

    await addAuditDoc(client, actorId, 'inventory.import', 'product', productId, { count: secrets.length });
    return { imported: secrets.length };
  });
}

export async function listInventory(productId) {
  return withPostgresClient(async (client) => {
    const params = [];
    let productClause = '';
    if (productId) {
      params.push(productId);
      productClause = 'AND doc->>\'productId\' = $1';
    }

    const result = await client.query(
      `SELECT doc
       FROM app_documents
       WHERE collection = 'inventory' ${productClause}
       ORDER BY doc->>'createdAt' DESC
       LIMIT 500`,
      params
    );
    return result.rows.map((row) => sanitizeInventoryItem(row.doc));
  });
}

async function expirePendingOrdersInClient(client, actorId, limit = 500) {
  const expired = await client.query(
    `SELECT id, doc
     FROM app_documents
     WHERE collection = 'orders'
       AND doc->>'status' = 'pending_payment'
       AND (doc->>'expiresAt')::timestamptz < now()
     ORDER BY doc->>'expiresAt' ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit]
  );

  for (const row of expired.rows) {
    const order = row.doc;
    await releaseReservedInventory(client, order.id);
    await setOrderStatus(client, order, 'expired', actorId, 'payment_timeout', { expiresAt: order.expiresAt });
    await upsertDoc(client, 'orders', order);
  }

  if (expired.rows.length) {
    await addAuditDoc(client, actorId, 'orders.expired', 'order', 'bulk', { count: expired.rows.length });
  }
  return expired.rows.length;
}

export async function createOrderForUser(user, productSkuOrId, quantity = 1) {
  return withPostgresTransaction(async (client) => {
    await expirePendingOrdersInClient(client, 'system', 100);

    const qty = Math.max(1, Math.min(config.orders.maxQuantity, Number(quantity || 1)));
    const sku = String(productSkuOrId || '').toLowerCase();
    const productResult = await client.query(
      `SELECT id, doc
       FROM app_documents
       WHERE collection = 'products'
         AND (id = $1 OR doc->>'sku' = $2)
       LIMIT 1`,
      [String(productSkuOrId), sku]
    );
    const product = productResult.rows[0]?.doc;
    if (!product || !product.active) {
      throw Object.assign(new Error('Product is not available'), { statusCode: 404 });
    }

    const pending = await client.query(
      `SELECT count(*)::int AS count
       FROM app_documents
       WHERE collection = 'orders'
         AND doc->>'userId' = $1
         AND doc->>'status' = 'pending_payment'
         AND (doc->>'expiresAt')::timestamptz > now()`,
      [user.id]
    );
    if ((pending.rows[0]?.count || 0) >= config.orders.maxPendingPerUser) {
      throw Object.assign(new Error('Too many pending orders. Pay or cancel an existing order first.'), { statusCode: 429 });
    }

    const inventoryResult = await client.query(
      `SELECT id, doc
       FROM app_documents
       WHERE collection = 'inventory'
         AND doc->>'productId' = $1
         AND doc->>'status' = 'available'
       ORDER BY doc->>'createdAt' ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [product.id, qty]
    );
    if (inventoryResult.rows.length < qty) {
      throw Object.assign(new Error('Not enough stock'), { statusCode: 409 });
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

    for (const row of inventoryResult.rows) {
      const item = row.doc;
      item.status = 'reserved';
      item.orderId = order.id;
      item.reservedUntil = order.expiresAt;
      item.updatedAt = nowIso();
      await upsertDoc(client, 'inventory', item);
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
    await insertDoc(client, 'orders', order);
    await insertDoc(client, 'payments', payment);
    await addAuditDoc(client, user.id, 'order.create', 'order', order.id, { sku: product.sku, quantity: qty });

    return { order: publicOrder(order), payment };
  });
}

function pageItems(items, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 100), 1), 500);
  const offset = Math.max(Number(options.offset || 0), 0);
  const paged = items.slice(0, limit);
  return {
    items: paged,
    total: Number(options.total || paged.length),
    limit,
    offset,
    hasMore: offset + paged.length < Number(options.total || paged.length)
  };
}

export async function listOrders(options = {}) {
  return withPostgresClient(async (client) => {
    const limit = Math.min(Math.max(Number(options.limit || 100), 1), 500);
    const offset = Math.max(Number(options.offset || 0), 0);
    const params = [limit, offset];
    let listStatusClause = '';
    let countStatusClause = '';
    const countParams = [];
    if (options.status) {
      params.push(options.status);
      countParams.push(options.status);
      listStatusClause = 'AND doc->>\'status\' = $3';
      countStatusClause = 'AND doc->>\'status\' = $1';
    }
    const total = await client.query(
      `SELECT count(*)::int AS count FROM app_documents WHERE collection = 'orders' ${countStatusClause}`,
      countParams
    );
    const result = await client.query(
      `SELECT doc
       FROM app_documents
       WHERE collection = 'orders' ${listStatusClause}
       ORDER BY doc->>'createdAt' DESC
       LIMIT $1 OFFSET $2`,
      params
    );
    return pageItems(result.rows.map((row) => publicOrder(row.doc)), {
      limit,
      offset,
      total: total.rows[0]?.count || 0
    });
  });
}

export async function listPayments(options = {}) {
  return withPostgresClient(async (client) => {
    const limit = Math.min(Math.max(Number(options.limit || 100), 1), 500);
    const offset = Math.max(Number(options.offset || 0), 0);
    const total = await client.query(`SELECT count(*)::int AS count FROM app_documents WHERE collection = 'payments'`);
    const result = await client.query(
      `SELECT doc
       FROM app_documents
       WHERE collection = 'payments'
       ORDER BY doc->>'createdAt' DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return pageItems(result.rows.map((row) => row.doc), { limit, offset, total: total.rows[0]?.count || 0 });
  });
}

export async function listAuditLogs(options = {}) {
  return withPostgresClient(async (client) => {
    const limit = Math.min(Math.max(Number(options.limit || 300), 1), 500);
    const offset = Math.max(Number(options.offset || 0), 0);
    const total = await client.query(`SELECT count(*)::int AS count FROM app_documents WHERE collection = 'auditLogs'`);
    const result = await client.query(
      `SELECT doc
       FROM app_documents
       WHERE collection = 'auditLogs'
       ORDER BY doc->>'createdAt' DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return pageItems(result.rows.map((row) => row.doc), { limit, offset, total: total.rows[0]?.count || 0 });
  });
}

export async function recordAudit(actorId, action, entityType, entityId, details = {}) {
  return withPostgresTransaction(async (client) => {
    await addAuditDoc(client, actorId, action, entityType, entityId, details);
    return { ok: true };
  });
}

async function findPaymentForEvent(client, event, forUpdate = true) {
  const candidates = [
    event.providerPaymentId,
    event.reference,
    event.raw?.code
  ].map((value) => String(value || '').trim()).filter(Boolean);

  if (candidates.length) {
    const exact = await client.query(
      `SELECT id, doc
       FROM app_documents
       WHERE collection = 'payments'
         AND ((doc->>'providerPaymentId') = ANY($1::text[]) OR (doc->>'reference') = ANY($1::text[]))
       LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
      [candidates]
    );
    if (exact.rows[0]) return exact.rows[0].doc;
  }

  const searchable = [
    event.raw?.content,
    event.raw?.description
  ].map((value) => String(value || '').toUpperCase()).join(' ');

  if (!searchable.trim()) return null;

  const fallback = await client.query(
    `SELECT id, doc
     FROM app_documents
     WHERE collection = 'payments'
       AND doc->>'status' = 'pending'
       AND $1 LIKE ('%' || upper(doc->>'reference') || '%')
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [searchable]
  );
  return fallback.rows[0]?.doc || null;
}

async function releaseReservedInventory(client, orderId) {
  const reserved = await client.query(
    `SELECT id, doc
     FROM app_documents
     WHERE collection = 'inventory'
       AND doc->>'orderId' = $1
       AND doc->>'status' = 'reserved'
     FOR UPDATE`,
    [orderId]
  );

  for (const row of reserved.rows) {
    const item = row.doc;
    item.status = 'available';
    item.orderId = null;
    item.reservedUntil = null;
    item.updatedAt = nowIso();
    await upsertDoc(client, 'inventory', item);
  }
}

async function reservedInventoryForOrder(client, orderId) {
  const reserved = await client.query(
    `SELECT id, doc
     FROM app_documents
     WHERE collection = 'inventory'
       AND doc->>'orderId' = $1
       AND doc->>'status' = 'reserved'
     ORDER BY doc->>'createdAt' ASC
     FOR UPDATE`,
    [orderId]
  );
  return reserved.rows.map((row) => row.doc);
}

async function markInventorySold(client, order, items, actorId, reason, details = {}) {
  const soldAt = nowIso();
  order.deliverySecrets = items.map((item) => item.secret);

  for (const item of items) {
    item.status = 'sold';
    item.orderId = order.id;
    item.soldAt = soldAt;
    item.reservedUntil = null;
    item.updatedAt = soldAt;
    await upsertDoc(client, 'inventory', item);
  }

  order.paidAt ||= soldAt;
  order.deliveredAt = soldAt;
  await setOrderStatus(client, order, 'delivered', actorId, reason, {
    count: items.length,
    ...details
  });
}

async function findPaymentForOrder(client, order) {
  if (order.paymentId) {
    const byId = await getDoc(client, 'payments', order.paymentId, { forUpdate: true });
    if (byId) return byId.doc;
  }
  const byOrder = await client.query(
    `SELECT id, doc
     FROM app_documents
     WHERE collection = 'payments' AND doc->>'orderId' = $1
     LIMIT 1
     FOR UPDATE`,
    [order.id]
  );
  return byOrder.rows[0]?.doc || null;
}

async function allocateInventoryForReviewDelivery(client, order) {
  const reserved = await reservedInventoryForOrder(client, order.id);
  const selected = reserved.slice(0, order.quantity);
  const needed = order.quantity - selected.length;

  if (needed > 0) {
    const available = await client.query(
      `SELECT id, doc
       FROM app_documents
       WHERE collection = 'inventory'
         AND doc->>'productId' = $1
         AND doc->>'status' = 'available'
       ORDER BY doc->>'createdAt' ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [order.productId, needed]
    );
    selected.push(...available.rows.map((row) => row.doc));
  }

  if (selected.length < order.quantity) {
    throw Object.assign(new Error('Not enough stock to approve this review order'), { statusCode: 409 });
  }

  const selectedIds = new Set(selected.map((item) => item.id));
  for (const item of reserved) {
    if (selectedIds.has(item.id)) continue;
    item.status = 'available';
    item.orderId = null;
    item.reservedUntil = null;
    item.updatedAt = nowIso();
    await upsertDoc(client, 'inventory', item);
  }

  return selected;
}

export async function applyPaymentEvent(event, actorId = 'payment-webhook') {
  return withPostgresTransaction(async (client) => {
    const existingEvent = await getDoc(client, 'paymentEvents', event.id);
    if (existingEvent) return { duplicate: true };

    const payment = await findPaymentForEvent(client, event, true);
    if (!payment) throw Object.assign(new Error('Payment not found'), { statusCode: 404 });

    const orderRow = await getDoc(client, 'orders', payment.orderId, { forUpdate: true });
    if (!orderRow) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const order = orderRow.doc;

    await insertDoc(client, 'paymentEvents', event);
    payment.events ||= [];
    payment.events.push(event.id);
    payment.updatedAt = nowIso();

    if (event.status !== 'paid') {
      payment.status = event.status;
      await upsertDoc(client, 'payments', payment);
      await addAuditDoc(client, actorId, 'payment.event', 'payment', payment.id, { status: event.status });
      return { order: publicOrder(order), payment };
    }

    if (closedPaymentStatuses.has(payment.status) && ['paid', 'delivered', 'payment_review'].includes(order.status)) {
      await upsertDoc(client, 'payments', payment);
      return { duplicate: true, order: publicOrder(order), payment };
    }

    if (Number(event.amount) !== Number(order.total)) {
      payment.status = 'amount_mismatch';
      await setOrderStatus(client, order, 'payment_review', actorId, 'amount_mismatch', {
        expected: order.total,
        actual: event.amount
      });
      await releaseReservedInventory(client, order.id);
      await addAuditDoc(client, actorId, 'payment.amount_mismatch', 'order', order.id, {
        expected: order.total,
        actual: event.amount
      });
      await upsertDoc(client, 'payments', payment);
      await upsertDoc(client, 'orders', order);
      return { order: publicOrder(order), payment };
    }

    if (['paid', 'delivered'].includes(order.status)) {
      await upsertDoc(client, 'payments', payment);
      return { duplicate: true, order: publicOrder(order), payment };
    }

    if (order.status !== 'pending_payment') {
      const priorStatus = order.status;
      payment.status = 'paid_needs_review';
      await setOrderStatus(client, order, 'payment_review', actorId, 'payment_for_closed_order', {
        priorStatus
      });
      await addAuditDoc(client, actorId, 'payment.needs_review.closed_order', 'order', order.id, {
        priorStatus,
        amount: event.amount
      });
      await upsertDoc(client, 'payments', payment);
      await upsertDoc(client, 'orders', order);
      return { order: publicOrder(order), payment };
    }

    if (new Date(order.expiresAt).getTime() < Date.now()) {
      payment.status = 'paid_needs_review';
      await setOrderStatus(client, order, 'payment_review', actorId, 'payment_after_expiry', {
        expiresAt: order.expiresAt
      });
      await releaseReservedInventory(client, order.id);
      await addAuditDoc(client, actorId, 'payment.needs_review.expired', 'order', order.id, {
        amount: event.amount,
        expiresAt: order.expiresAt
      });
      await upsertDoc(client, 'payments', payment);
      await upsertDoc(client, 'orders', order);
      return { order: publicOrder(order), payment };
    }

    const reserved = await reservedInventoryForOrder(client, order.id);
    if (reserved.length !== order.quantity) {
      payment.status = 'paid_needs_review';
      await setOrderStatus(client, order, 'payment_review', actorId, 'reserved_inventory_mismatch', {
        expected: order.quantity,
        actual: reserved.length
      });
      await addAuditDoc(client, actorId, 'payment.needs_review.inventory_mismatch', 'order', order.id, {
        expected: order.quantity,
        actual: reserved.length
      });
      await upsertDoc(client, 'payments', payment);
      await upsertDoc(client, 'orders', order);
      return { order: publicOrder(order), payment };
    }

    payment.status = 'paid';
    payment.reference = event.reference || payment.reference;
    order.paidAt = nowIso();
    await setOrderStatus(client, order, 'paid', actorId, 'payment_confirmed', { amount: order.total });
    await markInventorySold(client, order, reserved, actorId, 'inventory_delivered');
    await addAuditDoc(client, actorId, 'payment.paid', 'order', order.id, { amount: order.total });

    await upsertDoc(client, 'payments', payment);
    await upsertDoc(client, 'orders', order);
    return { order: publicOrder(order), payment };
  });
}

export async function markOrderPaidManually(actorId, orderId) {
  const { order, payment } = await withPostgresClient(async (client) => {
    const orderRow = await getDoc(client, 'orders', orderId);
    if (!orderRow) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const currentOrder = orderRow.doc;
    if (currentOrder.status !== 'pending_payment') {
      throw Object.assign(new Error('Only pending orders can be marked paid manually'), { statusCode: 409 });
    }
    if (new Date(currentOrder.expiresAt).getTime() < Date.now()) {
      throw Object.assign(new Error('Expired orders require manual review, not auto-delivery'), { statusCode: 409 });
    }

    const currentPayment = await findPaymentForOrder(client, currentOrder);
    if (!currentPayment) throw Object.assign(new Error('Payment not found'), { statusCode: 404 });
    return { order: currentOrder, payment: currentPayment };
  });

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
  return withPostgresTransaction(async (client) => {
    const orderRow = await getDoc(client, 'orders', orderId, { forUpdate: true });
    if (!orderRow) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const order = orderRow.doc;
    if (finalOrderStatuses.has(order.status) || ['paid', 'payment_review'].includes(order.status)) {
      throw Object.assign(new Error('This order cannot be cancelled from the normal flow'), { statusCode: 409 });
    }
    await releaseReservedInventory(client, order.id);
    await setOrderStatus(client, order, 'cancelled', actorId, 'admin_cancelled');
    await upsertDoc(client, 'orders', order);
    return publicOrder(order);
  });
}

export async function approveReviewDelivery(actorId, orderId, input = {}) {
  return withPostgresTransaction(async (client) => {
    const orderRow = await getDoc(client, 'orders', orderId, { forUpdate: true });
    if (!orderRow) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const order = orderRow.doc;
    if (order.status !== 'payment_review') {
      throw Object.assign(new Error('Only review orders can be approved manually'), { statusCode: 409 });
    }

    const payment = await findPaymentForOrder(client, order);
    const deliveryItems = await allocateInventoryForReviewDelivery(client, order);
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
      await upsertDoc(client, 'payments', payment);
    }

    await markInventorySold(client, order, deliveryItems, actorId, 'manual_review_delivery', { note });
    await addAuditDoc(client, actorId, 'order.review.approve_delivery', 'order', order.id, {
      count: deliveryItems.length,
      note
    });
    await upsertDoc(client, 'orders', order);
    return { order: publicOrder(order), payment, delivered: deliveryItems.length };
  });
}

export async function markOrderRefunded(actorId, orderId, input = {}) {
  return withPostgresTransaction(async (client) => {
    const orderRow = await getDoc(client, 'orders', orderId, { forUpdate: true });
    if (!orderRow) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const order = orderRow.doc;
    if (order.status !== 'payment_review') {
      throw Object.assign(new Error('Only review orders can be marked refunded'), { statusCode: 409 });
    }

    const payment = await findPaymentForOrder(client, order);
    const note = String(input.note || '').trim();
    const resolution = {
      type: 'refunded',
      actorId,
      note,
      at: nowIso()
    };

    await releaseReservedInventory(client, order.id);
    order.reviewResolution = resolution;
    if (payment) {
      payment.status = 'refunded';
      payment.reviewResolution = resolution;
      payment.updatedAt = nowIso();
      await upsertDoc(client, 'payments', payment);
    }

    await setOrderStatus(client, order, 'refunded', actorId, 'manual_refund', { note });
    await addAuditDoc(client, actorId, 'order.review.refund', 'order', order.id, { note });
    await upsertDoc(client, 'orders', order);
    return { order: publicOrder(order), payment };
  });
}

export async function getDeliveryForOrder(orderId) {
  return withPostgresClient(async (client) => {
    const orderRow = await getDoc(client, 'orders', orderId);
    if (!orderRow) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const order = orderRow.doc;
    return { order: publicOrder(order), deliverySecrets: order.deliverySecrets || [] };
  });
}

export async function expireOrders() {
  return withPostgresTransaction(async (client) => {
    return expirePendingOrdersInClient(client, 'system');
  });
}
