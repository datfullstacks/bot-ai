import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const html = await readFile(resolve(process.cwd(), 'public', 'index.html'), 'utf8');
const js = await readFile(resolve(process.cwd(), 'public', 'admin.js'), 'utf8');
const css = await readFile(resolve(process.cwd(), 'public', 'styles.css'), 'utf8');
const server = await readFile(resolve(process.cwd(), 'src', 'server.js'), 'utf8');
const brandAssets = await readFile(resolve(process.cwd(), 'public', 'brand-assets.js'), 'utf8');
const { getBrandAsset } = await import('../public/brand-assets.js');

for (const id of [
  'productSearch',
  'productBrandFilter',
  'productStatusFilter',
  'orderStatusFilter',
  'systemStorageBadge',
  'telegramStatusBadge'
]) {
  assert.ok(html.includes(`id="${id}"`), `Admin HTML should include #${id}.`);
}

assert.ok(html.includes('lucide'), 'Admin HTML should load the Lucide icon bundle.');
assert.ok(html.includes('data-lucide="layout-dashboard"'), 'Admin nav should include Lucide nav icons.');
assert.ok(html.includes('data-lucide="refresh-cw"'), 'Refresh button should include a Lucide icon.');
assert.ok(html.includes('data-lucide="log-out"'), 'Logout button should include a Lucide icon.');

for (const fn of [
  'renderProductFilters',
  'filteredProducts',
  'renderProductCard',
  'renderProductEditor',
  'renderOrderTable',
  'renderStatusPill',
  'refreshIcons'
]) {
  assert.ok(js.includes(`function ${fn}`), `Admin JS should define ${fn}.`);
}

assert.ok(js.includes('lucide.createIcons'), 'Admin JS should refresh Lucide icons after dynamic renders.');
assert.ok(js.includes("from './brand-assets.js'"), 'Admin JS should import shared brand assets.');
assert.ok(js.includes('brandLogo('), 'Admin JS should render exact brand logos.');
assert.ok(js.includes("icon('package'"), 'Product cards should render package icons.');
assert.ok(js.includes("icon('shopping-cart'"), 'Order action buttons should render action icons.');
assert.ok(js.includes("state.productSearch"), 'Admin JS should track product search state.');
assert.ok(js.includes("state.productBrand"), 'Admin JS should track product brand filter.');
assert.ok(js.includes("state.orderStatus"), 'Admin JS should track order status filter.');
assert.ok(js.includes("filteredProducts()"), 'Product rendering should use filteredProducts().');
assert.ok(js.includes('data-product-editor'), 'Product cards should include an inline product editor form.');
assert.ok(js.includes("actionButton('import-stock'"), 'Product cards should include a quick stock import action.');
assert.ok(js.includes("api(`/api/products/${id}`"), 'Product editor should save through the existing product PATCH API.');
assert.ok(js.includes("method: 'PATCH'"), 'Product editor should patch product fields instead of recreating products.');
assert.ok(js.includes("form.elements.price.value"), 'Product editor should expose editable pricing.');
assert.equal(server.includes('100000'), false, 'Dev order API must not create fake Telegram users that break startup broadcasts.');
assert.ok(server.includes('TELEGRAM_OWNER_USER_ID'), 'Dev order API should fall back to the configured owner chat when no test chat is supplied.');
assert.ok(html.includes('name="officialPriceNote"'), 'Product form should expose official pricing notes.');
assert.ok(js.includes('product.officialPriceNote'), 'Product cards should render official pricing notes.');
for (const field of ['description', 'accountType', 'warrantyPolicy', 'replacementPolicy']) {
  assert.ok(html.includes(`name="${field}"`), `Create product form should expose ${field}.`);
  assert.ok(js.includes(`name="${field}"`), `Product editor should expose ${field}.`);
}
assert.ok(js.includes('data.hot ='), 'Product editor should save hot product flags.');
assert.ok(js.includes("setTab('inventory')"), 'Import-stock action should jump to the Inventory tab.');

for (const selector of [
  '.toolbar',
  '.product-card',
  '.product-editor',
  '.editor-grid',
  '.data-table',
  '.status-dot',
  '.quick-status',
  '.brand-section',
  '.icon',
  '.nav-icon',
  '.icon-button',
  '.brand-logo'
]) {
  assert.ok(css.includes(selector), `Admin CSS should style ${selector}.`);
}

for (const [brand, expected] of [
  ['ChatGPT', '/brand/ChatGPT.png'],
  ['Claude', '/brand/Claude.png'],
  ['Gemini', '/brand/Gemini.png'],
  ['Cursor', '/brand/Cursor.png'],
  ['Canva', 'canva.svg'],
  ['CapCut', 'Capcut-icon.svg'],
  ['Gmail', 'gmail.svg'],
  ['PayPal', 'paypal.svg'],
  ['Telegram', 'telegram.svg'],
  ['TikTok', 'tiktok.svg'],
  ['Facebook', 'facebook.svg']
]) {
  const asset = getBrandAsset(brand);
  assert.ok(brandAssets.toLowerCase().includes(brand.toLowerCase()), `Brand asset map should include ${brand}.`);
  assert.ok(asset.logo.includes(expected), `Brand asset map should use the expected logo source for ${brand}.`);
  assert.equal(asset.exact, true, `${brand} should use an exact brand logo.`);
}

assert.equal(
  /font-size:\s*clamp\(|font-size:\s*\d+vw/.test(css),
  false,
  'Admin CSS should not scale font size with viewport width.'
);

console.log(JSON.stringify({ ok: true, checked: 'admin dashboard UI structure' }, null, 2));
