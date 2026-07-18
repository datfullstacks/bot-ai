function pricingError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function normalizeTelegramUsername(value, { strict = false } = {}) {
  const username = String(value || '').trim().replace(/^@+/, '').toLowerCase();
  if (!username) {
    if (strict) throw pricingError('Telegram username is required');
    return '';
  }
  if (!/^[a-z0-9_]{1,64}$/.test(username)) {
    if (strict) throw pricingError('Telegram username may only contain letters, numbers, and underscores');
    return '';
  }
  return username;
}

export function normalizeTelegramPriceOverrides(input, validSkus = null) {
  const source = input?.prices ?? input;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw pricingError('Prices must be an object keyed by product SKU');
  }

  const allowed = validSkus ? new Set([...validSkus].map((sku) => String(sku).trim().toLowerCase())) : null;
  const prices = {};
  for (const [rawSku, rawPrice] of Object.entries(source)) {
    const sku = String(rawSku || '').trim().toLowerCase();
    if (!sku || rawPrice === '' || rawPrice === null || rawPrice === undefined) continue;
    if (allowed && !allowed.has(sku)) throw pricingError(`Unknown product SKU: ${sku}`);
    const price = Number(rawPrice);
    if (!Number.isSafeInteger(price) || price <= 0) {
      throw pricingError(`Price for ${sku || 'product'} must be a positive integer`);
    }
    prices[sku] = price;
  }
  return prices;
}

export function telegramPriceListForUser(priceLists = [], user = {}) {
  const username = normalizeTelegramUsername(user.username);
  if (!username) return null;
  return priceLists.find((item) => normalizeTelegramUsername(item?.username) === username) || null;
}

export function catalogBasePriceList(priceLists = []) {
  const entries = Array.isArray(priceLists) ? priceLists : [priceLists];
  return entries.find((item) => item?.id === 'base') || null;
}

export function resolveCatalogBasePrice(product = {}, catalogPriceLists = []) {
  const sku = String(product.sku || '').trim().toLowerCase();
  const configuredPrice = catalogBasePriceList(catalogPriceLists)?.prices?.[sku];
  const configured = Number.isSafeInteger(Number(configuredPrice)) && Number(configuredPrice) > 0;
  return {
    price: configured ? Number(configuredPrice) : Number(product.price),
    configured
  };
}

export function resolveTelegramProductPricing(product = {}, user = {}, priceLists = [], catalogPriceLists = []) {
  const priceList = telegramPriceListForUser(priceLists, user);
  const sku = String(product.sku || '').trim().toLowerCase();
  const customPrice = priceList?.prices?.[sku];
  const basePricing = resolveCatalogBasePrice(product, catalogPriceLists);
  const catalogPrice = Number(product.price);
  if (!Number.isSafeInteger(Number(customPrice)) || Number(customPrice) <= 0) {
    return {
      price: catalogPrice,
      basePrice: basePricing.price,
      catalogPrice,
      basePriceConfigured: basePricing.configured,
      personalized: false,
      username: '',
      source: 'catalog'
    };
  }
  return {
    price: Number(customPrice),
    basePrice: basePricing.price,
    catalogPrice,
    basePriceConfigured: basePricing.configured,
    personalized: true,
    username: normalizeTelegramUsername(priceList.username),
    source: 'telegram_username'
  };
}

export function applyTelegramProductPricing(product = {}, user = {}, priceLists = [], catalogPriceLists = []) {
  const pricing = resolveTelegramProductPricing(product, user, priceLists, catalogPriceLists);
  if (!pricing.personalized) return product;
  return {
    ...product,
    price: pricing.price,
    basePrice: pricing.basePrice,
    catalogPrice: pricing.catalogPrice,
    basePriceConfigured: pricing.basePriceConfigured,
    personalizedPrice: pricing.personalized
  };
}

export function orderPricingSnapshot(pricing = {}) {
  const costConfigured = pricing.basePriceConfigured === true;
  const costUnitPrice = costConfigured && Number.isSafeInteger(Number(pricing.basePrice)) && Number(pricing.basePrice) > 0
    ? Number(pricing.basePrice)
    : null;
  return {
    source: pricing.source || 'catalog',
    ...(pricing.personalized ? { username: pricing.username || '' } : {}),
    catalogPrice: Number(pricing.catalogPrice || 0),
    basePrice: Number(pricing.basePrice || 0),
    basePriceConfigured: costConfigured,
    costUnitPrice,
    costConfigured: costUnitPrice !== null
  };
}
