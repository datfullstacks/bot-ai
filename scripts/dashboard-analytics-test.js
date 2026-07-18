import assert from 'node:assert/strict';
import { buildDashboardAnalytics } from '../src/dashboardAnalytics.js';

const analytics = buildDashboardAnalytics({
  now: new Date('2026-07-18T12:00:00.000Z'),
  products: [
    { id: 'a', active: true },
    { id: 'b', active: false }
  ],
  inventory: [
    { status: 'available' },
    { status: 'available' },
    { status: 'reserved' },
    { status: 'sold' }
  ],
  orders: [
    { id: '1', createdAt: '2026-07-18T01:00:00.000Z', status: 'pending_payment', productSku: 'alpha', productName: 'Alpha', quantity: 1, total: 100 },
    { id: '2', createdAt: '2026-07-17T01:00:00.000Z', status: 'delivered', productSku: 'alpha', productName: 'Alpha', quantity: 2, total: 200 },
    { id: '3', createdAt: '2026-07-16T01:00:00.000Z', status: 'awaiting_fulfillment', productSku: 'beta', productName: 'Beta', quantity: 1, total: 150 },
    { id: '4', createdAt: '2026-07-10T01:00:00.000Z', status: 'delivered', productSku: 'alpha', productName: 'Alpha', quantity: 1, total: 50 },
    { id: '5', createdAt: '2026-06-01T01:00:00.000Z', status: 'refunded', productSku: 'old', productName: 'Old', quantity: 1, total: 999 }
  ],
  payments: [
    { status: 'paid' },
    { status: 'pending' },
    { status: 'amount_mismatch' }
  ]
});

assert.equal(analytics.daily.length, 30);
assert.equal(analytics.timeZone, 'Asia/Bangkok');
assert.deepEqual(analytics.today, {
  date: '2026-07-18',
  orders: 1,
  paidOrders: 0,
  deliveredOrders: 0,
  revenue: 0,
  revenueDeltaPercent: -100,
  orderDeltaPercent: 0
});
assert.deepEqual(analytics.yesterday, {
  date: '2026-07-17',
  orders: 1,
  paidOrders: 1,
  deliveredOrders: 1,
  revenue: 200
});
assert.deepEqual(analytics.products, { total: 2, active: 1, inactive: 1 });
assert.equal(analytics.inventory.available, 2);
assert.equal(analytics.inventory.reserved, 1);
assert.equal(analytics.inventory.sold, 1);
assert.equal(analytics.current7d.orders, 3);
assert.equal(analytics.current7d.paidOrders, 2);
assert.equal(analytics.current7d.deliveredOrders, 1);
assert.equal(analytics.current7d.revenue, 350);
assert.equal(analytics.previous7d.orders, 1);
assert.equal(analytics.previous7d.revenue, 50);
assert.equal(analytics.current7d.revenueDeltaPercent, 600);
assert.equal(analytics.period30d.orders, 4);
assert.equal(analytics.period30d.revenue, 400);
assert.equal(analytics.period30d.averageOrderValue, 133);
assert.equal(analytics.period30d.paymentConversionRate, 75);
assert.equal(analytics.orderStatuses.delivered, 2);
assert.equal(analytics.orderStatuses.refunded, 1);
assert.equal(analytics.payments.total, 3);
assert.equal(analytics.payments.paid, 1);
assert.equal(analytics.topProducts[0].sku, 'alpha');
assert.equal(analytics.topProducts[0].revenue, 250);
assert.equal(analytics.topProducts[0].units, 3);
assert.equal(analytics.topProducts[1].sku, 'beta');

const localDayAnalytics = buildDashboardAnalytics({
  now: new Date('2026-07-18T01:00:00.000Z'),
  timeZone: 'Asia/Bangkok',
  orders: [
    {
      id: 'local-created',
      createdAt: '2026-07-17T18:30:00.000Z',
      status: 'pending_payment',
      total: 100
    },
    {
      id: 'local-paid',
      createdAt: '2026-07-17T10:00:00.000Z',
      paidAt: '2026-07-17T19:00:00.000Z',
      deliveredAt: '2026-07-17T20:00:00.000Z',
      status: 'delivered',
      productSku: 'timezone-product',
      productName: 'Timezone Product',
      quantity: 1,
      total: 250
    }
  ]
});
assert.equal(localDayAnalytics.today.date, '2026-07-18');
assert.equal(localDayAnalytics.today.orders, 1, 'Orders after 17:00 UTC should belong to the next Bangkok business day.');
assert.equal(localDayAnalytics.today.paidOrders, 1, 'Today revenue should follow paidAt instead of the order creation day.');
assert.equal(localDayAnalytics.today.deliveredOrders, 1, 'Today delivery should follow deliveredAt.');
assert.equal(localDayAnalytics.today.revenue, 250);

console.log(JSON.stringify({ ok: true, checked: 'dashboard analytics aggregation' }, null, 2));
