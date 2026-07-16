import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { config } from './config.js';
import { clearSessionCookie, loginForRequest, logout, makeSessionCookie, requireAdmin } from './auth.js';
import { initStore, readStore } from './storage.js';
import {
  applyPaymentEvent,
  approveReviewDelivery,
  cancelOrder,
  createOrderForUser,
  createProduct,
  expireOrders,
  getDashboardSummary,
  getDeliveryForOrder,
  getPublicPaymentStatus,
  importInventory,
  listAuditLogs,
  listInventory,
  listOrders,
  listPayments,
  listProducts,
  markOrderRefunded,
  markOrderPaidManually,
  recordAudit,
  updateProduct,
  upsertTelegramUser
} from './shop.js';
import { paymentProviders } from './payments.js';
import { configureTelegramMenu, handleTelegramUpdate, notifyBotRestoredToUsers, notifyDelivery, startTelegramPolling } from './telegram.js';
import { assertRateLimit, classifyHttpLimit, clientIp } from './rateLimit.js';
import { getReadiness, getSystemStatus } from './systemStatus.js';

const publicDir = resolve(process.cwd(), 'public');

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    ...headers
  });
  res.end(payload);
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers
  });
  res.end(JSON.stringify(body));
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

async function readRawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > config.traffic.maxBodyBytes) {
      throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  const rawBody = await readRawBody(req);
  if (!rawBody) return { rawBody: '', body: {} };
  return { rawBody, body: JSON.parse(rawBody) };
}

function routeParams(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const expected = patternParts[i];
    const actual = pathParts[i];
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}

async function requireAdminForRequest(req, res) {
  const db = await readStore();
  const admin = requireAdmin(req, db);
  if (!admin) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return admin;
}

async function serveStatic(pathname, res) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = resolve(join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
    send(res, 403, 'Forbidden');
    return;
  }

  try {
    const data = await readFile(filePath);
    const type = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.webm': 'video/webm'
    }[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  } catch {
    send(res, 404, 'Not found');
  }
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  const limit = classifyHttpLimit(pathname);
  if (limit) {
    await assertRateLimit(`${limit.bucket}:${clientIp(req)}`, limit.limit);
  }

  if (req.method === 'GET' && pathname === '/api/healthz') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/readyz') {
    return sendJson(res, 200, await getReadiness());
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const { body } = await readJson(req);
    const session = await loginForRequest(body.username, body.password);
    if (!session) return sendJson(res, 401, { error: 'Invalid credentials' });
    return sendJson(res, 200, { ok: true, user: { username: session.username, role: session.role } }, {
      'set-cookie': makeSessionCookie(session)
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const db = await readStore();
    const admin = requireAdmin(req, db);
    if (admin) await logout(admin.sessionId);
    return sendJson(res, 200, { ok: true }, { 'set-cookie': clearSessionCookie() });
  }

  if (req.method === 'GET' && pathname === '/api/me') {
    const db = await readStore();
    const admin = requireAdmin(req, db);
    if (!admin) return sendJson(res, 401, { error: 'Unauthorized' });
    return sendJson(res, 200, { username: admin.username, role: admin.role });
  }

  if (pathname === '/api/public/telegram/webhook' && req.method === 'POST') {
    if (config.telegram.polling) {
      return sendJson(res, 404, { error: 'Telegram webhook is disabled while polling is enabled' });
    }
    if (!config.telegram.webhookSecret) {
      return sendJson(res, 503, { error: 'Telegram webhook is not configured' });
    }
    const suppliedSecret = String(
      req.headers['x-telegram-bot-api-secret-token']
      || searchParams.get('secret')
      || ''
    );
    if (suppliedSecret !== config.telegram.webhookSecret) {
      return sendJson(res, 401, { error: 'Invalid webhook secret' });
    }
    const { body } = await readJson(req);
    await handleTelegramUpdate(body);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/public/payments/mock-webhook' && req.method === 'POST') {
    if (process.env.NODE_ENV === 'production' || config.payment.provider !== 'mock') {
      return sendJson(res, 404, { error: 'Mock payment webhook is disabled' });
    }
    const { rawBody, body } = await readJson(req);
    const event = await paymentProviders.mock.verifyWebhook({
      rawBody,
      body,
      signature: req.headers['x-payment-signature']
    });
    const result = await applyPaymentEvent(event);
    sendJson(res, 200, { ok: true, result });
    if (result.order?.id) {
      setImmediate(() => notifyDelivery(result.order.id).catch((error) => console.error('[telegram] notify failed:', error.message)));
    }
    return;
  }

  if (pathname === '/api/public/payments/sepay-webhook' && req.method === 'POST') {
    const { rawBody, body } = await readJson(req);
    const event = await paymentProviders.sepay.verifyWebhook({
      rawBody,
      body,
      headers: req.headers
    });
    const result = await applyPaymentEvent(event, 'sepay-webhook');
    sendJson(res, 200, { success: true });
    if (result.order?.id) {
      setImmediate(() => notifyDelivery(result.order.id).catch((error) => console.error('[telegram] notify failed:', error.message)));
    }
    return;
  }

  const paymentStatusParams = routeParams('/api/public/payments/:providerPaymentId/status', pathname);
  if (paymentStatusParams && req.method === 'GET') {
    const status = await getPublicPaymentStatus(paymentStatusParams.providerPaymentId);
    if (!status) return sendJson(res, 404, { error: 'Payment not found' });
    return sendJson(res, 200, status, { 'cache-control': 'no-store' });
  }

  const admin = await requireAdminForRequest(req, res);
  if (!admin) return;

  if (req.method === 'GET' && pathname === '/api/dashboard/summary') {
    return sendJson(res, 200, await getDashboardSummary());
  }

  if (req.method === 'GET' && pathname === '/api/system/status') {
    return sendJson(res, 200, await getSystemStatus());
  }

  if (req.method === 'GET' && pathname === '/api/products') {
    return sendJson(res, 200, await listProducts({ includeInactive: true }));
  }

  if (req.method === 'POST' && pathname === '/api/products') {
    const { body } = await readJson(req);
    return sendJson(res, 201, await createProduct(admin.id, body));
  }

  let params = routeParams('/api/products/:id', pathname);
  if (params && req.method === 'PATCH') {
    const { body } = await readJson(req);
    return sendJson(res, 200, await updateProduct(admin.id, params.id, body));
  }

  params = routeParams('/api/products/:id/inventory', pathname);
  if (params && req.method === 'GET') {
    return sendJson(res, 200, await listInventory(params.id));
  }
  if (params && req.method === 'POST') {
    const { body } = await readJson(req);
    const lines = Array.isArray(body.items) ? body.items : String(body.items || '').split(/\r?\n/);
    return sendJson(res, 201, await importInventory(admin.id, params.id, lines));
  }

  if (req.method === 'GET' && pathname === '/api/inventory') {
    return sendJson(res, 200, await listInventory(searchParams.get('productId')));
  }

  if (req.method === 'GET' && pathname === '/api/orders') {
    return sendJson(res, 200, await listOrders({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      status: searchParams.get('status')
    }));
  }

  params = routeParams('/api/orders/:id/mark-paid', pathname);
  if (params && req.method === 'POST') {
    const result = await markOrderPaidManually(admin.id, params.id);
    if (result.order?.id) await notifyDelivery(result.order.id).catch((error) => console.error('[telegram] notify failed:', error.message));
    return sendJson(res, 200, result);
  }

  params = routeParams('/api/orders/:id/cancel', pathname);
  if (params && req.method === 'POST') {
    return sendJson(res, 200, await cancelOrder(admin.id, params.id));
  }

  params = routeParams('/api/orders/:id/approve-review', pathname);
  if (params && req.method === 'POST') {
    const { body } = await readJson(req);
    const result = await approveReviewDelivery(admin.id, params.id, body);
    if (result.order?.id) await notifyDelivery(result.order.id).catch((error) => console.error('[telegram] notify failed:', error.message));
    return sendJson(res, 200, result);
  }

  params = routeParams('/api/orders/:id/refund', pathname);
  if (params && req.method === 'POST') {
    const { body } = await readJson(req);
    return sendJson(res, 200, await markOrderRefunded(admin.id, params.id, body));
  }

  params = routeParams('/api/orders/:id/delivery', pathname);
  if (params && req.method === 'GET') {
    return sendJson(res, 200, await getDeliveryForOrder(params.id));
  }

  params = routeParams('/api/orders/:id/resend-delivery', pathname);
  if (params && req.method === 'POST') {
    const delivery = await getDeliveryForOrder(params.id);
    if (!delivery.deliverySecrets.length) {
      throw Object.assign(new Error('No delivery payload is available'), { statusCode: 409 });
    }
    await notifyDelivery(params.id);
    await recordAudit(admin.id, 'delivery.resend', 'order', params.id);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/payments') {
    return sendJson(res, 200, await listPayments({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset')
    }));
  }

  if (req.method === 'GET' && pathname === '/api/audit-logs') {
    return sendJson(res, 200, await listAuditLogs({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset')
    }));
  }

  if (req.method === 'POST' && pathname === '/api/dev/create-order') {
    const { body } = await readJson(req);
    const telegramId = String(body.telegramId || process.env.TELEGRAM_OWNER_USER_ID || '').trim();
    if (!telegramId) {
      throw Object.assign(new Error('telegramId or TELEGRAM_OWNER_USER_ID is required for test orders'), { statusCode: 400 });
    }
    const user = await upsertTelegramUser({
      id: telegramId,
      username: body.username || 'dashboard-test',
      first_name: 'Dashboard',
      last_name: 'Test'
    });
    return sendJson(res, 201, await createOrderForUser(user, body.sku, body.quantity || 1));
  }

  sendJson(res, 404, { error: 'API route not found' });
}

async function handleMockPayPage(req, res, pathname) {
  const params = routeParams('/pay/mock/:providerPaymentId', pathname);
  if (!params) return false;

  const db = await readStore();
  const payment = db.payments.find((item) => item.providerPaymentId === params.providerPaymentId);
  if (!payment) {
    send(res, 404, 'Payment not found');
    return true;
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mock Payment</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="pay-page">
  <main class="pay-box">
    <h1>Mock Payment</h1>
    <p>Reference: <strong>${payment.reference}</strong></p>
    <p>Amount: <strong>${Number(payment.amount).toLocaleString('vi-VN')} ${payment.currency}</strong></p>
    <p>Status: <strong>${payment.status}</strong></p>
    <p>This page represents the QR/API provider checkout screen.</p>
  </main>
</body>
</html>`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
  return true;
}

async function handleSePayPage(req, res, pathname) {
  const params = routeParams('/pay/sepay/:providerPaymentId', pathname);
  if (!params) return false;

  const db = await readStore();
  const payment = db.payments.find((item) => item.providerPaymentId === params.providerPaymentId);
  if (!payment) {
    send(res, 404, 'Payment not found');
    return true;
  }

  const providerPaymentId = String(payment.providerPaymentId || '');
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Thanh toán đơn hàng</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="pay-page">
  <main class="pay-box">
    <h1>Thanh toán qua SePay</h1>
    <p>Quét QR hoặc chuyển khoản đúng số tiền và nội dung bên dưới.</p>
    ${payment.qrImageUrl ? `<img class="qr-image" src="${escapeHtml(payment.qrImageUrl)}" alt="Mã QR thanh toán SePay">` : ''}
    <p>Ngân hàng: <strong>${escapeHtml(payment.bankCode)}</strong></p>
    <p>Số tài khoản: <strong id="accountNumber">${escapeHtml(payment.accountNumber)}</strong></p>
    <p>Số tiền: <strong>${Number(payment.amount).toLocaleString('vi-VN')} ${escapeHtml(payment.currency)}</strong></p>
    <p>Nội dung: <strong id="paymentMemo">${escapeHtml(payment.memo || payment.reference)}</strong></p>
    <p>Trạng thái: <strong id="paymentStatus">${escapeHtml(payment.status)}</strong></p>
    <div class="actions">
      <button type="button" data-copy="accountNumber">Sao chép số tài khoản</button>
      <button type="button" data-copy="paymentMemo">Sao chép nội dung</button>
    </div>
    <p id="paymentNotice">Trang sẽ tự cập nhật khi SePay xác nhận giao dịch.</p>
  </main>
  <script>
    const providerPaymentId = ${JSON.stringify(providerPaymentId)};
    document.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', async () => {
        const value = document.getElementById(button.dataset.copy)?.textContent || '';
        await navigator.clipboard.writeText(value);
        const original = button.textContent;
        button.textContent = 'Đã sao chép';
        setTimeout(() => { button.textContent = original; }, 1200);
      });
    });
    async function refreshPaymentStatus() {
      try {
        const response = await fetch('/api/public/payments/' + encodeURIComponent(providerPaymentId) + '/status', {
          cache: 'no-store'
        });
        if (!response.ok) return;
        const data = await response.json();
        document.getElementById('paymentStatus').textContent = data.orderStatus || data.paymentStatus;
        if (['paid', 'delivered'].includes(data.paymentStatus) || data.orderStatus === 'delivered') {
          document.getElementById('paymentNotice').textContent = 'Thanh toán đã được xác nhận. Kiểm tra Telegram để nhận hàng.';
          return;
        }
        if (['cancelled', 'expired', 'payment_review', 'refunded'].includes(data.orderStatus)) {
          document.getElementById('paymentNotice').textContent = 'Đơn cần được kiểm tra. Vui lòng quay lại Telegram và liên hệ hỗ trợ.';
          return;
        }
        setTimeout(refreshPaymentStatus, 3000);
      } catch {
        setTimeout(refreshPaymentStatus, 5000);
      }
    }
    refreshPaymentStatus();
  </script>
</body>
</html>`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
  return true;
}

async function requestHandler(req, res) {
  try {
    const url = new URL(req.url, config.baseUrl);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (await handleMockPayPage(req, res, url.pathname)) return;
    if (await handleSePayPage(req, res, url.pathname)) return;
    await serveStatic(url.pathname, res);
  } catch (error) {
    const status = error.statusCode || 500;
    const headers = error.retryAfterSeconds ? { 'retry-after': String(error.retryAfterSeconds) } : {};
    sendJson(res, status, { error: error.message || 'Internal server error' }, headers);
  }
}

await initStore();
configureTelegramMenu().catch((error) => console.error('[telegram] menu setup failed:', error.message));
setInterval(() => expireOrders().catch((error) => console.error('[orders] expire failed:', error.message)), 60_000);
startTelegramPolling();

createServer(requestHandler).listen(config.port, '0.0.0.0', () => {
  console.log(`KAITO AI SHOP running at http://localhost:${config.port}`);
  notifyBotRestoredToUsers()
    .then((result) => {
      if (result.skipped) return;
      console.log(`[telegram] startup broadcast sent ${result.sent}/${result.attempted}`);
    })
    .catch((error) => console.error('[telegram] startup broadcast failed:', error.message));
});
