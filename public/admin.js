import { brandIcon, getBrandAsset } from './brand-assets.js';

const state = {
  tab: 'overview',
  products: [],
  productSearch: '',
  productBrand: 'all',
  productStatus: 'all',
  orderStatus: 'all'
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
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
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
      product.replacementPolicy
    ].join(' ').toLowerCase();

    if (query && !searchable.includes(query)) return false;
    if (state.productBrand !== 'all' && (product.brand || 'Other') !== state.productBrand) return false;
    if (state.productStatus === 'active' && !active) return false;
    if (state.productStatus === 'inactive' && active) return false;
    if (state.productStatus === 'low-stock' && (!active || stock > 2)) return false;
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
          ${product.officialPriceNote ? `<p>${escapeHtml(product.officialPriceNote)}</p>` : ''}
        </div>
        ${renderStatusPill(active ? 'available' : 'cancelled', active ? 'active' : 'disabled')}
      </div>
      <div class="product-meta">
        <span>${brandLogo(product.brand)}${escapeHtml(product.brand || 'Other')}</span>
        <span>${icon('barcode')}SKU <strong>${escapeHtml(product.sku)}</strong></span>
        <span>${icon('wallet')}${escapeHtml(money(product.price, product.currency))}</span>
      </div>
      <div class="stock-strip">
        <span>${icon('circle-check')}<strong>${escapeHtml(available)}</strong> available</span>
        <span>${icon('clock-3')}<strong>${escapeHtml(reserved)}</strong> reserved</span>
        <span>${icon('archive')}<strong>${escapeHtml(sold)}</strong> sold</span>
      </div>
      <div class="actions">
        <button class="small secondary" data-action="toggle-product" data-id="${escapeHtml(product.id)}" data-active="${active}">${icon(active ? 'pause-circle' : 'play-circle')}<span>${active ? 'Disable' : 'Enable'}</span></button>
        ${actionButton('import-stock', product.id, 'Import stock', 'small secondary', icon('boxes'))}
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
  select.innerHTML = sortedProducts(products).map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.brand || 'Other')} - ${escapeHtml(product.name)} (${escapeHtml(product.sku)})</option>`).join('');
  refreshIcons();
}

function renderSummary(summary) {
  $('#statProducts').textContent = summary.products;
  $('#statStock').textContent = summary.availableInventory;
  $('#statPending').textContent = summary.pendingOrders;
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

  $('#lowStock').innerHTML = summary.lowStock.length
    ? summary.lowStock.map((product) => `
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
  if (!selected) return;
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
  if (order.status === 'pending_payment') {
    actions.push(actionButton('mark-paid', order.id, 'Mark Paid', 'small', icon('shopping-cart')));
    actions.push(actionButton('cancel-order', order.id, 'Cancel', 'small danger', icon('x-circle')));
  }
  if (order.status === 'payment_review') {
    actions.push(actionButton('approve-review', order.id, 'Approve Delivery', 'small', icon('check-circle-2')));
    actions.push(actionButton('mark-refunded', order.id, 'Mark Refunded', 'small danger', icon('rotate-ccw')));
  }
  if (order.status === 'delivered') {
    actions.push(actionButton('show-delivery', order.id, 'Delivery', 'small secondary', icon('key-round')));
    actions.push(actionButton('resend-delivery', order.id, 'Resend Telegram', 'small secondary', icon('send')));
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
              <td>${escapeHtml(money(order.total, order.currency))}<span>qty ${escapeHtml(order.quantity)}</span></td>
              <td>${renderStatusPill(order.status)}</td>
              <td>${renderOrderActions(order) || '<span class="meta">No actions</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function renderOrders() {
  const result = await api('/api/orders?limit=100');
  const orders = state.orderStatus === 'all'
    ? result.items
    : result.items.filter((order) => order.status === state.orderStatus);
  $('#ordersList').innerHTML = renderOrderTable(orders);
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
  renderSummary(summary);
  renderProducts(products);
  if (state.tab === 'inventory') await renderInventory();
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
      toast('Order marked paid and delivered');
    }

    if (action === 'cancel-order') {
      await api(`/api/orders/${id}/cancel`, { method: 'POST' });
      toast('Order cancelled');
    }

    if (action === 'approve-review') {
      const note = window.prompt('Review note (optional)', '');
      if (note === null) return;
      await api(`/api/orders/${id}/approve-review`, {
        method: 'POST',
        body: JSON.stringify({ note })
      });
      toast('Review approved and delivered');
    }

    if (action === 'mark-refunded') {
      const note = window.prompt('Refund note (optional)', '');
      if (note === null) return;
      await api(`/api/orders/${id}/refund`, {
        method: 'POST',
        body: JSON.stringify({ note })
      });
      toast('Review order marked refunded');
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
