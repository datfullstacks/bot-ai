import { brandIcon, getBrandAsset } from './brand-assets.js';

const state = {
  tab: 'overview',
  products: [],
  productSearch: '',
  productBrand: 'all',
  productStatus: 'all',
  productSort: 'priority',
  productCreateDirty: false,
  productSkuManual: false,
  productAssistant: null,
  dashboardAnalytics: null,
  dashboardRangeDays: 14,
  discountCodes: [],
  discountSearch: '',
  discountStatus: 'all',
  expandedDiscountId: '',
  discountCreateOpen: false,
  notificationOverview: { campaigns: [], metrics: {}, audience: {} },
  telegramPricing: { basePriceList: { id: 'base', prices: {} }, priceLists: [], users: [] },
  telegramPricingUsername: '',
  orderStatus: 'all',
  seatGuard: null,
  seatGuardProvider: 'chatgpt',
  seatGuardMemberSearch: '',
  seatGuardInvitationSearch: ''
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function money(amount, currency = 'VND') {
  return `${Number(amount || 0).toLocaleString('vi-VN')} ${currency}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function icon(name, className = 'icon') {
  return `<span class="${escapeHtml(className)}" data-lucide="${escapeHtml(name)}" aria-hidden="true"></span>`;
}

function brandLogo(brand, className = 'brand-logo') {
  const asset = getBrandAsset(brand);
  if (asset.logo) {
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(asset.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  return `<span class="${escapeHtml(`${className} fallback`)}" aria-hidden="true">${escapeHtml(brandIcon(brand))}</span>`;
}

function productArtwork(product = {}, className = 'product-artwork') {
  const artwork = String(product.artwork || '').trim();
  if (!/^\/brand\/(?:product-plans|catalog-artwork\/brands)\/[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(artwork)) return '';
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(artwork)}" alt="" loading="lazy">`;
}

function refreshIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

function actionButton(action, id, label, className = 'small secondary', iconHtml = '') {
  return `<button class="${className}" data-action="${escapeHtml(action)}" data-id="${escapeHtml(id)}">${iconHtml}<span>${escapeHtml(label)}</span></button>`;
}

function statusClass(status) {
  return String(status || '').replace(/[^a-z0-9_-]/gi, '_');
}

function renderStatusPill(status, label = status) {
  return `<span class="badge ${escapeHtml(statusClass(status))}">${escapeHtml(label || '-')}</span>`;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2800);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function setSidebarOpen(open) {
  const expanded = Boolean(open);
  document.body.classList.toggle('sidebar-open', expanded);
  $('#sidebarToggle').setAttribute('aria-expanded', String(expanded));
}

function closeSidebarAndRestoreFocus() {
  setSidebarOpen(false);
  $('#sidebarToggle')?.focus();
}

function setButtonBusy(button, busy) {
  if (!button) return;
  button.disabled = Boolean(busy);
  button.classList.toggle('is-loading', Boolean(busy));
  if (busy) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
}

function setProductCreateOpen(open) {
  const toggle = $('#productCreateToggle');
  const content = $('#productCreateContent');
  if (!toggle || !content) return;
  const expanded = Boolean(open);
  toggle.setAttribute('aria-expanded', String(expanded));
  content.classList.toggle('hidden', !expanded);
  $('#productForm')?.classList.toggle('is-open', expanded);
  if (expanded) {
    closeProductEditors();
    renderProductCreateExperience();
  }
}

function productSkuSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function productCreateFormData() {
  const form = $('#productForm');
  return form ? Object.fromEntries(new FormData(form).entries()) : {};
}

function defaultProductEmoji(brand) {
  const key = String(brand || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return ({
    gemini: '✨',
    chatgpt: '🤖',
    openai: '🤖',
    claude: '🧠',
    anthropic: '🧠',
    canva: '🎨',
    cursor: '🖱️',
    perplexity: '🔎'
  })[key] || '';
}

async function loadProductAssistantStatus() {
  const badge = $('#productAiBadge');
  const statusText = $('#productAiStatus');
  const button = $('#productAiGenerate');
  if (!badge || !statusText || !button) return;
  try {
    state.productAssistant = await api('/api/products/ai-assistant');
    badge.textContent = state.productAssistant.configured ? state.productAssistant.model : 'Chưa cấu hình';
    badge.className = `badge ${state.productAssistant.configured ? 'available' : 'reserved'}`;
    button.disabled = !state.productAssistant.configured;
    statusText.textContent = state.productAssistant.configured
      ? 'Sẵn sàng phác thảo tên, SKU, mô tả, emoji và chính sách.'
      : 'Thêm GEMINI_API_KEY trên server để bật tính năng tạo bản nháp.';
  } catch {
    state.productAssistant = null;
    badge.textContent = 'Không khả dụng';
    badge.className = 'badge payment_review';
    button.disabled = true;
    statusText.textContent = 'Không kiểm tra được trạng thái Gemini.';
  }
}

function applyGeminiProductDraft(draft = {}) {
  const form = $('#productForm');
  if (!form) return;
  for (const field of [
    'category',
    'brand',
    'packageType',
    'name',
    'sku',
    'emoji',
    'description',
    'officialPriceNote',
    'accountType',
    'warrantyPolicy',
    'replacementPolicy'
  ]) {
    if (form.elements[field] && draft[field] !== undefined) form.elements[field].value = draft[field];
  }
  state.productCreateDirty = true;
  state.productSkuManual = Boolean(String(draft.sku || '').trim());
  if (draft.accountType || draft.warrantyPolicy || draft.replacementPolicy) {
    $('.product-optional-details').open = true;
  }
  renderProductCreateExperience();
}

function generateProductSku(force = false) {
  const form = $('#productForm');
  const skuInput = $('#productSkuInput');
  if (!form || !skuInput || (state.productSkuManual && !force)) return;
  const brand = productSkuSlug(form.elements.brand?.value);
  const detail = productSkuSlug(form.elements.packageType?.value || form.elements.name?.value);
  const generated = detail && (detail === brand || detail.startsWith(`${brand}-`))
    ? detail
    : [brand, detail].filter(Boolean).join('-');
  skuInput.value = generated;
  state.productSkuManual = false;
}

function productSeatProviderLabel(data = {}) {
  const source = `${data.brand || ''} ${data.sku || ''}`.toLowerCase();
  if (source.includes('chatgpt') || source.includes('openai')) return 'ChatGPT';
  if (source.includes('canva')) return 'Canva';
  if (source.includes('claude') || source.includes('anthropic')) return 'Claude';
  return 'Provider sẽ được xác định từ thương hiệu hoặc SKU';
}

function renderProductCreateExperience() {
  const form = $('#productForm');
  if (!form) return;
  const data = productCreateFormData();
  const seatEmail = data.fulfillmentMode === 'seat_email';
  const required = [
    ['category', 'Danh mục', String(data.category || '').trim()],
    ['brand', 'Thương hiệu', String(data.brand || '').trim()],
    ['name', 'Tên hiển thị', String(data.name || '').trim()],
    ['sku', 'SKU', String(data.sku || '').trim()],
    ['price', 'Giá bán', Number(data.price || 0) > 0]
  ];
  const completed = required.filter(([, , value]) => Boolean(value)).length;
  const progress = Math.round((completed / required.length) * 100);

  $$('[data-product-inventory-fields]').forEach((element) => element.classList.toggle('hidden', seatEmail));
  $$('[data-product-seat-fields]').forEach((element) => element.classList.toggle('hidden', !seatEmail));
  const deliveryMode = form.elements.deliveryMode;
  const seatTermMonths = form.elements.seatTermMonths;
  if (deliveryMode) deliveryMode.disabled = seatEmail;
  if (seatTermMonths) seatTermMonths.disabled = !seatEmail;
  $$('.product-mode-option').forEach((option) => {
    option.classList.toggle('is-selected', option.querySelector('input')?.checked === true);
  });
  $$('[data-product-seat-term]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.productSeatTerm) === Number(seatTermMonths?.value || 1));
  });

  $('#productCreateProgressLabel').textContent = `${completed}/${required.length} hoàn tất`;
  const progressTrack = $('.product-progress-track');
  progressTrack?.setAttribute('aria-valuenow', String(completed));
  $('#productCreateProgressBar').style.width = `${progress}%`;
  $('#productCreateChecklist').innerHTML = required.map(([key, label, value]) => `
    <span class="${value ? 'is-complete' : ''}" data-product-check="${escapeHtml(key)}">
      ${icon(value ? 'circle-check' : 'circle', 'inline-icon')}<span>${escapeHtml(label)}</span>
    </span>
  `).join('');

  const brand = String(data.brand || '').trim() || 'Thương hiệu';
  const productEmoji = String(data.emoji || '').trim() || defaultProductEmoji(brand) || '📦';
  const productName = String(data.name || '').trim() || 'Tên sản phẩm sẽ hiển thị ở đây';
  const sku = String(data.sku || '').trim() || 'sku-tu-dong';
  const description = String(data.description || '').trim() || 'Thêm mô tả ngắn để khách hàng hiểu nhanh quyền lợi sản phẩm.';
  const fulfillmentLabel = seatEmail
    ? `Seat qua email · ${Number(data.seatTermMonths || 1)} tháng`
    : `Từ kho · ${data.deliveryMode === 'file' ? 'Tệp TXT' : 'Tin nhắn'}`;
  $('#productCreatePreview').innerHTML = `
    <div class="product-preview-head">
      <span class="product-preview-brand">${brandLogo(brand, 'product-preview-logo')}</span>
      <span class="badge ${seatEmail ? 'processing' : 'available'}">${escapeHtml(seatEmail ? 'Seat email' : 'Inventory')}</span>
    </div>
    ${productArtwork(data, 'product-preview-artwork')}
    <span class="product-preview-eyebrow">Xem trước catalog</span>
    <h4><span class="product-preview-emoji" aria-hidden="true">${escapeHtml(productEmoji)}</span>${escapeHtml(productName)}</h4>
    <code>${escapeHtml(sku)}</code>
    <p>${escapeHtml(description)}</p>
    <div class="product-preview-meta"><span>${icon('tag', 'inline-icon')}${escapeHtml(data.category || 'AI Accounts')}</span><span>${icon(seatEmail ? 'mail-check' : 'warehouse', 'inline-icon')}${escapeHtml(fulfillmentLabel)}</span></div>
    <div class="product-preview-price"><span>Giá bán</span><strong>${escapeHtml(money(Number(data.price || 0), data.currency || 'VND'))}</strong></div>
  `;
  $('#productDescriptionCount').textContent = `${String(data.description || '').length}/320`;
  $('#productEmojiPreview').textContent = productEmoji;
  $$('[data-product-emoji]').forEach((button) => button.classList.toggle('active', button.dataset.productEmoji === data.emoji));
  $$('[data-product-brand]').forEach((button) => button.classList.toggle('active', button.dataset.productBrand.toLowerCase() === String(data.brand || '').trim().toLowerCase()));
  $('#productPriceCurrencySuffix').textContent = data.currency || 'VND';
  $('#productSeatProviderHint').textContent = seatEmail
    ? `${productSeatProviderLabel(data)} · thời hạn ${Number(data.seatTermMonths || 1)} tháng.`
    : 'Provider được xác định từ thương hiệu hoặc SKU.';
  $('#productCreateDraftStatus').innerHTML = `${icon(state.productCreateDirty ? 'circle-dot-dashed' : 'circle-dot', 'inline-icon')}<span>${state.productCreateDirty ? 'Bản nháp chưa lưu' : 'Chưa chỉnh sửa'}</span>`;
  $('#productCreateDraftStatus').classList.toggle('is-dirty', state.productCreateDirty);
  $('#productCreateToggleMeta').textContent = state.productCreateDirty
    ? `Bản nháp chưa lưu · ${completed}/${required.length} trường bắt buộc`
    : 'Thiết lập thông tin bán và cách giao hàng';
  refreshIcons();
}

function resetProductCreateForm() {
  const form = $('#productForm');
  if (!form) return;
  form.reset();
  state.productCreateDirty = false;
  state.productSkuManual = false;
  $('#productCreateError').classList.add('hidden');
  $('#productCreateError').textContent = '';
  renderProductCreateExperience();
}

function closeProductEditors(exceptId = '') {
  $$('[data-product-editor]').forEach((form) => {
    if (form.id === exceptId) return;
    form.classList.add('hidden');
    form.closest('.product-card')?.classList.remove('editor-open');
  });
  $$('[data-action="toggle-product-editor"]').forEach((button) => {
    if (button.getAttribute('aria-controls') !== exceptId) {
      button.setAttribute('aria-expanded', 'false');
    }
  });
}

function toggleProductEditor(button) {
  const editorId = button.getAttribute('aria-controls');
  const form = editorId ? document.getElementById(editorId) : null;
  if (!form) return;
  const shouldOpen = form.classList.contains('hidden');
  closeProductEditors(shouldOpen ? editorId : '');
  setProductCreateOpen(false);
  form.classList.toggle('hidden', !shouldOpen);
  form.closest('.product-card')?.classList.toggle('editor-open', shouldOpen);
  button.setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) form.querySelector('input, textarea, select')?.focus({ preventScroll: true });
}

function setTab(tab) {
  const drawerWasOpen = document.body.classList.contains('sidebar-open');
  state.tab = tab;
  $$('.nav').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  $$('.tab').forEach((section) => section.classList.remove('active-tab'));
  $(`#${tab}Tab`).classList.add('active-tab');
  const titles = {
    overview: ['Tổng quan', 'Ảnh chụp vận hành · Operational snapshot'],
    products: ['Sản phẩm', 'Tạo và quản lý mặt hàng đang bán'],
    pricing: ['Bảng giá Telegram', 'Giá gốc và giá riêng theo username'],
    discounts: ['Mã giảm giá', 'Voucher dùng một lần và trạng thái sử dụng'],
    notifications: ['Thông báo', 'Soạn, phân nhóm và theo dõi Notify Telegram'],
    inventory: ['Kho hàng', 'Nhập tài khoản và mã giao hàng'],
    seatGuard: ['Seat Guard', 'Đối chiếu Seat đã thanh toán với workspace'],
    orders: ['Đơn hàng', 'Theo dõi thanh toán và giao hàng'],
    payments: ['Thanh toán', 'Sự kiện provider và phiên thanh toán'],
    audit: ['Nhật ký', 'Hoạt động Admin và hệ thống'],
    system: ['Hệ thống', 'Cấu hình và trạng thái runtime']
  };
  $('#pageTitle').textContent = titles[tab][0];
  $('#pageSubtitle').textContent = titles[tab][1];
  if (drawerWasOpen) closeSidebarAndRestoreFocus();
  else setSidebarOpen(false);
  if (tab === 'overview') requestAnimationFrame(() => renderRevenueTrendChart());
}

function showDashboard(user) {
  $('#loginView').classList.add('hidden');
  $('#dashboardView').classList.remove('hidden');
  $('#adminName').textContent = `${user.username} (${user.role})`;
}

function showLogin() {
  setSidebarOpen(false);
  $('#dashboardView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
}

function row(html) {
  const div = document.createElement('div');
  div.className = 'row';
  div.innerHTML = html;
  return div;
}

function productSortKey(product) {
  return `${product.category || 'Accounts'}\u0000${product.brand || 'Other'}\u0000${String(product.sortOrder || 1000).padStart(6, '0')}\u0000${product.sku}`;
}

function sortedProducts(products = state.products) {
  return products.slice().sort((left, right) => productSortKey(left).localeCompare(productSortKey(right)));
}

function productFulfillmentMode(product = {}) {
  return String(product.fulfillmentMode || '').trim().toLowerCase() === 'seat_email'
    ? 'seat_email'
    : 'inventory';
}

function isSeatEmailProduct(product = {}) {
  return productFulfillmentMode(product) === 'seat_email';
}

function fulfillmentModeLabel(product = {}) {
  return isSeatEmailProduct(product) ? 'Seat qua email khách hàng' : 'Từ kho · Inventory';
}

function isSeatEmailOrder(order = {}) {
  return isSeatEmailProduct({
    fulfillmentMode: order.productSnapshot?.fulfillmentMode || order.fulfillment?.mode
  });
}

function automaticSeatProvider(order = {}) {
  return String(
    order.automaticFulfillmentProvider
    || order.fulfillment?.automation?.provider
    || ''
  ).trim().toLowerCase();
}

function automationDateTime(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : String(value || '');
}

function renderFulfillmentAutomation(order = {}) {
  const automation = order.fulfillment?.automation;
  const provider = automaticSeatProvider(order);
  if (!automation && !provider) return '';
  if (!automation) return `<span class="meta">${escapeHtml(provider)} auto: waiting to start</span>`;
  const parts = [
    `${automation.provider || provider || 'member'}: ${automation.status || 'unknown'}`,
    Number.isFinite(Number(automation.attempt)) ? `attempt ${Number(automation.attempt)}` : '',
    Number.isFinite(Number(automation.retryCount)) ? `retries ${Number(automation.retryCount)}` : '',
    automation.operationId ? `op ${automation.operationId}` : '',
    automation.nextRetryAt ? `next ${automationDateTime(automation.nextRetryAt)}` : '',
    automation.error?.code ? `error ${automation.error.code}` : '',
    automation.error?.message ? automation.error.message : ''
  ].filter(Boolean);
  return `<span class="meta">${escapeHtml(parts.join(' · '))}</span>`;
}

function automaticSeatRetryLabel(order = {}) {
  if (!automaticSeatProvider(order)) return '';
  const automation = order.fulfillment?.automation;
  if (!automation) return 'Start Auto';
  if (automation.status === 'retrying') return 'Thử lại ngay';
  if (automation.status === 'verification_required') return 'Thử lại / xác minh Auto';
  if (['failed', 'blocked'].includes(automation.status)) return 'Thử lại Auto';
  return '';
}

function automaticSeatRefundMode(order = {}) {
  if (!automaticSeatProvider(order)) return true;
  const automation = order.fulfillment?.automation;
  if (!automation) return 'blocked';
  if (automation.status === 'verification_required') return 'cleanup_required';
  if (
    automation.operationId
    && ['failed', 'blocked'].includes(automation.status)
  ) return 'cleanup_required';
  if (automation.operationId) return 'blocked';
  return ['failed', 'blocked'].includes(automation.status) ? 'safe' : 'blocked';
}

function automaticSeatManualMode(order = {}) {
  if (!automaticSeatProvider(order)) return 'safe';
  const automation = order.fulfillment?.automation;
  if (!automation) return 'blocked';
  if (
    automation.status === 'verification_required'
    || (automation.operationId && ['failed', 'blocked'].includes(automation.status))
  ) {
    return 'verification_required';
  }
  if (automation.operationId) return 'blocked';
  return ['failed', 'blocked'].includes(automation.status) ? 'safe' : 'blocked';
}

function orderRecipientRows(order = {}) {
  const source = order.fulfillment?.recipients
    || order.recipientEmails
    || order.fulfillment?.emails
    || order.seatEmails
    || [];
  const values = Array.isArray(source) ? source : [source];
  return values
    .map((entry) => (typeof entry === 'string'
      ? { email: entry, status: '' }
      : { email: entry?.email, status: entry?.status || '' }))
    .filter((entry) => String(entry.email || '').trim());
}

function renderOrderRecipients(order) {
  const recipients = orderRecipientRows(order);
  if (!recipients.length) {
    return isSeatEmailOrder(order)
      ? '<span class="meta">Chưa có email nhận Seat</span>'
      : '<span class="meta">-</span>';
  }
  return `<div class="recipient-list">${recipients.map((recipient) => `
    <span class="recipient-email">${icon('mail', 'inline-icon')}${escapeHtml(recipient.email)}${recipient.status ? ` <small>${escapeHtml(recipient.status)}</small>` : ''}</span>
  `).join('')}</div>`;
}

function seatGuardValues(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== undefined && entry !== null && entry !== '');
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function seatGuardCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function seatGuardOptionalCount(value) {
  if (value === undefined || value === null || value === '') return null;
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

function seatGuardDate(value) {
  if (!value) return '-';
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : String(value);
}

function seatGuardAccountLabel(account) {
  if (!account) return 'Chưa có thông tin tài khoản';
  if (typeof account === 'string') return account;
  const values = [
    account.name,
    account.email,
    account.loginEmail,
    account.workspaceName,
    account.workspaceId,
    account.brandId,
    account.organizationId,
    account.accountRef,
    account.id
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return [...new Set(values)].join(' · ') || 'Tài khoản đã cấu hình';
}

function seatGuardPermissionsLabel(permissions) {
  if (Array.isArray(permissions)) return permissions.join(', ') || 'none reported';
  if (permissions && typeof permissions === 'object') {
    const values = Object.entries(permissions)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([permission]) => permission);
    return values.join(', ') || 'none reported';
  }
  return String(permissions || 'none reported');
}

function seatGuardClassification(item = {}) {
  return String(item.classification || item.state || item.status || 'unknown').trim().toLowerCase();
}

function seatGuardRiskSorted(items = []) {
  const priority = {
    unauthorized: 0,
    expired: 1,
    review: 2,
    manual_allowed: 3,
    valid_order: 4,
    protected: 5
  };
  return items.slice().sort((left, right) => {
    const risk = (priority[seatGuardClassification(left)] ?? 9) - (priority[seatGuardClassification(right)] ?? 9);
    if (risk) return risk;
    return String(left.email || left.name || '').localeCompare(String(right.email || right.name || ''));
  });
}

function seatGuardFiltered(items = [], query = '') {
  const needle = String(query || '').trim().toLowerCase();
  const sorted = seatGuardRiskSorted(items);
  if (!needle) return sorted;
  return sorted.filter((item) => [
    item.email,
    item.name,
    item.role,
    item.status,
    seatGuardClassification(item),
    ...(Array.isArray(item.orderIds) ? item.orderIds : [])
  ].some((value) => String(value || '').toLowerCase().includes(needle)));
}

function renderSeatGuardReferences(values, empty = '-') {
  const entries = seatGuardValues(values).map((value) => String(value || '').trim()).filter(Boolean);
  if (!entries.length) return `<span class="meta">${escapeHtml(empty)}</span>`;
  return `<div class="seat-guard-reference-list">${entries.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}</div>`;
}

function renderSeatGuardIdentity(item = {}) {
  const email = String(item.email || '').trim();
  const name = String(item.name || '').trim();
  return `<strong>${escapeHtml(name || email || 'Không rõ thành viên')}</strong>${name && email ? `<span>${escapeHtml(email)}</span>` : ''}`;
}

function seatGuardAction(action, item, label, iconName) {
  return `<button class="small danger icon-button" data-action="${escapeHtml(action)}" data-id="${escapeHtml(item.actionRef || item.id || '')}" data-email="${escapeHtml(item.email || '')}">${icon(iconName)}<span>${escapeHtml(label)}</span></button>`;
}

function renderSeatGuardMembers(items = [], capabilities = {}) {
  items = seatGuardFiltered(items, state.seatGuardMemberSearch);
  if (!items.length) return '<p class="meta empty-state">Không có thành viên workspace.</p>';
  return `
    <div class="table-wrap">
      <table class="data-table seat-guard-table responsive-table">
        <thead>
          <tr>
            <th>Thành viên</th>
            <th>Vai trò</th>
            <th>Trạng thái workspace</th>
            <th>Phân loại</th>
            <th>Seat hết hạn</th>
            <th>Đơn hàng</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const classification = seatGuardClassification(item);
            const canRemove = Boolean(capabilities.canRemove && item.removable);
            return `
              <tr>
                <td data-label="Thành viên">${renderSeatGuardIdentity(item)}</td>
                <td data-label="Vai trò">${escapeHtml(item.role || '-')}</td>
                <td data-label="Trạng thái workspace">${renderStatusPill(item.status || 'unknown')}</td>
                <td data-label="Phân loại">${renderStatusPill(classification, classification.replaceAll('_', ' '))}</td>
                <td data-label="Seat hết hạn">${escapeHtml(seatGuardDate(item.expiresAt))}</td>
                <td data-label="Đơn hàng">${renderSeatGuardReferences(item.orderIds, 'Không có đơn khớp')}</td>
                <td data-label="Hành động">${canRemove
                  ? seatGuardAction('seat-guard-remove-member', item, classification === 'manual_allowed' ? 'Xóa mục chưa xác minh' : 'Xóa thành viên', 'user-minus')
                  : '<span class="meta">Được bảo vệ hoặc chỉ đọc</span>'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSeatGuardInvitations(items = [], capabilities = {}) {
  items = seatGuardFiltered(items, state.seatGuardInvitationSearch);
  if (!items.length) return '<p class="meta empty-state">Không có lời mời đang chờ.</p>';
  return `
    <div class="table-wrap">
      <table class="data-table seat-guard-table responsive-table">
        <thead>
          <tr>
            <th>Người được mời</th>
            <th>Trạng thái</th>
            <th>Phân loại</th>
            <th>Seat hết hạn</th>
            <th>Đơn hàng</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const classification = seatGuardClassification(item);
            const canCancel = Boolean(capabilities.canRemove && item.cancelable);
            return `
              <tr>
                <td data-label="Người được mời">${renderSeatGuardIdentity(item)}</td>
                <td data-label="Trạng thái">${renderStatusPill(item.status || 'pending')}</td>
                <td data-label="Phân loại">${renderStatusPill(classification, classification.replaceAll('_', ' '))}</td>
                <td data-label="Seat hết hạn">${escapeHtml(seatGuardDate(item.expiresAt))}</td>
                <td data-label="Đơn hàng">${renderSeatGuardReferences(item.orderIds, 'Không có đơn khớp')}</td>
                <td data-label="Hành động">${canCancel
                  ? seatGuardAction('seat-guard-cancel-invitation', item, classification === 'manual_allowed' ? 'Hủy mục chưa xác minh' : 'Hủy lời mời', 'mail-x')
                  : '<span class="meta">Được bảo vệ hoặc chỉ đọc</span>'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSeatGuardEntitlements(items = []) {
  if (!items.length) return '<p class="meta empty-state">Không có quyền Seat đã thanh toán.</p>';
  return `
    <div class="table-wrap">
      <table class="data-table seat-guard-table responsive-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Trạng thái</th>
            <th>Hết hạn</th>
            <th>Sản phẩm</th>
            <th>Đơn hàng</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td data-label="Email"><strong>${escapeHtml(item.email || '-')}</strong></td>
              <td data-label="Trạng thái">${renderStatusPill(item.state || 'unknown')}</td>
              <td data-label="Hết hạn">${escapeHtml(seatGuardDate(item.expiresAt))}</td>
              <td data-label="Sản phẩm">${renderSeatGuardReferences(item.productNames)}</td>
              <td data-label="Đơn hàng">${renderSeatGuardReferences(item.orderIds)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSeatGuardSummary(summary = {}) {
  const values = {
    seatGuardMembersCount: summary.members,
    seatGuardPendingCount: summary.pendingInvitations,
    seatGuardValidCount: summary.validMembers,
    seatGuardAllowedCount: summary.manualAllowedMembers,
    seatGuardProtectedCount: summary.protectedMembers,
    seatGuardUnauthorizedCount: summary.unauthorizedMembers,
    seatGuardExpiredCount: summary.expiredMembers,
    seatGuardReviewCount: summary.reviewMembers,
    seatGuardInviteRiskCount: seatGuardCount(summary.unauthorizedInvitations) + seatGuardCount(summary.expiredInvitations),
    seatGuardMissingCount: summary.missingAuthorized
  };
  for (const [id, value] of Object.entries(values)) {
    $(`#${id}`).textContent = seatGuardCount(value).toLocaleString('vi-VN');
  }
  const usedSlots = seatGuardOptionalCount(summary.usedSlots) ?? 0;
  const maxMembers = seatGuardOptionalCount(summary.maxMembers);
  const remainingSlots = seatGuardOptionalCount(summary.remainingSlots);
  $('#seatGuardCapacityCount').textContent = maxMembers === null
    ? `${usedSlots.toLocaleString('vi-VN')} / ?`
    : `${usedSlots.toLocaleString('vi-VN')} / ${maxMembers.toLocaleString('vi-VN')}`;
  $('#seatGuardRemainingCount').textContent = remainingSlots === null
    ? '-'
    : remainingSlots.toLocaleString('vi-VN');
}

function renderSeatGuardConnection(data = {}) {
  const capabilities = data.capabilities || {};
  const expiry = data.expiryAutomation || {};
  const capacity = data.capacity || {};
  const status = data.configured ? (capabilities.canRead ? 'ok' : 'warn') : 'warn';
  const title = data.configured
    ? capabilities.canRead ? 'Đã kết nối' : 'Đã cấu hình nhưng thiếu quyền đọc thành viên'
    : 'Seat Guard chưa được cấu hình';
  const expiryStatus = !expiry.enabled
    ? 'Dọn dẹp tự động đang tắt'
    : expiry.storageReady
      ? 'Dọn dẹp tự động đang bật'
      : expiry.storageReason === 'database_pool_too_small'
        ? `Bị chặn: DATABASE_POOL_MAX tối thiểu ${Number(expiry.requiredDatabasePoolMax || 0)}`
        : 'Bị chặn: cần PostgreSQL row mode';
  const usedSlots = seatGuardOptionalCount(capacity.usedSlots) ?? 0;
  const maxMembers = seatGuardOptionalCount(capacity.maxMembers);
  const remainingSlots = seatGuardOptionalCount(capacity.remainingSlots);
  const utilization = seatGuardOptionalCount(capacity.utilizationPercent);
  const progressWidth = Math.min(100, utilization ?? 0);
  const capacityTone = capacity.atLimit ? 'danger' : (utilization !== null && utilization >= 80 ? 'warning' : 'ok');
  const capacityMarkup = maxMembers === null ? `
    <div class="seat-guard-capacity unknown">
      <div><strong>Giới hạn thành viên chưa được member-service trả về</strong><span>Đang ghi nhận ${usedSlots.toLocaleString('vi-VN')} slot đã dùng.</span></div>
    </div>
  ` : `
    <div class="seat-guard-capacity ${capacityTone}">
      <div class="seat-guard-capacity-head">
        <span><strong>Sức chứa workspace</strong>${usedSlots.toLocaleString('vi-VN')} / ${maxMembers.toLocaleString('vi-VN')} slot đã dùng</span>
        <span><strong>${remainingSlots === null ? '-' : remainingSlots.toLocaleString('vi-VN')}</strong> slot còn trống · ${utilization ?? 0}%</span>
      </div>
      <div class="seat-guard-capacity-track" role="progressbar" aria-label="Mức sử dụng Seat" aria-valuemin="0" aria-valuemax="${maxMembers}" aria-valuenow="${Math.min(maxMembers, usedSlots)}">
        <span style="width: ${progressWidth}%"></span>
      </div>
    </div>
  `;
  $('#seatGuardConnection').innerHTML = `
    <div class="seat-guard-connection-head">
      <span class="status-dot ${status}">${escapeHtml(title)}</span>
      <span class="meta">Ghi nhận: ${escapeHtml(seatGuardDate(data.observedAt))}</span>
    </div>
    <div class="seat-guard-connection-grid">
      <span><strong>Tài khoản · Account</strong>${escapeHtml(seatGuardAccountLabel(data.account))}</span>
      <span><strong>Quyền · Permissions</strong>${escapeHtml(seatGuardPermissionsLabel(data.permissions))}</span>
      <span><strong>Hết hạn 30 ngày · 30-day expiry</strong>${escapeHtml(expiryStatus)}</span>
      <span><strong>Khả năng · Capabilities</strong>Đọc ${capabilities.canRead ? 'có' : 'không'} · Xóa ${capabilities.canRemove ? 'có' : 'không'}</span>
    </div>
    ${capacityMarkup}
  `;
}

const seatGuardProviderLabels = Object.freeze({ chatgpt: 'ChatGPT', canva: 'Canva', claude: 'Claude' });

function seatGuardUrl(path, provider = state.seatGuardProvider) {
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}provider=${encodeURIComponent(provider)}`;
}

function syncSeatGuardProviderControls() {
  const provider = state.seatGuardProvider;
  $$('#seatGuardProviderSwitcher [data-seat-guard-provider]').forEach((button) => {
    const active = button.dataset.seatGuardProvider === provider;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#seatGuardProviderLabel').textContent = seatGuardProviderLabels[provider] || provider;
}

async function renderSeatGuard(provider = state.seatGuardProvider) {
  const data = await api(seatGuardUrl('/api/seat-guard', provider));
  if (provider !== state.seatGuardProvider) return data;
  state.seatGuard = data;
  syncSeatGuardProviderControls();
  renderSeatGuardConnection(data);
  renderSeatGuardSummary(data.summary || {});
  renderSeatGuardTables();
  refreshIcons();
  return data;
}

function renderSeatGuardTables() {
  const data = state.seatGuard || {};
  $('#seatGuardMembers').innerHTML = renderSeatGuardMembers(data.members || [], data.capabilities || {});
  $('#seatGuardInvitations').innerHTML = renderSeatGuardInvitations(data.invitations || [], data.capabilities || {});
  $('#seatGuardEntitlements').innerHTML = renderSeatGuardEntitlements(data.entitlements || []);
  refreshIcons();
}

function seatGuardOperationEnvelope(payload = {}) {
  return payload.operation || payload.data || payload;
}

async function pollSeatGuardOperation(operationId, {
  provider = state.seatGuardProvider,
  timeoutMs = 180_000,
  intervalMs = 1_500
} = {}) {
  const deadline = Date.now() + timeoutMs;
  const terminalStatuses = new Set(['succeeded', 'failed', 'partially_succeeded', 'cancelled', 'completed']);
  while (Date.now() < deadline) {
    const payload = await api(seatGuardUrl(`/api/seat-guard/operations/${encodeURIComponent(operationId)}`, provider));
    const operation = seatGuardOperationEnvelope(payload);
    const status = String(operation.status || '').trim().toLowerCase();
    const terminal = operation.terminal === true || terminalStatuses.has(status);
    if (terminal) {
      if (!['succeeded', 'completed'].includes(status)) {
        await renderSeatGuard(provider).catch(() => {});
        const error = new Error(operation.error?.message || `Seat Guard operation ${status || 'failed'}`);
        error.seatGuardTerminal = true;
        error.operationId = operationId;
        throw error;
      }
      await renderSeatGuard(provider);
      return operation;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Seat Guard operation is still running. Refresh the page to check its status.');
}

function newSeatGuardActionRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `seat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

async function runSeatGuardAction(button, { action, id, email }) {
  const provider = state.seatGuardProvider;
  const verb = action === 'seat-guard-remove-member' ? 'REMOVE' : 'CANCEL';
  const label = action === 'seat-guard-remove-member' ? 'remove this workspace member' : 'cancel this invitation';
  const confirmation = `${verb} ${email}`;
  const entered = window.prompt(`To ${label}, type exactly:\n${confirmation}`, '');
  if (entered === null) return;
  if (entered !== confirmation) {
    toast('Confirmation did not match. No Seat Guard action was started.');
    return;
  }

  const resource = action === 'seat-guard-remove-member' ? 'members' : 'invitations';
  const endpointAction = action === 'seat-guard-remove-member' ? 'remove' : 'cancel';
  const actionRequestId = button.dataset.seatGuardActionRequestId || newSeatGuardActionRequestId();
  button.dataset.seatGuardActionRequestId = actionRequestId;
  button.disabled = true;
  try {
    const result = await api(seatGuardUrl(`/api/seat-guard/${resource}/${encodeURIComponent(id)}/${endpointAction}`, provider), {
      method: 'POST',
      body: JSON.stringify({ expectedEmail: email, confirmation, actionRequestId })
    });
    if (!result.operationId) throw new Error('Seat Guard did not return an operation id');
    toast(`Seat Guard operation ${result.operationId} started`);
    await pollSeatGuardOperation(result.operationId, { provider });
    toast(action === 'seat-guard-remove-member' ? 'Workspace member removed' : 'Invitation cancelled');
  } catch (error) {
    if (error.seatGuardTerminal || (Number.isInteger(error.status) && error.status < 500)) {
      delete button.dataset.seatGuardActionRequestId;
    }
    throw error;
  } finally {
    button.disabled = false;
  }
}

function renderProductFilters(products) {
  const brandFilter = $('#productBrandFilter');
  if (!brandFilter) return;

  const brands = [...new Set(products.map((product) => product.brand || 'Other'))].sort((left, right) => left.localeCompare(right));
  const current = state.productBrand;
  brandFilter.innerHTML = [
    '<option value="all">Tất cả thương hiệu</option>',
    ...brands.map((brand) => `<option value="${escapeHtml(brand)}">${escapeHtml(brand)}</option>`)
  ].join('');
  brandFilter.value = brands.includes(current) ? current : 'all';
  state.productBrand = brandFilter.value;
  const sort = $('#productSort');
  if (sort) sort.value = state.productSort;
  const reset = $('#productFilterReset');
  if (reset) {
    const hasFilters = Boolean(state.productSearch.trim())
      || state.productBrand !== 'all'
      || state.productStatus !== 'all'
      || state.productSort !== 'priority';
    reset.disabled = !hasFilters;
  }
}

function filteredProducts() {
  const query = state.productSearch.trim().toLowerCase();
  const products = sortedProducts().filter((product) => {
    const active = product.active !== false;
    const stock = Number(product.stock?.available || 0);
    const searchable = [
      product.category,
      product.brand,
      product.packageType,
      product.name,
      product.sku,
      product.description,
      product.accountType,
      product.warrantyPolicy,
      product.replacementPolicy,
      product.fulfillmentMode,
      fulfillmentModeLabel(product),
      product.deliveryMode
    ].join(' ').toLowerCase();

    if (query && !searchable.includes(query)) return false;
    if (state.productBrand !== 'all' && (product.brand || 'Other') !== state.productBrand) return false;
    if (state.productStatus === 'active' && !active) return false;
    if (state.productStatus === 'inactive' && active) return false;
    if (state.productStatus === 'inventory' && isSeatEmailProduct(product)) return false;
    if (state.productStatus === 'seat' && !isSeatEmailProduct(product)) return false;
    if (state.productStatus === 'low-stock' && (isSeatEmailProduct(product) || !active || stock > 2)) return false;
    return true;
  });

  if (state.productSort === 'name') {
    products.sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'vi'));
  } else if (state.productSort === 'price-asc') {
    products.sort((left, right) => Number(left.price || 0) - Number(right.price || 0));
  } else if (state.productSort === 'price-desc') {
    products.sort((left, right) => Number(right.price || 0) - Number(left.price || 0));
  } else if (state.productSort === 'stock-asc') {
    products.sort((left, right) => {
      if (isSeatEmailProduct(left) !== isSeatEmailProduct(right)) return isSeatEmailProduct(left) ? 1 : -1;
      return Number(left.stock?.available || 0) - Number(right.stock?.available || 0);
    });
  }
  return products;
}

function renderProductCatalogMetrics(products, filtered) {
  const inventoryProducts = products.filter((product) => !isSeatEmailProduct(product));
  const active = products.filter((product) => product.active !== false).length;
  const inactive = products.length - active;
  const seat = products.filter((product) => isSeatEmailProduct(product)).length;
  const available = inventoryProducts.reduce((total, product) => total + Number(product.stock?.available || 0), 0);
  const lowStock = inventoryProducts.filter((product) => (
    product.active !== false && Number(product.stock?.available || 0) <= 2
  )).length;

  $('#productMetricActive').textContent = active.toLocaleString('vi-VN');
  $('#productMetricActiveMeta').textContent = `${inactive} đã tắt · ${products.length} tổng`;
  $('#productMetricStock').textContent = available.toLocaleString('vi-VN');
  $('#productMetricStockMeta').textContent = `${inventoryProducts.length} SKU quản lý kho`;
  $('#productMetricLowStock').textContent = lowStock.toLocaleString('vi-VN');
  $('#productMetricLowStockMeta').textContent = lowStock ? 'Cần xử lý sớm' : 'Tồn kho đang an toàn';
  $('#productMetricSeat').textContent = seat.toLocaleString('vi-VN');
  $('#productMetricSeatMeta').textContent = 'Giao qua email khách hàng';

  $$('[data-product-health-filter]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.productHealthFilter === state.productStatus));
  });

  const statusLabels = {
    active: 'đang bán',
    inactive: 'đã tắt',
    inventory: 'quản lý bằng kho',
    seat: 'Seat qua email',
    'low-stock': 'cần nhập kho'
  };
  const parts = [`Hiển thị ${filtered.length}/${products.length} sản phẩm`];
  if (state.productSearch.trim()) parts.push(`từ khóa “${state.productSearch.trim()}”`);
  if (state.productBrand !== 'all') parts.push(state.productBrand);
  if (state.productStatus !== 'all') parts.push(statusLabels[state.productStatus] || state.productStatus);
  $('#productFilterSummary').textContent = parts.join(' · ');
}

function productEditorDomId(productId) {
  return `product-editor-${String(productId || '').replace(/[^a-z0-9_-]/gi, '-')}`;
}

function renderProductEditor(product) {
  const active = product.active !== false;
  const editorId = productEditorDomId(product.id);
  return `
    <form id="${escapeHtml(editorId)}" class="product-editor hidden" data-product-editor data-id="${escapeHtml(product.id)}">
      <div class="product-editor-head">
        <span><strong>Chỉnh sửa sản phẩm</strong><small>${escapeHtml(product.sku)}</small></span>
        <span>Mọi thay đổi chỉ được áp dụng sau khi bấm lưu.</span>
      </div>
      <fieldset class="editor-section">
        <legend>${icon('scan-line')}Nhận diện</legend>
        <div class="editor-grid">
          <label>Danh mục · Category<input name="category" value="${escapeHtml(product.category || 'Accounts')}" required></label>
          <label>Thương hiệu · Brand<input name="brand" value="${escapeHtml(product.brand || 'Other')}" required></label>
          <label>Emoji sản phẩm<input name="emoji" maxlength="32" value="${escapeHtml(product.emoji || '')}" placeholder="📦"></label>
          <label>Gói · Package<input name="packageType" value="${escapeHtml(product.packageType || '')}"></label>
          <label class="editor-span-2">Ảnh plan<input name="artwork" value="${escapeHtml(product.artwork || '')}" placeholder="/brand/product-plans/ten-plan.png" spellcheck="false"></label>
          <label>Tên sản phẩm<input name="name" value="${escapeHtml(product.name || '')}" required></label>
          <label class="editor-span-2">Mô tả · Description<textarea name="description" rows="3">${escapeHtml(product.description || '')}</textarea></label>
        </div>
      </fieldset>
      <fieldset class="editor-section">
        <legend>${icon('badge-dollar-sign')}Bán hàng &amp; vận hành</legend>
        <div class="editor-grid">
          <label>Giá bán<input name="price" type="number" min="1" value="${escapeHtml(product.price)}" required></label>
          <label>Tiền tệ · Currency<input name="currency" value="${escapeHtml(product.currency || 'VND')}" required></label>
          <label>Giá hãng tham khảo<input name="officialPriceNote" value="${escapeHtml(product.officialPriceNote || '')}"></label>
          <label>Thứ tự catalog<input name="sortOrder" type="number" min="1" value="${escapeHtml(product.sortOrder || 1000)}"></label>
          <label>Hình thức giao
            <select name="deliveryMode">
              <option value="text" ${(product.deliveryMode || 'text') === 'text' ? 'selected' : ''}>Tin nhắn văn bản</option>
              <option value="file" ${product.deliveryMode === 'file' ? 'selected' : ''}>Tệp TXT</option>
            </select>
          </label>
          <label>Fulfillment
            <select name="fulfillmentMode">
              <option value="inventory" ${isSeatEmailProduct(product) ? '' : 'selected'}>Từ kho · Inventory</option>
              <option value="seat_email" ${isSeatEmailProduct(product) ? 'selected' : ''}>Seat qua email khách hàng</option>
            </select>
          </label>
          <label>Thời hạn Seat (tháng)<input name="seatTermMonths" type="number" min="1" max="120" value="${escapeHtml(product.seatTermMonths || 1)}"></label>
          <label>Trạng thái
            <select name="active">
              <option value="true" ${active ? 'selected' : ''}>Đang bán</option>
              <option value="false" ${active ? '' : 'selected'}>Đã tắt</option>
            </select>
          </label>
          <label class="checkbox-label"><input name="hot" type="checkbox" value="true" ${product.hot ? 'checked' : ''}> Nổi bật · Hot</label>
        </div>
      </fieldset>
      <fieldset class="editor-section editor-section-policy">
        <legend>${icon('shield-check')}Thông tin &amp; chính sách</legend>
        <div class="editor-grid">
          <label class="editor-span-2">Loại tài khoản<textarea name="accountType" rows="3">${escapeHtml(product.accountType || '')}</textarea></label>
          <label class="editor-span-2">Chính sách bảo hành<textarea name="warrantyPolicy" rows="3">${escapeHtml(product.warrantyPolicy || '')}</textarea></label>
          <label class="editor-span-2">Chính sách đổi mới<textarea name="replacementPolicy" rows="3">${escapeHtml(product.replacementPolicy || '')}</textarea></label>
        </div>
      </fieldset>
      <div class="actions product-editor-actions">
        <button class="small" type="submit">${icon('save')}<span>Lưu thay đổi</span></button>
      </div>
    </form>
  `;
}

function renderProductCard(product) {
  const active = product.active !== false;
  const seatEmail = isSeatEmailProduct(product);
  const available = Number(product.stock?.available || 0);
  const reserved = Number(product.stock?.reserved || 0);
  const sold = Number(product.stock?.sold || 0);
  const editorId = productEditorDomId(product.id);
  const stockTone = available === 0 ? 'empty' : available <= 2 ? 'low' : 'healthy';
  return `
    <article class="product-card">
      <div class="product-card-summary">
        <div class="product-identity">
          <span class="product-brand-mark ${product.artwork ? 'has-artwork' : ''}">${productArtwork(product, 'product-card-artwork') || brandLogo(product.brand)}</span>
          <div>
            <div class="product-title-line">
              <h3>${product.emoji ? `<span class="product-title-emoji" aria-hidden="true">${escapeHtml(product.emoji)}</span>` : ''}${escapeHtml(product.name)}</h3>
              ${product.hot ? '<span class="product-hot-badge">Hot</span>' : ''}
            </div>
            <span class="product-sku">${icon('barcode')}${escapeHtml(product.sku)}</span>
            <p class="product-description">${escapeHtml(product.description || 'Chưa có mô tả')}</p>
            <div class="product-identity-tags">
              <span>${icon('tag')}${escapeHtml(product.category || 'Accounts')}</span>
              <span>${icon('package')}${escapeHtml(product.packageType || 'Package')}</span>
            </div>
          </div>
        </div>
        <div class="product-price-cell">
          <small>Giá bán</small>
          <strong>${escapeHtml(money(product.price, product.currency))}</strong>
          <span>${escapeHtml(product.officialPriceNote || 'Chưa có giá hãng')}</span>
        </div>
        <div class="product-fulfillment-cell">
          <small>Fulfillment</small>
          <strong>${icon(seatEmail ? 'mail-check' : 'warehouse')}${escapeHtml(seatEmail ? 'Seat qua email' : 'Từ kho')}</strong>
          <span>${escapeHtml(seatEmail ? `${product.seatTermMonths || 1} tháng` : (product.deliveryMode === 'file' ? 'Tệp TXT' : 'Tin nhắn'))}</span>
        </div>
        ${seatEmail
          ? `<div class="product-stock-cell seat"><small>Tồn kho</small><strong>Không áp dụng</strong><span>Giao theo email</span></div>`
          : `<div class="product-stock-cell ${stockTone}">
              <small>Tồn kho</small>
              <strong>${escapeHtml(available)} khả dụng</strong>
              <span>${escapeHtml(reserved)} giữ · ${escapeHtml(sold)} đã bán</span>
            </div>`}
        <div class="product-operation-cell">
          ${renderStatusPill(active ? 'available' : 'cancelled', active ? 'đang bán' : 'đã tắt')}
          <div class="actions product-row-actions">
            <button class="small secondary" data-action="toggle-product-editor" data-id="${escapeHtml(product.id)}" aria-expanded="false" aria-controls="${escapeHtml(editorId)}">${icon('pencil')}<span>Chỉnh sửa</span></button>
            <button class="small secondary" data-action="toggle-product" data-id="${escapeHtml(product.id)}" data-active="${active}">${icon(active ? 'pause-circle' : 'play-circle')}<span>${active ? 'Tắt bán' : 'Bật bán'}</span></button>
            ${seatEmail ? '' : actionButton('import-stock', product.id, 'Nhập kho', 'small secondary', icon('boxes'))}
          </div>
        </div>
      </div>
      <div class="product-card-context">
        <span>${brandLogo(product.brand)}${escapeHtml(product.brand || 'Other')}</span>
        ${product.accountType ? `<span title="${escapeHtml(product.accountType)}">${icon('user-round-check')}Loại tài khoản</span>` : ''}
        ${product.warrantyPolicy ? `<span title="${escapeHtml(product.warrantyPolicy)}">${icon('shield-check')}Có bảo hành</span>` : ''}
        ${product.replacementPolicy ? `<span title="${escapeHtml(product.replacementPolicy)}">${icon('refresh-cw')}Có đổi mới</span>` : ''}
      </div>
      ${renderProductEditor(product)}
    </article>
  `;
}

function renderProducts(products) {
  state.products = products;
  renderProductFilters(products);
  const list = $('#productsList');
  list.innerHTML = '';
  const filtered = filteredProducts();
  $('#productCountBadge').textContent = `${filtered.length} sản phẩm`;
  renderProductCatalogMetrics(products, filtered);

  const groups = new Map();
  for (const product of filtered) {
    const category = product.category || 'Accounts';
    const brand = product.brand || 'Other';
    const key = `${category}\u0000${brand}`;
    if (!groups.has(key)) groups.set(key, { category, brand, products: [] });
    groups.get(key).products.push(product);
  }
  $('#productGroupSummary').textContent = `${groups.size} nhóm catalog`;

  for (const group of groups.values()) {
    const header = document.createElement('section');
    header.className = 'brand-section';
    const activeCount = group.products.filter((product) => product.active !== false).length;
    header.innerHTML = `
      <div class="brand-section-identity">
        <span>${icon('tag')}${escapeHtml(group.category)}</span>
        <strong>${brandLogo(group.brand)}${escapeHtml(group.brand)}</strong>
      </div>
      <span class="brand-section-count">${group.products.length} sản phẩm · ${activeCount} đang bán</span>
    `;
    list.appendChild(header);
    for (const product of group.products) {
      const item = document.createElement('div');
      item.className = 'product-list-item';
      item.innerHTML = renderProductCard(product);
      list.appendChild(item);
    }
  }
  if (!filtered.length) {
    list.innerHTML = `
      <div class="product-empty-state empty-state">
        ${icon('search-x')}
        <strong>Không tìm thấy sản phẩm</strong>
        <span>Thử đổi từ khóa hoặc đặt lại bộ lọc hiện tại.</span>
      </div>
    `;
  }

  const select = $('#inventoryForm select[name="productId"]');
  const selectedProductId = select.value;
  const inventoryProducts = sortedProducts(products).filter((product) => !isSeatEmailProduct(product));
  select.innerHTML = inventoryProducts.length
    ? inventoryProducts.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.brand || 'Other')} - ${escapeHtml(product.name)} (${escapeHtml(product.sku)})</option>`).join('')
    : '<option value="">Không có sản phẩm quản lý bằng kho</option>';
  select.disabled = inventoryProducts.length === 0;
  if (inventoryProducts.some((product) => product.id === selectedProductId)) {
    select.value = selectedProductId;
  }
  refreshIcons();
}

function normalizeTelegramUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}

function selectedTelegramPriceList() {
  const username = normalizeTelegramUsername(state.telegramPricingUsername);
  return (state.telegramPricing.priceLists || []).find((item) => (
    normalizeTelegramUsername(item.username) === username
  ));
}

function catalogBasePrices() {
  return state.telegramPricing.basePriceList?.prices || {};
}

function resolvedCatalogBasePrice(product) {
  const prices = catalogBasePrices();
  const configured = Object.prototype.hasOwnProperty.call(prices, product.sku);
  return {
    price: configured ? Number(prices[product.sku]) : Number(product.price),
    configured
  };
}

function renderCatalogPricingProducts() {
  const products = sortedProducts(state.products);
  const prices = catalogBasePrices();
  $('#catalogPricingProducts').innerHTML = products.length ? `
    <div class="table-wrap pricing-table-wrap">
      <table class="data-table pricing-table responsive-table">
        <thead>
          <tr><th>Sản phẩm</th><th>SKU</th><th>Giá bán trên bot</th><th>Giá gốc / vốn</th></tr>
        </thead>
        <tbody>
          ${products.map((product) => {
            const hasBasePrice = Object.prototype.hasOwnProperty.call(prices, product.sku);
            return `
            <tr class="base-price-row ${hasBasePrice ? 'has-base-price' : ''}">
              <td data-label="Sản phẩm"><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.brand || 'Other')}</span></td>
              <td data-label="SKU">${escapeHtml(product.sku)}</td>
              <td data-label="Giá bán trên bot">${escapeHtml(money(product.price, product.currency))}</td>
              <td data-label="Giá gốc / vốn">
                <input
                  class="catalog-base-price-input"
                  data-catalog-price-sku="${escapeHtml(product.sku)}"
                  type="number"
                  min="1"
                  step="1"
                  value="${escapeHtml(hasBasePrice ? prices[product.sku] : '')}"
                  placeholder="Nhập giá vốn"
                  aria-label="Giá vốn cho ${escapeHtml(product.name)}"
                >
                <span class="pricing-inheritance">${hasBasePrice ? 'Đã có dữ liệu tính lợi nhuận' : 'Chưa có giá vốn · lợi nhuận sẽ thiếu'}</span>
              </td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : '<p class="meta empty-state">Hãy tạo sản phẩm trước khi cấu hình bảng giá gốc.</p>';
}

function renderTelegramPricingProducts() {
  const priceList = selectedTelegramPriceList();
  const prices = priceList?.prices || {};
  const products = sortedProducts(state.products);
  $('#telegramPricingProducts').innerHTML = products.length ? `
    <div class="table-wrap pricing-table-wrap">
      <table class="data-table pricing-table responsive-table">
        <thead>
          <tr><th>Sản phẩm</th><th>Giá bán trên bot</th><th>Giá gốc / vốn</th><th>Giá riêng</th></tr>
        </thead>
        <tbody>
          ${products.map((product) => {
            const hasOverride = Object.prototype.hasOwnProperty.call(prices, product.sku);
            const basePricing = resolvedCatalogBasePrice(product);
            return `
            <tr class="pricing-row ${hasOverride ? 'has-override' : ''}">
              <td data-label="Sản phẩm">
                <strong>${escapeHtml(product.name)}</strong>
                <span>${escapeHtml(product.sku)}</span>
              </td>
              <td data-label="Giá bán trên bot">
                <strong>${escapeHtml(money(product.price, product.currency))}</strong>
                <span>Mặc định nếu không có giá riêng</span>
              </td>
              <td data-label="Giá gốc / vốn">
                <strong>${basePricing.configured ? escapeHtml(money(basePricing.price, product.currency)) : '—'}</strong>
                <span>${basePricing.configured ? 'Dùng tính lợi nhuận' : 'Chưa cấu hình'}</span>
              </td>
              <td data-label="Giá riêng">
                <input
                  class="pricing-override-input"
                  data-telegram-price-sku="${escapeHtml(product.sku)}"
                  type="number"
                  min="1"
                  step="1"
                  value="${escapeHtml(hasOverride ? prices[product.sku] : '')}"
                  placeholder="Dùng giá bán hiện tại"
                  aria-label="Giá riêng cho ${escapeHtml(product.name)}"
                >
                <span class="pricing-inheritance">${hasOverride ? 'Bot dùng giá riêng' : 'Bot dùng giá bán hiện tại'}</span>
              </td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : '<p class="meta empty-state">Hãy tạo sản phẩm trước khi cấu hình giá theo username.</p>';
}

function renderTelegramPricing(pricing = state.telegramPricing) {
  state.telegramPricing = pricing || { basePriceList: { id: 'base', prices: {} }, priceLists: [], users: [] };
  state.telegramPricing.basePriceList ||= { id: 'base', prices: {} };
  const configuredBasePrices = Object.keys(catalogBasePrices()).length;
  const basePriceBadge = $('#catalogBasePriceCount');
  basePriceBadge.textContent = configuredBasePrices ? `${configuredBasePrices} SKU có giá vốn` : 'Chưa cấu hình';
  basePriceBadge.className = `badge ${configuredBasePrices ? 'available' : 'reserved'}`;
  const knownUsernames = [...new Set([
    ...(state.telegramPricing.users || []).map((user) => normalizeTelegramUsername(user.username)),
    ...(state.telegramPricing.priceLists || []).map((item) => normalizeTelegramUsername(item.username))
  ].filter(Boolean))].sort();
  $('#telegramPricingUsers').innerHTML = knownUsernames
    .map((username) => `<option value="@${escapeHtml(username)}"></option>`)
    .join('');
  $('#telegramPricingCount').textContent = `${state.telegramPricing.priceLists.length} username`;
  $('#telegramPricingLists').innerHTML = state.telegramPricing.priceLists.length
    ? state.telegramPricing.priceLists.map((item) => {
      const username = normalizeTelegramUsername(item.username);
      const customPrices = Object.keys(item.prices || {}).length;
      return `
        <div class="row">
          <div class="row-title">
            <strong>${icon('user-round')}@${escapeHtml(username)}</strong>
            <span class="badge available">${escapeHtml(customPrices)} SKU</span>
          </div>
          <div class="meta">Cập nhật ${escapeHtml(new Date(item.updatedAt).toLocaleString('vi-VN'))}</div>
          <div class="actions">
            <button class="small secondary" data-action="edit-telegram-pricing" data-username="${escapeHtml(username)}">${icon('pencil')}<span>Chỉnh sửa</span></button>
            <button class="small danger" data-action="delete-telegram-pricing" data-username="${escapeHtml(username)}">${icon('trash-2')}<span>Xóa</span></button>
          </div>
        </div>
      `;
    }).join('')
    : '<p class="meta empty-state">Chưa có bảng giá riêng theo username.</p>';
  $('#telegramPricingUsername').value = state.telegramPricingUsername
    ? `@${normalizeTelegramUsername(state.telegramPricingUsername)}`
    : '';
  renderCatalogPricingProducts();
  renderTelegramPricingProducts();
  refreshIcons();
}

function selectTelegramPricingUsername(value) {
  state.telegramPricingUsername = normalizeTelegramUsername(value);
  $('#telegramPricingUsername').value = state.telegramPricingUsername
    ? `@${state.telegramPricingUsername}`
    : '';
  renderTelegramPricingProducts();
}

function newDiscountCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  return `KAITO-${Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')}`;
}

function setDiscountCreateOpen(open, { restoreFocus = false } = {}) {
  const expanded = Boolean(open);
  state.discountCreateOpen = expanded;
  $('#discountForm').classList.toggle('hidden', !expanded);
  $('#discountCreateToggle').setAttribute('aria-expanded', String(expanded));
  if (expanded) {
    if (!$('#discountCodeInput').value.trim()) $('#discountCodeInput').value = newDiscountCode();
    renderDiscountFormPreview();
    requestAnimationFrame(() => $('#discountForm input[name="campaignName"]')?.focus({ preventScroll: true }));
  } else if (restoreFocus) {
    $('#discountCreateToggle').focus();
  }
}

function resetDiscountForm() {
  const form = $('#discountForm');
  form.reset();
  form.elements.code.value = newDiscountCode();
  form.elements.value.removeAttribute('max');
  form.elements.value.placeholder = '50000';
  $('.discount-optional-details').open = false;
  $('#discountFormError').textContent = '';
  $('#discountFormError').classList.add('hidden');
  $$('[data-discount-expiry-days]').forEach((button) => button.classList.remove('active'));
  renderDiscountFormPreview();
}

function discountDisplayState(discount) {
  if (discount.usedAt || discount.usedByOrderId) return { key: 'used', label: 'Đã sử dụng', badge: 'delivered' };
  if (discount.reservedByOrderId && Number(new Date(discount.reservedUntil)) > Date.now()) {
    return { key: 'reserved', label: 'Đang giữ', badge: 'reserved' };
  }
  if (discount.expiresAt && Number(new Date(discount.expiresAt)) <= Date.now()) {
    return { key: 'expired', label: 'Hết hạn', badge: 'expired' };
  }
  if (discount.active === false) return { key: 'inactive', label: 'Đã khóa', badge: 'cancelled' };
  return { key: 'active', label: 'Khả dụng', badge: 'available' };
}

function discountValueLabel(discount) {
  return discount.type === 'percent'
    ? `${Number(discount.value || 0).toLocaleString('vi-VN')}%`
    : money(discount.value, 'VND');
}

function discountDate(value, fallback = '-') {
  if (!value) return fallback;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('vi-VN') : fallback;
}

function filteredDiscountCodes() {
  const query = state.discountSearch.trim().toLowerCase();
  return state.discountCodes.filter((discount) => {
    const status = discountDisplayState(discount).key;
    const statusMatch = state.discountStatus === 'all'
      || status === state.discountStatus
      || (state.discountStatus === 'unavailable' && ['expired', 'inactive'].includes(status));
    if (!statusMatch) return false;
    if (!query) return true;
    return [
      discount.code,
      discount.campaignName,
      discount.internalNote,
      discount.reservedByOrderId,
      discount.reservedByUserId,
      discount.usedByOrderId,
      discount.usedByUserId,
      discount.createdBy,
      status
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });
}

function renderDiscountMetrics() {
  const counts = { active: 0, reserved: 0, used: 0, unavailable: 0 };
  for (const discount of state.discountCodes) {
    const status = discountDisplayState(discount).key;
    if (counts[status] !== undefined) counts[status] += 1;
    if (['expired', 'inactive'].includes(status)) counts.unavailable += 1;
  }
  $('#discountMetricTotal').textContent = state.discountCodes.length.toLocaleString('vi-VN');
  $('#discountMetricActive').textContent = counts.active.toLocaleString('vi-VN');
  $('#discountMetricReserved').textContent = counts.reserved.toLocaleString('vi-VN');
  $('#discountMetricUsed').textContent = counts.used.toLocaleString('vi-VN');
  $('#discountMetricUnavailable').textContent = counts.unavailable.toLocaleString('vi-VN');
  $$('[data-discount-status]').forEach((button) => {
    const active = button.dataset.discountStatus === state.discountStatus;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function discountUsageMarkup(discount, status) {
  if (status.key === 'used') {
    return `
      <strong>${escapeHtml(discount.usedByOrderId || 'Không rõ đơn')}</strong>
      <span>User: ${escapeHtml(discount.usedByUserId || '-')}</span>
      <span>${escapeHtml(discountDate(discount.usedAt))}</span>
    `;
  }
  if (status.key === 'reserved') {
    return `
      <strong>${escapeHtml(discount.reservedByOrderId || 'Đơn đang giữ')}</strong>
      <span>User: ${escapeHtml(discount.reservedByUserId || '-')}</span>
      <span>Giữ đến ${escapeHtml(discountDate(discount.reservedUntil))}</span>
    `;
  }
  return '<strong>0 / 1 lượt</strong><span>Chưa sử dụng</span>';
}

function discountDetailMarkup(discount, status) {
  const expiry = discount.expiresAt ? discountDate(discount.expiresAt) : 'Không giới hạn';
  const lifecycle = status.key === 'used'
    ? `Đã thanh toán đơn ${discount.usedByOrderId || '-'} lúc ${discountDate(discount.usedAt)}`
    : status.key === 'reserved'
      ? `Đang giữ cho đơn ${discount.reservedByOrderId || '-'} từ ${discountDate(discount.reservedAt)} đến ${discountDate(discount.reservedUntil)}`
      : status.key === 'expired'
        ? `Mã hết hạn lúc ${expiry}`
        : status.key === 'inactive'
          ? 'Mã đã được Admin khóa thủ công'
          : 'Mã sẵn sàng cho một đơn hàng hợp lệ';
  return `
    <div class="discount-detail-grid">
      <span><strong>Chiến dịch</strong>${escapeHtml(discount.campaignName || 'Không đặt tên')}</span>
      <span><strong>Phạm vi</strong>Tất cả sản phẩm · 1 đơn duy nhất</span>
      <span><strong>Điều kiện đơn</strong>${escapeHtml(discount.minOrderTotal ? `Tối thiểu ${money(discount.minOrderTotal)}` : 'Không yêu cầu tối thiểu')}</span>
      <span><strong>Thời hạn</strong>${escapeHtml(expiry)}</span>
      <span><strong>Người tạo</strong>${escapeHtml(discount.createdBy || '-')} · ${escapeHtml(discountDate(discount.createdAt))}</span>
      <span><strong>Cập nhật dữ liệu</strong>${escapeHtml(discountDate(discount.updatedAt))} · Admin gần nhất: ${escapeHtml(discount.updatedBy || '-')}</span>
    </div>
    <div class="discount-lifecycle-note">${icon('route', 'inline-icon')}<span>${escapeHtml(lifecycle)}</span></div>
    ${discount.internalNote ? `<div class="discount-internal-note"><strong>Ghi chú nội bộ</strong><span>${escapeHtml(discount.internalNote)}</span></div>` : ''}
  `;
}

function renderDiscountCodes(discounts = state.discountCodes) {
  state.discountCodes = Array.isArray(discounts) ? discounts : [];
  const filtered = filteredDiscountCodes();
  renderDiscountMetrics();
  $('#discountCodeCount').textContent = `${filtered.length}/${state.discountCodes.length} mã`;
  $('#discountFilterSummary').textContent = state.discountCodes.length
    ? `Hiển thị ${filtered.length}/${state.discountCodes.length} mã · Sắp xếp mới nhất trước`
    : 'Theo dõi mã khả dụng, đang giữ và đã sử dụng.';
  $('#discountStatusFilter').value = state.discountStatus;
  $('#discountSearch').value = state.discountSearch;
  $('#discountFilterReset').disabled = state.discountStatus === 'all' && !state.discountSearch;
  $('#discountCodesList').innerHTML = filtered.length ? `
    <div class="table-wrap">
      <table class="data-table responsive-table discount-table">
        <thead>
          <tr><th>Mã / chiến dịch</th><th>Mức giảm</th><th>Điều kiện</th><th>Trạng thái</th><th>Sử dụng</th><th>Hành động</th></tr>
        </thead>
        <tbody>
          ${filtered.map((discount) => {
            const status = discountDisplayState(discount);
            const expiry = discount.expiresAt
              ? discountDate(discount.expiresAt)
              : 'Không giới hạn';
            const expanded = state.expandedDiscountId === discount.id;
            const immutable = ['used', 'expired'].includes(status.key);
            return `
              <tr class="discount-row status-${escapeHtml(status.key)}">
                <td data-label="Mã / chiến dịch"><code class="discount-code-token">${escapeHtml(discount.code)}</code><strong>${escapeHtml(discount.campaignName || 'Không đặt tên chiến dịch')}</strong><span>Tạo ${escapeHtml(discountDate(discount.createdAt))}</span></td>
                <td data-label="Mức giảm"><strong>${escapeHtml(discountValueLabel(discount))}</strong><span>Dùng 1 lần</span></td>
                <td data-label="Điều kiện"><strong>${escapeHtml(discount.minOrderTotal ? `Từ ${money(discount.minOrderTotal)}` : 'Không tối thiểu')}</strong><span>Hết hạn: ${escapeHtml(expiry)}</span></td>
                <td data-label="Trạng thái">${renderStatusPill(status.badge, status.label)}</td>
                <td data-label="Sử dụng">${discountUsageMarkup(discount, status)}</td>
                <td data-label="Hành động"><div class="discount-row-actions">
                  <button class="small secondary icon-button" data-action="copy-discount-code" data-code="${escapeHtml(discount.code)}">${icon('copy')}<span>Sao chép</span></button>
                  <button class="small secondary icon-button" data-action="toggle-discount-detail" data-id="${escapeHtml(discount.id)}" aria-expanded="${expanded}">${icon(expanded ? 'chevron-up' : 'chevron-down')}<span>Chi tiết</span></button>
                  ${immutable ? '' : `<button class="small secondary icon-button" data-action="toggle-discount-code" data-id="${escapeHtml(discount.id)}" data-active="${discount.active !== false}">${icon(discount.active !== false ? 'lock-keyhole' : 'lock-keyhole-open')}<span>${discount.active !== false ? 'Khóa' : 'Mở'}</span></button>`}
                </div></td>
              </tr>
              ${expanded ? `<tr class="discount-detail-row"><td colspan="6">${discountDetailMarkup(discount, status)}</td></tr>` : ''}
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : state.discountCodes.length
    ? `<div class="discount-empty-state"><span>${icon('search-x')}</span><strong>Không tìm thấy mã phù hợp</strong><p>Thử bỏ bớt từ khóa hoặc đặt lại bộ lọc trạng thái.</p><button class="secondary" type="button" data-action="reset-discount-filter">${icon('rotate-ccw')}<span>Đặt lại bộ lọc</span></button></div>`
    : `<div class="discount-empty-state"><span>${icon('ticket-plus')}</span><strong>Chưa có mã giảm giá</strong><p>Tạo mã dùng một lần đầu tiên để áp dụng trong Telegram checkout.</p><button type="button" data-action="open-discount-create">${icon('ticket-plus')}<span>Tạo mã đầu tiên</span></button></div>`;
  refreshIcons();
}

function renderDiscountFormPreview() {
  const form = $('#discountForm');
  const data = Object.fromEntries(new FormData(form).entries());
  const rawCode = String(data.code || '').trim().toUpperCase();
  const code = rawCode || 'MA-GIAM-GIA';
  const value = Number(data.value || 0);
  const minimum = Number(data.minOrderTotal || 0);
  const percent = data.type === 'percent';
  const valueLabel = value > 0
    ? discountValueLabel({ type: data.type, value })
    : 'Chưa nhập mức giảm';
  const condition = minimum > 0 ? `Đơn từ ${money(minimum)}` : 'Không yêu cầu đơn tối thiểu';
  const expiryTimestamp = Date.parse(String(data.expiresAt || ''));
  const expiry = Number.isFinite(expiryTimestamp)
    ? discountDate(new Date(expiryTimestamp).toISOString())
    : 'Không hết hạn';
  const sampleOrder = minimum > 0
    ? minimum
    : percent
      ? 200000
      : Math.max(100000, value * 2);
  const sampleDiscount = value > 0
    ? percent ? Math.floor(sampleOrder * value / 100) : Math.min(value, sampleOrder)
    : 0;
  const sampleTotal = Math.max(0, sampleOrder - sampleDiscount);
  const codeReady = /^[A-Z0-9_-]{4,32}$/.test(rawCode);
  const valueReady = Number.isFinite(value) && value > 0 && (!percent || value < 100);
  const minimumReady = minimum >= 0 && (percent || minimum === 0 || minimum > value);
  const expiryReady = !data.expiresAt || (Number.isFinite(expiryTimestamp) && expiryTimestamp > Date.now());
  form.elements.minOrderTotal.setCustomValidity(minimumReady ? '' : 'Đơn tối thiểu phải lớn hơn số tiền giảm.');
  form.elements.expiresAt.min = discountExpiryInputValue(0);
  form.elements.expiresAt.setCustomValidity(expiryReady ? '' : 'Thời hạn phải nằm trong tương lai.');
  const ready = codeReady && valueReady && minimumReady && expiryReady;
  $('#discountValueSuffix').textContent = percent ? '%' : 'VND';
  $('#discountFormSubmit').disabled = !ready;
  $$('[data-discount-type][data-discount-value]').forEach((button) => {
    button.classList.toggle('active', button.dataset.discountType === data.type && Number(button.dataset.discountValue) === value);
  });
  $('#discountFormPreview').innerHTML = `
    <div class="discount-ticket">
      <div class="discount-ticket-brand"><span>${icon('ticket-percent', 'inline-icon')}KAITO AI SHOP</span><small>Dùng một lần</small></div>
      <code class="discount-preview-code">${escapeHtml(code)}</code>
      <strong>${escapeHtml(valueLabel)}</strong>
      <div class="discount-ticket-meta"><span>${icon('shopping-cart', 'inline-icon')}${escapeHtml(condition)}</span><span>${icon('calendar-clock', 'inline-icon')}${escapeHtml(expiry)}</span></div>
    </div>
    <div class="discount-preview-example">
      <span><small>Đơn mẫu</small><strong>${escapeHtml(money(sampleOrder))}</strong></span>
      <span><small>Giảm giá</small><strong>−${escapeHtml(money(sampleDiscount))}</strong></span>
      <span class="discount-preview-total"><small>Khách thanh toán</small><strong>${escapeHtml(money(sampleTotal))}</strong></span>
    </div>
  `;
  $('#discountCreateChecklist').innerHTML = [
    [codeReady, 'Mã hợp lệ'],
    [valueReady, percent ? 'Phần trăm từ 1–99%' : 'Số tiền giảm hợp lệ'],
    [minimumReady, minimum > 0 ? (minimumReady ? `Đơn tối thiểu ${money(minimum)}` : 'Đơn tối thiểu phải lớn hơn mức giảm') : 'Áp dụng mọi giá trị đơn'],
    [expiryReady, data.expiresAt ? `Hiệu lực đến ${expiry}` : 'Không giới hạn thời gian']
  ].map(([complete, label]) => `<span class="${complete ? 'is-complete' : ''}">${icon(complete ? 'circle-check' : 'circle', 'inline-icon')}<span>${escapeHtml(label)}</span></span>`).join('');
  refreshIcons();
}

function discountExpiryInputValue(days) {
  const date = new Date(Date.now() + (Number(days) * 24 * 60 * 60_000));
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60_000));
  return local.toISOString().slice(0, 16);
}

async function copyDiscountCode(code) {
  const value = String(code || '').trim();
  if (!value) return;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch { }
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Copy command was rejected');
}

const notificationEmojiText = {
  boom: '💥',
  fire: '🔥',
  'shopping-bag': '🛍',
  megaphone: '📣',
  bell: '🔔',
  party: '🎉',
  info: 'ℹ️',
  warning: '⚠️'
};

function notificationStatus(status) {
  return ({
    draft: { label: 'Bản nháp', badge: 'reserved' },
    scheduled: { label: 'Đã lên lịch', badge: 'processing' },
    sending: { label: 'Đang gửi', badge: 'processing' },
    completed: { label: 'Hoàn tất', badge: 'available' },
    completed_with_errors: { label: 'Có lỗi', badge: 'payment_review' }
  })[status] || { label: status || 'Không rõ', badge: 'cancelled' };
}

function notificationCategoryLabel(category) {
  return ({ promotion: 'Ưu đãi', stock: 'Hàng mới / restock', news: 'Tin tức', service: 'Cập nhật dịch vụ' })[category] || category;
}

function notificationAudienceLabel(audience = {}) {
  const labels = {
    subscribers: 'Người đã đăng ký',
    customers: 'Khách đã thanh toán',
    product: `Khách mua ${audience.value || 'SKU'}`,
    username: `@${String(audience.value || '').replace(/^@/, '')}`
  };
  return labels[audience.type] || audience.type || '-';
}

function syncNotificationForm() {
  const form = $('#notificationForm');
  if (!form) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const needsAudienceValue = ['product', 'username'].includes(data.audienceType);
  const audienceField = $('#notificationAudienceValueField');
  audienceField.classList.toggle('hidden', !needsAudienceValue);
  const audienceInput = audienceField.querySelector('input');
  audienceInput.disabled = !needsAudienceValue;
  audienceInput.required = needsAudienceValue;
  audienceInput.placeholder = data.audienceType === 'username' ? '@username' : 'chatgpt-plus-1m';
  audienceInput.setAttribute('list', data.audienceType === 'username' ? 'notificationUserOptions' : 'notificationProductOptions');
  audienceField.firstChild.textContent = data.audienceType === 'username' ? 'Username Telegram' : 'SKU đã mua';

  const needsCtaValue = data.ctaType === 'product';
  const ctaField = $('#notificationCtaValueField');
  ctaField.classList.toggle('hidden', !needsCtaValue);
  const ctaInput = ctaField.querySelector('input');
  ctaInput.disabled = !needsCtaValue;
  ctaInput.required = needsCtaValue;

  const emoji = notificationEmojiText[data.emojiKey] || '🔔';
  const title = String(data.title || '').trim() || 'Tiêu đề thông báo';
  const message = String(data.message || '').trim() || 'Nội dung thân thiện, ngắn gọn và hữu ích sẽ xuất hiện tại đây.';
  const friendly = ({
    promotion: '🥳 Chúc bạn chọn được gói phù hợp.',
    stock: '👌 Bot sẵn sàng hỗ trợ bạn đặt nhanh.',
    news: '🫡 Cảm ơn bạn đã đồng hành cùng KAITO.',
    service: '👌 Cảm ơn bạn đã kiên nhẫn cùng KAITO.'
  })[data.category] || '👌 KAITO luôn sẵn sàng hỗ trợ bạn.';
  const ctaLabels = { catalog: 'Xem sản phẩm', orders: 'Xem đơn hàng', product: 'Xem gói ngay' };
  const ctaLabel = String(data.ctaLabel || '').trim() || ctaLabels[data.ctaType] || '';
  $('#notificationPreview').innerHTML = `
    <div class="notification-preview-head"><span>${escapeHtml(emoji)}</span><div><small>Xem trước Telegram</small><strong>${escapeHtml(title)}</strong></div></div>
    <p>${escapeHtml(message).replaceAll('\n', '<br>')}</p>
    <span class="notification-preview-friendly">${escapeHtml(friendly)}</span>
    <span class="notification-preview-category">${icon('bell-ring', 'inline-icon')}${escapeHtml(notificationCategoryLabel(data.category))} · /notifications</span>
    ${data.ctaType !== 'none' ? `<button type="button" tabindex="-1">${escapeHtml(ctaLabel)}</button>` : ''}
  `;
  $('#notificationMessageCount').textContent = `${String(data.message || '').length}/1200`;
  refreshIcons();
}

function renderNotifications(overview = state.notificationOverview) {
  state.notificationOverview = overview || { campaigns: [], metrics: {}, audience: {} };
  const metrics = state.notificationOverview.metrics || {};
  const audience = state.notificationOverview.audience || {};
  const campaigns = state.notificationOverview.campaigns || [];
  $('#notificationMetricCampaigns').textContent = Number(metrics.campaigns || 0).toLocaleString('vi-VN');
  $('#notificationMetricSent').textContent = Number(metrics.sent || 0).toLocaleString('vi-VN');
  $('#notificationMetricSubscribers').textContent = Number(audience.subscribers || 0).toLocaleString('vi-VN');
  $('#notificationMetricSubscribersMeta').textContent = `${Number(audience.knownUsers || 0).toLocaleString('vi-VN')} user đã biết`;
  $('#notificationMetricFailed').textContent = Number(metrics.failed || 0) + Number(metrics.blocked || 0);
  $('#notificationMetricClicked').textContent = Number(metrics.clicked || 0).toLocaleString('vi-VN');
  $('#notificationCampaignCount').textContent = `${campaigns.length} chiến dịch`;
  $('#notificationProductOptions').innerHTML = state.products.map((product) => (
    `<option value="${escapeHtml(product.sku)}">${escapeHtml(product.name)}</option>`
  )).join('');
  $('#notificationUserOptions').innerHTML = (state.notificationOverview.users || []).map((user) => (
    `<option value="@${escapeHtml(String(user.username || '').replace(/^@/, ''))}"></option>`
  )).join('');
  $('#notificationCampaignsList').innerHTML = campaigns.length ? campaigns.map((campaign) => {
    const status = notificationStatus(campaign.status);
    const summary = campaign.deliverySummary || {};
    const scheduled = campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString('vi-VN') : '';
    return `
      <article class="notification-campaign-card">
        <div class="notification-campaign-head">
          <span class="notification-campaign-emoji">${escapeHtml(notificationEmojiText[campaign.emojiKey] || '🔔')}</span>
          <div><strong>${escapeHtml(campaign.title)}</strong><small>${escapeHtml(notificationCategoryLabel(campaign.category))} · ${escapeHtml(notificationAudienceLabel(campaign.audience))}</small></div>
          ${renderStatusPill(status.badge, status.label)}
        </div>
        <p>${escapeHtml(campaign.message)}</p>
        ${scheduled ? `<span class="notification-campaign-schedule">${icon('calendar-clock', 'inline-icon')} ${escapeHtml(scheduled)}</span>` : ''}
        <div class="notification-delivery-summary">
          <span><strong>${escapeHtml(summary.targeted || 0)}</strong>nhắm đến</span>
          <span><strong>${escapeHtml(summary.sent || 0)}</strong>đã gửi</span>
          <span><strong>${escapeHtml((summary.failed || 0) + (summary.blocked || 0))}</strong>lỗi/chặn</span>
          <span><strong>${escapeHtml(summary.clicked || 0)}</strong>click</span>
        </div>
        ${campaign.status === 'draft' ? `<div class="actions"><button class="small" data-action="send-notification-campaign" data-id="${escapeHtml(campaign.id)}">${icon('send')}<span>Gửi chiến dịch</span></button></div>` : ''}
      </article>
    `;
  }).join('') : '<p class="meta empty-state">Chưa có chiến dịch. Có thể bắt đầu với một username đã bật đúng nhóm thông báo.</p>';
  syncNotificationForm();
  refreshIcons();
}

async function refreshNotifications() {
  renderNotifications(await api('/api/notifications'));
}

function compactNumber(value) {
  return new Intl.NumberFormat('vi-VN', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function compactMoney(value) {
  return `${compactNumber(value)} ₫`;
}

function dashboardDeltaLabel(value) {
  if (value === null || value === undefined) return 'mới so với 7 ngày trước';
  const numeric = Number(value || 0);
  return `${numeric > 0 ? '+' : ''}${numeric}% so với 7 ngày trước`;
}

function dashboardDateLabel(value) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? `${value}T12:00:00.000Z` : value;
  const timestamp = Date.parse(String(normalized || ''));
  if (!Number.isFinite(timestamp)) return '-';
  return new Date(timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function todayDeltaLabel(value, yesterdayValue, formatter = (item) => Number(item || 0).toLocaleString('vi-VN')) {
  const previous = formatter(yesterdayValue);
  if (value === null || value === undefined) return `Hôm qua: ${previous} · phát sinh mới`;
  const numeric = Number(value || 0);
  return `Hôm qua: ${previous} · ${numeric > 0 ? '+' : ''}${numeric}%`;
}

function setStatMeta(id, text, tone = 'neutral') {
  const element = $(`#${id}`);
  if (!element) return;
  element.textContent = text;
  element.dataset.tone = tone;
}

function renderRevenueTrendChart(analytics = state.dashboardAnalytics) {
  const target = $('#revenueTrendChart');
  if (!target) return;
  const days = Math.min(Number(state.dashboardRangeDays || 14), Number(analytics?.windowDays || 30));
  const hourly = days === 1 && Array.isArray(analytics?.hourlyToday) && analytics.hourlyToday.length === 24;
  const daily = hourly
    ? analytics.hourlyToday
    : (analytics?.daily || []).slice(-days);
  const totals = daily.reduce((sum, day) => ({
    orders: sum.orders + Number(day.orders || 0),
    revenue: sum.revenue + Number(day.revenue || 0),
    coveredRevenue: sum.coveredRevenue + Number(day.coveredRevenue || 0),
    grossProfit: sum.grossProfit + Number(day.grossProfit || 0),
    ordersMissingCost: sum.ordersMissingCost + Number(day.ordersMissingCost || 0)
  }), { orders: 0, revenue: 0, coveredRevenue: 0, grossProfit: 0, ordersMissingCost: 0 });
  const rangeLabel = hourly ? 'Hôm nay 00:00–23:59' : `${days} ngày`;
  const pointLabel = (point) => hourly ? String(point.label || `${String(point.hour || 0).padStart(2, '0')}:00`) : dashboardDateLabel(point.date);
  const pointPeriod = (point) => hourly
    ? `${pointLabel(point)}–${String(point.hour || 0).padStart(2, '0')}:59`
    : pointLabel(point);
  const costCoverage = totals.revenue ? Math.round((totals.coveredRevenue / totals.revenue) * 1000) / 10 : 0;
  const profitSummary = totals.coveredRevenue
    ? `LN gộp ${money(totals.grossProfit)} · phủ giá vốn ${costCoverage}%`
    : 'Lợi nhuận chưa đủ dữ liệu giá gốc';
  $('#trendChartSummary').textContent = `${rangeLabel} · ${totals.orders.toLocaleString('vi-VN')} đơn · DT ${money(totals.revenue)} · ${profitSummary}`;
  if (!daily.length || (!totals.orders && !totals.revenue)) {
    target.innerHTML = '<p class="meta empty-state">Chưa có giao dịch trong khoảng thời gian này.</p>';
    return;
  }

  const availableWidth = Math.round(target.getBoundingClientRect().width || 760);
  const width = Math.max(320, Math.min(760, availableWidth));
  const compactChart = width < 520;
  const height = compactChart ? 238 : 260;
  const padding = compactChart
    ? { top: 16, right: 10, bottom: 36, left: 48 }
    : { top: 18, right: 24, bottom: 38, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxMoney = Math.max(
    ...daily.map((day) => Number(day.revenue || 0)),
    ...daily.map((day) => Number(day.grossProfit || 0)),
    1
  );
  const minMoney = Math.min(0, ...daily.map((day) => Number(day.grossProfit || 0)));
  const moneyRange = Math.max(1, maxMoney - minMoney);
  const maxOrders = Math.max(...daily.map((day) => Number(day.orders || 0)), 1);
  const pointX = (index) => padding.left + (daily.length === 1 ? chartWidth / 2 : (index / (daily.length - 1)) * chartWidth);
  const moneyY = (value) => padding.top + ((maxMoney - Number(value || 0)) / moneyRange) * chartHeight;
  const zeroY = moneyY(0);
  const barWidth = Math.max(5, Math.min(18, chartWidth / Math.max(daily.length * 1.8, 1)));
  const points = daily.map((day, index) => `${pointX(index)},${moneyY(day.revenue)}`).join(' ');
  let profitActive = false;
  const profitPath = daily.map((day, index) => {
    const hasCost = Number(day.ordersWithCost || 0) > 0;
    if (!hasCost) {
      profitActive = false;
      return '';
    }
    const command = profitActive ? 'L' : 'M';
    profitActive = true;
    return `${command} ${pointX(index)} ${moneyY(day.grossProfit)}`;
  }).filter(Boolean).join(' ');
  const areaPath = daily.length
    ? `M ${pointX(0)} ${zeroY} L ${daily.map((day, index) => `${pointX(index)} ${moneyY(day.revenue)}`).join(' L ')} L ${pointX(daily.length - 1)} ${zeroY} Z`
    : '';
  const labelStep = Math.max(1, Math.ceil(daily.length / (compactChart ? 5 : 6)));
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + chartHeight - chartHeight * ratio;
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid-line"></line>
      <text x="${padding.left - 10}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${escapeHtml(compactMoney(minMoney + (moneyRange * ratio)))}</text>
    `;
  }).join('');
  const bars = daily.map((day, index) => {
    const barHeight = (Number(day.orders || 0) / maxOrders) * chartHeight;
    const x = pointX(index) - barWidth / 2;
    const y = padding.top + chartHeight - barHeight;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" class="orders-bar"><title>${escapeHtml(`${pointPeriod(day)}: ${day.orders} đơn được tạo`)}</title></rect>`;
  }).join('');
  const dots = daily.map((day, index) => `
    <circle cx="${pointX(index)}" cy="${moneyY(day.revenue)}" r="${daily.length > 20 ? 2.5 : 3.5}" class="revenue-dot">
      <title>${escapeHtml(`${pointPeriod(day)}: doanh thu ${money(day.revenue)} · ${day.paidOrders || 0} đơn thanh toán`)}</title>
    </circle>
  `).join('');
  const profitDots = daily.map((day, index) => Number(day.ordersWithCost || 0) > 0 ? `
    <circle cx="${pointX(index)}" cy="${moneyY(day.grossProfit)}" r="${daily.length > 20 ? 2.5 : 3.5}" class="profit-dot">
      <title>${escapeHtml(`${pointPeriod(day)}: lợi nhuận ${money(day.grossProfit)} · phủ giá vốn ${day.costCoveragePercent || 0}%`)}</title>
    </circle>
  ` : '').join('');
  const xLabels = daily.map((day, index) => (
    index % labelStep === 0 || index === daily.length - 1
      ? `<text x="${pointX(index)}" y="${height - 12}" class="chart-axis-label" text-anchor="middle">${escapeHtml(pointLabel(day))}</text>`
      : ''
  )).join('');

  target.innerHTML = `
    <svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`Biểu đồ ${rangeLabel.toLowerCase()}: ${totals.orders} đơn, doanh thu ${money(totals.revenue)}, lợi nhuận đã xác định ${money(totals.grossProfit)}`)}">
      <defs>
        <linearGradient id="revenueAreaGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#14b8a6" stop-opacity="0.24"></stop>
          <stop offset="100%" stop-color="#14b8a6" stop-opacity="0.02"></stop>
        </linearGradient>
      </defs>
      ${grid}
      ${bars}
      <path d="${areaPath}" class="revenue-area"></path>
      <polyline points="${points}" class="revenue-line"></polyline>
      ${profitPath ? `<path d="${profitPath}" class="profit-line"></path>` : ''}
      ${dots}
      ${profitDots}
      ${xLabels}
    </svg>
  `;
}

function renderOrderStatusChart(analytics = state.dashboardAnalytics) {
  const target = $('#orderStatusChart');
  if (!target) return;
  const definitions = [
    ['delivered', 'Đã giao', '#079455'],
    ['awaiting_fulfillment', 'Chờ giao Seat', '#1570ef'],
    ['pending_payment', 'Chờ thanh toán', '#f79009'],
    ['payment_review', 'Cần kiểm tra', '#f04438'],
    ['refunded', 'Hoàn tiền', '#7f56d9'],
    ['cancelled', 'Đã hủy', '#667085'],
    ['expired', 'Hết hạn', '#98a2b3']
  ];
  const statuses = analytics?.orderStatuses || {};
  const entries = definitions
    .map(([key, label, color]) => ({ key, label, color, value: Number(statuses[key] || 0) }))
    .filter((entry) => entry.value > 0);
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  if (!total) {
    target.innerHTML = '<p class="meta empty-state">Chưa có đơn hàng để phân tích.</p>';
    return;
  }
  let cursor = 0;
  const segments = entries.map((entry) => {
    const start = cursor;
    cursor += (entry.value / total) * 100;
    return `${entry.color} ${start}% ${cursor}%`;
  }).join(', ');
  target.innerHTML = `
    <div class="donut-layout">
      <div class="status-donut" style="background: conic-gradient(${escapeHtml(segments)})" role="img" aria-label="${escapeHtml(`Phân bổ ${total} đơn hàng theo trạng thái`)}">
        <div><strong>${escapeHtml(total.toLocaleString('vi-VN'))}</strong><span>Tổng đơn</span></div>
      </div>
      <div class="status-legend">
        ${entries.map((entry) => `
          <div class="status-legend-item" style="--status-color: ${entry.color}">
            <span>${escapeHtml(entry.label)}</span>
            <strong>${escapeHtml(entry.value.toLocaleString('vi-VN'))}</strong>
            <small>${escapeHtml(`${Math.round((entry.value / total) * 1000) / 10}%`)}</small>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderTopProductsChart(analytics = state.dashboardAnalytics) {
  const target = $('#topProductsChart');
  if (!target) return;
  const products = analytics?.topProductsByProfit || [];
  if (!products.length) {
    const hasRevenue = (analytics?.topProducts || []).some((product) => Number(product.revenue || 0) > 0);
    target.innerHTML = `<p class="meta empty-state">${hasRevenue ? 'Có doanh thu nhưng chưa đủ giá gốc để xếp hạng lợi nhuận.' : 'Chưa có sản phẩm phát sinh doanh thu trong 30 ngày.'}</p>`;
    return;
  }
  const maxProfit = Math.max(...products.map((product) => Math.abs(Number(product.grossProfit || 0))), 1);
  target.innerHTML = products.map((product, index) => `
    <div class="top-product-row ${Number(product.grossProfit || 0) < 0 ? 'is-loss' : ''}">
      <span class="top-product-rank">${index + 1}</span>
      <div class="top-product-main">
        <div class="top-product-head">
          <span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)}</small></span>
          <span><strong>${escapeHtml(money(product.grossProfit))}</strong><small>${escapeHtml(product.marginPercent === null ? 'Chưa có biên LN' : `Biên ${product.marginPercent}%`)}</small></span>
        </div>
        <div class="top-product-financial"><span>DT có giá vốn ${escapeHtml(money(product.coveredRevenue))}</span><span>Giá vốn ${escapeHtml(money(product.cost))}</span><span>Phủ ${escapeHtml(`${product.costCoveragePercent || 0}%`)}</span></div>
        <div class="horizontal-bar profit-bar" aria-hidden="true"><span style="width: ${Math.max(4, (Math.abs(Number(product.grossProfit || 0)) / maxProfit) * 100)}%"></span></div>
      </div>
    </div>
  `).join('');
}

function renderOperationsFunnel(analytics = state.dashboardAnalytics) {
  const target = $('#operationsFunnel');
  if (!target) return;
  const period = analytics?.period30d || {};
  const orders = Number(period.orders || 0);
  const steps = [
    { label: 'Đơn được tạo', value: orders, color: '#818cf8' },
    { label: 'Đã thanh toán', value: Number(period.paidOrders || 0), color: '#22c55e' },
    { label: 'Đã giao', value: Number(period.deliveredOrders || 0), color: '#0f766e' }
  ];
  if (!orders) {
    target.innerHTML = '<p class="meta empty-state">Chưa có đơn hàng trong 30 ngày để dựng funnel.</p>';
    return;
  }
  const payment = analytics?.payments || {};
  target.innerHTML = `
    <div class="funnel-steps">
      ${steps.map((step) => {
        const percentage = orders ? Math.round((step.value / orders) * 1000) / 10 : 0;
        return `
          <div class="funnel-step">
            <div><span>${escapeHtml(step.label)}</span><strong>${escapeHtml(step.value.toLocaleString('vi-VN'))}</strong><small>${escapeHtml(`${percentage}%`)}</small></div>
            <div class="funnel-track"><span style="width: ${Math.max(step.value ? 4 : 0, percentage)}%; background: ${step.color}"></span></div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="funnel-metrics">
      <div><span>Tỷ lệ thanh toán</span><strong>${escapeHtml(`${period.paymentConversionRate || 0}%`)}</strong></div>
      <div><span>AOV 30 ngày</span><strong>${escapeHtml(money(period.averageOrderValue || 0))}</strong></div>
      <div><span>Payment thành công</span><strong>${escapeHtml(`${payment.paid || 0}/${payment.total || 0}`)}</strong></div>
    </div>
  `;
}

function renderDashboardAnalytics(analytics = {}) {
  state.dashboardAnalytics = analytics;
  const productStats = analytics.products || {};
  const inventory = analytics.inventory || {};
  const statuses = analytics.orderStatuses || {};
  const current7d = analytics.current7d || {};
  const today = analytics.today || {};
  const yesterday = analytics.yesterday || {};
  const fulfillment = analytics.fulfillment || {};
  const revenueDelta = current7d.revenueDeltaPercent;
  const orderDelta = current7d.orderDeltaPercent;
  setStatMeta('statProductsMeta', `${productStats.active || 0} đang bán · ${productStats.inactive || 0} đã tắt`);
  setStatMeta('statStockMeta', `${inventory.reserved || 0} giữ · ${inventory.sold || 0} đã bán`);
  setStatMeta('statPendingMeta', `7 ngày: ${current7d.orders || 0} đơn · ${dashboardDeltaLabel(orderDelta)}`, Number(orderDelta || 0) >= 0 ? 'positive' : 'negative');
  setStatMeta('statAwaitingSeatMeta', `Tỷ lệ giao ${fulfillment.deliveryRate || 0}%`);
  setStatMeta('statDeliveredMeta', `${fulfillment.paid || 0} đơn đã thanh toán`);
  setStatMeta('statReviewMeta', `${statuses.refunded || 0} hoàn tiền · ${statuses.expired || 0} hết hạn`, Number(statuses.payment_review || 0) ? 'negative' : 'neutral');
  setStatMeta('statRevenueMeta', `7 ngày: ${compactMoney(current7d.revenue || 0)} · ${dashboardDeltaLabel(revenueDelta)}`, Number(revenueDelta || 0) >= 0 ? 'positive' : 'negative');
  $('#todayRevenue').textContent = money(today.revenue || 0);
  $('#todayProfit').textContent = Number(today.ordersWithCost || 0) ? money(today.grossProfit || 0) : '—';
  $('#todayOrders').textContent = Number(today.orders || 0).toLocaleString('vi-VN');
  $('#todayPaidOrders').textContent = Number(today.paidOrders || 0).toLocaleString('vi-VN');
  $('#todayDeliveredOrders').textContent = Number(today.deliveredOrders || 0).toLocaleString('vi-VN');
  setStatMeta('todayRevenueMeta', todayDeltaLabel(today.revenueDeltaPercent, yesterday.revenue, compactMoney), Number(today.revenueDeltaPercent || 0) >= 0 ? 'positive' : 'negative');
  setStatMeta(
    'todayProfitMeta',
    Number(today.ordersWithCost || 0)
      ? `Biên ${today.marginPercent ?? 0}% · phủ ${today.costCoveragePercent || 0}%${today.ordersMissingCost ? ` · thiếu ${today.ordersMissingCost} đơn` : ''}`
      : (Number(today.revenue || 0) ? `Thiếu giá gốc cho ${today.ordersMissingCost || today.paidOrders || 0} đơn` : 'Chưa phát sinh doanh thu'),
    Number(today.ordersWithCost || 0) ? (Number(today.grossProfit || 0) < 0 ? 'negative' : 'positive') : 'neutral'
  );
  setStatMeta('todayOrdersMeta', todayDeltaLabel(today.orderDeltaPercent, yesterday.orders), Number(today.orderDeltaPercent || 0) >= 0 ? 'positive' : 'negative');
  const generatedAt = analytics.generatedAt ? new Date(analytics.generatedAt) : null;
  $('#todayDateLabel').textContent = generatedAt
    ? `${generatedAt.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: analytics.timeZone || 'Asia/Bangkok' })} · ${analytics.timeZone || 'Asia/Bangkok'}`
    : '—';
  $('#analyticsGeneratedAt').textContent = analytics.generatedAt
    ? `Cập nhật ${new Date(analytics.generatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
    : '—';
  renderRevenueTrendChart(analytics);
  renderOrderStatusChart(analytics);
  renderTopProductsChart(analytics);
  renderOperationsFunnel(analytics);
}

function renderSummary(summary) {
  const financials = summary.financials || {};
  $('#statProducts').textContent = summary.products;
  $('#statStock').textContent = summary.availableInventory;
  $('#statPending').textContent = summary.pendingOrders;
  $('#statAwaitingSeat').textContent = summary.awaitingFulfillmentOrders || 0;
  $('#statDelivered').textContent = summary.deliveredOrders;
  $('#statReview').textContent = summary.reviewOrders;
  $('#statRevenue').textContent = money(summary.revenue);
  $('#statProfit').textContent = Number(financials.ordersWithCost || 0) ? money(financials.grossProfit || 0) : '—';
  renderDashboardAnalytics(summary.analytics || {});
  setStatMeta(
    'statProfitMeta',
    Number(financials.ordersWithCost || 0)
      ? `Biên ${financials.marginPercent ?? 0}% · phủ ${financials.costCoveragePercent || 0}%${financials.ordersMissingCost ? ` · thiếu ${financials.ordersMissingCost} đơn` : ''}`
      : (Number(financials.revenue || 0) ? `${financials.ordersMissingCost || 0} đơn chưa có giá gốc` : 'Chưa phát sinh doanh thu'),
    Number(financials.ordersWithCost || 0) ? (Number(financials.grossProfit || 0) < 0 ? 'negative' : 'positive') : 'neutral'
  );

  $('#recentOrders').innerHTML = summary.recentOrders.length
    ? summary.recentOrders.map((order) => `
      <div class="row">
        <div class="row-title"><strong>${icon('shopping-cart')}${escapeHtml(order.productName)}</strong><span class="badge ${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></div>
        <div class="meta">${escapeHtml(order.id)} | ${escapeHtml(money(order.total, order.currency))}</div>
      </div>
    `).join('')
    : '<p class="meta empty-state">Chưa có đơn hàng.</p>';

  const lowStockProducts = (summary.lowStock || []).filter((product) => {
    const catalogProduct = state.products.find((item) => item.id === product.id || item.sku === product.sku) || product;
    return !isSeatEmailProduct(catalogProduct);
  });
  $('#lowStock').innerHTML = lowStockProducts.length
    ? lowStockProducts.map((product) => `
      <div class="row">
        <div class="row-title"><strong>${icon('package-x')}${escapeHtml(product.name)}</strong><span class="badge reserved">còn ${escapeHtml(product.stock.available)}</span></div>
        <div class="meta">${escapeHtml(product.sku)}</div>
      </div>
    `).join('')
    : '<p class="meta empty-state">Không có sản phẩm sắp hết.</p>';
  refreshIcons();
}

async function renderInventory() {
  const selected = $('#inventoryForm select[name="productId"]').value;
  if (!selected) {
    $('#inventoryList').innerHTML = '<p class="meta empty-state">Không có sản phẩm quản lý bằng kho.</p>';
    return;
  }
  const items = await api(`/api/products/${selected}/inventory`);
  $('#inventoryList').innerHTML = items.length
    ? items.slice(0, 80).map((item) => `
      <div class="row">
        <div class="row-title"><strong>${icon('key-round')}${escapeHtml(item.id)}</strong><span class="badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div>
        <div class="meta">${escapeHtml(item.secretPreview)} | order ${escapeHtml(item.orderId || '-')}</div>
      </div>
    `).join('')
    : '<p class="meta empty-state">Sản phẩm này chưa có dữ liệu kho.</p>';
  refreshIcons();
}

function renderOrderActions(order) {
  const actions = [];
  const seatEmail = isSeatEmailOrder(order);
  if (order.status === 'pending_payment') {
    actions.push(actionButton('mark-paid', order.id, 'Đánh dấu đã trả', 'small', icon('shopping-cart')));
    actions.push(actionButton('cancel-order', order.id, 'Hủy đơn', 'small danger', icon('x-circle')));
  }
  if (order.status === 'payment_review') {
    actions.push(actionButton(
      'approve-review',
      order.id,
      seatEmail ? 'Duyệt thanh toán Seat' : 'Duyệt giao hàng',
      'small',
      icon('check-circle-2')
    ));
    actions.push(actionButton('mark-refunded', order.id, 'Đã hoàn tiền', 'small danger', icon('rotate-ccw')));
  }
  if (order.status === 'awaiting_fulfillment') {
    const retryLabel = automaticSeatRetryLabel(order);
    if (retryLabel) {
      const targetChangedWithoutOperation = Boolean(
        order.fulfillment?.automation?.status === 'verification_required'
        && order.fulfillment?.automation?.error?.code === 'integration_target_changed'
        && !order.fulfillment?.automation?.operationId
      );
      if (targetChangedWithoutOperation) {
        actions.push(actionButton(
          'confirm-retarget-fulfillment',
          order.id,
          'Xác nhận đích & thử lại',
          'small',
          icon('refresh-cw')
        ));
      } else {
        actions.push(actionButton('retry-fulfillment', order.id, retryLabel, 'small', icon('refresh-cw')));
      }
    }
    const manualMode = automaticSeatManualMode(order);
    if (manualMode === 'safe') {
      actions.push(actionButton('complete-seat', order.id, 'Hoàn tất thủ công', 'small secondary', icon('mail-check')));
    }
    if (manualMode === 'verification_required') {
      actions.push(actionButton('complete-after-verification', order.id, 'Hoàn tất sau xác minh', 'small secondary', icon('shield-check')));
    }
    const refundMode = automaticSeatRefundMode(order);
    if (refundMode === true || refundMode === 'safe') {
      actions.push(actionButton('mark-refunded', order.id, 'Hoàn tiền', 'small danger', icon('rotate-ccw')));
    }
    if (refundMode === 'cleanup_required') {
      actions.push(actionButton('refund-after-cleanup', order.id, 'Hoàn tiền sau dọn dẹp', 'small danger', icon('shield-alert')));
    }
  }
  if (order.status === 'delivered') {
    if (!seatEmail) {
      actions.push(actionButton('show-delivery', order.id, 'Nội dung giao', 'small secondary', icon('key-round')));
    }
    actions.push(actionButton(
      'resend-delivery',
      order.id,
      seatEmail ? 'Gửi lại thông báo Seat' : 'Gửi lại Telegram',
      'small secondary',
      icon('send')
    ));
  }
  return actions.length ? `<div class="actions">${actions.join('')}</div>` : '';
}

function renderOrderTable(orders) {
  if (!orders.length) return '<p class="meta empty-state">Không có đơn hàng phù hợp bộ lọc.</p>';
  return `
    <div class="table-wrap">
      <table class="data-table responsive-table orders-table">
        <thead>
          <tr>
            <th>Đơn hàng</th>
            <th>Sản phẩm</th>
            <th>Người dùng</th>
            <th>Email nhận Seat</th>
            <th>Tổng tiền</th>
            <th>Trạng thái</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map((order) => `
            <tr>
              <td data-label="Đơn hàng"><strong>${escapeHtml(order.id)}</strong><span>${escapeHtml(new Date(order.createdAt).toLocaleString('vi-VN'))}</span></td>
              <td data-label="Sản phẩm"><strong>${escapeHtml(order.productName)}</strong><span>${escapeHtml(order.productSku || order.productId)}</span></td>
              <td data-label="Người dùng">${escapeHtml(order.telegramId || order.userId)}</td>
              <td data-label="Email nhận Seat">${renderOrderRecipients(order)}</td>
              <td data-label="Tổng tiền">${escapeHtml(money(order.total, order.currency))}<span>SL ${escapeHtml(order.quantity)}${order.discount ? ` · Mã ${escapeHtml(order.discount.code)} · giảm ${escapeHtml(money(order.discount.amount, order.currency))}` : ''}</span></td>
              <td data-label="Trạng thái">${renderStatusPill(order.status)}${renderFulfillmentAutomation(order)}</td>
              <td data-label="Hành động">${renderOrderActions(order) || '<span class="meta">Không có hành động</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function renderOrders() {
  const statusQuery = state.orderStatus === 'all'
    ? ''
    : `&status=${encodeURIComponent(state.orderStatus)}`;
  const result = await api(`/api/orders?limit=500${statusQuery}`);
  const more = result.hasMore
    ? `<p class="meta">Đang hiển thị 500/${escapeHtml(result.total)} đơn phù hợp.</p>`
    : '';
  $('#ordersList').innerHTML = `${more}${renderOrderTable(result.items)}`;
  refreshIcons();
}

async function renderPayments() {
  const result = await api('/api/payments?limit=100');
  $('#paymentsList').innerHTML = result.items.length
    ? `
      <div class="table-wrap">
        <table class="data-table responsive-table payments-table">
          <thead>
            <tr>
              <th>Tham chiếu</th>
              <th>Đơn hàng</th>
              <th>Số tiền</th>
              <th>Trạng thái</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            ${result.items.map((payment) => `
              <tr>
                <td data-label="Tham chiếu"><strong>${icon('credit-card')}${escapeHtml(payment.reference)}</strong><span>${escapeHtml(payment.providerPaymentId)}</span></td>
                <td data-label="Đơn hàng"><strong>${escapeHtml(payment.orderId)}</strong></td>
                <td data-label="Số tiền">${escapeHtml(money(payment.amount, payment.currency))}</td>
                <td data-label="Trạng thái">${renderStatusPill(payment.status)}</td>
                <td data-label="Hành động">
                  <div class="actions">
                    <a class="table-action" href="${escapeHtml(payment.paymentUrl)}" target="_blank" rel="noreferrer">${icon('external-link')}<span>Mở thanh toán</span></a>
                    ${payment.qrImageUrl ? `<a class="table-action" href="${escapeHtml(payment.qrImageUrl)}" target="_blank" rel="noreferrer">${icon('qr-code')}<span>Mở QR</span></a>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : '<p class="meta empty-state">Chưa có thanh toán.</p>';
  refreshIcons();
}

async function renderAudit() {
  const result = await api('/api/audit-logs?limit=300');
  $('#auditList').innerHTML = result.items.length
    ? result.items.map((log) => `
      <div class="row">
        <div class="row-title"><strong>${icon('scroll-text')}${escapeHtml(log.action)}</strong><span class="meta">${escapeHtml(new Date(log.createdAt).toLocaleString())}</span></div>
        <div class="meta">${escapeHtml(log.actorId)} | ${escapeHtml(log.entityType)}:${escapeHtml(log.entityId)}</div>
      </div>
    `).join('')
    : '<p class="meta empty-state">Chưa có nhật ký hoạt động.</p>';
  refreshIcons();
}

function systemLine(label, value) {
  return `
    <div class="kv-line">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || '-')}</strong>
    </div>
  `;
}

function renderQuickStatus(system) {
  $('#systemStorageBadge').textContent = system.storage.driver === 'postgres' ? 'PostgreSQL' : 'JSON storage';
  $('#systemStorageBadge').className = `status-dot ${system.storage.driver === 'postgres' ? 'ok' : 'warn'}`;
  $('#telegramStatusBadge').textContent = system.telegram.polling ? 'Telegram polling' : 'Telegram off';
  $('#telegramStatusBadge').className = `status-dot ${system.telegram.tokenConfigured && system.telegram.polling ? 'ok' : 'warn'}`;
}

async function renderSystem(system = null) {
  system ||= await api('/api/system/status');
  renderQuickStatus(system);
  $('#systemChecks').innerHTML = `
    <div class="system-head">
      <span class="badge ${system.status === 'ready' ? 'available' : 'payment_review'}">${escapeHtml(system.status)}</span>
      <span class="meta">${escapeHtml(system.warnings)} cảnh báo</span>
    </div>
    ${system.checks.map((check) => `
      <div class="row">
        <div class="row-title">
          <strong>${icon(check.status === 'ok' ? 'check-circle-2' : 'triangle-alert')}${escapeHtml(check.label)}</strong>
          <span class="badge ${check.status === 'ok' ? 'available' : 'payment_review'}">${escapeHtml(check.status)}</span>
        </div>
        <div class="meta">${escapeHtml(check.detail)}</div>
      </div>
    `).join('')}
  `;

  $('#systemRuntime').innerHTML = `
    ${systemLine('Môi trường · Environment', system.environment)}
    ${systemLine('Node', system.node)}
    ${systemLine('Thời gian chạy · Uptime', `${system.uptimeSeconds}s`)}
    ${systemLine('Base URL', system.baseUrl)}
    ${systemLine('Lưu trữ · Storage', system.storage.driver)}
    ${system.storage.dataFile ? systemLine('Tệp dữ liệu', system.storage.dataFile) : ''}
    ${systemLine('Redis', system.traffic.redisConfigured ? 'đã cấu hình' : 'memory fallback')}
    ${system.sales ? systemLine('Bán hàng · Sales', system.sales.enabled ? 'đang mở' : 'đã đóng') : ''}
    ${system.sales ? systemLine('Mã hóa kho', system.sales.inventoryEncryptionConfigured ? 'đã cấu hình' : 'còn thiếu') : ''}
    ${systemLine('Thanh toán · Payment', system.payment.configuredProvider)}
    ${systemLine('Telegram', system.telegram.tokenConfigured ? 'đã cấu hình token' : 'chưa cấu hình')}
    ${system.telegramEmoji ? systemLine('Telegram emoji', system.telegramEmoji.enabled ? `${Object.values(system.telegramEmoji.packs || {}).filter((pack) => pack.loaded).length}/${system.telegramEmoji.requiredPacks.length} packs loaded` : 'disabled') : ''}
    ${systemLine('Telegram webhook', system.telegram.webhookUrl)}
    ${systemLine('SePay webhook', system.payment.sepayWebhookUrl)}
    ${systemLine('Order TTL', `${system.orders.ttlMinutes} phút`)}
    ${systemLine('Số lượng tối đa', system.orders.maxQuantity)}
    ${systemLine('Sản phẩm', system.counts.products)}
    ${systemLine('Mục trong kho', system.counts.inventory)}
    ${systemLine('Đơn hàng', system.counts.orders)}
    ${systemLine('Thanh toán', system.counts.payments)}
  `;
  refreshIcons();
}

async function refresh() {
  const [summary, products, system, telegramPricing, discountCodes, notificationOverview] = await Promise.all([
    api('/api/dashboard/summary'),
    api('/api/products'),
    api('/api/system/status'),
    api('/api/telegram-pricing'),
    api('/api/discount-codes'),
    api('/api/notifications')
  ]);
  renderQuickStatus(system);
  renderProducts(products);
  renderTelegramPricing(telegramPricing);
  renderDiscountCodes(discountCodes);
  renderNotifications(notificationOverview);
  renderSummary(summary);
  if (state.tab === 'inventory') await renderInventory();
  if (state.tab === 'seatGuard') await renderSeatGuard();
  if (state.tab === 'orders') await renderOrders();
  if (state.tab === 'payments') await renderPayments();
  if (state.tab === 'audit') await renderAudit();
  if (state.tab === 'system') await renderSystem(system);
}

async function boot() {
  try {
    const user = await api('/api/me');
    showDashboard(user);
    await Promise.all([refresh(), loadProductAssistantStatus()]);
  } catch {
    showLogin();
  }
  refreshIcons();
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  $('#loginError').textContent = '';
  const data = Object.fromEntries(new FormData(form).entries());
  setButtonBusy(submit, true);
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
    showDashboard(result.user);
    await Promise.all([refresh(), loadProductAssistantStatus()]);
  } catch (error) {
    $('#loginError').textContent = error.message;
  } finally {
    setButtonBusy(submit, false);
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

$('#refreshBtn').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  setButtonBusy(button, true);
  try {
    await refresh();
    toast('Đã làm mới dữ liệu');
  } catch (error) {
    toast(error.message);
  } finally {
    setButtonBusy(button, false);
  }
});

$('#sidebarToggle').addEventListener('click', () => setSidebarOpen(true));
$('#sidebarClose').addEventListener('click', closeSidebarAndRestoreFocus);
$('#sidebarBackdrop').addEventListener('click', closeSidebarAndRestoreFocus);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
    closeSidebarAndRestoreFocus();
    return;
  }
  if (event.key === 'Escape' && state.discountCreateOpen) {
    setDiscountCreateOpen(false, { restoreFocus: true });
  }
});

$('#productCreateToggle').addEventListener('click', (event) => {
  setProductCreateOpen(event.currentTarget.getAttribute('aria-expanded') !== 'true');
});

const productForm = $('#productForm');
productForm.addEventListener('input', (event) => {
  if (event.target === $('#productAiPrompt')) return;
  state.productCreateDirty = true;
  if (event.target === $('#productSkuInput')) {
    state.productSkuManual = Boolean(event.target.value.trim());
  } else if (['brand', 'packageType', 'name'].includes(event.target.name)) {
    if (event.target.name === 'brand' && !productForm.elements.emoji.value.trim()) {
      productForm.elements.emoji.value = defaultProductEmoji(event.target.value);
    }
    generateProductSku();
  }
  $('#productCreateError').classList.add('hidden');
  renderProductCreateExperience();
});

productForm.addEventListener('change', () => {
  state.productCreateDirty = true;
  renderProductCreateExperience();
});

productForm.addEventListener('invalid', () => {
  const missing = [...productForm.querySelectorAll(':invalid')];
  const error = $('#productCreateError');
  error.textContent = `Còn ${missing.length} trường bắt buộc hoặc chưa hợp lệ. Kiểm tra các trường được trình duyệt đánh dấu.`;
  error.classList.remove('hidden');
  renderProductCreateExperience();
}, true);

$('#productSkuGenerate').addEventListener('click', () => {
  state.productCreateDirty = true;
  generateProductSku(true);
  renderProductCreateExperience();
  $('#productSkuInput').focus();
});

$$('[data-product-brand]').forEach((button) => {
  button.addEventListener('click', () => {
    productForm.elements.brand.value = button.dataset.productBrand;
    productForm.elements.emoji.value = defaultProductEmoji(button.dataset.productBrand);
    state.productCreateDirty = true;
    generateProductSku();
    renderProductCreateExperience();
    productForm.elements.packageType.focus();
  });
});

$$('[data-product-emoji]').forEach((button) => {
  button.addEventListener('click', () => {
    productForm.elements.emoji.value = button.dataset.productEmoji;
    state.productCreateDirty = true;
    renderProductCreateExperience();
  });
});

$('#productAiGenerate').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const status = $('#productAiStatus');
  const error = $('#productCreateError');
  const current = productCreateFormData();
  error.classList.add('hidden');
  error.textContent = '';
  setButtonBusy(button, true);
  status.textContent = 'Gemini đang phân tích và tạo bản nháp…';
  try {
    const result = await api('/api/products/ai-assistant', {
      method: 'POST',
      body: JSON.stringify({ brief: $('#productAiPrompt').value, current })
    });
    applyGeminiProductDraft(result.draft);
    status.textContent = `Đã áp dụng bản nháp từ ${result.model}. Hãy kiểm tra lại trước khi tạo.`;
    toast('Gemini đã hoàn thiện bản nháp sản phẩm');
  } catch (requestError) {
    status.textContent = requestError.message;
    error.textContent = `Không thể tạo bản nháp: ${requestError.message}`;
    error.classList.remove('hidden');
    toast(requestError.message);
  } finally {
    setButtonBusy(button, false);
  }
});

$$('[data-product-seat-term]').forEach((button) => {
  button.addEventListener('click', () => {
    productForm.elements.seatTermMonths.value = button.dataset.productSeatTerm;
    state.productCreateDirty = true;
    renderProductCreateExperience();
  });
});

$('#productCreateReset').addEventListener('click', () => {
  resetProductCreateForm();
  productForm.elements.brand.focus();
});

$('#productCreateClose').addEventListener('click', () => {
  setProductCreateOpen(false);
  $('#productCreateToggle').focus();
});

$$('[data-dashboard-range]').forEach((button) => {
  button.addEventListener('click', () => {
    state.dashboardRangeDays = Number(button.dataset.dashboardRange || 14);
    $$('[data-dashboard-range]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderRevenueTrendChart();
  });
});

let dashboardChartResizeTimer;
window.addEventListener('resize', () => {
  window.clearTimeout(dashboardChartResizeTimer);
  dashboardChartResizeTimer = window.setTimeout(() => {
    if ($('#overviewTab')?.classList.contains('active-tab')) renderRevenueTrendChart();
  }, 120);
});

$('#productSearch').addEventListener('input', (event) => {
  state.productSearch = event.target.value;
  renderProducts(state.products);
});

$('#productBrandFilter').addEventListener('change', (event) => {
  state.productBrand = event.target.value;
  renderProducts(state.products);
});

$('#productStatusFilter').addEventListener('change', (event) => {
  state.productStatus = event.target.value;
  renderProducts(state.products);
});

$('#productSort').addEventListener('change', (event) => {
  state.productSort = event.target.value;
  renderProducts(state.products);
});

$$('[data-product-health-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    const nextFilter = button.dataset.productHealthFilter;
    state.productStatus = state.productStatus === nextFilter ? 'all' : nextFilter;
    $('#productStatusFilter').value = state.productStatus;
    renderProducts(state.products);
  });
});

$('#productFilterReset').addEventListener('click', () => {
  state.productSearch = '';
  state.productBrand = 'all';
  state.productStatus = 'all';
  state.productSort = 'priority';
  $('#productSearch').value = '';
  $('#productBrandFilter').value = 'all';
  $('#productStatusFilter').value = 'all';
  $('#productSort').value = 'priority';
  renderProducts(state.products);
  $('#productSearch').focus();
});

$('#telegramPricingProducts').addEventListener('input', (event) => {
  const input = event.target.closest('.pricing-override-input');
  if (!input) return;
  const hasOverride = Boolean(String(input.value || '').trim());
  const row = input.closest('.pricing-row');
  row?.classList.toggle('has-override', hasOverride);
  const note = row?.querySelector('.pricing-inheritance');
  if (note) note.textContent = hasOverride ? 'Bot dùng giá riêng' : 'Bot dùng giá bán hiện tại';
});

$('#catalogPricingProducts').addEventListener('input', (event) => {
  const input = event.target.closest('.catalog-base-price-input');
  if (!input) return;
  const hasBasePrice = Boolean(String(input.value || '').trim());
  const row = input.closest('.base-price-row');
  row?.classList.toggle('has-base-price', hasBasePrice);
  const note = row?.querySelector('.pricing-inheritance');
  if (note) note.textContent = hasBasePrice ? 'Đã có dữ liệu tính lợi nhuận' : 'Chưa có giá vốn · lợi nhuận sẽ thiếu';
});

$('#discountGenerateBtn').addEventListener('click', () => {
  $('#discountCodeInput').value = newDiscountCode();
  $('#discountCodeInput').focus();
  renderDiscountFormPreview();
});

$('#discountCreateToggle').addEventListener('click', () => {
  const opening = !state.discountCreateOpen;
  setDiscountCreateOpen(opening);
  if (opening) $('#discountForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#discountCreateClose').addEventListener('click', () => {
  setDiscountCreateOpen(false, { restoreFocus: true });
});

$('#discountFormReset').addEventListener('click', () => {
  resetDiscountForm();
  $('#discountForm input[name="campaignName"]').focus();
});

$('#discountForm select[name="type"]').addEventListener('change', (event) => {
  const valueInput = $('#discountForm input[name="value"]');
  const percent = event.currentTarget.value === 'percent';
  if (percent) valueInput.setAttribute('max', '99');
  else valueInput.removeAttribute('max');
  valueInput.placeholder = percent ? '10' : '50000';
  renderDiscountFormPreview();
});

$('#discountForm').addEventListener('input', (event) => {
  if (event.target.name === 'expiresAt') {
    $$('[data-discount-expiry-days]').forEach((button) => button.classList.remove('active'));
  }
  $('#discountFormError').classList.add('hidden');
  renderDiscountFormPreview();
});

$('#discountForm').addEventListener('invalid', () => {
  const invalid = $$('#discountForm :invalid');
  const error = $('#discountFormError');
  error.textContent = `Còn ${invalid.length} trường bắt buộc hoặc chưa hợp lệ.`;
  error.classList.remove('hidden');
}, true);

$$('[data-discount-type][data-discount-value]').forEach((button) => {
  button.addEventListener('click', () => {
    const form = $('#discountForm');
    form.elements.type.value = button.dataset.discountType;
    form.elements.value.value = button.dataset.discountValue;
    if (button.dataset.discountType === 'percent') form.elements.value.setAttribute('max', '99');
    else form.elements.value.removeAttribute('max');
    form.elements.value.placeholder = button.dataset.discountType === 'percent' ? '10' : '50000';
    renderDiscountFormPreview();
    $$('[data-discount-type][data-discount-value]').forEach((item) => item.classList.toggle('active', item === button));
  });
});

$$('[data-discount-expiry-days]').forEach((button) => {
  button.addEventListener('click', () => {
    const expiryInput = $('#discountForm input[name="expiresAt"]');
    expiryInput.value = button.dataset.discountExpiryDays === 'none'
      ? ''
      : discountExpiryInputValue(button.dataset.discountExpiryDays);
    $$('[data-discount-expiry-days]').forEach((item) => item.classList.toggle('active', item === button));
    renderDiscountFormPreview();
  });
});

$$('[data-discount-status]').forEach((button) => {
  button.addEventListener('click', () => {
    state.discountStatus = button.dataset.discountStatus;
    renderDiscountCodes();
  });
});

$('#discountSearch').addEventListener('input', (event) => {
  state.discountSearch = event.currentTarget.value;
  renderDiscountCodes();
});

$('#discountStatusFilter').addEventListener('change', (event) => {
  state.discountStatus = event.currentTarget.value;
  renderDiscountCodes();
});

$('#discountFilterReset').addEventListener('click', () => {
  state.discountSearch = '';
  state.discountStatus = 'all';
  renderDiscountCodes();
});

$('#discountForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());
  data.code = String(data.code || '').trim().toUpperCase();
  data.value = Number(data.value);
  data.minOrderTotal = Number(data.minOrderTotal || 0);
  data.expiresAt = data.expiresAt ? new Date(data.expiresAt).toISOString() : null;
  data.active = true;
  const errorMessage = $('#discountFormError');
  errorMessage.textContent = '';
  errorMessage.classList.add('hidden');
  setButtonBusy(submit, true);
  try {
    await api('/api/discount-codes', { method: 'POST', body: JSON.stringify(data) });
    resetDiscountForm();
    setDiscountCreateOpen(false);
    await refresh();
    toast(`Đã tạo mã ${data.code}`);
  } catch (error) {
    errorMessage.textContent = `Không thể tạo mã: ${error.message}`;
    errorMessage.classList.remove('hidden');
    toast(error.message);
  } finally {
    setButtonBusy(submit, false);
    renderDiscountFormPreview();
  }
});

$('#notificationForm').addEventListener('input', syncNotificationForm);
$('#notificationForm').addEventListener('change', (event) => {
  const form = event.currentTarget;
  if (event.target.name === 'category') {
    const emojiByCategory = { promotion: 'boom', stock: 'shopping-bag', news: 'megaphone', service: 'bell' };
    form.elements.emojiKey.value = emojiByCategory[event.target.value] || 'bell';
  }
  syncNotificationForm();
});

$('#notificationForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = event.submitter || $('#notificationSendBtn');
  const otherSubmit = submit === $('#notificationSendBtn') ? $('#notificationScheduleBtn') : $('#notificationSendBtn');
  const action = submit.dataset.notificationSubmit || 'send';
  const data = Object.fromEntries(new FormData(form).entries());
  const error = $('#notificationFormError');
  error.classList.add('hidden');
  error.textContent = '';
  if (action === 'schedule') {
    const timestamp = Date.parse(String(data.scheduledAt || ''));
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      error.textContent = 'Chọn thời gian gửi trong tương lai trước khi lưu lịch.';
      error.classList.remove('hidden');
      form.elements.scheduledAt.focus();
      return;
    }
    data.scheduledAt = new Date(timestamp).toISOString();
    data.sendNow = false;
  } else {
    data.scheduledAt = null;
    data.sendNow = true;
  }
  setButtonBusy(submit, true);
  otherSubmit.disabled = true;
  try {
    const result = await api('/api/notifications/campaigns', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    form.reset();
    syncNotificationForm();
    await refreshNotifications();
    toast(result.queued ? 'Đã đưa chiến dịch vào hàng gửi' : 'Đã lưu lịch gửi thông báo');
    if (result.queued) setTimeout(() => refreshNotifications().catch(() => {}), 1200);
  } catch (requestError) {
    error.textContent = requestError.message;
    error.classList.remove('hidden');
    toast(requestError.message);
  } finally {
    setButtonBusy(submit, false);
    otherSubmit.disabled = false;
  }
});

$('#telegramPricingUsername').addEventListener('change', (event) => {
  selectTelegramPricingUsername(event.currentTarget.value);
});

$('#catalogPricingForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const prices = {};
  form.querySelectorAll('[data-catalog-price-sku]').forEach((input) => {
    const value = String(input.value || '').trim();
    if (value) prices[input.dataset.catalogPriceSku] = Number(value);
  });
  setButtonBusy(submit, true);
  try {
    await api('/api/catalog-pricing', {
      method: 'PUT',
      body: JSON.stringify({ prices })
    });
    await refresh();
    toast('Đã cập nhật giá vốn');
  } catch (error) {
    toast(error.message);
  } finally {
    setButtonBusy(submit, false);
  }
});

$('#telegramPricingResetBtn').addEventListener('click', () => {
  selectTelegramPricingUsername('');
  $('#telegramPricingUsername').focus();
});

$('#telegramPricingForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const username = normalizeTelegramUsername(form.elements.username.value);
  if (!username) {
    toast('Cần nhập Telegram username');
    return;
  }
  const prices = {};
  form.querySelectorAll('[data-telegram-price-sku]').forEach((input) => {
    const value = String(input.value || '').trim();
    if (value) prices[input.dataset.telegramPriceSku] = Number(value);
  });
  setButtonBusy(submit, true);
  try {
    await api(`/api/telegram-pricing/${encodeURIComponent(username)}`, {
      method: 'PUT',
      body: JSON.stringify({ prices })
    });
    state.telegramPricingUsername = username;
    await refresh();
    toast(`Đã lưu bảng giá cho @${username}`);
  } catch (error) {
    toast(error.message);
  } finally {
    setButtonBusy(submit, false);
  }
});

$('#orderStatusFilter').addEventListener('change', async (event) => {
  state.orderStatus = event.target.value;
  await renderOrders().catch((error) => toast(error.message));
});

$$('.nav').forEach((button) => {
  button.addEventListener('click', async () => {
    setTab(button.dataset.tab);
    await refresh().catch((error) => toast(error.message));
  });
});

$('#productForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());
  data.price = Number(data.price);
  if (data.fulfillmentMode === 'seat_email') data.seatTermMonths = Number(data.seatTermMonths || 1);
  else delete data.seatTermMonths;
  data.hot = data.hot === 'true';
  const errorMessage = $('#productCreateError');
  errorMessage.textContent = '';
  errorMessage.classList.add('hidden');
  setButtonBusy(submit, true);
  try {
    await api('/api/products', { method: 'POST', body: JSON.stringify(data) });
    resetProductCreateForm();
    setProductCreateOpen(false);
    await refresh();
    toast('Đã tạo sản phẩm');
  } catch (error) {
    errorMessage.textContent = `Không thể tạo sản phẩm: ${error.message}`;
    errorMessage.classList.remove('hidden');
    toast(error.message);
  } finally {
    setButtonBusy(submit, false);
  }
});

$('#inventoryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());
  setButtonBusy(submit, true);
  try {
    const result = await api(`/api/products/${data.productId}/inventory`, {
      method: 'POST',
      body: JSON.stringify({ items: data.items })
    });
    form.elements.items.value = '';
    await refresh();
    const duplicateNote = result.skippedDuplicates ? `; bỏ qua ${result.skippedDuplicates} dòng trùng` : '';
    const notificationNote = result.notification?.queued
      ? '; đã xếp hàng thông báo restock'
      : result.notification?.error
        ? '; lưu kho thành công nhưng chưa tạo được thông báo'
        : '';
    toast(`Đã nhập ${result.imported} mục${duplicateNote}${notificationNote}`);
  } catch (error) {
    toast(error.message);
  } finally {
    setButtonBusy(submit, false);
  }
});

$('#inventoryForm select[name="productId"]').addEventListener('change', () => renderInventory().catch((error) => toast(error.message)));

$('#seatGuardMemberSearch').addEventListener('input', (event) => {
  state.seatGuardMemberSearch = event.currentTarget.value;
  renderSeatGuardTables();
});

$('#seatGuardInvitationSearch').addEventListener('input', (event) => {
  state.seatGuardInvitationSearch = event.currentTarget.value;
  renderSeatGuardTables();
});

$('#seatGuardProviderSwitcher').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-seat-guard-provider]');
  if (!button || button.dataset.seatGuardProvider === state.seatGuardProvider) return;
  const provider = button.dataset.seatGuardProvider;
  if (!seatGuardProviderLabels[provider]) return;
  state.seatGuardProvider = provider;
  state.seatGuard = null;
  syncSeatGuardProviderControls();
  renderSeatGuardSummary({});
  renderSeatGuardTables();
  $('#seatGuardConnection').innerHTML = `<p class="meta">Đang tải Seat Guard ${escapeHtml(seatGuardProviderLabels[provider])}...</p>`;
  const buttons = $$('#seatGuardProviderSwitcher [data-seat-guard-provider]');
  buttons.forEach((item) => { item.disabled = true; });
  try {
    await renderSeatGuard(provider);
  } catch (error) {
    toast(error.message);
  } finally {
    buttons.forEach((item) => { item.disabled = false; });
  }
});

$('#devOrderForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());
  data.quantity = Number(data.quantity || 1);
  setButtonBusy(submit, true);
  try {
    await api('/api/dev/create-order', { method: 'POST', body: JSON.stringify(data) });
    await refresh();
    await renderOrders();
    toast('Đã tạo đơn thử');
  } catch (error) {
    toast(error.message);
  } finally {
    setButtonBusy(submit, false);
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-product-editor]');
  if (!form) return;
  event.preventDefault();
  const id = form.dataset.id;
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());
  data.price = Number(form.elements.price.value);
  data.sortOrder = Number(form.elements.sortOrder.value || 1000);
  data.seatTermMonths = Number(form.elements.seatTermMonths.value || 1);
  data.active = form.elements.active.value === 'true';
  data.hot = form.elements.hot.checked;
  setButtonBusy(submit, true);
  try {
    await api(`/api/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    await refresh();
    toast('Đã cập nhật sản phẩm');
  } catch (error) {
    toast(error.message);
  } finally {
    setButtonBusy(submit, false);
  }
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const { action, id } = target.dataset;
  if (action === 'toggle-product-editor') {
    toggleProductEditor(target);
    return;
  }
  if (action === 'open-discount-create') {
    setDiscountCreateOpen(true);
    $('#discountForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (action === 'reset-discount-filter') {
    state.discountSearch = '';
    state.discountStatus = 'all';
    renderDiscountCodes();
    return;
  }
  if (action === 'toggle-discount-detail') {
    state.expandedDiscountId = state.expandedDiscountId === id ? '' : id;
    renderDiscountCodes();
    return;
  }
  if (action === 'copy-discount-code') {
    try {
      await copyDiscountCode(target.dataset.code);
      toast(`Đã sao chép mã ${target.dataset.code}`);
    } catch {
      toast('Không thể sao chép mã tự động');
    }
    return;
  }
  if (action === 'send-notification-campaign') {
    setButtonBusy(target, true);
    try {
      await api(`/api/notifications/campaigns/${encodeURIComponent(id)}/send`, { method: 'POST' });
      toast('Đã đưa chiến dịch vào hàng gửi');
      await refreshNotifications();
      setTimeout(() => refreshNotifications().catch(() => {}), 1200);
    } catch (error) {
      toast(error.message);
    } finally {
      setButtonBusy(target, false);
    }
    return;
  }
  try {
    if (action === 'toggle-discount-code') {
      setButtonBusy(target, true);
      try {
        await api(`/api/discount-codes/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ active: target.dataset.active !== 'true' })
        });
        toast(target.dataset.active === 'true' ? 'Đã khóa mã giảm giá' : 'Đã mở mã giảm giá');
      } finally {
        setButtonBusy(target, false);
      }
    }

    if (action === 'edit-telegram-pricing') {
      setTab('pricing');
      selectTelegramPricingUsername(target.dataset.username);
      $('#telegramPricingUsername').focus();
      return;
    }

    if (action === 'delete-telegram-pricing') {
      const username = normalizeTelegramUsername(target.dataset.username);
      if (!window.confirm(`Remove custom pricing for @${username}?`)) return;
      await api(`/api/telegram-pricing/${encodeURIComponent(username)}`, { method: 'DELETE' });
      if (normalizeTelegramUsername(state.telegramPricingUsername) === username) {
        state.telegramPricingUsername = '';
      }
      await refresh();
      toast(`Removed pricing for @${username}`);
      return;
    }

    if (action === 'refresh-seat-guard') {
      setButtonBusy(target, true);
      try {
        await renderSeatGuard();
        toast(`Đã làm mới Seat Guard ${seatGuardProviderLabels[state.seatGuardProvider]}`);
      } finally {
        setButtonBusy(target, false);
      }
      return;
    }

    if (['seat-guard-remove-member', 'seat-guard-cancel-invitation'].includes(action)) {
      const email = String(target.dataset.email || '').trim();
      if (!id || !email) throw new Error('Seat Guard action is missing its member identity');
      await runSeatGuardAction(target, { action, id, email });
      return;
    }

    if (action === 'import-stock') {
      setTab('inventory');
      const select = $('#inventoryForm select[name="productId"]');
      if (select) select.value = id;
      await renderInventory();
      toast('Ready to import stock');
      return;
    }

    if (action === 'toggle-product') {
      await api(`/api/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: target.dataset.active !== 'true' })
      });
      toast('Product updated');
    }

    if (action === 'mark-paid') {
      await api(`/api/orders/${id}/mark-paid`, { method: 'POST' });
      toast('Order marked paid');
    }

    if (action === 'cancel-order') {
      await api(`/api/orders/${id}/cancel`, { method: 'POST' });
      toast('Order cancelled');
    }

    if (action === 'approve-review') {
      const note = window.prompt('Review note (optional)', '');
      if (note === null) return;
      const result = await api(`/api/orders/${id}/approve-review`, {
        method: 'POST',
        body: JSON.stringify({ note })
      });
      toast(result.awaitingFulfillment ? 'Seat payment approved; awaiting fulfillment' : 'Review approved and delivered');
    }

    if (action === 'mark-refunded') {
      const note = window.prompt('Refund note (optional)', '');
      if (note === null) return;
      await api(`/api/orders/${id}/refund`, {
        method: 'POST',
        body: JSON.stringify({ note })
      });
      toast('Order marked refunded');
    }

    if (action === 'refund-after-cleanup') {
      const confirmation = window.prompt('Remove/cancel the external member invitation first, then type CLEANED to refund.', '');
      if (confirmation !== 'CLEANED') return;
      const note = window.prompt('Refund note', 'External invitation removed before refund');
      if (note === null) return;
      await api(`/api/orders/${id}/refund`, {
        method: 'POST',
        body: JSON.stringify({ note, confirmExternalCleanup: true })
      });
      toast('Order marked refunded after external cleanup confirmation');
    }

    if (action === 'complete-seat') {
      const note = window.prompt('Seat fulfillment note (optional)', 'Invitations sent');
      if (note === null) return;
      await api(`/api/orders/${id}/complete-fulfillment`, {
        method: 'POST',
        body: JSON.stringify({ note })
      });
      toast('Seat fulfillment completed');
    }

    if (action === 'complete-after-verification') {
      const confirmation = window.prompt('Verify every recipient in the external member service, then type VERIFIED to complete.', '');
      if (confirmation !== 'VERIFIED') return;
      const note = window.prompt('Verification note', 'External invitations verified before manual completion');
      if (note === null) return;
      await api(`/api/orders/${id}/complete-fulfillment`, {
        method: 'POST',
        body: JSON.stringify({ note, confirmExternalVerification: true })
      });
      toast('Seat fulfillment completed after external verification');
    }

    if (action === 'retry-fulfillment') {
      await api(`/api/orders/${id}/retry-fulfillment`, { method: 'POST' });
      toast('Automatic Seat fulfillment queued');
    }

    if (action === 'confirm-retarget-fulfillment') {
      const confirmation = window.prompt(
        'Confirm no invitation was created on the old target, then type RETARGET to start a new attempt.',
        ''
      );
      if (confirmation !== 'RETARGET') return;
      await api(`/api/orders/${id}/retry-fulfillment`, {
        method: 'POST',
        body: JSON.stringify({ confirmTargetChange: true })
      });
      toast('New automatic Seat fulfillment attempt queued');
    }

    if (action === 'show-delivery') {
      const result = await api(`/api/orders/${id}/delivery`);
      const text = result.deliverySecrets.length ? result.deliverySecrets.join('\n') : 'No delivery payload yet.';
      window.alert(text);
    }

    if (action === 'resend-delivery') {
      await api(`/api/orders/${id}/resend-delivery`, { method: 'POST' });
      toast('Delivery resend triggered');
    }

    await refresh();
  } catch (error) {
    toast(error.message);
  }
});

renderDiscountFormPreview();
renderProductCreateExperience();
syncNotificationForm();
boot();
