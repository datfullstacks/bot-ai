import { randomUUID } from 'node:crypto';
import { config, nowIso } from '../config.js';
import {
  isSeatEmailFulfillment,
  normalizeDeliveryMode,
  normalizeFulfillmentMode,
  normalizeProductInput,
  normalizePublicProduct
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
import { paymentProvider } from '../payments.js';
import { assertSalesOrderAllowed, normalizeOrderQuantity } from '../salesGuard.js';
import { parseSeatEmailLines } from '../seatFulfillment.js';
import { withPostgresClient, withPostgresTransaction } from '../postgresStore.js';

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
  const { secret, secretFingerprint, ...safe } = item;
  return { ...safe, secretPreview: inventorySecretPreview(item) };
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
    const receivedRevenue = await client.query(`
      SELECT COALESCE(sum((doc->>'total')::numeric), 0)::float AS revenue
      FROM app_documents
      WHERE collection = 'orders'
        AND doc->>'status' IN ('delivered', 'awaiting_fulfillment')
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
      awaitingFulfillmentOrders: count('orders', 'awaiting_fulfillment'),
      deliveredOrders: count('orders', 'delivered'),
      reviewOrders: count('orders', 'payment_review'),
      revenue: receivedRevenue.rows[0]?.revenue || 0,
      recentOrders: recentOrders.rows.map((row) => publicOrder(row.doc)),
      lowStock: products.filter((product) => (
        product.active && !isSeatEmailFulfillment(product) && product.stock.available <= 2
      ))
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

    if (!product.name || !Number.isSafeInteger(product.price) || product.price <= 0) {
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
    if (!product.name || !Number.isSafeInteger(product.price) || product.price <= 0) {
      throw Object.assign(new Error('Name and positive integer price are required'), { statusCode: 400 });
    }
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
    if (isSeatEmailFulfillment(productRow.doc)) {
      throw Object.assign(new Error('Seat-email products do not use inventory'), { statusCode: 409 });
    }

    assertInventoryEncryptionReadyForImport();
    const requested = [...new Set(lines.map((line) => String(line).trim()).filter(Boolean))];
    const existing = await client.query(
      `SELECT doc
       FROM app_documents
       WHERE collection = 'inventory' AND doc->>'productId' = $1`,
      [productId]
    );
    const existingFingerprints = new Set(existing.rows.map(({ doc }) => (
      inventorySecretFingerprint(decryptInventorySecret(doc.secret))
    )));
    const secrets = requested.filter((secret) => !existingFingerprints.has(inventorySecretFingerprint(secret)));
    for (const secret of secrets) {
      await insertDoc(client, 'inventory', {
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
      });
    }

    await addAuditDoc(client, actorId, 'inventory.import', 'product', productId, {
      count: secrets.length,
      skippedDuplicates: requested.length - secrets.length
    });
    return {
      imported: secrets.length,
      skippedDuplicates: requested.length - secrets.length
    };
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

export async function createOrderForUser(user, productSkuOrId, quantity = 1, options = {}) {
  return withPostgresTransaction(async (client) => {
    await expirePendingOrdersInClient(client, 'system', 100);

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
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [checkoutKey]);
      const existingOrder = await client.query(
        `SELECT doc
         FROM app_documents
         WHERE collection = 'orders'
           AND doc->>'userId' = $1
           AND doc->>'checkoutKey' = $2
         LIMIT 1`,
        [user.id, checkoutKey]
      );
      if (existingOrder.rows[0]) {
        const order = existingOrder.rows[0].doc;
        const existingPayment = await client.query(
          `SELECT doc
           FROM app_documents
           WHERE collection = 'payments'
             AND (id = $1 OR doc->>'orderId' = $2)
           LIMIT 1`,
          [String(order.paymentId || ''), order.id]
        );
        return {
          order: publicOrder(order),
          payment: existingPayment.rows[0]?.doc || null,
          reused: true
        };
      }
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

    let inventoryRows = [];
    if (!seatEmailOrder) {
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
      inventoryRows = inventoryResult.rows;
      if (inventoryRows.length < qty) {
        throw Object.assign(new Error('Not enough stock'), { statusCode: 409 });
      }
      assertInventorySecretsReadyForSale(inventoryRows.map((row) => row.doc));
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

    for (const row of inventoryRows) {
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

export async function getPublicPaymentStatus(providerPaymentId) {
  return withPostgresClient(async (client) => {
    const result = await client.query(
      `SELECT payment.doc AS payment, orders.doc AS orders
       FROM app_documents AS payment
       LEFT JOIN app_documents AS orders
         ON orders.collection = 'orders'
        AND orders.id = payment.doc->>'orderId'
       WHERE payment.collection = 'payments'
         AND payment.doc->>'providerPaymentId' = $1
       LIMIT 1`,
      [providerPaymentId]
    );
    const payment = result.rows[0]?.payment;
    if (!payment) return null;
    const order = result.rows[0]?.orders;
    return {
      ok: true,
      paymentStatus: payment.status,
      orderStatus: order?.status || '',
      updatedAt: payment.updatedAt || payment.createdAt || ''
    };
  });
}

async function readPaymentForOrder(client, order) {
  const result = await client.query(
    `SELECT doc
     FROM app_documents
     WHERE collection = 'payments'
       AND (id = $1 OR doc->>'orderId' = $2)
     LIMIT 1`,
    [String(order.paymentId || ''), order.id]
  );
  return result.rows[0]?.doc || null;
}

async function checkoutContext(client, order) {
  return {
    order: publicOrder(order),
    payment: publicPaymentCheckout(await readPaymentForOrder(client, order))
  };
}

export async function listOrdersForUser(userId, { limit = 5 } = {}) {
  return withPostgresClient(async (client) => {
    const safeLimit = Math.min(Math.max(Number(limit || 5), 1), 20);
    const result = await client.query(
      `SELECT doc
       FROM app_documents
       WHERE collection = 'orders' AND doc->>'userId' = $1
       ORDER BY doc->>'createdAt' DESC
       LIMIT $2`,
      [userId, safeLimit]
    );
    const contexts = [];
    for (const { doc } of result.rows) {
      contexts.push(await checkoutContext(client, doc));
    }
    return contexts;
  });
}

export async function getOrderCheckoutForUser(userId, orderId) {
  return withPostgresClient(async (client) => {
    const result = await client.query(
      `SELECT doc
       FROM app_documents
       WHERE collection = 'orders'
         AND id = $1
         AND doc->>'userId' = $2
       LIMIT 1`,
      [orderId, userId]
    );
    const order = result.rows[0]?.doc;
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    return checkoutContext(client, order);
  });
}

export async function cancelOrderForUser(userId, orderId) {
  return withPostgresTransaction(async (client) => {
    const result = await client.query(
      `SELECT doc
       FROM app_documents
       WHERE collection = 'orders'
         AND id = $1
         AND doc->>'userId' = $2
       LIMIT 1
       FOR UPDATE`,
      [orderId, userId]
    );
    const order = result.rows[0]?.doc;
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (order.status === 'cancelled') return checkoutContext(client, order);
    if (order.status !== 'pending_payment') {
      throw Object.assign(new Error('Only pending orders can be cancelled'), { statusCode: 409 });
    }

    await releaseReservedInventory(client, order.id);
    const expired = new Date(order.expiresAt).getTime() < Date.now();
    await setOrderStatus(
      client,
      order,
      expired ? 'expired' : 'cancelled',
      userId,
      expired ? 'payment_timeout' : 'buyer_cancelled',
      expired ? { expiresAt: order.expiresAt } : {}
    );
    await upsertDoc(client, 'orders', order);
    return checkoutContext(client, order);
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
         AND doc->>'provider' = $2
         AND ((doc->>'providerPaymentId') = ANY($1::text[]) OR (doc->>'reference') = ANY($1::text[]))
       LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
      [candidates, event.provider]
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
       AND doc->>'provider' = $2
       AND doc->>'status' = 'pending'
       AND $1 LIKE ('%' || upper(doc->>'reference') || '%')
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [searchable, event.provider]
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
  assertInventorySecretsReadyForSale(items);
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

    await insertDoc(client, 'paymentEvents', event);
    if (event.test === true) {
      await addAuditDoc(client, actorId, 'payment.test', 'payment_event', event.id, {
        provider: event.provider
      });
      return { unmatched: true, test: true };
    }
    const payment = await findPaymentForEvent(client, event, true);
    if (!payment) {
      await addAuditDoc(client, actorId, 'payment.unmatched', 'payment_event', event.id, {
        provider: event.provider,
        reference: event.reference || '',
        bankReference: event.bankReference || ''
      });
      return { unmatched: true };
    }

    const orderRow = await getDoc(client, 'orders', payment.orderId, { forUpdate: true });
    if (!orderRow) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const order = orderRow.doc;

    payment.events ||= [];
    payment.events.push(event.id);
    payment.updatedAt = nowIso();

    if (event.status !== 'paid') {
      payment.status = event.status;
      await upsertDoc(client, 'payments', payment);
      await addAuditDoc(client, actorId, 'payment.event', 'payment', payment.id, { status: event.status });
      return { order: publicOrder(order), payment };
    }

    if (
      closedPaymentStatuses.has(payment.status)
      && ['paid', 'delivered', 'payment_review', 'awaiting_fulfillment'].includes(order.status)
    ) {
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

    if (['paid', 'delivered', 'awaiting_fulfillment'].includes(order.status)) {
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

    if (isSeatOrder(order)) {
      payment.status = 'paid';
      payment.bankReference = event.bankReference || payment.bankReference || '';
      order.paidAt = nowIso();
      await setOrderStatus(client, order, 'awaiting_fulfillment', actorId, 'payment_confirmed', {
        amount: order.total,
        fulfillmentMode: 'seat_email',
        recipientCount: order.fulfillment?.recipients?.length || 0
      });
      await addAuditDoc(client, actorId, 'payment.paid', 'order', order.id, {
        amount: order.total,
        fulfillmentMode: 'seat_email'
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
    payment.bankReference = event.bankReference || payment.bankReference || '';
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
    if (finalOrderStatuses.has(order.status) || ['paid', 'payment_review', 'awaiting_fulfillment'].includes(order.status)) {
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
    const seatEmailOrder = isSeatOrder(order);
    const deliveryItems = seatEmailOrder ? [] : await allocateInventoryForReviewDelivery(client, order);
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
      await upsertDoc(client, 'payments', payment);
    }

    if (seatEmailOrder) {
      order.paidAt ||= nowIso();
      await setOrderStatus(client, order, 'awaiting_fulfillment', actorId, 'manual_review_approved', {
        note,
        fulfillmentMode: 'seat_email',
        recipientCount: order.fulfillment?.recipients?.length || 0
      });
      await addAuditDoc(client, actorId, 'order.review.approve_fulfillment', 'order', order.id, {
        recipientCount: order.fulfillment?.recipients?.length || 0,
        note
      });
      await upsertDoc(client, 'orders', order);
      return { order: publicOrder(order), payment, delivered: 0, awaitingFulfillment: true };
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

export async function completeSeatFulfillment(actorId, orderId, input = {}) {
  return withPostgresTransaction(async (client) => {
    const orderRow = await getDoc(client, 'orders', orderId, { forUpdate: true });
    if (!orderRow) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const order = orderRow.doc;
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
    await setOrderStatus(client, order, 'delivered', actorId, 'seat_fulfillment_completed', {
      count: recipients.length,
      note
    });
    await addAuditDoc(client, actorId, 'order.fulfillment.complete', 'order', order.id, {
      count: recipients.length,
      note
    });
    await upsertDoc(client, 'orders', order);
    return { order: publicOrder(order), fulfilled: recipients.length };
  });
}

export async function markOrderRefunded(actorId, orderId, input = {}) {
  return withPostgresTransaction(async (client) => {
    const orderRow = await getDoc(client, 'orders', orderId, { forUpdate: true });
    if (!orderRow) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const order = orderRow.doc;
    if (!['payment_review', 'awaiting_fulfillment'].includes(order.status)) {
      throw Object.assign(new Error('Only review or awaiting-fulfillment orders can be marked refunded'), { statusCode: 409 });
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
    return {
      order: publicOrder(order),
      deliverySecrets: (order.deliverySecrets || []).map((secret) => decryptInventorySecret(secret))
    };
  });
}

export async function expireOrders() {
  return withPostgresTransaction(async (client) => {
    return expirePendingOrdersInClient(client, 'system');
  });
}
