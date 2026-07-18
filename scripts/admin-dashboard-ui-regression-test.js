import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const html = await readFile(resolve(process.cwd(), 'public', 'index.html'), 'utf8');
const js = await readFile(resolve(process.cwd(), 'public', 'admin.js'), 'utf8');
const css = await readFile(resolve(process.cwd(), 'public', 'styles.css'), 'utf8');
const server = await readFile(resolve(process.cwd(), 'src', 'server.js'), 'utf8');
const catalogSeed = await readFile(resolve(process.cwd(), 'scripts', 'seed-catalog.js'), 'utf8');
const brandAssets = await readFile(resolve(process.cwd(), 'public', 'brand-assets.js'), 'utf8');
const telegramPricing = await readFile(resolve(process.cwd(), 'src', 'telegramPricing.js'), 'utf8');
const jsonShopStore = await readFile(resolve(process.cwd(), 'src', 'shopStores', 'jsonShopStore.js'), 'utf8');
const postgresShopStore = await readFile(resolve(process.cwd(), 'src', 'shopStores', 'postgresShopStore.js'), 'utf8');
const postgresStore = await readFile(resolve(process.cwd(), 'src', 'postgresStore.js'), 'utf8');
const dashboardAnalytics = await readFile(resolve(process.cwd(), 'src', 'dashboardAnalytics.js'), 'utf8');
const discountCodes = await readFile(resolve(process.cwd(), 'src', 'discountCodes.js'), 'utf8');
const notificationCenter = await readFile(resolve(process.cwd(), 'src', 'notificationCenter.js'), 'utf8');
const shop = await readFile(resolve(process.cwd(), 'src', 'shop.js'), 'utf8');
const telegram = await readFile(resolve(process.cwd(), 'src', 'telegram.js'), 'utf8');
const { getBrandAsset } = await import('../public/brand-assets.js');

for (const id of [
  'productSearch',
  'productBrandFilter',
  'productStatusFilter',
  'productSort',
  'productFilterReset',
  'productCreateToggle',
  'productCreateContent',
  'productCreateToggleMeta',
  'productCreateDraftStatus',
  'productAiTitle',
  'productAiBadge',
  'productAiPrompt',
  'productAiGenerate',
  'productAiStatus',
  'productBrandInput',
  'productEmojiInput',
  'productArtworkInput',
  'productEmojiPreview',
  'productNameInput',
  'productSkuInput',
  'productSkuGenerate',
  'productDescriptionCount',
  'productPriceCurrencySuffix',
  'productCreateProgressLabel',
  'productCreateProgressBar',
  'productCreatePreview',
  'productCreateChecklist',
  'productCreateError',
  'productCreateReset',
  'productCreateSubmit',
  'productCreateClose',
  'productMetricActive',
  'productMetricStock',
  'productMetricLowStock',
  'productMetricSeat',
  'productFilterSummary',
  'productGroupSummary',
  'discountsTab',
  'discountForm',
  'discountCreateToggle',
  'discountCreatePanel',
  'discountCreateClose',
  'discountCodeInput',
  'discountGenerateBtn',
  'discountValueInput',
  'discountValueSuffix',
  'discountCreateChecklist',
  'discountFormError',
  'discountFormReset',
  'discountFormSubmit',
  'discountCodeCount',
  'discountCodesList',
  'discountMetricTotal',
  'discountMetricActive',
  'discountMetricReserved',
  'discountMetricUsed',
  'discountMetricUnavailable',
  'discountFormPreview',
  'discountSearch',
  'discountStatusFilter',
  'discountFilterReset',
  'discountFilterSummary',
  'notificationsTab',
  'notificationForm',
  'notificationMetricCampaigns',
  'notificationMetricSent',
  'notificationMetricSubscribers',
  'notificationMetricFailed',
  'notificationMetricClicked',
  'notificationMessage',
  'notificationMessageCount',
  'notificationAudienceValueField',
  'notificationUserOptions',
  'notificationCtaValueField',
  'notificationPreview',
  'notificationFormError',
  'notificationScheduleBtn',
  'notificationSendBtn',
  'notificationCampaignsList',
  'adminSidebar',
  'sidebarToggle',
  'sidebarClose',
  'sidebarBackdrop',
  'catalogPricingForm',
  'catalogPricingProducts',
  'catalogBasePriceCount',
  'telegramPricingUsername',
  'telegramPricingProducts',
  'telegramPricingLists',
  'orderStatusFilter',
  'systemStorageBadge',
  'telegramStatusBadge',
  'seatGuardConnection',
  'seatGuardProviderSwitcher',
  'seatGuardProviderLabel',
  'seatGuardCapacityCount',
  'seatGuardRemainingCount',
  'seatGuardMembers',
  'seatGuardInvitations',
  'seatGuardEntitlements',
  'revenueTrendChart',
  'orderStatusChart',
  'topProductsChart',
  'operationsFunnel',
  'analyticsGeneratedAt',
  'statProfit',
  'statProfitMeta',
  'todayOverviewTitle',
  'todayDateLabel',
  'todayRevenue',
  'todayRevenueMeta',
  'todayProfit',
  'todayProfitMeta',
  'todayOrders',
  'todayOrdersMeta',
  'todayPaidOrders',
  'todayDeliveredOrders'
]) {
  assert.ok(html.includes(`id="${id}"`), `Admin HTML should include #${id}.`);
}

assert.ok(html.includes('lucide'), 'Admin HTML should load the Lucide icon bundle.');
assert.ok(html.includes('data-lucide="layout-dashboard"'), 'Admin nav should include Lucide nav icons.');
assert.ok(html.includes('data-lucide="refresh-cw"'), 'Refresh button should include a Lucide icon.');
assert.ok(html.includes('data-lucide="log-out"'), 'Logout button should include a Lucide icon.');
assert.ok(html.includes('data-tab="seatGuard"'), 'Admin nav should expose the Seat Guard tab.');
assert.ok(html.includes('data-tab="pricing"'), 'Admin nav should expose Telegram username pricing.');
assert.ok(html.includes('data-tab="discounts"'), 'Admin nav should expose one-time discount management.');
assert.ok(html.includes('data-tab="notifications"'), 'Admin nav should expose the Notification Center.');
assert.ok(html.includes('id="seatGuardTab"'), 'Admin HTML should include the Seat Guard panel.');
assert.ok(html.includes('data-lucide="shield-check"'), 'Seat Guard nav should include a shield icon.');
assert.ok(html.includes('thời hạn 30 ngày'), 'Seat Guard should explain its fixed 30-day entitlement term.');
for (const provider of ['chatgpt', 'canva', 'claude']) {
  assert.ok(html.includes(`data-seat-guard-provider="${provider}"`), `Seat Guard should expose the ${provider} provider.`);
}
assert.ok(html.includes('<html lang="vi">'), 'Admin content should declare Vietnamese as its primary language.');
assert.ok(html.includes('aria-controls="productCreateContent"'), 'Create-product accordion should expose its controlled region.');
assert.ok(html.includes('id="productCreateContent" class="accordion-content hidden"'), 'Create-product accordion should start closed.');
assert.ok(html.includes('type="radio" name="fulfillmentMode"'), 'Create-product flow should choose fulfillment before showing related fields.');
assert.ok(html.includes('data-product-inventory-fields'), 'Create-product flow should expose inventory-only controls.');
assert.ok(html.includes('data-product-seat-fields'), 'Create-product flow should expose Seat-only controls.');
assert.ok(html.includes('data-product-seat-term="12"'), 'Create-product flow should provide quick Seat-term presets.');
assert.ok(html.includes('data-product-brand="Gemini"'), 'Create-product flow should expose Gemini as a visible brand preset.');
assert.ok(html.includes('data-product-emoji="✨"'), 'Create-product flow should expose an accessible product emoji picker.');
assert.ok(html.includes('/brand/Gemini.png'), 'Gemini assistant and brand preset should use the exact local logo.');
assert.ok(html.includes('<details class="product-optional-details">'), 'Optional policies should not crowd primary fields.');
assert.ok(html.includes('role="progressbar"'), 'Create-product flow should expose accessible completion progress.');
assert.ok(js.includes('deliveryMode.disabled = seatEmail'), 'Hidden inventory fields should not be submitted for Seat products.');
assert.ok(js.includes('seatTermMonths.disabled = !seatEmail'), 'Hidden Seat fields should not be submitted for inventory products.');
assert.ok(js.includes("productForm.addEventListener('invalid'"), 'Create-product validation should surface an inline error summary.');

for (const fn of [
  'renderProductFilters',
  'renderProductCatalogMetrics',
  'renderDiscountCodes',
  'discountDisplayState',
  'filteredDiscountCodes',
  'renderDiscountMetrics',
  'renderDiscountFormPreview',
  'newDiscountCode',
  'setDiscountCreateOpen',
  'resetDiscountForm',
  'copyDiscountCode',
  'syncNotificationForm',
  'renderNotifications',
  'refreshNotifications',
  'setSidebarOpen',
  'setButtonBusy',
  'setProductCreateOpen',
  'defaultProductEmoji',
  'loadProductAssistantStatus',
  'applyGeminiProductDraft',
  'productSkuSlug',
  'generateProductSku',
  'renderProductCreateExperience',
  'resetProductCreateForm',
  'toggleProductEditor',
  'filteredProducts',
  'renderProductCard',
  'renderProductEditor',
  'todayDeltaLabel',
  'renderCatalogPricingProducts',
  'catalogBasePrices',
  'resolvedCatalogBasePrice',
  'renderTelegramPricing',
  'renderTelegramPricingProducts',
  'renderRevenueTrendChart',
  'renderOrderStatusChart',
  'renderTopProductsChart',
  'renderOperationsFunnel',
  'renderDashboardAnalytics',
  'renderOrderTable',
  'renderOrderRecipients',
  'renderStatusPill',
  'renderSeatGuard',
  'renderSeatGuardSummary',
  'renderSeatGuardMembers',
  'renderSeatGuardInvitations',
  'renderSeatGuardEntitlements',
  'syncSeatGuardProviderControls',
  'pollSeatGuardOperation',
  'runSeatGuardAction',
  'refreshIcons'
]) {
  assert.ok(js.includes(`function ${fn}`), `Admin JS should define ${fn}.`);
}

assert.ok(js.includes('lucide.createIcons'), 'Admin JS should refresh Lucide icons after dynamic renders.');
assert.ok(js.includes("event.key === 'Escape'"), 'The mobile navigation drawer should close with Escape.');
assert.ok(js.includes("setAttribute('aria-expanded'"), 'The mobile navigation trigger should expose its expanded state.');
assert.ok(js.includes('closeSidebarAndRestoreFocus'), 'Closing the mobile drawer should return focus to its trigger.');
assert.ok(html.includes('data-dashboard-range="7"'), 'Overview trend chart should expose a seven-day range.');
assert.ok(html.includes('data-dashboard-range="1"'), 'Overview trend chart should expose a today range.');
assert.ok(html.includes('data-dashboard-range="30"'), 'Overview trend chart should expose a thirty-day range.');
assert.ok(html.includes('Nhịp vận hành trong ngày'), 'Overview should expose a dedicated today snapshot.');
assert.ok(js.includes('analytics.today'), 'Overview should render the backend today analytics contract.');
assert.ok(js.includes('analytics.hourlyToday'), 'The today chart should render all 24 local-hour buckets.');
assert.ok(js.includes("'Hôm nay 00:00–23:59'"), 'The today chart should state its full-day time range.');
assert.ok(html.includes('aria-pressed="true"'), 'The active chart range should expose its pressed state.');
assert.ok(html.includes('class="stat-icon"'), 'Overview statistics should include visual metric icons.');
assert.ok(html.includes('class="auth-security"'), 'Login should expose the protected-admin trust cue.');
assert.ok(js.includes("from './brand-assets.js'"), 'Admin JS should import shared brand assets.');
assert.ok(js.includes('brandLogo('), 'Admin JS should render exact brand logos.');
assert.ok(js.includes('productArtwork('), 'Admin JS should render product-specific plan artwork.');
assert.ok(js.includes("icon('package'"), 'Product cards should render package icons.');
assert.ok(js.includes("icon('shopping-cart'"), 'Order action buttons should render action icons.');
assert.ok(js.includes("state.productSearch"), 'Admin JS should track product search state.');
assert.ok(js.includes("state.productBrand"), 'Admin JS should track product brand filter.');
assert.ok(js.includes("productSort: 'priority'"), 'Admin JS should track the selected product catalog sort.');
assert.ok(js.includes('state.telegramPricing'), 'Admin JS should retain Telegram username price lists.');
assert.ok(js.includes('basePriceList'), 'Admin JS should retain the independent catalog base-price list.');
assert.ok(js.includes('Giá bán trên bot'), 'Base pricing should distinguish the bot sale price from the Admin reference price.');
assert.ok(js.includes("api('/api/telegram-pricing')"), 'Admin refresh should load Telegram username pricing.');
assert.ok(js.includes("api('/api/catalog-pricing'"), 'Admin should save the base price list through its authenticated API.');
assert.ok(js.includes("method: 'PUT'"), 'Admin should save a username price list with PUT.');
assert.ok(js.includes("method: 'DELETE'"), 'Admin should remove a username price list with DELETE.');
assert.ok(js.includes("state.orderStatus"), 'Admin JS should track order status filter.');
assert.ok(js.includes("state.seatGuard"), 'Admin JS should retain the latest Seat Guard snapshot.');
assert.ok(js.includes("seatGuardUrl('/api/seat-guard', provider)"), 'Seat Guard should load the selected provider snapshot.');
assert.ok(js.includes("seatGuardProvider: 'chatgpt'"), 'Seat Guard should default safely to ChatGPT.');
assert.ok(js.includes('provider=${encodeURIComponent(provider)}'), 'Seat Guard API calls should preserve the selected provider.');
assert.ok(js.includes('capacity.maxMembers'), 'Seat Guard should render the workspace member limit.');
assert.ok(js.includes('aria-label="Mức sử dụng Seat"'), 'Seat Guard capacity should expose an accessible progress indicator.');
assert.ok(js.includes("if (state.tab === 'seatGuard') await renderSeatGuard()"), 'Refreshing the active Seat Guard tab should reload its snapshot.');
assert.ok(js.includes("seat-guard-remove-member"), 'Removable members should expose a guarded remove action.');
assert.ok(js.includes("seat-guard-cancel-invitation"), 'Cancelable invitations should expose a guarded cancel action.');
assert.ok(js.includes('confirmation = `${verb} ${email}`'), 'Destructive Seat Guard actions should build an exact email-bound confirmation.');
assert.ok(js.includes('entered !== confirmation'), 'Seat Guard should reject an incorrect typed confirmation.');
assert.ok(js.includes('expectedEmail: email, confirmation'), 'Seat Guard mutations should send the expected email and confirmation.');
assert.ok(js.includes('actionRequestId'), 'Seat Guard mutations should preserve an explicit idempotency generation.');
assert.ok(js.includes('/api/seat-guard/operations/${encodeURIComponent(operationId)}'), 'Seat Guard should poll the returned operation until terminal.');
assert.ok(js.includes('seatGuardRiskSorted'), 'Seat Guard should sort dangerous access rows first.');
assert.ok(js.includes('30-day expiry</strong>'), 'Seat Guard should surface automatic expiry status.');
assert.ok(js.includes('PostgreSQL row mode'), 'Seat Guard should explain when expiry cleanup storage is unsafe.');
assert.ok(html.includes('id="seatGuardMemberSearch"'), 'Seat Guard should support searching large member workspaces.');
assert.ok(html.includes('id="seatGuardInviteRiskCount"'), 'Seat Guard should surface risky invitations in its summary.');
assert.ok(js.includes("filteredProducts()"), 'Product rendering should use filteredProducts().');
assert.ok(html.includes('data-product-health-filter="low-stock"'), 'Product health metrics should act as quick catalog filters.');
assert.ok(html.includes('<option value="inventory">Quản lý bằng kho</option>'), 'Product filters should distinguish inventory-managed products.');
assert.ok(html.includes('<option value="seat">Seat qua email</option>'), 'Product filters should distinguish Seat products.');
assert.ok(js.includes("state.productSort === 'stock-asc'"), 'Product catalog should support operational low-stock sorting.');
assert.ok(js.includes("button.setAttribute('aria-pressed'"), 'Product health quick filters should expose their pressed state.');
assert.ok(js.includes('data-product-editor'), 'Product cards should include an inline product editor form.');
assert.ok(js.includes('data-action="toggle-product-editor"'), 'Product editors should be controlled by accessible accordion buttons.');
assert.ok(js.includes('closeProductEditors('), 'Opening a product editor should close other inline editors.');
assert.ok(js.includes("actionButton('import-stock'"), 'Inventory-managed product cards should include a quick stock import action.');
assert.ok(js.includes("seatEmail ? '' : actionButton('import-stock'"), 'Seat products should hide the stock import action.');
assert.ok(js.includes("api(`/api/products/${id}`"), 'Product editor should save through the existing product PATCH API.');
assert.ok(js.includes("method: 'PATCH'"), 'Product editor should patch product fields instead of recreating products.');
assert.ok(js.includes("form.elements.price.value"), 'Product editor should expose editable pricing.');
assert.equal(server.includes('100000'), false, 'Dev order API must not create fake Telegram users that break startup broadcasts.');
assert.ok(server.includes('TELEGRAM_OWNER_USER_ID'), 'Dev order API should fall back to the configured owner chat when no test chat is supplied.');
assert.ok(server.includes("pathname === '/api/telegram-pricing'"), 'Server should expose the authenticated Telegram pricing overview.');
assert.ok(server.includes("pathname === '/api/catalog-pricing'"), 'Server should expose the authenticated base price-list update.');
assert.ok(server.includes("pathname === '/api/discount-codes'"), 'Server should expose authenticated discount list and creation endpoints.');
assert.ok(server.includes("pathname === '/api/notifications'"), 'Server should expose the authenticated notification overview.');
assert.ok(server.includes("pathname === '/api/notifications/campaigns'"), 'Server should expose notification campaign creation.');
assert.ok(server.includes("routeParams('/api/notifications/campaigns/:id/send'"), 'Server should expose queued notification sending.');
assert.ok(notificationCenter.includes('DEFAULT_NOTIFICATION_PREFERENCES'), 'Notification preferences should have explicit safe defaults.');
assert.ok(notificationCenter.includes('userAllowsNotification'), 'Campaign targeting should honor user opt-in preferences.');
assert.ok(notificationCenter.includes('buildInventoryRestockNotification'), 'Successful inventory imports should build a stock notification campaign.');
assert.ok(server.includes('inventory notification'), 'Inventory imports should queue their restock notification asynchronously.');
assert.ok(jsonShopStore.includes('claimNotificationCampaign'), 'JSON storage should claim notification campaigns idempotently.');
assert.ok(postgresShopStore.includes('claimNotificationCampaign'), 'Postgres storage should claim notification campaigns transactionally.');
assert.ok(postgresStore.includes("notificationCampaigns: 'notificationCampaigns'"), 'Document snapshots should persist notification campaigns.');
assert.ok(telegram.includes("'notifications', 'support'"), 'Telegram commands should expose the Notification Center.');
assert.ok(telegram.includes("data.startsWith('notify_pref:'"), 'Telegram should handle notification preference toggles.');
assert.ok(telegram.includes("data.startsWith('notify_cta:'"), 'Telegram should track notification CTA callbacks.');
assert.ok(telegram.includes('startNotificationCampaignAutomation'), 'Scheduled notification campaigns should have a background worker.');
assert.ok(telegram.includes('presentProductDetailCard'), 'Telegram product details should include plan artwork when configured.');
assert.ok(telegram.includes('sendTelegramPhotoFile(chatId, imagePath'), 'Telegram should send local plan artwork through the photo transport.');
assert.ok(server.includes("routeParams('/api/discount-codes/:id'"), 'Server should expose discount activation mutations.');
assert.ok(shop.includes('previewDiscountForUser'), 'The active shop store should expose discount previews to Telegram checkout.');
assert.ok(discountCodes.includes('discountReservationIsLive'), 'Discount domain should model live one-order reservations.');
assert.ok(discountCodes.includes('usageLimit: 1'), 'Public discount data should expose the fixed one-use limit.');
assert.ok(discountCodes.includes('reservedByUserId'), 'Admin discount data should expose the user holding a code.');
assert.ok(discountCodes.includes('usedByUserId'), 'Admin discount data should expose the user who consumed a code.');
assert.ok(html.includes('Giá vốn nội bộ để tính lợi nhuận') && html.includes('không dùng làm giá checkout trên bot'), 'Base pricing should be described as internal cost data.');
assert.ok(html.includes('Ô SKU để trống sẽ dùng giá bán hiện tại của sản phẩm'), 'Blank Telegram overrides should clearly retain the product sale price.');
assert.ok(html.includes('name="campaignName"'), 'Discount creation should capture an internal campaign name.');
assert.ok(html.includes('name="internalNote"'), 'Discount creation should capture a private operations note.');
assert.ok(html.includes('id="discountCreateToggle"') && html.includes('aria-controls="discountCreatePanel"'), 'Discount creation should use an accessible reveal control.');
assert.ok(html.includes('id="discountForm" class="panel discount-create-panel hidden"'), 'Discount builder should stay collapsed until the operator needs it.');
assert.ok(html.includes('data-discount-value="50000"'), 'Discount builder should expose quick value presets.');
assert.ok(html.includes('data-discount-expiry-days="none"'), 'Discount builder should expose a no-expiry shortcut.');
assert.ok(html.includes('<details class="discount-optional-details">'), 'Private voucher notes should not crowd the primary workflow.');
assert.ok(js.includes('toggle-discount-detail'), 'Discount rows should expose lifecycle details.');
assert.ok(js.includes('copy-discount-code'), 'Discount rows should provide a copy action.');
assert.ok(jsonShopStore.includes('consumeDiscountReservation'), 'JSON checkout should consume a reserved code after payment.');
assert.ok(postgresShopStore.includes('consumeDiscountReservation'), 'Postgres checkout should consume a reserved code transactionally.');
assert.ok(postgresStore.includes("discountCodes: 'discountCodes'"), 'Postgres document snapshots should persist discount codes.');
assert.ok(telegram.includes('discount_confirm:'), 'Telegram should support confirming a discounted checkout.');
assert.ok(telegram.includes('seat_discount:'), 'Seat checkout should also support one-time discounts.');
assert.ok(server.includes("routeParams('/api/telegram-pricing/:username'"), 'Server should expose per-username price-list mutations.');
assert.ok(telegramPricing.includes('resolveCatalogBasePrice'), 'Telegram pricing should retain the independent Admin reference price.');
assert.ok(telegramPricing.includes('price: catalogPrice'), 'Telegram pricing without a username override should use product.price.');
assert.equal(telegramPricing.includes("source: basePricing.configured ? 'catalog_base'"), false, 'Admin base pricing must never become the Telegram checkout source.');
assert.ok(telegramPricing.includes('orderPricingSnapshot'), 'Order creation should use an immutable pricing and cost snapshot.');
assert.ok(telegramPricing.includes('costUnitPrice') && telegramPricing.includes('costConfigured'), 'Pricing snapshots should distinguish configured cost from missing cost.');
assert.ok(jsonShopStore.includes('pricing: orderPricingSnapshot(pricing)'), 'JSON orders should snapshot configured unit cost.');
assert.ok(postgresShopStore.includes('pricing: orderPricingSnapshot(pricing)'), 'Postgres orders should snapshot configured unit cost.');
assert.ok(jsonShopStore.includes('db.catalogPriceLists'), 'JSON storage should persist base prices separately from products.');
assert.ok(postgresShopStore.includes("upsertDoc(client, 'catalogPriceLists'"), 'Postgres row mode should persist the independent base-price document.');
assert.ok(postgresStore.includes("catalogPriceLists: 'catalogPriceLists'"), 'Postgres document mode should include base-price documents in snapshots.');
assert.ok(dashboardAnalytics.includes('buildDashboardAnalytics'), 'Dashboard summary should use a deterministic analytics aggregation.');
assert.ok(dashboardAnalytics.includes('buildOrderFinancialSummary'), 'Dashboard should calculate covered revenue, cost and gross profit.');
assert.ok(dashboardAnalytics.includes('ordersMissingCost'), 'Profit analytics should report missing cost instead of treating it as zero.');
assert.ok(dashboardAnalytics.includes('hourlySnapshot'), 'Dashboard analytics should build a 24-hour today series.');
assert.ok(dashboardAnalytics.includes("label: `${String(hour).padStart(2, '0')}:00`"), 'Hourly analytics should label buckets from 00:00 through 23:00.');
assert.ok(jsonShopStore.includes('buildDashboardAnalytics'), 'JSON dashboard summary should expose analytics.');
assert.ok(postgresShopStore.includes('analyticsOrders'), 'Postgres dashboard summary should aggregate a bounded analytics window.');
assert.ok(postgresShopStore.includes('cost_known'), 'Postgres overview should aggregate profit only for orders with cost snapshots.');
assert.ok(postgresShopStore.includes("doc->>'paidAt' >= $1"), 'Postgres analytics should include orders paid during the reporting window even when created earlier.');
assert.ok(html.includes('name="officialPriceNote"'), 'Product form should expose official pricing notes.');
assert.ok(js.includes('product.officialPriceNote'), 'Product cards should render official pricing notes.');
for (const field of ['emoji', 'artwork', 'description', 'accountType', 'warrantyPolicy', 'replacementPolicy', 'deliveryMode', 'fulfillmentMode']) {
  assert.ok(html.includes(`name="${field}"`), `Create product form should expose ${field}.`);
  assert.ok(js.includes(`name="${field}"`), `Product editor should expose ${field}.`);
}
assert.ok(html.includes('Tệp TXT'), 'Create product form should expose TXT delivery.');
assert.ok(js.includes('Tin nhắn văn bản'), 'Product cards/editor should expose text delivery.');
assert.ok(js.includes('data.hot ='), 'Product editor should save hot product flags.');
assert.ok(js.includes("setTab('inventory')"), 'Import-stock action should jump to the Inventory tab.');
assert.ok(html.includes('value="seat_email"'), 'Create product form should expose seat-email fulfillment.');
assert.ok(html.includes('Seat qua email khách hàng'), 'Create product form should explain seat-email fulfillment.');
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
assert.ok(js.includes('Gửi lại thông báo Seat'), 'Delivered Seat orders should expose a recoverable Telegram resend action.');
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
assert.ok(server.includes("for (const provider of ['chatgpt', 'canva', 'claude'])"), 'Server should initialize Seat Guard lifecycle jobs for every provider.');
assert.ok(server.includes('startSeatExpiryAutomation({ provider })'), 'Server should scope the guarded Seat expiry scheduler by provider.');
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
assert.ok(server.includes("pathname === '/api/products/ai-assistant'"), 'Server should expose the authenticated Gemini product assistant.');
assert.ok(js.includes("api('/api/products/ai-assistant'"), 'Admin should request Gemini drafts without exposing the API key.');
assert.ok(js.includes('result.draft'), 'Admin should apply the structured Gemini draft to the create form.');

for (const selector of [
  '.toolbar',
  '.auth-panel',
  '.sidebar-backdrop',
  'body.sidebar-open',
  '.product-card',
  '.product-card-summary',
  '.product-health-grid',
  '.product-health-card',
  '.product-results-bar',
  '.product-list-columns',
  '.product-row-actions',
  '.product-editor',
  '.editor-section',
  '.discount-code-field',
  '.discount-form-grid',
  '.discount-create-workspace',
  '.discount-builder-section',
  '.discount-builder-aside',
  '.discount-ticket',
  '.discount-create-checklist',
  '.discount-empty-state',
  '.discount-code-token',
  '.discount-table',
  '.discount-metrics',
  '.discount-metric',
  '.discount-list-toolbar',
  '.discount-form-preview',
  '.discount-detail-grid',
  '.discount-lifecycle-note',
  '.notification-metrics',
  '.notification-layout',
  '.notification-preview',
  '.notification-campaign-card',
  '.notification-delivery-summary',
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
  '.seat-guard-capacity',
  '.seat-guard-capacity-track',
  '.seat-guard-table',
  '.seat-guard-reference-list',
  '.pricing-base-panel',
  '.pricing-table',
  '.accordion-toggle',
  '.product-create-workspace',
  '.product-ai-assistant',
  '.product-brand-presets',
  '.product-emoji-presets',
  '.product-mode-option',
  '.product-create-aside',
  '.product-create-preview',
  '.product-create-checklist',
  '.product-create-error',
  '.product-optional-details',
  '.pricing-row.has-override',
  '.base-price-row.has-base-price',
  '.analytics-grid',
  '.overview-today',
  '.overview-today-grid',
  '.today-metric',
  '.stat-profit',
  '.today-profit',
  '.trend-svg',
  '.profit-line',
  '.profit-dot',
  '.status-donut',
  '.top-products-chart',
  '.top-product-financial',
  '.operations-funnel',
  '.responsive-table'
]) {
  assert.ok(css.includes(selector), `Admin CSS should style ${selector}.`);
}

assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Admin motion should respect reduced-motion preferences.');
assert.ok(css.includes('content: attr(data-label)'), 'Responsive tables should expose cell labels in mobile card mode.');
assert.ok(js.includes('class="data-table pricing-table responsive-table"'), 'Pricing tables should use mobile cards instead of overflowing the viewport.');
assert.ok(js.includes('target.getBoundingClientRect().width'), 'Revenue charts should size their SVG coordinate system to the available viewport width.');
assert.ok(css.includes('@media (max-width: 360px)'), 'Admin CSS should include a narrow-phone fallback for 320–360px viewports.');
assert.ok(css.includes('.pricing-table-wrap,'), 'Pricing table wrappers should release desktop scrolling constraints on mobile.');
assert.ok(html.includes('aria-label="Làm mới dữ liệu"'), 'The compact mobile refresh control should retain an accessible name.');
assert.ok(js.includes('class="data-table responsive-table payments-table"'), 'Payments should use the shared compact table and mobile card pattern.');
assert.ok(js.includes('setButtonBusy(submit, true)'), 'Admin submit actions should expose a shared loading state.');
assert.ok(js.includes("row?.classList.toggle('has-override'"), 'Telegram override rows should visibly reflect inheritance state.');

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
