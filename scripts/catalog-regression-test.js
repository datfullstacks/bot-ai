import assert from 'node:assert/strict';
import {
  DEFAULT_CATALOG_PRODUCTS,
  brandSortKey,
  normalizeDeliveryMode,
  normalizeFulfillmentMode,
  normalizeProductEmoji,
  normalizeProductInput,
  normalizePublicProduct
} from '../src/catalog.js';

assert.ok(DEFAULT_CATALOG_PRODUCTS.length >= 10, 'Catalog should include account package products across brands.');

const bySku = new Map(DEFAULT_CATALOG_PRODUCTS.map((product) => [product.sku, product]));
assert.equal(bySku.get('gemini-advanced-1m')?.emoji, '✨', 'Gemini should ship with its catalog emoji.');
assert.equal(
  bySku.size,
  DEFAULT_CATALOG_PRODUCTS.length,
  'Default catalog SKUs must be unique.'
);
for (const product of DEFAULT_CATALOG_PRODUCTS) {
  const visibleText = `${product.name} ${product.description} ${product.accountType} ${product.warrantyPolicy} ${product.replacementPolicy}`;
  assert.equal(
    /Ã|Â|Æ|Ä|áº|á»/.test(visibleText),
    false,
    `Catalog text should be readable UTF-8, found mojibake in ${product.sku}`
  );
  assert.ok(product.accountType, `${product.sku} should describe the account type.`);
  assert.ok(product.warrantyPolicy, `${product.sku} should describe warranty coverage.`);
  assert.ok(product.replacementPolicy, `${product.sku} should describe replacement conditions.`);
  assert.equal(product.deliveryMode, 'text', `${product.sku} should default to text delivery.`);
}

for (const sku of [
  'chatgpt-plus-1m',
  'chatgpt-business-seat-1m',
  'claude-pro-1m',
  'claude-business-seat-1x-1m',
  'claude-business-seat-6-5x-1m',
  'gemini-advanced-1m',
  'cursor-pro-1m',
  'canva-pro-1m',
  'figma-pro-1m',
  'gmail-aged-pack-10',
  'paypal-business-verified-1',
  'facebook-aged-pack-5',
  'telegram-aged-pack-10',
  'tiktok-aged-pack-5'
]) {
  assert.ok(bySku.has(sku), `Missing default catalog SKU ${sku}`);
}

assert.equal(
  bySku.has('chatgpt-team-slot-1m'),
  false,
  'Legacy ChatGPT Team Slot SKU should be replaced by ChatGPT Business Seat.'
);

for (const expected of [
  {
    sku: 'chatgpt-business-seat-1m',
    name: 'ChatGPT Business Seat 1M',
    packageType: 'Business Seat 1M',
    price: 400000
  },
  {
    sku: 'claude-business-seat-1x-1m',
    name: 'Claude Business Seat 1x 1M',
    packageType: 'Business Seat 1x 1M',
    price: 400000
  },
  {
    sku: 'claude-business-seat-6-5x-1m',
    name: 'Claude Business Seat 6.5x 1M',
    packageType: 'Business Seat 6.5x 1M',
    price: 1800000
  }
]) {
  const product = bySku.get(expected.sku);
  assert.ok(product, `Missing seat product ${expected.sku}.`);
  assert.equal(product.name, expected.name, `${expected.sku} should use the expected name.`);
  assert.equal(product.packageType, expected.packageType, `${expected.sku} should use the expected package type.`);
  assert.equal(product.price, expected.price, `${expected.sku} should use the expected price.`);
  assert.equal(product.hot, true, `${expected.sku} should appear in the hot-product list.`);
  assert.equal(product.fulfillmentMode, 'seat_email', `${expected.sku} should collect customer emails instead of inventory.`);
  assert.equal(product.deliveryMode, 'text', `${expected.sku} should use text delivery.`);
  assert.match(product.accountType, /seat/i, `${expected.sku} should explicitly describe the seat account type.`);
  assert.match(product.warrantyPolicy, /1 tháng/i, `${expected.sku} should explicitly cover the one-month term.`);
  assert.match(product.replacementPolicy, /đổi seat/i, `${expected.sku} should explicitly describe seat replacement.`);
}

assert.match(
  bySku.get('claude-business-seat-6-5x-1m').officialPriceNote,
  /shop tier.*not an official Anthropic plan name/i
);

for (const sku of ['canva-pro-1m', 'canva-pro-6m']) {
  const product = bySku.get(sku);
  assert.equal(product.fulfillmentMode, 'seat_email', `${sku} should collect the customer email for Canva invite.`);
  assert.match(product.name, /Nonprofit/i, `${sku} should identify the nonprofit Seat.`);
  assert.match(product.accountType, /Seat/i, `${sku} should describe a Canva team Seat.`);
}

const defaultBrands = new Set(DEFAULT_CATALOG_PRODUCTS.map((product) => product.brand));
for (const brand of ['Gmail', 'PayPal', 'Cursor', 'TikTok', 'Facebook', 'Figma']) {
  assert.ok(defaultBrands.has(brand), `Missing default catalog brand ${brand}`);
}

for (const sku of ['chatgpt-plus-1m', 'cursor-pro-1m', 'gmail-aged-pack-10', 'tiktok-aged-pack-5']) {
  assert.equal(bySku.get(sku).hot, true, `Expected ${sku} to be marked hot.`);
}

assert.match(bySku.get('cursor-pro-1m').officialPriceNote, /\$20\/mo/i);
assert.match(bySku.get('figma-pro-1m').officialPriceNote, /Professional/i);
assert.match(bySku.get('paypal-business-verified-1').officialPriceNote, /fees/i);

assert.deepEqual(
  {
    category: bySku.get('chatgpt-plus-1m').category,
    brand: bySku.get('chatgpt-plus-1m').brand,
    packageType: bySku.get('chatgpt-plus-1m').packageType
  },
  {
    category: 'AI Accounts',
    brand: 'ChatGPT',
    packageType: 'Plus 1M'
  }
);

const normalized = normalizeProductInput({
  sku: '  ChatGPT-PLUS-1M  ',
  name: ' ChatGPT Plus 1 tháng ',
  description: ' Gói tài khoản AI ',
  category: '',
  brand: '  ChatGPT ',
  emoji: '🤖',
  packageType: ' Plus 1M ',
  price: '99000',
  currency: '',
  hot: true,
  officialPriceNote: 'Official: $20/mo',
  accountType: 'Tài khoản riêng',
  warrantyPolicy: 'Bảo hành 30 ngày',
  replacementPolicy: 'Đổi khi lỗi bàn giao',
  deliveryMode: ' FILE '
});

assert.deepEqual(normalized, {
  sku: 'chatgpt-plus-1m',
  name: 'ChatGPT Plus 1 tháng',
  description: 'Gói tài khoản AI',
  category: 'Accounts',
  brand: 'ChatGPT',
  emoji: '🤖',
  packageType: 'Plus 1M',
  price: 99000,
  currency: 'VND',
  sortOrder: 1000,
  active: true,
  hot: true,
  officialPriceNote: 'Official: $20/mo',
  accountType: 'Tài khoản riêng',
  warrantyPolicy: 'Bảo hành 30 ngày',
  replacementPolicy: 'Đổi khi lỗi bàn giao',
  fulfillmentMode: 'inventory',
  deliveryMode: 'file'
});

assert.equal(normalizeFulfillmentMode('SEAT_EMAIL'), 'seat_email');
assert.equal(normalizeFulfillmentMode('', { sku: 'chatgpt-business-seat-1m' }), 'seat_email');
assert.equal(normalizePublicProduct({ sku: 'regular-product' }).fulfillmentMode, 'inventory');
assert.equal(normalizeProductEmoji('👨‍💻', { strict: true }), '👨‍💻');
assert.throws(() => normalizeProductEmoji('✨🚀', { strict: true }), /exactly one emoji/);
assert.equal(normalizeDeliveryMode('TEXT'), 'text');
assert.equal(normalizePublicProduct({ deliveryMode: 'invalid' }).deliveryMode, 'text');
assert.throws(
  () => normalizeProductInput({ sku: 'bad-fulfillment', name: 'Bad', price: 1, fulfillmentMode: 'warehouse' }),
  /Fulfillment mode must be inventory or seat_email/
);
assert.throws(
  () => normalizeProductInput({ sku: 'bad-mode', name: 'Bad', price: 1, deliveryMode: 'zip' }),
  /Delivery mode must be text or file/
);

assert.equal(brandSortKey({ category: 'AI Accounts', brand: 'ChatGPT', sortOrder: 10 }), 'AI Accounts\x00ChatGPT\x00000010');

console.log(JSON.stringify({ ok: true, checked: 'catalog defaults and normalization' }, null, 2));
