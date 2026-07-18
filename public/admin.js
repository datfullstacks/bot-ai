import { brandIcon, getBrandAsset } from './brand-assets.js';

const state = {
  tab: 'overview',
  products: [],
  productSearch: '',
  productBrand: 'all',
  productStatus: 'all',
  productSort: 'priority',
  dashboardAnalytics: null,
  dashboardRangeDays: 14,
  discountCodes: [],
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
  if (expanded) closeProductEditors();
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
}

function renderSeatGuardConnection(data = {}) {
  const capabilities = data.capabilities || {};
  const expiry = data.expiryAutomation || {};
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
          <label>Gói · Package<input name="packageType" value="${escapeHtml(product.packageType || '')}"></label>
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
          <span class="product-brand-mark">${brandLogo(product.brand)}</span>
          <div>
            <div class="product-title-line">
              <h3>${escapeHtml(product.name)}</h3>
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
      <table class="data-table pricing-table">
        <thead>
          <tr><th>Sản phẩm</th><th>SKU</th><th>Giá hiện tại</th><th>Giá gốc</th></tr>
        </thead>
        <tbody>
          ${products.map((product) => {
            const hasBasePrice = Object.prototype.hasOwnProperty.call(prices, product.sku);
            return `
            <tr class="base-price-row ${hasBasePrice ? 'has-base-price' : ''}">
              <td data-label="Sản phẩm"><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.brand || 'Other')}</span></td>
              <td data-label="SKU">${escapeHtml(product.sku)}</td>
              <td data-label="Giá hiện tại">${escapeHtml(money(product.price, product.currency))}</td>
              <td data-label="Giá gốc">
                <input
                  class="catalog-base-price-input"
                  data-catalog-price-sku="${escapeHtml(product.sku)}"
                  type="number"
                  min="1"
                  step="1"
                  value="${escapeHtml(hasBasePrice ? prices[product.sku] : '')}"
                  placeholder="Nhập giá gốc"
                  aria-label="Giá gốc cho ${escapeHtml(product.name)}"
                >
                <span class="pricing-inheritance">${hasBasePrice ? 'Giá gốc đã cấu hình' : 'Chưa cấu hình · tạm dùng giá hiện tại'}</span>
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
      <table class="data-table pricing-table">
        <thead>
          <tr><th>Sản phẩm</th><th>Giá gốc</th><th>Giá riêng</th></tr>
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
              <td data-label="Giá gốc">
                <strong>${escapeHtml(money(basePricing.price, product.currency))}</strong>
                <span>${basePricing.configured ? 'Đã cấu hình' : 'Tạm dùng giá hiện tại'}</span>
              </td>
              <td data-label="Giá riêng">
                <input
                  class="pricing-override-input"
                  data-telegram-price-sku="${escapeHtml(product.sku)}"
                  type="number"
                  min="1"
                  step="1"
                  value="${escapeHtml(hasOverride ? prices[product.sku] : '')}"
                  placeholder="Kế thừa giá gốc"
                  aria-label="Giá riêng cho ${escapeHtml(product.name)}"
                >
                <span class="pricing-inheritance">${hasOverride ? 'Đang dùng giá riêng' : 'Kế thừa giá gốc'}</span>
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
  basePriceBadge.textContent = configuredBasePrices ? `${configuredBasePrices} SKU gốc` : 'Chưa cấu hình';
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

function renderDiscountCodes(discounts = state.discountCodes) {
  state.discountCodes = Array.isArray(discounts) ? discounts : [];
  $('#discountCodeCount').textContent = `${state.discountCodes.length} mã`;
  $('#discountCodesList').innerHTML = state.discountCodes.length ? `
    <div class="table-wrap">
      <table class="data-table responsive-table discount-table">
        <thead>
          <tr><th>Mã</th><th>Mức giảm</th><th>Điều kiện</th><th>Trạng thái</th><th>Sử dụng</th><th>Hành động</th></tr>
        </thead>
        <tbody>
          ${state.discountCodes.map((discount) => {
            const status = discountDisplayState(discount);
            const expiry = discount.expiresAt
              ? new Date(discount.expiresAt).toLocaleString('vi-VN')
              : 'Không giới hạn';
            return `
              <tr class="discount-row status-${escapeHtml(status.key)}">
                <td data-label="Mã"><code class="discount-code-token">${escapeHtml(discount.code)}</code><span>Tạo ${escapeHtml(new Date(discount.createdAt).toLocaleString('vi-VN'))}</span></td>
                <td data-label="Mức giảm"><strong>${escapeHtml(discountValueLabel(discount))}</strong><span>Dùng 1 lần</span></td>
                <td data-label="Điều kiện"><strong>${escapeHtml(discount.minOrderTotal ? `Từ ${money(discount.minOrderTotal)}` : 'Không tối thiểu')}</strong><span>Hết hạn: ${escapeHtml(expiry)}</span></td>
                <td data-label="Trạng thái">${renderStatusPill(status.badge, status.label)}</td>
                <td data-label="Sử dụng">${status.key === 'used'
                  ? `<strong>${escapeHtml(discount.usedByOrderId)}</strong><span>${escapeHtml(new Date(discount.usedAt).toLocaleString('vi-VN'))}</span>`
                  : status.key === 'reserved'
                    ? `<strong>${escapeHtml(discount.reservedByOrderId)}</strong><span>Giữ đến ${escapeHtml(new Date(discount.reservedUntil).toLocaleString('vi-VN'))}</span>`
                    : '<span>Chưa sử dụng</span>'}</td>
                <td data-label="Hành động">${status.key === 'used'
                  ? '<span class="meta">Đã hoàn tất</span>'
                  : `<button class="small secondary" data-action="toggle-discount-code" data-id="${escapeHtml(discount.id)}" data-active="${discount.active !== false}">${icon(discount.active !== false ? 'lock-keyhole' : 'lock-keyhole-open')}<span>${discount.active !== false ? 'Khóa mã' : 'Mở mã'}</span></button>`}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : '<p class="meta empty-state">Chưa có mã giảm giá. Tạo mã đầu tiên để dùng trong Telegram checkout.</p>';
  refreshIcons();
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
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return '-';
  return new Date(timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
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
  const daily = (analytics?.daily || []).slice(-days);
  const totals = daily.reduce((sum, day) => ({
    orders: sum.orders + Number(day.orders || 0),
    revenue: sum.revenue + Number(day.revenue || 0)
  }), { orders: 0, revenue: 0 });
  $('#trendChartSummary').textContent = `${days} ngày · ${totals.orders.toLocaleString('vi-VN')} đơn · ${money(totals.revenue)}`;
  if (!daily.length || (!totals.orders && !totals.revenue)) {
    target.innerHTML = '<p class="meta empty-state">Chưa có giao dịch trong khoảng thời gian này.</p>';
    return;
  }

  const width = 760;
  const height = 260;
  const padding = { top: 18, right: 24, bottom: 38, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxRevenue = Math.max(...daily.map((day) => Number(day.revenue || 0)), 1);
  const maxOrders = Math.max(...daily.map((day) => Number(day.orders || 0)), 1);
  const pointX = (index) => padding.left + (daily.length === 1 ? chartWidth / 2 : (index / (daily.length - 1)) * chartWidth);
  const revenueY = (value) => padding.top + chartHeight - (Number(value || 0) / maxRevenue) * chartHeight;
  const barWidth = Math.max(5, Math.min(18, chartWidth / Math.max(daily.length * 1.8, 1)));
  const points = daily.map((day, index) => `${pointX(index)},${revenueY(day.revenue)}`).join(' ');
  const areaPath = daily.length
    ? `M ${pointX(0)} ${padding.top + chartHeight} L ${daily.map((day, index) => `${pointX(index)} ${revenueY(day.revenue)}`).join(' L ')} L ${pointX(daily.length - 1)} ${padding.top + chartHeight} Z`
    : '';
  const labelStep = Math.max(1, Math.ceil(daily.length / 6));
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + chartHeight - chartHeight * ratio;
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid-line"></line>
      <text x="${padding.left - 10}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${escapeHtml(compactMoney(maxRevenue * ratio))}</text>
    `;
  }).join('');
  const bars = daily.map((day, index) => {
    const barHeight = (Number(day.orders || 0) / maxOrders) * chartHeight;
    const x = pointX(index) - barWidth / 2;
    const y = padding.top + chartHeight - barHeight;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" class="orders-bar"><title>${escapeHtml(`${dashboardDateLabel(day.date)}: ${day.orders} đơn`)}</title></rect>`;
  }).join('');
  const dots = daily.map((day, index) => `
    <circle cx="${pointX(index)}" cy="${revenueY(day.revenue)}" r="${daily.length > 20 ? 2.5 : 3.5}" class="revenue-dot">
      <title>${escapeHtml(`${dashboardDateLabel(day.date)}: ${money(day.revenue)} · ${day.orders} đơn`)}</title>
    </circle>
  `).join('');
  const xLabels = daily.map((day, index) => (
    index % labelStep === 0 || index === daily.length - 1
      ? `<text x="${pointX(index)}" y="${height - 12}" class="chart-axis-label" text-anchor="middle">${escapeHtml(dashboardDateLabel(day.date))}</text>`
      : ''
  )).join('');

  target.innerHTML = `
    <svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`Biểu đồ ${days} ngày: ${totals.orders} đơn, doanh thu ${money(totals.revenue)}`)}">
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
      ${dots}
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
  const products = analytics?.topProducts || [];
  if (!products.length) {
    target.innerHTML = '<p class="meta empty-state">Chưa có sản phẩm phát sinh doanh thu trong 30 ngày.</p>';
    return;
  }
  const maxRevenue = Math.max(...products.map((product) => Number(product.revenue || 0)), 1);
  target.innerHTML = products.map((product, index) => `
    <div class="top-product-row">
      <span class="top-product-rank">${index + 1}</span>
      <div class="top-product-main">
        <div class="top-product-head">
          <span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)}</small></span>
          <span><strong>${escapeHtml(money(product.revenue))}</strong><small>${escapeHtml(`${product.units} lượt giao`)}</small></span>
        </div>
        <div class="horizontal-bar" aria-hidden="true"><span style="width: ${Math.max(4, (Number(product.revenue || 0) / maxRevenue) * 100)}%"></span></div>
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
  $('#analyticsGeneratedAt').textContent = analytics.generatedAt
    ? `Cập nhật ${new Date(analytics.generatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
    : '—';
  renderRevenueTrendChart(analytics);
  renderOrderStatusChart(analytics);
  renderTopProductsChart(analytics);
  renderOperationsFunnel(analytics);
}

function renderSummary(summary) {
  $('#statProducts').textContent = summary.products;
  $('#statStock').textContent = summary.availableInventory;
  $('#statPending').textContent = summary.pendingOrders;
  $('#statAwaitingSeat').textContent = summary.awaitingFulfillmentOrders || 0;
  $('#statDelivered').textContent = summary.deliveredOrders;
  $('#statReview').textContent = summary.reviewOrders;
  $('#statRevenue').textContent = money(summary.revenue);
  renderDashboardAnalytics(summary.analytics || {});

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
  const [summary, products, system, telegramPricing, discountCodes] = await Promise.all([
    api('/api/dashboard/summary'),
    api('/api/products'),
    api('/api/system/status'),
    api('/api/telegram-pricing'),
    api('/api/discount-codes')
  ]);
  renderQuickStatus(system);
  renderProducts(products);
  renderTelegramPricing(telegramPricing);
  renderDiscountCodes(discountCodes);
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
    await refresh();
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
    await refresh();
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
  }
});

$('#productCreateToggle').addEventListener('click', (event) => {
  setProductCreateOpen(event.currentTarget.getAttribute('aria-expanded') !== 'true');
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
  if (note) note.textContent = hasOverride ? 'Đang dùng giá riêng' : 'Kế thừa giá gốc';
});

$('#catalogPricingProducts').addEventListener('input', (event) => {
  const input = event.target.closest('.catalog-base-price-input');
  if (!input) return;
  const hasBasePrice = Boolean(String(input.value || '').trim());
  const row = input.closest('.base-price-row');
  row?.classList.toggle('has-base-price', hasBasePrice);
  const note = row?.querySelector('.pricing-inheritance');
  if (note) note.textContent = hasBasePrice ? 'Giá gốc đã cấu hình' : 'Chưa cấu hình · tạm dùng giá hiện tại';
});

$('#discountGenerateBtn').addEventListener('click', () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
  $('#discountCodeInput').value = `KAITO-${suffix}`;
  $('#discountCodeInput').focus();
});

$('#discountForm select[name="type"]').addEventListener('change', (event) => {
  const valueInput = $('#discountForm input[name="value"]');
  const percent = event.currentTarget.value === 'percent';
  if (percent) valueInput.setAttribute('max', '99');
  else valueInput.removeAttribute('max');
  valueInput.placeholder = percent ? '10' : '50000';
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
  setButtonBusy(submit, true);
  try {
    await api('/api/discount-codes', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    form.elements.value.removeAttribute('max');
    form.elements.value.placeholder = '50000';
    await refresh();
    toast(`Đã tạo mã ${data.code}`);
  } catch (error) {
    toast(error.message);
  } finally {
    setButtonBusy(submit, false);
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
    toast('Đã cập nhật bảng giá gốc');
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
  data.seatTermMonths = Number(data.seatTermMonths || 1);
  data.hot = data.hot === 'true';
  setButtonBusy(submit, true);
  try {
    await api('/api/products', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    setProductCreateOpen(false);
    await refresh();
    toast('Đã tạo sản phẩm');
  } catch (error) {
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
    toast(`Đã nhập ${result.imported} mục${result.skippedDuplicates ? `; bỏ qua ${result.skippedDuplicates} dòng trùng` : ''}`);
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

boot();
