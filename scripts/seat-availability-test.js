import assert from 'node:assert/strict';

process.env.STORE_DRIVER = 'json';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
process.env.AUTH_SECRET ||= 'seat-availability-test-secret';
process.env.PAYMENT_WEBHOOK_SECRET ||= 'seat-availability-payment-secret';
process.env.CLAUDE_MEMBER_ACCOUNT_REFS_BY_SKU = '';

const {
  attachSeatAvailabilityToProducts,
  createSeatAvailabilityResolver,
  seatAvailabilityTargetForProduct,
  seatProviderForProduct
} = await import('../src/seatAvailability.js');
const { config } = await import('../src/config.js');

function snapshot(provider, remainingSlots, maxMembers = 10) {
  return {
    provider,
    configured: true,
    observedAt: '2026-07-18T00:00:00.000Z',
    capacity: {
      usedSlots: maxMembers - remainingSlots,
      maxMembers,
      remainingSlots,
      utilizationPercent: Math.round(((maxMembers - remainingSlots) / maxMembers) * 100)
    }
  };
}

let clock = 1_000;
let loads = 0;
const resolver = createSeatAvailabilityResolver({
  ttlMs: 100,
  staleTtlMs: 1_000,
  now: () => clock,
  loadSnapshot: async ({ provider }) => {
    loads += 1;
    return snapshot(provider, 4);
  }
});

const [first, concurrent] = await Promise.all([
  resolver('chatgpt'),
  resolver('chatgpt')
]);
assert.equal(loads, 1, 'Concurrent requests for one provider should share a single Seat Guard request.');
assert.equal(first.remainingSlots, 4);
assert.deepEqual(concurrent, first);

clock += 50;
assert.equal((await resolver('chatgpt')).remainingSlots, 4);
assert.equal(loads, 1, 'Fresh capacity should be served from the short-lived cache.');

clock += 100;
await resolver('chatgpt');
assert.equal(loads, 2, 'Expired capacity should refresh from Seat Guard.');

let fail = false;
const staleResolver = createSeatAvailabilityResolver({
  ttlMs: 100,
  staleTtlMs: 1_000,
  now: () => clock,
  loadSnapshot: async ({ provider }) => {
    if (fail) throw new Error('member service unavailable');
    return snapshot(provider, 2, 8);
  }
});
assert.equal((await staleResolver('canva')).remainingSlots, 2);
fail = true;
clock += 101;
const stale = await staleResolver('canva');
assert.equal(stale.remainingSlots, 2);
assert.equal(stale.stale, true, 'A transient provider failure should retain the last known capacity.');

const unknownResolver = createSeatAvailabilityResolver({
  ttlMs: 100,
  now: () => clock,
  loadSnapshot: async ({ provider }) => ({ provider, configured: false, capacity: { remainingSlots: null } })
});
const unknown = await unknownResolver('claude');
assert.equal(unknown.known, false);
assert.equal(unknown.remainingSlots, null);

assert.equal(seatProviderForProduct({ sku: 'chatgpt-business-seat-1m', fulfillmentMode: 'seat_email' }), 'chatgpt');
assert.equal(seatProviderForProduct({ brand: 'Canva', fulfillmentMode: 'seat_email' }), 'canva');
assert.equal(seatProviderForProduct({ name: 'Anthropic Business Seat', fulfillmentMode: 'seat_email' }), 'claude');
assert.equal(seatProviderForProduct({ brand: 'ChatGPT', fulfillmentMode: 'inventory' }), '');

let claudeLoads = 0;
const products = await attachSeatAvailabilityToProducts([
  { sku: 'claude-business-seat-1x-1m', brand: 'Claude', fulfillmentMode: 'seat_email' },
  { sku: 'claude-business-seat-6-5x-1m', brand: 'Claude', fulfillmentMode: 'seat_email' },
  { sku: 'chatgpt-plus-1m', brand: 'ChatGPT', fulfillmentMode: 'inventory' }
], {
  resolveAvailability: async (target) => {
    claudeLoads += 1;
    return {
      provider: target.provider,
      accountRef: target.accountRef,
      cacheKey: target.cacheKey,
      configured: true,
      known: true,
      remainingSlots: 3,
      maxMembers: 10,
      stale: false
    };
  }
});
assert.equal(claudeLoads, 1, 'Multiple plans on one workspace should resolve capacity only once.');
assert.equal(products[0].seatAvailability.remainingSlots, 3);
assert.equal(products[1].seatAvailability.remainingSlots, 3);
assert.equal(products[2].seatAvailability, undefined);

config.memberFulfillment.integrations.claude.accountRefsBySku = {
  'claude-business-seat-1x-1m': 'claude-standard@example.com',
  'claude-business-seat-6-5x-1m': 'claude-premium@example.com'
};
const standardTarget = seatAvailabilityTargetForProduct({
  sku: 'claude-business-seat-1x-1m',
  brand: 'Claude',
  fulfillmentMode: 'seat_email'
});
const premiumTarget = seatAvailabilityTargetForProduct({
  sku: 'claude-business-seat-6-5x-1m',
  brand: 'Claude',
  fulfillmentMode: 'seat_email'
});
assert.equal(standardTarget.accountRef, 'claude-standard@example.com');
assert.equal(premiumTarget.accountRef, 'claude-premium@example.com');
assert.notEqual(standardTarget.cacheKey, premiumTarget.cacheKey, 'Capacity caches must be isolated per workspace.');

let workspaceLoads = 0;
const mappedProducts = await attachSeatAvailabilityToProducts([
  { sku: 'claude-business-seat-1x-1m', brand: 'Claude', fulfillmentMode: 'seat_email' },
  { sku: 'claude-business-seat-6-5x-1m', brand: 'Claude', fulfillmentMode: 'seat_email' }
], {
  resolveAvailability: async (target) => {
    workspaceLoads += 1;
    return {
      provider: target.provider,
      accountRef: target.accountRef,
      cacheKey: target.cacheKey,
      configured: true,
      known: true,
      remainingSlots: target.accountRef.includes('standard') ? 1 : 5,
      maxMembers: 10,
      stale: false
    };
  }
});
assert.equal(workspaceLoads, 2, 'Plans mapped to different Claude workspaces need separate capacity checks.');
assert.deepEqual(mappedProducts.map((product) => product.seatAvailability.remainingSlots), [1, 5]);

console.log('Seat availability tests passed.');
