import { config } from './config.js';
import { inventoryEncryptionStatus } from './inventorySecrets.js';
import { strongWebhookCredential } from './webhookSecurity.js';

function publicHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function sepayAuthReady() {
  if (config.sepay.webhookAuth === 'hmac') return strongWebhookCredential(config.sepay.webhookSecret);
  if (['api_key', 'apikey'].includes(config.sepay.webhookAuth)) {
    return strongWebhookCredential(config.sepay.webhookApiKey);
  }
  return false;
}

function controlledTestBuyer(user) {
  const telegramId = String(user?.telegramId || '').trim();
  return Boolean(telegramId && config.sales.testTelegramIds.includes(telegramId));
}

export function normalizeOrderQuantity(quantity) {
  const value = Number(quantity);
  if (!Number.isSafeInteger(value) || value < 1 || value > config.orders.maxQuantity) {
    throw Object.assign(
      new Error(`Quantity must be an integer between 1 and ${config.orders.maxQuantity}`),
      { statusCode: 400 }
    );
  }
  return value;
}

export function salesReadinessProblems(product = null, user = null) {
  const problems = [];
  const production = process.env.NODE_ENV === 'production';

  if (!config.sales.enabled && !controlledTestBuyer(user)) {
    problems.push('Shop chưa mở bán');
    return problems;
  }

  if (production && (config.storage.driver !== 'postgres' || !config.database.url)) {
    problems.push('Production sales require PostgreSQL and DATABASE_URL');
  }

  if (production && config.payment.provider !== 'sepay') {
    problems.push('Production sales require PAYMENT_PROVIDER=sepay');
  }

  if (config.payment.provider === 'sepay') {
    if (!config.sepay.accountNumber || !config.sepay.bankCode) {
      problems.push('Thiếu tài khoản hoặc mã ngân hàng SePay');
    }
    if (!sepayAuthReady()) {
      problems.push('Thiếu xác thực webhook SePay');
    }
    if (production && config.sepay.webhookAccountNumbers.length === 0) {
      problems.push('Thiếu SEPAY_WEBHOOK_ACCOUNT_NUMBERS');
    }
  }

  if (production && !publicHttps(config.baseUrl)) {
    problems.push('BASE_URL phải là HTTPS công khai');
  }

  if (production) {
    const encryption = inventoryEncryptionStatus();
    if (!encryption.valid) {
      problems.push(encryption.error || 'Thiếu INVENTORY_ENCRYPTION_KEY');
    }
  }

  if (production && product) {
    const missing = [
      ['description', 'mô tả'],
      ['accountType', 'loại tài khoản'],
      ['warrantyPolicy', 'bảo hành'],
      ['replacementPolicy', 'điều kiện đổi lỗi']
    ].filter(([key]) => !String(product[key] || '').trim());
    if (missing.length) {
      problems.push(`Sản phẩm thiếu ${missing.map(([, label]) => label).join(', ')}`);
    }
  }

  if (product && (!Number.isSafeInteger(Number(product.price)) || Number(product.price) <= 0)) {
    problems.push('Giá sản phẩm phải là số nguyên dương');
  }

  if (
    product
    && config.payment.provider === 'sepay'
    && String(product.currency || '').trim().toUpperCase() !== 'VND'
  ) {
    problems.push('SePay chỉ hỗ trợ sản phẩm có tiền tệ VND');
  }

  return problems;
}

export function assertSalesOrderAllowed(product, user = null) {
  const problems = salesReadinessProblems(product, user);
  if (!problems.length) return;
  throw Object.assign(new Error(problems[0]), {
    statusCode: 503,
    salesProblems: problems
  });
}
