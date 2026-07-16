import assert from 'node:assert/strict';
import {
  DEFAULT_CATALOG_PRODUCTS,
  brandSortKey,
  normalizeDeliveryMode,
  normalizeProductInput,
  normalizePublicProduct
} from '../src/catalog.js';

assert.ok(DEFAULT_CATALOG_PRODUCTS.length >= 10, 'Catalog should include account package products across brands.');

const bySku = new Map(DEFAULT_CATALOG_PRODUCTS.map((product) => [product.sku, product]));
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
  'chatgpt-team-slot-1m',
  'claude-pro-1m',
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
  deliveryMode: 'file'
});

assert.equal(normalizeDeliveryMode('TEXT'), 'text');
assert.equal(normalizePublicProduct({ deliveryMode: 'invalid' }).deliveryMode, 'text');
assert.throws(
  () => normalizeProductInput({ sku: 'bad-mode', name: 'Bad', price: 1, deliveryMode: 'zip' }),
  /Delivery mode must be text or file/
);

assert.equal(brandSortKey({ category: 'AI Accounts', brand: 'ChatGPT', sortOrder: 10 }), 'AI Accounts\x00ChatGPT\x00000010');

console.log(JSON.stringify({ ok: true, checked: 'catalog defaults and normalization' }, null, 2));
