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
  'telegramStatusBadge',
  'seatGuardConnection',
  'seatGuardMembers',
  'seatGuardInvitations',
  'seatGuardEntitlements'
]) {
  assert.ok(html.includes(`id="${id}"`), `Admin HTML should include #${id}.`);
}

assert.ok(html.includes('lucide'), 'Admin HTML should load the Lucide icon bundle.');
assert.ok(html.includes('data-lucide="layout-dashboard"'), 'Admin nav should include Lucide nav icons.');
assert.ok(html.includes('data-lucide="refresh-cw"'), 'Refresh button should include a Lucide icon.');
assert.ok(html.includes('data-lucide="log-out"'), 'Logout button should include a Lucide icon.');
assert.ok(html.includes('data-tab="seatGuard"'), 'Admin nav should expose the Seat Guard tab.');
assert.ok(html.includes('id="seatGuardTab"'), 'Admin HTML should include the Seat Guard panel.');
assert.ok(html.includes('data-lucide="shield-check"'), 'Seat Guard nav should include a shield icon.');
assert.ok(html.includes('configured 30-day term'), 'Seat Guard should explain its fixed 30-day entitlement term.');

for (const fn of [
  'renderProductFilters',
  'filteredProducts',
  'renderProductCard',
  'renderProductEditor',
  'renderOrderTable',
  'renderOrderRecipients',
  'renderStatusPill',
  'renderSeatGuard',
  'renderSeatGuardSummary',
  'renderSeatGuardMembers',
  'renderSeatGuardInvitations',
  'renderSeatGuardEntitlements',
  'pollSeatGuardOperation',
  'runSeatGuardAction',
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
assert.ok(js.includes("state.seatGuard"), 'Admin JS should retain the latest Seat Guard snapshot.');
assert.ok(js.includes("api('/api/seat-guard')"), 'Seat Guard should load the backend reconciliation snapshot.');
assert.ok(js.includes("if (state.tab === 'seatGuard') await renderSeatGuard()"), 'Refreshing the active Seat Guard tab should reload its snapshot.');
assert.ok(js.includes("seat-guard-remove-member"), 'Removable members should expose a guarded remove action.');
assert.ok(js.includes("seat-guard-cancel-invitation"), 'Cancelable invitations should expose a guarded cancel action.');
assert.ok(js.includes('confirmation = `${verb} ${email}`'), 'Destructive Seat Guard actions should build an exact email-bound confirmation.');
assert.ok(js.includes('entered !== confirmation'), 'Seat Guard should reject an incorrect typed confirmation.');
assert.ok(js.includes('expectedEmail: email, confirmation'), 'Seat Guard mutations should send the expected email and confirmation.');
assert.ok(js.includes('actionRequestId'), 'Seat Guard mutations should preserve an explicit idempotency generation.');
assert.ok(js.includes('/api/seat-guard/operations/${encodeURIComponent(operationId)}'), 'Seat Guard should poll the returned operation until terminal.');
assert.ok(js.includes('seatGuardRiskSorted'), 'Seat Guard should sort dangerous access rows first.');
assert.ok(js.includes('<strong>30-day expiry</strong>'), 'Seat Guard should surface automatic expiry status.');
assert.ok(js.includes('PostgreSQL row mode required'), 'Seat Guard should explain when expiry cleanup storage is unsafe.');
assert.ok(html.includes('id="seatGuardMemberSearch"'), 'Seat Guard should support searching large member workspaces.');
assert.ok(html.includes('id="seatGuardInviteRiskCount"'), 'Seat Guard should surface risky invitations in its summary.');
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
assert.ok(html.includes('name="seatTermMonths"'), 'Product form should configure the Seat entitlement term.');
assert.ok(server.includes('recipientEmails: body.recipientEmails'), 'Dev order API should forward Seat recipient emails.');
assert.ok(js.includes('order.fulfillment?.recipients'), 'Order table should read recipient emails from fulfillment data.');
assert.ok(js.includes('&status=${encodeURIComponent(state.orderStatus)}'), 'Order status filters should query the server before pagination.');
assert.ok(js.includes("actionButton('complete-seat'"), 'Awaiting seat orders should expose Complete Seat.');
assert.ok(js.includes("actionButton('mark-refunded'"), 'Awaiting seat orders should expose Refund.');
assert.ok(js.includes('Resend Seat Notice'), 'Delivered Seat orders should expose a recoverable Telegram resend action.');
assert.ok(js.includes("api(`/api/orders/${id}/complete-fulfillment`"), 'Complete Seat should call the fulfillment completion endpoint.');
assert.ok(js.includes("actionButton('retry-fulfillment'"), 'Automatic Seat orders should expose a retry action.');
assert.ok(js.includes("api(`/api/orders/${id}/retry-fulfillment`"), 'Retry Auto should call the asynchronous fulfillment retry endpoint.');
assert.ok(js.includes("'confirm-retarget-fulfillment'"), 'Target changes without an operation should expose an explicit confirmation action.');
assert.ok(js.includes("confirmation !== 'RETARGET'"), 'Retargeting must require an explicit operator confirmation.');
assert.ok(js.includes('confirmTargetChange: true'), 'Confirmed target changes should be sent explicitly to the server guard.');
assert.ok(server.includes("routeParams('/api/orders/:id/retry-fulfillment'"), 'Server should expose the automatic Seat retry endpoint.');
assert.ok(server.includes("pathname === '/api/seat-guard'"), 'Server should expose the authenticated Seat Guard snapshot endpoint.');
assert.ok(server.includes("routeParams('/api/seat-guard/members/:memberId/remove'"), 'Server should expose guarded member removal.');
assert.ok(server.includes("routeParams('/api/seat-guard/invitations/:invitationId/cancel'"), 'Server should expose guarded invitation cancellation.');
assert.ok(server.includes("'seat_guard.member.remove_queued'"), 'Seat member removal should be written to the audit log.');
assert.ok(server.includes("'seat_guard.invitation.cancel_queued'"), 'Seat invitation cancellation should be written to the audit log.');
assert.ok(server.includes('await requestSeatFulfillmentRetry(params.id'), 'Retry Auto should persist a durable retry request before returning 202.');
assert.ok(server.includes('startSeatFulfillmentAutomation'), 'Server should resume pending automatic Seat operations after restart.');
assert.ok(server.includes('startSeatExpiryAutomation()'), 'Server should start the guarded Seat expiry scheduler.');
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
  '.recipient-list',
  '.seat-guard-stats',
  '.seat-guard-connection',
  '.seat-guard-table',
  '.seat-guard-reference-list'
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
