const REVENUE_ORDER_STATUSES = new Set(['delivered', 'awaiting_fulfillment']);
const ORDER_STATUSES = [
  'pending_payment',
  'payment_review',
  'awaiting_fulfillment',
  'delivered',
  'cancelled',
  'expired',
  'refunded'
];
const INVENTORY_STATUSES = ['available', 'reserved', 'sold'];

function countBy(items = [], key) {
  const counts = {};
  for (const item of items) {
    const value = String(item?.[key] || 'unknown');
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function completeBreakdown(input = {}, keys = []) {
  const output = {};
  for (const key of keys) output[key] = Number(input[key] || 0);
  for (const [key, value] of Object.entries(input || {})) {
    if (!(key in output)) output[key] = Number(value || 0);
  }
  return output;
}

function dayKey(value, timeZone) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateKeys(days, now = new Date(), timeZone = 'Asia/Bangkok') {
  const currentKey = dayKey(now, timeZone);
  const today = new Date(`${currentKey}T12:00:00.000Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function daySnapshot(orders, date, timeZone) {
  const snapshot = { date, orders: 0, paidOrders: 0, deliveredOrders: 0, revenue: 0 };
  for (const order of orders) {
    if (dayKey(order.createdAt, timeZone) === date) snapshot.orders += 1;
    const revenueOrder = REVENUE_ORDER_STATUSES.has(String(order.status || ''));
    const revenueAt = order.paidAt || order.deliveredAt || order.createdAt;
    if (revenueOrder && dayKey(revenueAt, timeZone) === date) {
      snapshot.paidOrders += 1;
      snapshot.revenue += Number(order.total || 0);
    }
    const deliveredAt = order.deliveredAt || order.paidAt || order.createdAt;
    if (String(order.status || '') === 'delivered' && dayKey(deliveredAt, timeZone) === date) {
      snapshot.deliveredOrders += 1;
    }
  }
  return snapshot;
}

function deltaPercent(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (!previousValue) return currentValue ? null : 0;
  return Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
}

function sumDaily(daily, start, end) {
  return daily.slice(start, end).reduce((total, day) => ({
    orders: total.orders + day.orders,
    paidOrders: total.paidOrders + day.paidOrders,
    deliveredOrders: total.deliveredOrders + day.deliveredOrders,
    revenue: total.revenue + day.revenue
  }), { orders: 0, paidOrders: 0, deliveredOrders: 0, revenue: 0 });
}

export function buildDashboardAnalytics({
  products = [],
  inventory = [],
  orders = [],
  payments = [],
  inventoryBreakdown = null,
  orderStatusBreakdown = null,
  paymentStatusBreakdown = null,
  now = new Date(),
  days = 30,
  timeZone = 'Asia/Bangkok'
} = {}) {
  const keys = dateKeys(days, now, timeZone);
  const keySet = new Set(keys);
  const dailyByDate = new Map(keys.map((date) => [date, {
    date,
    orders: 0,
    paidOrders: 0,
    deliveredOrders: 0,
    revenue: 0
  }]));
  const topProducts = new Map();

  for (const order of orders) {
    const date = dayKey(order.createdAt, timeZone);
    if (!keySet.has(date)) continue;
    const day = dailyByDate.get(date);
    day.orders += 1;
    const revenueOrder = REVENUE_ORDER_STATUSES.has(String(order.status || ''));
    if (!revenueOrder) continue;
    const revenue = Number(order.total || 0);
    const quantity = Number(order.quantity || 0);
    day.paidOrders += 1;
    if (String(order.status || '') === 'delivered') day.deliveredOrders += 1;
    day.revenue += revenue;
    const sku = String(order.productSku || order.productId || 'unknown');
    const product = topProducts.get(sku) || {
      sku,
      name: String(order.productName || sku),
      orders: 0,
      units: 0,
      revenue: 0
    };
    product.orders += 1;
    product.units += quantity;
    product.revenue += revenue;
    topProducts.set(sku, product);
  }

  const daily = [...dailyByDate.values()];
  const current7d = sumDaily(daily, Math.max(0, daily.length - 7), daily.length);
  const previous7d = sumDaily(daily, Math.max(0, daily.length - 14), Math.max(0, daily.length - 7));
  const period30d = sumDaily(daily, 0, daily.length);
  const todaySnapshot = daySnapshot(orders, keys.at(-1), timeZone);
  const yesterdaySnapshot = daySnapshot(orders, keys.at(-2), timeZone);
  const statuses = completeBreakdown(orderStatusBreakdown || countBy(orders, 'status'), ORDER_STATUSES);
  const inventoryCounts = completeBreakdown(inventoryBreakdown || countBy(inventory, 'status'), INVENTORY_STATUSES);
  const paymentCounts = completeBreakdown(paymentStatusBreakdown || countBy(payments, 'status'));
  const activeProducts = products.filter((product) => product.active !== false).length;
  const paidPaymentCount = ['paid', 'succeeded', 'completed']
    .reduce((total, status) => total + Number(paymentCounts[status] || 0), 0);

  return {
    generatedAt: new Date(now).toISOString(),
    windowDays: days,
    timeZone,
    daily,
    today: {
      ...todaySnapshot,
      revenueDeltaPercent: deltaPercent(todaySnapshot.revenue, yesterdaySnapshot.revenue),
      orderDeltaPercent: deltaPercent(todaySnapshot.orders, yesterdaySnapshot.orders)
    },
    yesterday: yesterdaySnapshot,
    current7d: {
      ...current7d,
      revenueDeltaPercent: deltaPercent(current7d.revenue, previous7d.revenue),
      orderDeltaPercent: deltaPercent(current7d.orders, previous7d.orders)
    },
    previous7d,
    period30d: {
      ...period30d,
      averageOrderValue: period30d.paidOrders
        ? Math.round(period30d.revenue / period30d.paidOrders)
        : 0,
      paymentConversionRate: period30d.orders
        ? Math.round((period30d.paidOrders / period30d.orders) * 1000) / 10
        : 0
    },
    products: {
      total: products.length,
      active: activeProducts,
      inactive: products.length - activeProducts
    },
    inventory: inventoryCounts,
    orderStatuses: statuses,
    payments: {
      ...paymentCounts,
      total: Object.values(paymentCounts).reduce((sum, value) => sum + Number(value || 0), 0),
      paid: paidPaymentCount
    },
    fulfillment: {
      paid: Number(statuses.delivered || 0) + Number(statuses.awaiting_fulfillment || 0),
      delivered: Number(statuses.delivered || 0),
      awaiting: Number(statuses.awaiting_fulfillment || 0),
      deliveryRate: (Number(statuses.delivered || 0) + Number(statuses.awaiting_fulfillment || 0))
        ? Math.round((Number(statuses.delivered || 0) / (
          Number(statuses.delivered || 0) + Number(statuses.awaiting_fulfillment || 0)
        )) * 1000) / 10
        : 0
    },
    topProducts: [...topProducts.values()]
      .sort((left, right) => right.revenue - left.revenue || right.units - left.units)
      .slice(0, 6)
  };
}
