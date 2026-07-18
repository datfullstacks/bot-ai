import { normalizeNotificationPreferences } from './notificationCenter.js';

const customerOrderStatuses = new Set(['awaiting_fulfillment', 'delivered', 'refunded']);
const revenueOrderStatuses = new Set(['awaiting_fulfillment', 'delivered']);
const openOrderStatuses = new Set(['pending_payment', 'payment_review', 'paid', 'awaiting_fulfillment']);
const allowedSegments = new Set(['all', 'active7d', 'customers', 'no-orders']);
const allowedSorts = new Set(['recent', 'spent', 'orders', 'joined']);

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function searchable(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .trim();
}

function safePageNumber(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function notificationState(user = {}) {
  const preferences = normalizeNotificationPreferences(user.notificationPreferences);
  const blocked = Boolean(user.notificationBlockedAt);
  return {
    blocked,
    subscribed: !blocked && Boolean(preferences.promotions || preferences.stockAlerts || preferences.news),
    serviceEnabled: !blocked && preferences.serviceUpdates !== false
  };
}

function orderStatsByUser(orders = []) {
  const stats = new Map();
  for (const order of orders) {
    const userId = String(order?.userId || '').trim();
    if (!userId) continue;
    const current = stats.get(userId) || {
      total: 0,
      paid: 0,
      customer: 0,
      refunded: 0,
      open: 0,
      totalSpent: 0,
      latestOrderAt: null,
      latestOrderId: null,
      latestOrderStatus: null,
      latestOrderTimestamp: 0
    };
    const status = String(order.status || '').trim();
    const orderTimestamp = timestamp(order.createdAt);
    current.total += 1;
    if (customerOrderStatuses.has(status)) current.customer += 1;
    if (revenueOrderStatuses.has(status)) {
      current.paid += 1;
      current.totalSpent += Math.max(Number(order.total || 0), 0);
    }
    if (status === 'refunded') current.refunded += 1;
    if (openOrderStatuses.has(status)) current.open += 1;
    if (orderTimestamp >= current.latestOrderTimestamp) {
      current.latestOrderTimestamp = orderTimestamp;
      current.latestOrderAt = order.createdAt || null;
      current.latestOrderId = order.id || null;
      current.latestOrderStatus = status || null;
    }
    stats.set(userId, current);
  }
  return stats;
}

export function buildUserDirectory({ users = [], orders = [] } = {}, options = {}, now = Date.now()) {
  const nowTimestamp = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const active7dCutoff = nowTimestamp - (7 * 24 * 60 * 60 * 1000);
  const new30dCutoff = nowTimestamp - (30 * 24 * 60 * 60 * 1000);
  const statsByUser = orderStatsByUser(orders);
  const rows = users.map((user) => {
    const username = String(user.username || '').trim().replace(/^@/, '');
    const firstName = String(user.firstName || '').trim();
    const lastName = String(user.lastName || '').trim();
    const telegramId = String(user.telegramId || '').trim();
    const displayName = [firstName, lastName].filter(Boolean).join(' ')
      || (username ? `@${username}` : `Telegram ${telegramId || 'user'}`);
    const orderStats = statsByUser.get(String(user.id)) || {
      total: 0,
      paid: 0,
      customer: 0,
      refunded: 0,
      open: 0,
      totalSpent: 0,
      latestOrderAt: null,
      latestOrderId: null,
      latestOrderStatus: null,
      latestOrderTimestamp: 0
    };
    const lastActiveAt = user.updatedAt || user.createdAt || null;
    const lastActiveTimestamp = timestamp(lastActiveAt);
    const createdTimestamp = timestamp(user.createdAt);
    return {
      id: String(user.id || ''),
      telegramId,
      username,
      firstName,
      lastName,
      displayName,
      createdAt: user.createdAt || null,
      lastActiveAt,
      notifications: notificationState(user),
      orders: {
        total: orderStats.total,
        paid: orderStats.paid,
        refunded: orderStats.refunded,
        open: orderStats.open
      },
      isCustomer: orderStats.customer > 0,
      totalSpent: orderStats.totalSpent,
      currency: 'VND',
      latestOrderAt: orderStats.latestOrderAt,
      latestOrderId: orderStats.latestOrderId,
      latestOrderStatus: orderStats.latestOrderStatus,
      _lastActiveTimestamp: lastActiveTimestamp,
      _createdTimestamp: createdTimestamp,
      _search: searchable([displayName, username, telegramId, firstName, lastName].join(' '))
    };
  });

  const metrics = {
    totalUsers: rows.length,
    active7d: rows.filter((user) => user._lastActiveTimestamp >= active7dCutoff).length,
    customers: rows.filter((user) => user.isCustomer).length,
    new30d: rows.filter((user) => user._createdTimestamp >= new30dCutoff).length
  };
  const query = searchable(options.search);
  const segment = allowedSegments.has(options.segment) ? options.segment : 'all';
  const sort = allowedSorts.has(options.sort) ? options.sort : 'recent';
  let filtered = rows.filter((user) => {
    if (query && !user._search.includes(query)) return false;
    if (segment === 'active7d') return user._lastActiveTimestamp >= active7dCutoff;
    if (segment === 'customers') return user.isCustomer;
    if (segment === 'no-orders') return user.orders.total === 0;
    return true;
  });

  filtered.sort((left, right) => {
    if (sort === 'spent') return right.totalSpent - left.totalSpent || right._lastActiveTimestamp - left._lastActiveTimestamp;
    if (sort === 'orders') return right.orders.total - left.orders.total || right._lastActiveTimestamp - left._lastActiveTimestamp;
    if (sort === 'joined') return right._createdTimestamp - left._createdTimestamp || right._lastActiveTimestamp - left._lastActiveTimestamp;
    return right._lastActiveTimestamp - left._lastActiveTimestamp || right._createdTimestamp - left._createdTimestamp;
  });

  const limit = safePageNumber(options.limit, 100, { min: 1, max: 500 });
  const offset = safePageNumber(options.offset, 0, { min: 0 });
  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit).map((user) => {
    const { _lastActiveTimestamp, _createdTimestamp, _search, ...publicUser } = user;
    return publicUser;
  });

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
    metrics,
    generatedAt: new Date(nowTimestamp).toISOString()
  };
}
