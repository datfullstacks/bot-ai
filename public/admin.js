import { brandIcon, getBrandAsset } from './brand-assets.js';

const state = {
  tab: 'overview',
  products: [],
  productSearch: '',
  productBrand: 'all',
  productStatus: 'all',
  orderStatus: 'all',
  seatGuard: null,
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

function setTab(tab) {
  state.tab = tab;
  $$('.nav').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  $$('.tab').forEach((section) => section.classList.remove('active-tab'));
  $(`#${tab}Tab`).classList.add('active-tab');
  const titles = {
    overview: ['Overview', 'Operational snapshot'],
    products: ['Products', 'Create and manage sellable items'],
    inventory: ['Inventory', 'Import account/code stock'],
    seatGuard: ['Seat Guard', 'Reconcile paid Seat access with workspace members'],
    orders: ['Orders', 'Track checkout and delivery'],
    payments: ['Payments', 'Provider events and payment sessions'],
    audit: ['Audit', 'Admin and system activity'],
    system: ['System', 'Configuration and runtime readiness']
  };
  $('#pageTitle').textContent = titles[tab][0];
  $('#pageSubtitle').textContent = titles[tab][1];
}

function showDashboard(user) {
  $('#loginView').classList.add('hidden');
  $('#dashboardView').classList.remove('hidden');
  $('#adminName').textContent = `${user.username} (${user.role})`;
}

function showLogin() {
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
  return isSeatEmailProduct(product) ? 'Seat via customer emails' : 'Inventory stock';
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
  if (automation.status === 'retrying') return 'Retry Now';
  if (automation.status === 'verification_required') return 'Retry / Verify Auto';
  if (['failed', 'blocked'].includes(automation.status)) return 'Retry Auto';
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
      ? '<span class="meta">No recipient emails</span>'
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
  if (!account) return 'No account reported';
  if (typeof account === 'string') return account;
  const values = [
    account.name,
    account.email,
    account.workspaceName,
    account.workspaceId,
    account.accountRef,
    account.id
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return [...new Set(values)].join(' · ') || 'Configured account';
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
  return `<strong>${escapeHtml(name || email || 'Unknown member')}</strong>${name && email ? `<span>${escapeHtml(email)}</span>` : ''}`;
}

function seatGuardAction(action, item, label, iconName) {
  return `<button class="small danger icon-button" data-action="${escapeHtml(action)}" data-id="${escapeHtml(item.actionRef || item.id || '')}" data-email="${escapeHtml(item.email || '')}">${icon(iconName)}<span>${escapeHtml(label)}</span></button>`;
}

function renderSeatGuardMembers(items = [], capabilities = {}) {
  items = seatGuardFiltered(items, state.seatGuardMemberSearch);
  if (!items.length) return '<p class="meta empty-state">No workspace members were returned.</p>';
  return `
    <div class="table-wrap">
      <table class="data-table seat-guard-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>Workspace status</th>
            <th>Classification</th>
            <th>Seat expires</th>
            <th>Orders</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const classification = seatGuardClassification(item);
            const canRemove = Boolean(capabilities.canRemove && item.removable);
            return `
              <tr>
                <td>${renderSeatGuardIdentity(item)}</td>
                <td>${escapeHtml(item.role || '-')}</td>
                <td>${renderStatusPill(item.status || 'unknown')}</td>
                <td>${renderStatusPill(classification, classification.replaceAll('_', ' '))}</td>
                <td>${escapeHtml(seatGuardDate(item.expiresAt))}</td>
                <td>${renderSeatGuardReferences(item.orderIds, 'No matching order')}</td>
                <td>${canRemove
                  ? seatGuardAction('seat-guard-remove-member', item, classification === 'manual_allowed' ? 'Remove unverified' : 'Remove member', 'user-minus')
                  : '<span class="meta">Protected or read only</span>'}</td>
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
  if (!items.length) return '<p class="meta empty-state">No pending invitations were returned.</p>';
  return `
    <div class="table-wrap">
      <table class="data-table seat-guard-table">
        <thead>
          <tr>
            <th>Invitee</th>
            <th>Status</th>
            <th>Classification</th>
            <th>Seat expires</th>
            <th>Orders</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const classification = seatGuardClassification(item);
            const canCancel = Boolean(capabilities.canRemove && item.cancelable);
            return `
              <tr>
                <td>${renderSeatGuardIdentity(item)}</td>
                <td>${renderStatusPill(item.status || 'pending')}</td>
                <td>${renderStatusPill(classification, classification.replaceAll('_', ' '))}</td>
                <td>${escapeHtml(seatGuardDate(item.expiresAt))}</td>
                <td>${renderSeatGuardReferences(item.orderIds, 'No matching order')}</td>
                <td>${canCancel
                  ? seatGuardAction('seat-guard-cancel-invitation', item, classification === 'manual_allowed' ? 'Cancel unverified' : 'Cancel invite', 'mail-x')
                  : '<span class="meta">Protected or read only</span>'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSeatGuardEntitlements(items = []) {
  if (!items.length) return '<p class="meta empty-state">No Seat entitlements were returned.</p>';
  return `
    <div class="table-wrap">
      <table class="data-table seat-guard-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>State</th>
            <th>Expires</th>
            <th>Products</th>
            <th>Orders</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.email || '-')}</strong></td>
              <td>${renderStatusPill(item.state || 'unknown')}</td>
              <td>${escapeHtml(seatGuardDate(item.expiresAt))}</td>
              <td>${renderSeatGuardReferences(item.productNames)}</td>
              <td>${renderSeatGuardReferences(item.orderIds)}</td>
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
    ? capabilities.canRead ? 'Connected' : 'Configured without member-read permission'
    : 'Seat Guard is not configured';
  const expiryStatus = !expiry.enabled
    ? 'Automatic cleanup off'
    : expiry.storageReady
      ? 'Automatic cleanup on'
      : expiry.storageReason === 'database_pool_too_small'
        ? `Blocked: DATABASE_POOL_MAX must be at least ${Number(expiry.requiredDatabasePoolMax || 0)}`
        : 'Blocked: PostgreSQL row mode required';
  $('#seatGuardConnection').innerHTML = `
    <div class="seat-guard-connection-head">
      <span class="status-dot ${status}">${escapeHtml(title)}</span>
      <span class="meta">Observed: ${escapeHtml(seatGuardDate(data.observedAt))}</span>
    </div>
    <div class="seat-guard-connection-grid">
      <span><strong>Account</strong>${escapeHtml(seatGuardAccountLabel(data.account))}</span>
      <span><strong>Permissions</strong>${escapeHtml(seatGuardPermissionsLabel(data.permissions))}</span>
      <span><strong>30-day expiry</strong>${escapeHtml(expiryStatus)}</span>
      <span><strong>Capabilities</strong>Read ${capabilities.canRead ? 'yes' : 'no'} · Remove ${capabilities.canRemove ? 'yes' : 'no'}</span>
    </div>
  `;
}

async function renderSeatGuard() {
  const data = await api('/api/seat-guard');
  state.seatGuard = data;
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

async function pollSeatGuardOperation(operationId, { timeoutMs = 180_000, intervalMs = 1_500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const terminalStatuses = new Set(['succeeded', 'failed', 'partially_succeeded', 'cancelled', 'completed']);
  while (Date.now() < deadline) {
    const payload = await api(`/api/seat-guard/operations/${encodeURIComponent(operationId)}`);
    const operation = seatGuardOperationEnvelope(payload);
    const status = String(operation.status || '').trim().toLowerCase();
    const terminal = operation.terminal === true || terminalStatuses.has(status);
    if (terminal) {
      if (!['succeeded', 'completed'].includes(status)) {
        await renderSeatGuard().catch(() => {});
        const error = new Error(operation.error?.message || `Seat Guard operation ${status || 'failed'}`);
        error.seatGuardTerminal = true;
        error.operationId = operationId;
        throw error;
      }
      await renderSeatGuard();
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
    const result = await api(`/api/seat-guard/${resource}/${encodeURIComponent(id)}/${endpointAction}`, {
      method: 'POST',
      body: JSON.stringify({ expectedEmail: email, confirmation, actionRequestId })
    });
    if (!result.operationId) throw new Error('Seat Guard did not return an operation id');
    toast(`Seat Guard operation ${result.operationId} started`);
    await pollSeatGuardOperation(result.operationId);
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
    '<option value="all">All brands</option>',
    ...brands.map((brand) => `<option value="${escapeHtml(brand)}">${escapeHtml(brand)}</option>`)
  ].join('');
  brandFilter.value = brands.includes(current) ? current : 'all';
  state.productBrand = brandFilter.value;
}

function filteredProducts() {
  const query = state.productSearch.trim().toLowerCase();
  return sortedProducts().filter((product) => {
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
    if (state.productStatus === 'low-stock' && (isSeatEmailProduct(product) || !active || stock > 2)) return false;
    return true;
  });
}

function renderProductEditor(product) {
  const active = product.active !== false;
  return `
    <form class="product-editor" data-product-editor data-id="${escapeHtml(product.id)}">
      <div class="editor-grid">
        <label>Category<input name="category" value="${escapeHtml(product.category || 'Accounts')}" required></label>
        <label>Brand<input name="brand" value="${escapeHtml(product.brand || 'Other')}" required></label>
        <label>Package<input name="packageType" value="${escapeHtml(product.packageType || '')}"></label>
        <label>Name<input name="name" value="${escapeHtml(product.name || '')}" required></label>
        <label>Description<textarea name="description" rows="3">${escapeHtml(product.description || '')}</textarea></label>
        <label>Account type<textarea name="accountType" rows="3">${escapeHtml(product.accountType || '')}</textarea></label>
        <label>Warranty policy<textarea name="warrantyPolicy" rows="3">${escapeHtml(product.warrantyPolicy || '')}</textarea></label>
        <label>Replacement policy<textarea name="replacementPolicy" rows="3">${escapeHtml(product.replacementPolicy || '')}</textarea></label>
        <label>Delivery mode
          <select name="deliveryMode">
            <option value="text" ${(product.deliveryMode || 'text') === 'text' ? 'selected' : ''}>Text message</option>
            <option value="file" ${product.deliveryMode === 'file' ? 'selected' : ''}>TXT file</option>
          </select>
        </label>
        <label>Fulfillment mode
          <select name="fulfillmentMode">
            <option value="inventory" ${isSeatEmailProduct(product) ? '' : 'selected'}>Inventory stock</option>
            <option value="seat_email" ${isSeatEmailProduct(product) ? 'selected' : ''}>Seat via customer emails</option>
          </select>
        </label>
        <label>Seat term (months)<input name="seatTermMonths" type="number" min="1" max="120" value="${escapeHtml(product.seatTermMonths || 1)}"></label>
        <label>Official price note<input name="officialPriceNote" value="${escapeHtml(product.officialPriceNote || '')}"></label>
        <label>Price<input name="price" type="number" min="1" value="${escapeHtml(product.price)}" required></label>
        <label>Currency<input name="currency" value="${escapeHtml(product.currency || 'VND')}" required></label>
        <label>Sort<input name="sortOrder" type="number" min="1" value="${escapeHtml(product.sortOrder || 1000)}"></label>
        <label><input name="hot" type="checkbox" value="true" ${product.hot ? 'checked' : ''}> Hot</label>
        <label>Status
          <select name="active">
            <option value="true" ${active ? 'selected' : ''}>Active</option>
            <option value="false" ${active ? '' : 'selected'}>Disabled</option>
          </select>
        </label>
      </div>
      <div class="actions">
        <button class="small" type="submit">${icon('save')}<span>Save product</span></button>
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
  return `
    <article class="product-card">
      <div class="product-main">
        <div>
          <div class="eyebrow">${icon('package')}<span>${escapeHtml(product.packageType || 'Package')}</span></div>
          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(product.description || 'No description')}</p>
          ${product.accountType ? `<p><strong>Account type:</strong> ${escapeHtml(product.accountType)}</p>` : ''}
          ${product.warrantyPolicy ? `<p><strong>Warranty:</strong> ${escapeHtml(product.warrantyPolicy)}</p>` : ''}
          ${product.replacementPolicy ? `<p><strong>Replacement:</strong> ${escapeHtml(product.replacementPolicy)}</p>` : ''}
          <p><strong>Delivery:</strong> ${product.deliveryMode === 'file' ? 'TXT file' : 'Text message'}</p>
          <p><strong>Fulfillment:</strong> ${escapeHtml(fulfillmentModeLabel(product))}</p>
          ${seatEmail ? `<p><strong>Seat term:</strong> ${escapeHtml(product.seatTermMonths || 1)} month(s)</p>` : ''}
          ${product.officialPriceNote ? `<p>${escapeHtml(product.officialPriceNote)}</p>` : ''}
        </div>
        ${renderStatusPill(active ? 'available' : 'cancelled', active ? 'active' : 'disabled')}
      </div>
      <div class="product-meta">
        <span>${brandLogo(product.brand)}${escapeHtml(product.brand || 'Other')}</span>
        <span>${icon('barcode')}SKU <strong>${escapeHtml(product.sku)}</strong></span>
        <span>${icon('wallet')}${escapeHtml(money(product.price, product.currency))}</span>
      </div>
      ${seatEmail
        ? `<div class="stock-strip seat-fulfillment-strip"><span>${icon('mail-check')}<strong>Seat</strong> via customer emails</span></div>`
        : `<div class="stock-strip">
            <span>${icon('circle-check')}<strong>${escapeHtml(available)}</strong> available</span>
            <span>${icon('clock-3')}<strong>${escapeHtml(reserved)}</strong> reserved</span>
            <span>${icon('archive')}<strong>${escapeHtml(sold)}</strong> sold</span>
          </div>`}
      <div class="actions">
        <button class="small secondary" data-action="toggle-product" data-id="${escapeHtml(product.id)}" data-active="${active}">${icon(active ? 'pause-circle' : 'play-circle')}<span>${active ? 'Disable' : 'Enable'}</span></button>
        ${seatEmail ? '' : actionButton('import-stock', product.id, 'Import stock', 'small secondary', icon('boxes'))}
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
  $('#productCountBadge').textContent = `${filtered.length} products`;

  let currentGroup = '';
  for (const product of filtered) {
    const category = product.category || 'Accounts';
    const brand = product.brand || 'Other';
    const group = `${category}\u0000${brand}`;
    if (group !== currentGroup) {
      currentGroup = group;
      const header = document.createElement('section');
      header.className = 'brand-section';
      header.innerHTML = `
        <div>
          <span>${icon('tag')}${escapeHtml(category)}</span>
          <strong>${brandLogo(brand)}${escapeHtml(brand)}</strong>
        </div>
      `;
      list.appendChild(header);
    }
    const item = document.createElement('div');
    item.innerHTML = renderProductCard(product);
    list.appendChild(item);
  }
  if (!filtered.length) {
    list.innerHTML = '<p class="meta empty-state">No products match the current filters.</p>';
  }

  const select = $('#inventoryForm select[name="productId"]');
  const selectedProductId = select.value;
  const inventoryProducts = sortedProducts(products).filter((product) => !isSeatEmailProduct(product));
  select.innerHTML = inventoryProducts.length
    ? inventoryProducts.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.brand || 'Other')} - ${escapeHtml(product.name)} (${escapeHtml(product.sku)})</option>`).join('')
    : '<option value="">No inventory-managed products</option>';
  select.disabled = inventoryProducts.length === 0;
  if (inventoryProducts.some((product) => product.id === selectedProductId)) {
    select.value = selectedProductId;
  }
  refreshIcons();
}

function renderSummary(summary) {
  $('#statProducts').textContent = summary.products;
  $('#statStock').textContent = summary.availableInventory;
  $('#statPending').textContent = summary.pendingOrders;
  $('#statAwaitingSeat').textContent = summary.awaitingFulfillmentOrders || 0;
  $('#statDelivered').textContent = summary.deliveredOrders;
  $('#statReview').textContent = summary.reviewOrders;
  $('#statRevenue').textContent = money(summary.revenue);

  $('#recentOrders').innerHTML = summary.recentOrders.length
    ? summary.recentOrders.map((order) => `
      <div class="row">
        <div class="row-title"><strong>${icon('shopping-cart')}${escapeHtml(order.productName)}</strong><span class="badge ${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></div>
        <div class="meta">${escapeHtml(order.id)} | ${escapeHtml(money(order.total, order.currency))}</div>
      </div>
    `).join('')
    : '<p class="meta">No orders yet.</p>';

  const lowStockProducts = (summary.lowStock || []).filter((product) => {
    const catalogProduct = state.products.find((item) => item.id === product.id || item.sku === product.sku) || product;
    return !isSeatEmailProduct(catalogProduct);
  });
  $('#lowStock').innerHTML = lowStockProducts.length
    ? lowStockProducts.map((product) => `
      <div class="row">
        <div class="row-title"><strong>${icon('package-x')}${escapeHtml(product.name)}</strong><span class="badge reserved">${escapeHtml(product.stock.available)} left</span></div>
        <div class="meta">${escapeHtml(product.sku)}</div>
      </div>
    `).join('')
    : '<p class="meta">No low-stock products.</p>';
  refreshIcons();
}

async function renderInventory() {
  const selected = $('#inventoryForm select[name="productId"]').value;
  if (!selected) {
    $('#inventoryList').innerHTML = '<p class="meta">No inventory-managed products.</p>';
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
    : '<p class="meta">No inventory for this product.</p>';
  refreshIcons();
}

function renderOrderActions(order) {
  const actions = [];
  const seatEmail = isSeatEmailOrder(order);
  if (order.status === 'pending_payment') {
    actions.push(actionButton('mark-paid', order.id, 'Mark Paid', 'small', icon('shopping-cart')));
    actions.push(actionButton('cancel-order', order.id, 'Cancel', 'small danger', icon('x-circle')));
  }
  if (order.status === 'payment_review') {
    actions.push(actionButton(
      'approve-review',
      order.id,
      seatEmail ? 'Approve Seat Payment' : 'Approve Delivery',
      'small',
      icon('check-circle-2')
    ));
    actions.push(actionButton('mark-refunded', order.id, 'Mark Refunded', 'small danger', icon('rotate-ccw')));
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
          'Confirm Target & Retry',
          'small',
          icon('refresh-cw')
        ));
      } else {
        actions.push(actionButton('retry-fulfillment', order.id, retryLabel, 'small', icon('refresh-cw')));
      }
    }
    const manualMode = automaticSeatManualMode(order);
    if (manualMode === 'safe') {
      actions.push(actionButton('complete-seat', order.id, 'Complete Manually', 'small secondary', icon('mail-check')));
    }
    if (manualMode === 'verification_required') {
      actions.push(actionButton('complete-after-verification', order.id, 'Complete After Verification', 'small secondary', icon('shield-check')));
    }
    const refundMode = automaticSeatRefundMode(order);
    if (refundMode === true || refundMode === 'safe') {
      actions.push(actionButton('mark-refunded', order.id, 'Refund', 'small danger', icon('rotate-ccw')));
    }
    if (refundMode === 'cleanup_required') {
      actions.push(actionButton('refund-after-cleanup', order.id, 'Refund After Cleanup', 'small danger', icon('shield-alert')));
    }
  }
  if (order.status === 'delivered') {
    if (!seatEmail) {
      actions.push(actionButton('show-delivery', order.id, 'Delivery', 'small secondary', icon('key-round')));
    }
    actions.push(actionButton(
      'resend-delivery',
      order.id,
      seatEmail ? 'Resend Seat Notice' : 'Resend Telegram',
      'small secondary',
      icon('send')
    ));
  }
  return actions.length ? `<div class="actions">${actions.join('')}</div>` : '';
}

function renderOrderTable(orders) {
  if (!orders.length) return '<p class="meta empty-state">No orders match the current filter.</p>';
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Product</th>
            <th>User</th>
            <th>Recipient emails</th>
            <th>Total</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map((order) => `
            <tr>
              <td><strong>${escapeHtml(order.id)}</strong><span>${escapeHtml(new Date(order.createdAt).toLocaleString())}</span></td>
              <td><strong>${escapeHtml(order.productName)}</strong><span>${escapeHtml(order.productSku || order.productId)}</span></td>
              <td>${escapeHtml(order.telegramId || order.userId)}</td>
              <td>${renderOrderRecipients(order)}</td>
              <td>${escapeHtml(money(order.total, order.currency))}<span>qty ${escapeHtml(order.quantity)}</span></td>
              <td>${renderStatusPill(order.status)}${renderFulfillmentAutomation(order)}</td>
              <td>${renderOrderActions(order) || '<span class="meta">No actions</span>'}</td>
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
    ? `<p class="meta">Showing 500 of ${escapeHtml(result.total)} matching orders.</p>`
    : '';
  $('#ordersList').innerHTML = `${more}${renderOrderTable(result.items)}`;
  refreshIcons();
}

async function renderPayments() {
  const result = await api('/api/payments?limit=100');
  $('#paymentsList').innerHTML = result.items.length
    ? result.items.map((payment) => `
      <div class="row">
        <div class="row-title"><strong>${icon('credit-card')}${escapeHtml(payment.reference)}</strong><span class="badge ${escapeHtml(payment.status)}">${escapeHtml(payment.status)}</span></div>
        <div class="meta">${escapeHtml(payment.providerPaymentId)} | order ${escapeHtml(payment.orderId)} | ${escapeHtml(money(payment.amount, payment.currency))}</div>
        <div class="meta"><a href="${escapeHtml(payment.paymentUrl)}" target="_blank" rel="noreferrer">${escapeHtml(payment.paymentUrl)}</a></div>
        ${payment.qrImageUrl ? `<div class="meta"><a href="${escapeHtml(payment.qrImageUrl)}" target="_blank" rel="noreferrer">Open QR image</a></div>` : ''}
      </div>
    `).join('')
    : '<p class="meta">No payments yet.</p>';
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
    : '<p class="meta">No audit logs yet.</p>';
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
      <span class="meta">${escapeHtml(system.warnings)} warning(s)</span>
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
    ${systemLine('Environment', system.environment)}
    ${systemLine('Node', system.node)}
    ${systemLine('Uptime', `${system.uptimeSeconds}s`)}
    ${systemLine('Base URL', system.baseUrl)}
    ${systemLine('Storage', system.storage.driver)}
    ${system.storage.dataFile ? systemLine('Data file', system.storage.dataFile) : ''}
    ${systemLine('Redis', system.traffic.redisConfigured ? 'configured' : 'memory fallback')}
    ${system.sales ? systemLine('Sales', system.sales.enabled ? 'open' : 'closed') : ''}
    ${system.sales ? systemLine('Inventory encryption', system.sales.inventoryEncryptionConfigured ? 'configured' : 'missing') : ''}
    ${systemLine('Payment', system.payment.configuredProvider)}
    ${systemLine('Telegram', system.telegram.tokenConfigured ? 'token configured' : 'not configured')}
    ${system.telegramEmoji ? systemLine('Telegram emoji', system.telegramEmoji.enabled ? `${Object.values(system.telegramEmoji.packs || {}).filter((pack) => pack.loaded).length}/${system.telegramEmoji.requiredPacks.length} packs loaded` : 'disabled') : ''}
    ${systemLine('Telegram webhook', system.telegram.webhookUrl)}
    ${systemLine('SePay webhook', system.payment.sepayWebhookUrl)}
    ${systemLine('Order TTL', `${system.orders.ttlMinutes} minutes`)}
    ${systemLine('Max quantity', system.orders.maxQuantity)}
    ${systemLine('Products', system.counts.products)}
    ${systemLine('Inventory items', system.counts.inventory)}
    ${systemLine('Orders', system.counts.orders)}
    ${systemLine('Payments', system.counts.payments)}
  `;
  refreshIcons();
}

async function refresh() {
  const [summary, products, system] = await Promise.all([
    api('/api/dashboard/summary'),
    api('/api/products'),
    api('/api/system/status')
  ]);
  renderQuickStatus(system);
  renderProducts(products);
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
  $('#loginError').textContent = '';
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
    showDashboard(result.user);
    await refresh();
  } catch (error) {
    $('#loginError').textContent = error.message;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

$('#refreshBtn').addEventListener('click', () => refresh().then(() => toast('Refreshed')).catch((error) => toast(error.message)));

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
  const data = Object.fromEntries(new FormData(form).entries());
  data.price = Number(data.price);
  data.seatTermMonths = Number(data.seatTermMonths || 1);
  data.hot = data.hot === 'true';
  try {
    await api('/api/products', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    await refresh();
    toast('Product created');
  } catch (error) {
    toast(error.message);
  }
});

$('#inventoryForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const result = await api(`/api/products/${data.productId}/inventory`, {
      method: 'POST',
      body: JSON.stringify({ items: data.items })
    });
    form.elements.items.value = '';
    await refresh();
    toast(`Imported ${result.imported} items${result.skippedDuplicates ? `; skipped ${result.skippedDuplicates} duplicate(s)` : ''}`);
  } catch (error) {
    toast(error.message);
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

$('#devOrderForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  data.quantity = Number(data.quantity || 1);
  try {
    await api('/api/dev/create-order', { method: 'POST', body: JSON.stringify(data) });
    await refresh();
    await renderOrders();
    toast('Test order created');
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-product-editor]');
  if (!form) return;
  event.preventDefault();
  const id = form.dataset.id;
  const data = Object.fromEntries(new FormData(form).entries());
  data.price = Number(form.elements.price.value);
  data.sortOrder = Number(form.elements.sortOrder.value || 1000);
  data.seatTermMonths = Number(form.elements.seatTermMonths.value || 1);
  data.active = form.elements.active.value === 'true';
  data.hot = form.elements.hot.checked;
  try {
    await api(`/api/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    await refresh();
    toast('Product updated');
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const { action, id } = target.dataset;
  try {
    if (action === 'refresh-seat-guard') {
      await renderSeatGuard();
      toast('Seat Guard refreshed');
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
