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

function hourIndex(value, timeZone) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return -1;
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(timestamp)).find((part) => part.type === 'hour')?.value;
  const index = Number(hour);
  return Number.isInteger(index) && index >= 0 && index <= 23 ? index : -1;
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

function emptyFinancials() {
  return {
    revenue: 0,
    coveredRevenue: 0,
    cost: 0,
    ordersWithCost: 0,
    ordersMissingCost: 0
  };
}

function orderCost(order = {}) {
  const pricing = order.productSnapshot?.pricing || {};
  const configured = pricing.costConfigured === true || pricing.basePriceConfigured === true;
  const unitCost = Number(pricing.costUnitPrice ?? pricing.basePrice);
  const quantity = Number(order.quantity || 0);
  if (!configured || !Number.isFinite(unitCost) || unitCost <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  return Math.round(unitCost * quantity);
}

function addOrderFinancials(target, order) {
  const revenue = Number(order.total || 0);
  target.revenue += revenue;
  const cost = orderCost(order);
  if (cost === null) {
    target.ordersMissingCost += 1;
    return;
  }
  target.coveredRevenue += revenue;
  target.cost += cost;
  target.ordersWithCost += 1;
}

function finalizedFinancials(target = {}) {
  const revenue = Number(target.revenue || 0);
  const coveredRevenue = Number(target.coveredRevenue || 0);
  const cost = Number(target.cost || 0);
  const grossProfit = coveredRevenue - cost;
  return {
    ...target,
    revenue,
    coveredRevenue,
    cost,
    grossProfit,
    marginPercent: coveredRevenue
      ? Math.round((grossProfit / coveredRevenue) * 1000) / 10
      : null,
    costCoveragePercent: revenue
      ? Math.round((coveredRevenue / revenue) * 1000) / 10
      : 0
  };
}

export function buildOrderFinancialSummary(orders = []) {
  const totals = emptyFinancials();
  for (const order of orders) {
    if (!REVENUE_ORDER_STATUSES.has(String(order.status || ''))) continue;
    addOrderFinancials(totals, order);
  }
  return finalizedFinancials(totals);
}

function daySnapshot(orders, date, timeZone) {
  const snapshot = { date, orders: 0, paidOrders: 0, deliveredOrders: 0, ...emptyFinancials() };
  for (const order of orders) {
    if (dayKey(order.createdAt, timeZone) === date) snapshot.orders += 1;
    const revenueOrder = REVENUE_ORDER_STATUSES.has(String(order.status || ''));
    const revenueAt = order.paidAt || order.deliveredAt || order.createdAt;
    if (revenueOrder && dayKey(revenueAt, timeZone) === date) {
      snapshot.paidOrders += 1;
      addOrderFinancials(snapshot, order);
    }
    const deliveredAt = order.deliveredAt || order.paidAt || order.createdAt;
    if (String(order.status || '') === 'delivered' && dayKey(deliveredAt, timeZone) === date) {
      snapshot.deliveredOrders += 1;
    }
  }
  return finalizedFinancials(snapshot);
}

function hourlySnapshot(orders, date, timeZone) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    date,
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    orders: 0,
    paidOrders: 0,
    deliveredOrders: 0,
    ...emptyFinancials()
  }));
  for (const order of orders) {
    if (dayKey(order.createdAt, timeZone) === date) {
      const createdHour = hourIndex(order.createdAt, timeZone);
      if (createdHour >= 0) buckets[createdHour].orders += 1;
    }
    const revenueOrder = REVENUE_ORDER_STATUSES.has(String(order.status || ''));
    const revenueAt = order.paidAt || order.deliveredAt || order.createdAt;
    if (revenueOrder && dayKey(revenueAt, timeZone) === date) {
      const revenueHour = hourIndex(revenueAt, timeZone);
      if (revenueHour >= 0) {
        buckets[revenueHour].paidOrders += 1;
        addOrderFinancials(buckets[revenueHour], order);
      }
    }
    const deliveredAt = order.deliveredAt || order.paidAt || order.createdAt;
    if (String(order.status || '') === 'delivered' && dayKey(deliveredAt, timeZone) === date) {
      const deliveredHour = hourIndex(deliveredAt, timeZone);
      if (deliveredHour >= 0) buckets[deliveredHour].deliveredOrders += 1;
    }
  }
  return buckets.map(finalizedFinancials);
}

function deltaPercent(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (!previousValue) return currentValue ? null : 0;
  return Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
}

function sumDaily(daily, start, end) {
  const totals = daily.slice(start, end).reduce((total, day) => ({
    orders: total.orders + day.orders,
    paidOrders: total.paidOrders + day.paidOrders,
    deliveredOrders: total.deliveredOrders + day.deliveredOrders,
    revenue: total.revenue + day.revenue,
    coveredRevenue: total.coveredRevenue + day.coveredRevenue,
    cost: total.cost + day.cost,
    ordersWithCost: total.ordersWithCost + day.ordersWithCost,
    ordersMissingCost: total.ordersMissingCost + day.ordersMissingCost
  }), { orders: 0, paidOrders: 0, deliveredOrders: 0, ...emptyFinancials() });
  return finalizedFinancials(totals);
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
    ...emptyFinancials()
  }]));
  const topProducts = new Map();

  for (const order of orders) {
    const createdDate = dayKey(order.createdAt, timeZone);
    if (keySet.has(createdDate)) dailyByDate.get(createdDate).orders += 1;
    const revenueOrder = REVENUE_ORDER_STATUSES.has(String(order.status || ''));
    const revenueAt = order.paidAt || order.deliveredAt || order.createdAt;
    const revenueDate = dayKey(revenueAt, timeZone);
    if (revenueOrder && keySet.has(revenueDate)) {
      const revenueDay = dailyByDate.get(revenueDate);
      const quantity = Number(order.quantity || 0);
      revenueDay.paidOrders += 1;
      addOrderFinancials(revenueDay, order);
      const sku = String(order.productSku || order.productId || 'unknown');
      const product = topProducts.get(sku) || {
        sku,
        name: String(order.productName || sku),
        orders: 0,
        units: 0,
        ...emptyFinancials()
      };
      product.orders += 1;
      product.units += quantity;
      addOrderFinancials(product, order);
      topProducts.set(sku, product);
    }
    if (String(order.status || '') === 'delivered') {
      const deliveredAt = order.deliveredAt || order.paidAt || order.createdAt;
      const deliveredDate = dayKey(deliveredAt, timeZone);
      if (keySet.has(deliveredDate)) dailyByDate.get(deliveredDate).deliveredOrders += 1;
    }
  }

  const daily = [...dailyByDate.values()].map(finalizedFinancials);
  const current7d = sumDaily(daily, Math.max(0, daily.length - 7), daily.length);
  const previous7d = sumDaily(daily, Math.max(0, daily.length - 14), Math.max(0, daily.length - 7));
  const period30d = sumDaily(daily, 0, daily.length);
  const todaySnapshot = daySnapshot(orders, keys.at(-1), timeZone);
  const yesterdaySnapshot = daySnapshot(orders, keys.at(-2), timeZone);
  const hourlyToday = hourlySnapshot(orders, keys.at(-1), timeZone);
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
    hourlyToday,
    today: {
      ...todaySnapshot,
      revenueDeltaPercent: deltaPercent(todaySnapshot.revenue, yesterdaySnapshot.revenue),
      profitDeltaPercent: deltaPercent(todaySnapshot.grossProfit, yesterdaySnapshot.grossProfit),
      orderDeltaPercent: deltaPercent(todaySnapshot.orders, yesterdaySnapshot.orders)
    },
    yesterday: yesterdaySnapshot,
    current7d: {
      ...current7d,
      revenueDeltaPercent: deltaPercent(current7d.revenue, previous7d.revenue),
      profitDeltaPercent: deltaPercent(current7d.grossProfit, previous7d.grossProfit),
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
      .map(finalizedFinancials)
      .sort((left, right) => right.revenue - left.revenue || right.units - left.units)
      .slice(0, 6),
    topProductsByProfit: [...topProducts.values()]
      .map(finalizedFinancials)
      .filter((product) => product.ordersWithCost > 0)
      .sort((left, right) => right.grossProfit - left.grossProfit || right.coveredRevenue - left.coveredRevenue)
      .slice(0, 6)
  };
}
