import { config } from './config.js';
import { isSeatEmailFulfillment } from './catalog.js';
import { getSeatGuardCapacitySnapshot } from './seatGuard.js';

const providers = Object.freeze(['chatgpt', 'canva', 'claude']);
const providerSet = new Set(providers);

function nonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizedProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return providerSet.has(provider) ? provider : '';
}

function integrationSkus(provider) {
  const values = config.memberFulfillment?.integrations?.[provider]?.skus;
  return new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean));
}

function providerForProduct(product = {}) {
  if (!isSeatEmailFulfillment(product)) return '';
  const sku = String(product.sku || '').trim().toLowerCase();
  if (sku) {
    for (const provider of providers) {
      if (integrationSkus(provider).has(sku)) return provider;
    }
  }

  const identity = [product.brand, product.name, product.sku]
    .map((value) => String(value || '').trim().toLowerCase())
    .join(' ');
  if (/\b(?:chatgpt|openai)\b/.test(identity)) return 'chatgpt';
  if (/\bcanva\b/.test(identity)) return 'canva';
  if (/\b(?:claude|anthropic)\b/.test(identity)) return 'claude';
  return '';
}

export function seatAvailabilityTargetForProduct(product = {}) {
  const provider = providerForProduct(product);
  if (!provider) return null;
  const integration = config.memberFulfillment?.integrations?.[provider] || {};
  const sku = String(product.sku || '').trim().toLowerCase();
  const mappedAccountRef = String(integration.accountRefsBySku?.[sku] || '').trim();
  const accountRef = mappedAccountRef || String(integration.accountRef || '').trim();
  return {
    provider,
    accountRef,
    cacheKey: `${provider}:${accountRef || 'default'}`,
    integration: mappedAccountRef ? { ...integration, accountRef: mappedAccountRef } : null
  };
}

export function seatProviderForProduct(product = {}) {
  return providerForProduct(product);
}

function availabilityTarget(input) {
  const provider = normalizedProvider(typeof input === 'object' ? input?.provider : input);
  if (!provider) return null;
  const baseIntegration = config.memberFulfillment?.integrations?.[provider] || {};
  const accountRef = String(
    (typeof input === 'object' ? input?.accountRef : '') || baseIntegration.accountRef || ''
  ).trim();
  return {
    provider,
    accountRef,
    cacheKey: String(typeof input === 'object' ? input?.cacheKey || '' : '').trim()
      || `${provider}:${accountRef || 'default'}`,
    integration: typeof input === 'object' && input?.integration ? input.integration : null
  };
}

function availabilityFromSnapshot(target, snapshot, checkedAt) {
  const capacity = snapshot?.capacity && typeof snapshot.capacity === 'object'
    ? snapshot.capacity
    : snapshot?.summary && typeof snapshot.summary === 'object'
      ? snapshot.summary
      : {};
  const remainingSlots = nonNegativeInteger(capacity.remainingSlots);
  const maxMembers = nonNegativeInteger(capacity.maxMembers);
  const usedSlots = nonNegativeInteger(capacity.usedSlots);
  const utilizationPercent = nonNegativeInteger(capacity.utilizationPercent);
  const configured = snapshot?.configured === true;
  return {
    provider: target.provider,
    accountRef: target.accountRef || null,
    cacheKey: target.cacheKey,
    configured,
    known: configured && remainingSlots !== null,
    remainingSlots,
    maxMembers,
    usedSlots,
    utilizationPercent,
    atLimit: configured && remainingSlots === 0,
    observedAt: snapshot?.observedAt || null,
    checkedAt: new Date(checkedAt).toISOString(),
    stale: false
  };
}

function unknownAvailability(target, checkedAt) {
  target = availabilityTarget(target) || { provider: '', accountRef: '', cacheKey: '' };
  return {
    provider: target.provider,
    accountRef: target.accountRef || null,
    cacheKey: target.cacheKey,
    configured: false,
    known: false,
    remainingSlots: null,
    maxMembers: null,
    usedSlots: null,
    utilizationPercent: null,
    atLimit: false,
    observedAt: null,
    checkedAt: new Date(checkedAt).toISOString(),
    stale: false
  };
}

export function createSeatAvailabilityResolver(options = {}) {
  const loadSnapshot = options.loadSnapshot || getSeatGuardCapacitySnapshot;
  const ttlMs = Math.max(1, Number(options.ttlMs ?? config.telegram.seatAvailabilityTtlMs) || 60_000);
  const staleTtlMs = Math.max(ttlMs, Number(options.staleTtlMs ?? Math.max(ttlMs * 5, 5 * 60_000)) || ttlMs);
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const cache = new Map();
  const pending = new Map();

  async function resolveAvailability(input, resolveOptions = {}) {
    const target = availabilityTarget(input);
    const checkedAt = Number(now());
    if (!target) return unknownAvailability('', checkedAt);
    const { provider, cacheKey } = target;

    const cached = cache.get(cacheKey);
    if (!resolveOptions.force && cached && checkedAt < cached.freshUntil) return cached.value;
    if (pending.has(cacheKey)) return pending.get(cacheKey);

    const request = (async () => {
      try {
        const snapshot = await loadSnapshot({
          provider,
          ...(target.integration ? { integration: target.integration } : {})
        });
        const loadedAt = Number(now());
        const value = availabilityFromSnapshot(target, snapshot, loadedAt);
        cache.set(cacheKey, {
          value,
          freshUntil: loadedAt + ttlMs,
          staleUntil: loadedAt + staleTtlMs
        });
        return value;
      } catch {
        const failedAt = Number(now());
        const previous = cache.get(cacheKey);
        if (previous?.value?.known && failedAt < previous.staleUntil) {
          const staleValue = { ...previous.value, stale: true };
          cache.set(cacheKey, {
            ...previous,
            value: staleValue,
            freshUntil: failedAt + ttlMs
          });
          return staleValue;
        }
        const value = unknownAvailability(target, failedAt);
        cache.set(cacheKey, {
          value,
          freshUntil: failedAt + ttlMs,
          staleUntil: failedAt + ttlMs
        });
        return value;
      } finally {
        pending.delete(cacheKey);
      }
    })();
    pending.set(cacheKey, request);
    return request;
  }

  resolveAvailability.clear = () => {
    cache.clear();
    pending.clear();
  };
  return resolveAvailability;
}

const resolveSeatAvailability = createSeatAvailabilityResolver();

export async function attachSeatAvailabilityToProducts(products = [], options = {}) {
  const resolveAvailability = options.resolveAvailability || resolveSeatAvailability;
  const productTargets = products.map((product) => seatAvailabilityTargetForProduct(product));
  const requestedTargets = [...new Map(productTargets
    .filter(Boolean)
    .map((target) => [target.cacheKey, target])).values()];
  const resolved = new Map(await Promise.all(requestedTargets.map(async (target) => [
    target.cacheKey,
    await resolveAvailability(target, { force: options.force === true })
  ])));

  return products.map((product, index) => {
    const target = productTargets[index];
    if (!target) return product;
    return { ...product, seatAvailability: resolved.get(target.cacheKey) || unknownAvailability(target, Date.now()) };
  });
}

export function resetSeatAvailabilityCache() {
  resolveSeatAvailability.clear();
}
