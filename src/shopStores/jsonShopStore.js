import { config, nowIso } from '../config.js';
import { buildDashboardAnalytics } from '../dashboardAnalytics.js';
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
import {
  calculateDiscount,
  clearExpiredDiscountReservation,
  discountReservationIsLive,
  normalizeDiscountCode,
  normalizeDiscountInput,
  publicDiscountCode
} from '../discountCodes.js';
import { assertSalesOrderAllowed, normalizeOrderQuantity } from '../salesGuard.js';
import { parseSeatEmailLines } from '../seatFulfillment.js';
import {
  normalizeNotificationCampaignInput,
  normalizeNotificationPreferencePatch,
  normalizeNotificationPreferences,
  notificationDeliverySummary,
  publicNotificationCampaign,
  userAllowsNotification
} from '../notificationCenter.js';
import { addAudit, makeId, publicProduct, readStore, withWrite } from '../storage.js';
import { paymentProvider } from '../payments.js';
import {
  applyTelegramProductPricing,
  catalogBasePriceList,
  normalizeTelegramPriceOverrides,
  normalizeTelegramUsername,
  resolveTelegramProductPricing
} from '../telegramPricing.js';

const orderTtlMs = config.orders.ttlMinutes * 60 * 1000;
const finalOrderStatuses = new Set(['delivered', 'refunded']);
const closedPaymentStatuses = new Set(['paid', 'amount_mismatch', 'paid_needs_review', 'refunded']);

function findDiscountCode(db, rawCode) {
  const code = normalizeDiscountCode(rawCode, { strict: true });
  return (db.discountCodes || []).find((item) => item.code === code) || null;
}

function releaseDiscountReservation(db, order) {
  const code = order?.discount?.code;
  if (!code) return false;
  const discount = (db.discountCodes || []).find((item) => item.code === code);
  if (!discount || discount.usedByOrderId || discount.reservedByOrderId !== order.id) return false;
  discount.reservedByOrderId = null;
  discount.reservedByUserId = null;
  discount.reservedAt = null;
  discount.reservedUntil = null;
  discount.updatedAt = nowIso();
  return true;
}

function consumeDiscountReservation(db, order, actorId) {
  const code = order?.discount?.code;
  if (!code) return null;
  const discount = (db.discountCodes || []).find((item) => item.code === code);
  if (!discount) {
    throw Object.assign(new Error('Reserved discount code no longer exists'), {
      code: 'discount_reservation_lost',
      statusCode: 409
    });
  }
  if (discount.usedByOrderId === order.id) return discount;
  if (discount.usedByOrderId || discount.reservedByOrderId !== order.id) {
    throw Object.assign(new Error('Discount reservation no longer belongs to this order'), {
      code: 'discount_reservation_lost',
      statusCode: 409
    });
  }
  discount.usedByOrderId = order.id;
  discount.usedByUserId = order.userId;
  discount.usedAt = nowIso();
  discount.reservedByOrderId = null;
  discount.reservedByUserId = null;
  discount.reservedAt = null;
  discount.reservedUntil = null;
  discount.updatedAt = nowIso();
  addAudit(db, actorId, 'discount.consume', 'discount_code', discount.id, {
    code: discount.code,
    orderId: order.id,
    amount: order.discount.amount
  });
  return discount;
}

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

export async function listProducts({ includeInactive = false, user = null } = {}) {
  const db = await readStore();
  return db.products
    .filter((product) => includeInactive || product.active)
    .map((product) => {
      const visibleProduct = publicProduct(product, db);
      if (!user) return visibleProduct;
      return applyTelegramProductPricing(
        visibleProduct,
        user,
        db.telegramPriceLists || [],
        db.catalogPriceLists || []
      );
    });
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
    analytics: buildDashboardAnalytics({
      products: db.products,
      inventory: db.inventory,
      orders: db.orders,
      payments: db.payments
    }),
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
      user.username = typeof from.username === 'string' ? from.username : '';
      user.firstName = from.first_name || user.firstName;
      user.lastName = from.last_name || user.lastName;
      user.updatedAt = nowIso();
    }
    return user;
  });
}

function notificationAudienceUsers(db, campaign) {
  const type = campaign.audience?.type || 'subscribers';
  const value = String(campaign.audience?.value || '').trim().toLowerCase().replace(/^@/, '');
  let userIds = null;
  if (type === 'customers') {
    userIds = new Set(db.orders
      .filter((order) => ['awaiting_fulfillment', 'delivered', 'refunded'].includes(order.status))
      .map((order) => order.userId));
  } else if (type === 'product') {
    userIds = new Set(db.orders
      .filter((order) => String(order.productSku || '').trim().toLowerCase() === value)
      .map((order) => order.userId));
  }
  return db.users.filter((user) => {
    if (!String(user.telegramId || '').trim() || user.notificationBlockedAt) return false;
    if (!userAllowsNotification(user, campaign.category)) return false;
    if (type === 'username') return String(user.username || '').trim().toLowerCase().replace(/^@/, '') === value;
    if (userIds) return userIds.has(user.id);
    return true;
  });
}

export async function getNotificationCenterForUser(userId, { markRead = false } = {}) {
  const read = async (db) => {
    const user = db.users.find((item) => item.id === userId);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    const deliveries = (db.notificationDeliveries || [])
      .filter((item) => item.userId === userId && item.status === 'sent')
      .sort((left, right) => String(right.sentAt || '').localeCompare(String(left.sentAt || '')))
      .slice(0, 8);
    if (markRead) {
      const readAt = nowIso();
      for (const delivery of deliveries) delivery.readAt ||= readAt;
    }
    return {
      preferences: normalizeNotificationPreferences(user.notificationPreferences),
      unread: deliveries.filter((item) => !item.readAt).length,
      notifications: deliveries.map((item) => ({
        id: item.id,
        campaignId: item.campaignId,
        title: item.title,
        category: item.category,
        sentAt: item.sentAt,
        readAt: item.readAt || null,
        clickedAt: item.clickedAt || null
      }))
    };
  };
  return markRead ? withWrite(read) : read(await readStore());
}

export async function updateNotificationPreferences(userId, input) {
  return withWrite(async (db) => {
    const user = db.users.find((item) => item.id === userId);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    user.notificationPreferences = {
      ...normalizeNotificationPreferences(user.notificationPreferences),
      ...normalizeNotificationPreferencePatch(input)
    };
    user.updatedAt = nowIso();
    return normalizeNotificationPreferences(user.notificationPreferences);
  });
}

export async function getNotificationAdminOverview() {
  const db = await readStore();
  const campaigns = (db.notificationCampaigns || [])
    .slice()
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
    .map(publicNotificationCampaign);
  const deliveries = db.notificationDeliveries || [];
  return {
    campaigns,
    metrics: {
      campaigns: campaigns.length,
      sent: deliveries.filter((item) => item.status === 'sent').length,
      failed: deliveries.filter((item) => item.status === 'failed').length,
      blocked: deliveries.filter((item) => item.status === 'blocked').length,
      clicked: deliveries.filter((item) => item.clickedAt).length
    },
    audience: {
      knownUsers: db.users.filter((user) => String(user.telegramId || '').trim()).length,
      subscribers: db.users.filter((user) => (
        String(user.telegramId || '').trim()
        && !user.notificationBlockedAt
        && Object.values(normalizeNotificationPreferences(user.notificationPreferences)).some(Boolean)
      )).length
    },
    users: db.users
      .filter((user) => String(user.username || '').trim() && !user.notificationBlockedAt)
      .map((user) => ({ username: user.username }))
      .sort((left, right) => left.username.localeCompare(right.username))
  };
}

export async function createNotificationCampaign(actorId, input) {
  return withWrite(async (db) => {
    const normalized = normalizeNotificationCampaignInput(input);
    const campaign = {
      id: makeId('ntf'),
      ...normalized,
      createdBy: actorId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deliverySummary: { targeted: 0, sent: 0, failed: 0, blocked: 0, clicked: 0 }
    };
    db.notificationCampaigns ||= [];
    db.notificationCampaigns.push(campaign);
    addAudit(db, actorId, 'notification.campaign.create', 'notification_campaign', campaign.id, {
      category: campaign.category,
      audience: campaign.audience,
      status: campaign.status
    });
    return publicNotificationCampaign(campaign);
  });
}

export async function getNotificationCampaign(campaignId) {
  const db = await readStore();
  const campaign = (db.notificationCampaigns || []).find((item) => item.id === campaignId);
  return campaign ? publicNotificationCampaign(campaign) : null;
}

export async function listDueNotificationCampaigns(at = nowIso()) {
  const db = await readStore();
  const timestamp = Date.parse(at);
  return (db.notificationCampaigns || [])
    .filter((campaign) => campaign.status === 'scheduled' && Date.parse(campaign.scheduledAt) <= timestamp)
    .map(publicNotificationCampaign);
}

export async function claimNotificationCampaign(campaignId, actorId = 'system') {
  return withWrite(async (db) => {
    const campaign = (db.notificationCampaigns || []).find((item) => item.id === campaignId);
    if (!campaign) throw Object.assign(new Error('Notification campaign not found'), { statusCode: 404 });
    if (!['draft', 'scheduled'].includes(campaign.status)) return { claimed: false, campaign: publicNotificationCampaign(campaign), recipients: [] };
    if (campaign.status === 'scheduled' && Date.parse(campaign.scheduledAt) > Date.now()) {
      throw Object.assign(new Error('Notification campaign is not due yet'), { statusCode: 409 });
    }
    campaign.status = 'sending';
    campaign.startedAt = nowIso();
    campaign.updatedAt = campaign.startedAt;
    const recipients = notificationAudienceUsers(db, campaign).map((user) => ({
      id: user.id,
      telegramId: user.telegramId,
      username: user.username || '',
      firstName: user.firstName || ''
    }));
    addAudit(db, actorId, 'notification.campaign.send_started', 'notification_campaign', campaign.id, {
      targeted: recipients.length
    });
    return { claimed: true, campaign: publicNotificationCampaign(campaign), recipients };
  });
}

export async function completeNotificationCampaign(campaignId, deliveries, actorId = 'system') {
  return withWrite(async (db) => {
    const campaign = (db.notificationCampaigns || []).find((item) => item.id === campaignId);
    if (!campaign) throw Object.assign(new Error('Notification campaign not found'), { statusCode: 404 });
    const completedAt = nowIso();
    db.notificationDeliveries ||= [];
    const records = deliveries.map((item) => ({
      id: makeId('ndl'),
      campaignId,
      userId: item.userId,
      telegramId: String(item.telegramId || ''),
      title: campaign.title,
      category: campaign.category,
      status: item.status,
      error: item.error || null,
      sentAt: item.status === 'sent' ? completedAt : null,
      readAt: null,
      clickedAt: null,
      createdAt: completedAt
    }));
    db.notificationDeliveries.push(...records);
    for (const record of records.filter((item) => item.status === 'blocked')) {
      const user = db.users.find((item) => item.id === record.userId);
      if (user) user.notificationBlockedAt = completedAt;
    }
    campaign.deliverySummary = notificationDeliverySummary(records);
    campaign.status = records.some((item) => item.status === 'failed') || records.some((item) => item.status === 'blocked')
      ? 'completed_with_errors'
      : 'completed';
    campaign.completedAt = completedAt;
    campaign.updatedAt = completedAt;
    addAudit(db, actorId, 'notification.campaign.completed', 'notification_campaign', campaign.id, campaign.deliverySummary);
    return publicNotificationCampaign(campaign);
  });
}

export async function recordNotificationClick(campaignId, userId) {
  return withWrite(async (db) => {
    const delivery = (db.notificationDeliveries || []).find((item) => item.campaignId === campaignId && item.userId === userId);
    if (!delivery) return { recorded: false };
    delivery.clickedAt ||= nowIso();
    const campaign = (db.notificationCampaigns || []).find((item) => item.id === campaignId);
    if (campaign) {
      const deliveries = (db.notificationDeliveries || []).filter((item) => item.campaignId === campaignId);
      campaign.deliverySummary = notificationDeliverySummary(deliveries);
      campaign.updatedAt = nowIso();
    }
    return { recorded: true, clickedAt: delivery.clickedAt };
  });
}

export async function getTelegramPricingOverview() {
  const db = await readStore();
  return {
    basePriceList: catalogBasePriceList(db.catalogPriceLists || []) || {
      id: 'base',
      prices: {},
      updatedAt: null
    },
    priceLists: (db.telegramPriceLists || [])
      .slice()
      .sort((left, right) => String(left.username).localeCompare(String(right.username))),
    users: db.users
      .filter((user) => normalizeTelegramUsername(user.username))
      .slice()
      .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
      .map((user) => ({
        id: user.id,
        telegramId: user.telegramId,
        username: normalizeTelegramUsername(user.username),
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        updatedAt: user.updatedAt
      }))
  };
}

export async function setTelegramPriceList(actorId, rawUsername, input = {}) {
  return withWrite(async (db) => {
    const username = normalizeTelegramUsername(rawUsername, { strict: true });
    const validSkus = db.products.map((product) => product.sku);
    const prices = normalizeTelegramPriceOverrides(input, validSkus);
    db.telegramPriceLists ||= [];
    let priceList = db.telegramPriceLists.find((item) => (
      normalizeTelegramUsername(item.username) === username
    ));
    const created = !priceList;
    if (!priceList) {
      priceList = {
        id: makeId('tpl'),
        username,
        prices: {},
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      db.telegramPriceLists.push(priceList);
    }
    priceList.username = username;
    priceList.prices = prices;
    priceList.updatedAt = nowIso();
    addAudit(db, actorId, created ? 'telegram_pricing.create' : 'telegram_pricing.update', 'telegram_price_list', priceList.id, {
      username,
      productCount: Object.keys(prices).length
    });
    return priceList;
  });
}

export async function deleteTelegramPriceList(actorId, rawUsername) {
  return withWrite(async (db) => {
    const username = normalizeTelegramUsername(rawUsername, { strict: true });
    db.telegramPriceLists ||= [];
    const index = db.telegramPriceLists.findIndex((item) => (
      normalizeTelegramUsername(item.username) === username
    ));
    if (index < 0) throw Object.assign(new Error('Telegram price list not found'), { statusCode: 404 });
    const [removed] = db.telegramPriceLists.splice(index, 1);
    addAudit(db, actorId, 'telegram_pricing.delete', 'telegram_price_list', removed.id, { username });
    return { ok: true, username };
  });
}

export async function setCatalogPriceList(actorId, input = {}) {
  return withWrite(async (db) => {
    const prices = normalizeTelegramPriceOverrides(input, db.products.map((product) => product.sku));
    db.catalogPriceLists ||= [];
    let priceList = catalogBasePriceList(db.catalogPriceLists);
    const created = !priceList;
    if (!priceList) {
      priceList = {
        id: 'base',
        prices: {},
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      db.catalogPriceLists.push(priceList);
    }
    priceList.prices = prices;
    priceList.updatedAt = nowIso();
    addAudit(db, actorId, 'catalog_pricing.update', 'catalog_price_list', 'base', {
      productCount: Object.keys(prices).length,
      created
    });
    return priceList;
  });
}

export async function listDiscountCodes() {
  const db = await readStore();
  return (db.discountCodes || [])
    .slice()
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
    .map(publicDiscountCode);
}

export async function createDiscountCode(actorId, input = {}) {
  return withWrite(async (db) => {
    const normalized = normalizeDiscountInput(input);
    db.discountCodes ||= [];
    if (db.discountCodes.some((item) => item.code === normalized.code)) {
      throw Object.assign(new Error('Discount code already exists'), {
        code: 'discount_code_exists',
        statusCode: 409
      });
    }
    const discount = {
      id: makeId('dsc'),
      ...normalized,
      usageLimit: 1,
      reservedByOrderId: null,
      reservedByUserId: null,
      reservedAt: null,
      reservedUntil: null,
      usedByOrderId: null,
      usedByUserId: null,
      usedAt: null,
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    db.discountCodes.push(discount);
    addAudit(db, actorId, 'discount.create', 'discount_code', discount.id, {
      code: discount.code,
      type: discount.type,
      value: discount.value
    });
    return publicDiscountCode(discount);
  });
}

export async function updateDiscountCode(actorId, discountId, input = {}) {
  return withWrite(async (db) => {
    const discount = (db.discountCodes || []).find((item) => item.id === discountId);
    if (!discount) throw Object.assign(new Error('Discount code not found'), { statusCode: 404 });
    if (input.active === undefined) {
      throw Object.assign(new Error('Discount active state is required'), { statusCode: 400 });
    }
    discount.active = input.active === true;
    discount.updatedBy = actorId;
    discount.updatedAt = nowIso();
    addAudit(db, actorId, discount.active ? 'discount.activate' : 'discount.deactivate', 'discount_code', discount.id, {
      code: discount.code
    });
    return publicDiscountCode(discount);
  });
}

export async function previewDiscountForUser(user, productSkuOrId, quantity = 1, options = {}) {
  const db = await readStore();
  const product = db.products.find((item) => item.id === productSkuOrId || item.sku === String(productSkuOrId).toLowerCase());
  if (!product || !product.active) throw Object.assign(new Error('Product is not available'), { statusCode: 404 });
  assertSalesOrderAllowed(product, user);
  const pricing = resolveTelegramProductPricing(
    product,
    user,
    db.telegramPriceLists || [],
    db.catalogPriceLists || []
  );
  const seatEmailOrder = isSeatEmailFulfillment(product);
  const qty = seatEmailOrder && options.recipientEmails
    ? normalizeOrderQuantity(seatOrderRecipients(options.recipientEmails).length)
    : normalizeOrderQuantity(quantity);
  const discount = findDiscountCode(db, options.discountCode);
  if (!discount) {
    throw Object.assign(new Error('Discount code was not found'), {
      code: 'discount_not_found',
      statusCode: 404
    });
  }
  clearExpiredDiscountReservation(discount);
  if (discountReservationIsLive(discount)) {
    throw Object.assign(new Error('Discount code is reserved by another order'), {
      code: 'discount_reserved',
      statusCode: 409
    });
  }
  const breakdown = calculateDiscount(discount, pricing.price * qty);
  return {
    productId: product.id,
    productSku: product.sku,
    quantity: qty,
    unitPrice: pricing.price,
    currency: product.currency,
    subtotal: breakdown.subtotal,
    total: breakdown.total,
    discount: {
      code: breakdown.code,
      type: breakdown.type,
      value: breakdown.value,
      amount: breakdown.amount
    }
  };
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
    const pricing = resolveTelegramProductPricing(
      product,
      user,
      db.telegramPriceLists || [],
      db.catalogPriceLists || []
    );
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

    const subtotal = pricing.price * qty;
    let discount = null;
    let discountRecord = null;
    if (options.discountCode) {
      discountRecord = findDiscountCode(db, options.discountCode);
      if (!discountRecord) {
        throw Object.assign(new Error('Discount code was not found'), {
          code: 'discount_not_found',
          statusCode: 404
        });
      }
      clearExpiredDiscountReservation(discountRecord);
      if (discountReservationIsLive(discountRecord)) {
        throw Object.assign(new Error('Discount code is reserved by another order'), {
          code: 'discount_reserved',
          statusCode: 409
        });
      }
      const breakdown = calculateDiscount(discountRecord, subtotal);
      discount = {
        code: breakdown.code,
        type: breakdown.type,
        value: breakdown.value,
        amount: breakdown.amount
      };
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
      unitPrice: pricing.price,
      subtotal,
      discount,
      total: subtotal - Number(discount?.amount || 0),
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
        fulfillmentMode: normalizeFulfillmentMode(product.fulfillmentMode, { sku: product.sku }),
        pricing: pricing.personalized ? {
          source: pricing.source,
          username: pricing.username,
          basePrice: pricing.basePrice,
          catalogPrice: pricing.catalogPrice
        } : {
          source: pricing.source,
          basePrice: pricing.basePrice,
          catalogPrice: pricing.catalogPrice
        }
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

    if (discountRecord) {
      discountRecord.reservedByOrderId = order.id;
      discountRecord.reservedByUserId = user.id;
      discountRecord.reservedAt = nowIso();
      discountRecord.reservedUntil = order.expiresAt;
      discountRecord.updatedAt = nowIso();
    }

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
    addAudit(db, user.id, 'order.create', 'order', order.id, {
      sku: product.sku,
      quantity: qty,
      ...(discount ? { discountCode: discount.code, discountAmount: discount.amount } : {})
    });

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
    releaseDiscountReservation(db, order);
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
      consumeDiscountReservation(db, order, actorId);
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

    consumeDiscountReservation(db, order, actorId);
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
    releaseDiscountReservation(db, order);
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

    consumeDiscountReservation(db, order, actorId);
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
    releaseDiscountReservation(db, order);
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
      releaseDiscountReservation(db, order);
      setOrderStatus(db, order, 'expired', actorId, 'payment_timeout', { expiresAt: order.expiresAt });
      expired += 1;
    }
  }
  if (expired) {
    addAudit(db, actorId, 'orders.expired', 'order', 'bulk', { count: expired });
  }
  return expired;
}
