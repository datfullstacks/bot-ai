import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const html = await readFile(resolve(process.cwd(), 'public', 'index.html'), 'utf8');
const js = await readFile(resolve(process.cwd(), 'public', 'admin.js'), 'utf8');
const css = await readFile(resolve(process.cwd(), 'public', 'styles.css'), 'utf8');
const server = await readFile(resolve(process.cwd(), 'src', 'server.js'), 'utf8');
const catalogSeed = await readFile(resolve(process.cwd(), 'scripts', 'seed-catalog.js'), 'utf8');
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
  'renderOrderRecipients',
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
assert.ok(js.includes("actionButton('import-stock'"), 'Inventory-managed product cards should include a quick stock import action.');
assert.ok(js.includes("seatEmail ? '' : actionButton('import-stock'"), 'Seat products should hide the stock import action.');
assert.ok(js.includes("api(`/api/products/${id}`"), 'Product editor should save through the existing product PATCH API.');
assert.ok(js.includes("method: 'PATCH'"), 'Product editor should patch product fields instead of recreating products.');
assert.ok(js.includes("form.elements.price.value"), 'Product editor should expose editable pricing.');
assert.equal(server.includes('100000'), false, 'Dev order API must not create fake Telegram users that break startup broadcasts.');
assert.ok(server.includes('TELEGRAM_OWNER_USER_ID'), 'Dev order API should fall back to the configured owner chat when no test chat is supplied.');
assert.ok(html.includes('name="officialPriceNote"'), 'Product form should expose official pricing notes.');
assert.ok(js.includes('product.officialPriceNote'), 'Product cards should render official pricing notes.');
for (const field of ['description', 'accountType', 'warrantyPolicy', 'replacementPolicy', 'deliveryMode', 'fulfillmentMode']) {
  assert.ok(html.includes(`name="${field}"`), `Create product form should expose ${field}.`);
  assert.ok(js.includes(`name="${field}"`), `Product editor should expose ${field}.`);
}
assert.ok(html.includes('TXT file'), 'Create product form should expose TXT delivery.');
assert.ok(js.includes('Text message'), 'Product cards/editor should expose text delivery.');
assert.ok(js.includes('data.hot ='), 'Product editor should save hot product flags.');
assert.ok(js.includes("setTab('inventory')"), 'Import-stock action should jump to the Inventory tab.');
assert.ok(html.includes('value="seat_email"'), 'Create product form should expose seat-email fulfillment.');
assert.ok(html.includes('Seat via customer emails'), 'Create product form should explain seat-email fulfillment.');
assert.ok(js.includes("filter((product) => !isSeatEmailProduct(product))"), 'Inventory selector should exclude seat-email products.');
assert.ok(js.includes("return !isSeatEmailProduct(catalogProduct)"), 'Low-stock summary should exclude seat-email products.');
assert.ok(html.includes('value="awaiting_fulfillment"'), 'Order filter should expose awaiting fulfillment status.');
assert.ok(html.includes('id="statAwaitingSeat"'), 'Overview should expose the paid Seat fulfillment queue count.');
assert.ok(html.includes('name="recipientEmails"'), 'Dev order form should accept Seat emails one per line.');
assert.ok(server.includes('recipientEmails: body.recipientEmails'), 'Dev order API should forward Seat recipient emails.');
assert.ok(js.includes('order.fulfillment?.recipients'), 'Order table should read recipient emails from fulfillment data.');
assert.ok(js.includes('&status=${encodeURIComponent(state.orderStatus)}'), 'Order status filters should query the server before pagination.');
assert.ok(js.includes("actionButton('complete-seat'"), 'Awaiting seat orders should expose Complete Seat.');
assert.ok(js.includes("actionButton('mark-refunded'"), 'Awaiting seat orders should expose Refund.');
assert.ok(js.includes('Resend Seat Notice'), 'Delivered Seat orders should expose a recoverable Telegram resend action.');
assert.ok(js.includes("api(`/api/orders/${id}/complete-fulfillment`"), 'Complete Seat should call the fulfillment completion endpoint.');
assert.ok(js.includes("actionButton('retry-fulfillment'"), 'Automatic Seat orders should expose a retry action.');
assert.ok(js.includes("api(`/api/orders/${id}/retry-fulfillment`"), 'Retry Auto should call the asynchronous fulfillment retry endpoint.');
assert.ok(server.includes("routeParams('/api/orders/:id/retry-fulfillment'"), 'Server should expose the automatic Seat retry endpoint.');
assert.ok(server.includes('await requestSeatFulfillmentRetry(params.id'), 'Retry Auto should persist a durable retry request before returning 202.');
assert.ok(server.includes('startSeatFulfillmentAutomation'), 'Server should resume pending automatic Seat operations after restart.');
assert.ok(js.includes('automaticFulfillmentProvider'), 'Admin automation actions should use the backend SKU mapping instead of hardcoded SKUs.');
assert.ok(js.includes("actionButton('refund-after-cleanup'"), 'Failed external operations should require cleanup before refund.');
assert.ok(js.includes('confirmExternalCleanup: true'), 'Confirmed cleanup should be sent explicitly to the refund guard.');
assert.ok(js.includes("['failed', 'blocked'].includes(automation.status)"), 'Retry Auto should be limited to recoverable terminal states.');
assert.ok(js.includes("automation.status === 'retrying'"), 'Retry Now should be available for a scheduled retry.');
assert.ok(js.includes("automation.status === 'verification_required'"), 'Unknown external outcomes should require verification.');
assert.ok(
  js.includes("if (automation.status === 'verification_required') return 'cleanup_required';"),
  'Unknown external outcomes must require cleanup confirmation before refund, even without an operation id.'
);
assert.ok(js.includes("actionButton('complete-after-verification'"), 'External operations should expose a verification-gated manual completion action.');
assert.ok(js.includes("confirmation !== 'VERIFIED'"), 'Manual completion after an external operation should require explicit verification.');
assert.ok(js.includes('confirmExternalVerification: true'), 'Verified manual completion should send an explicit server-side confirmation.');
for (const field of ['automation.attempt', 'automation.retryCount', 'automation.nextRetryAt', 'automation.error?.message']) {
  assert.ok(js.includes(field), `Automation diagnostics should render ${field}.`);
}
assert.ok(server.includes("isSeatEmailFulfillment(delivery.order?.productSnapshot)"), 'Seat completion notices should be resendable without inventory secrets.');
assert.ok(catalogSeed.includes('fulfillmentMode: product.fulfillmentMode'), 'Catalog seed should synchronize fulfillment mode.');

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
  '.brand-logo',
  '.seat-fulfillment-strip',
  '.recipient-list'
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
