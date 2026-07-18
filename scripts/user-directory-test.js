import assert from 'node:assert/strict';
import { buildUserDirectory } from '../src/userDirectory.js';

const now = Date.parse('2026-07-18T12:00:00.000Z');
const users = [
  {
    id: 'usr_recent',
    telegramId: '1001',
    username: 'nguyen_an',
    firstName: 'Nguyễn',
    lastName: 'An',
    notificationPreferences: { promotions: true },
    createdAt: '2026-07-08T12:00:00.000Z',
    updatedAt: '2026-07-18T11:00:00.000Z'
  },
  {
    id: 'usr_refunded',
    telegramId: '1002',
    username: 'blocked_buyer',
    firstName: 'Blocked',
    notificationBlockedAt: '2026-07-10T12:00:00.000Z',
    createdAt: '2026-05-01T12:00:00.000Z',
    updatedAt: '2026-07-08T12:00:00.000Z'
  },
  {
    id: 'usr_no_orders',
    telegramId: '1003',
    username: '',
    firstName: 'No Order',
    createdAt: '2026-05-20T12:00:00.000Z',
    updatedAt: '2026-06-08T12:00:00.000Z'
  }
];
const orders = [
  {
    id: 'ord_delivered',
    userId: 'usr_recent',
    status: 'delivered',
    total: 120000,
    createdAt: '2026-07-17T12:00:00.000Z'
  },
  {
    id: 'ord_pending',
    userId: 'usr_recent',
    status: 'pending_payment',
    total: 50000,
    createdAt: '2026-07-18T10:00:00.000Z'
  },
  {
    id: 'ord_refunded',
    userId: 'usr_refunded',
    status: 'refunded',
    total: 200000,
    createdAt: '2026-07-05T12:00:00.000Z'
  }
];

const directory = buildUserDirectory({ users, orders }, { limit: 500 }, now);
assert.deepEqual(directory.metrics, {
  totalUsers: 3,
  active7d: 1,
  customers: 2,
  new30d: 1
});
assert.equal(directory.items[0].id, 'usr_recent', 'Recent activity should be the default sort.');
assert.deepEqual(directory.items[0].orders, { total: 2, paid: 1, refunded: 0, open: 1 });
assert.equal(directory.items[0].totalSpent, 120000, 'Only non-refunded paid orders should count toward spend.');
assert.equal(directory.items[0].notifications.subscribed, true);
assert.equal(directory.items[0].notificationPreferences, undefined, 'Raw notification preferences should stay out of the admin response.');
assert.equal(buildUserDirectory({ users, orders }, {}, now).limit, 100, 'The API should keep its safe default page size.');

const accentSearch = buildUserDirectory({ users, orders }, { search: 'nguyen' }, now);
assert.equal(accentSearch.total, 1, 'User search should be accent-insensitive.');
assert.equal(accentSearch.items[0].telegramId, '1001');

const customers = buildUserDirectory({ users, orders }, { segment: 'customers' }, now);
assert.equal(customers.total, 2, 'Refunded buyers should still be recognized as customers.');
assert.equal(customers.items.find((user) => user.id === 'usr_refunded').totalSpent, 0);
assert.equal(customers.items.find((user) => user.id === 'usr_refunded').notifications.blocked, true);

const noOrders = buildUserDirectory({ users, orders }, { segment: 'no-orders' }, now);
assert.deepEqual(noOrders.items.map((user) => user.id), ['usr_no_orders']);

const bySpend = buildUserDirectory({ users, orders }, { sort: 'spent', limit: 1 }, now);
assert.equal(bySpend.items[0].id, 'usr_recent');
assert.equal(bySpend.hasMore, true);
assert.equal(bySpend.total, 3);

console.log(JSON.stringify({ ok: true, checked: 'admin user directory aggregation, filtering and privacy' }, null, 2));
