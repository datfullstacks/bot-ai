import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config, nowIso } from './config.js';
import { makeId } from './storage.js';
import { strongWebhookCredential } from './webhookSecurity.js';

function hmac(body) {
  return createHmac('sha256', config.payment.webhookSecret).update(body).digest('hex');
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function compactCode(prefix) {
  const cleanPrefix = String(prefix || 'KAITO').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(cleanPrefix)) {
    throw Object.assign(
      new Error('SEPAY_PAYMENT_PREFIX must contain 2-5 letters or numbers'),
      { statusCode: 500 }
    );
  }
  const stamp = Date.now().toString(36).toUpperCase().padStart(9, '0').slice(-9);
  const random = randomBytes(3).toString('hex').toUpperCase();
  return `${cleanPrefix}${stamp}${random}`;
}

function sepayMemo(reference) {
  return [config.sepay.memoPrefix, reference, config.sepay.memoSuffix]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
}

function sepayQrUrl({ amount, reference }) {
  if (!config.sepay.accountNumber || !config.sepay.bankCode) {
    throw Object.assign(new Error('SEPAY_ACCOUNT_NUMBER and SEPAY_BANK_CODE are required'), { statusCode: 500 });
  }

  const params = new URLSearchParams({
    acc: config.sepay.accountNumber,
    bank: config.sepay.bankCode,
    amount: String(Math.round(Number(amount || 0))),
    des: sepayMemo(reference)
  });

  if (config.sepay.qrTemplate) params.set('template', config.sepay.qrTemplate);
  return `https://qr.sepay.vn/img?${params.toString()}`;
}

export class MockPaymentProvider {
  constructor(baseUrl = config.baseUrl) {
    this.name = 'mock';
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async createPayment(input) {
    const providerPaymentId = makeId('paymock');
    const reference = `KAITO${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
    return {
      provider: this.name,
      providerPaymentId,
      reference,
      amount: input.amount,
      currency: input.currency,
      paymentUrl: `${this.baseUrl}/pay/mock/${providerPaymentId}`,
      qrText: `MOCK_QR|amount=${input.amount}|ref=${reference}`,
      expiresAt: input.expiresAt,
      status: 'pending'
    };
  }

  async verifyWebhook({ rawBody, body, signature }) {
    if (!signature || !safeEqualHex(signature, hmac(rawBody))) {
      throw Object.assign(new Error('Invalid payment signature'), { statusCode: 401 });
    }

    return {
      id: body.eventId || makeId('evt'),
      provider: this.name,
      providerPaymentId: body.providerPaymentId,
      reference: body.reference || '',
      amount: Number(body.amount || 0),
      currency: body.currency || 'VND',
      status: body.status || 'paid',
      raw: body,
      receivedAt: nowIso()
    };
  }

  async getPaymentStatus() {
    return { status: 'pending' };
  }

  signWebhookPayload(payload) {
    return hmac(JSON.stringify(payload));
  }
}

export class SePayPaymentProvider {
  constructor(baseUrl = config.baseUrl) {
    this.name = 'sepay';
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async createPayment(input) {
    const amount = Number(input.amount);
    const currency = String(input.currency || '').trim().toUpperCase();
    if (currency !== 'VND') {
      throw Object.assign(new Error('SePay payments require VND currency'), { statusCode: 400 });
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw Object.assign(new Error('SePay payment amount must be a positive integer'), { statusCode: 400 });
    }

    const reference = compactCode(config.sepay.paymentPrefix);
    const providerPaymentId = reference;
    const qrImageUrl = sepayQrUrl({ amount, reference });

    return {
      provider: this.name,
      providerPaymentId,
      reference,
      amount,
      currency: 'VND',
      paymentUrl: `${this.baseUrl}/pay/sepay/${providerPaymentId}`,
      qrImageUrl,
      qrText: qrImageUrl,
      memo: sepayMemo(reference),
      accountNumber: config.sepay.accountNumber,
      bankCode: config.sepay.bankCode,
      expiresAt: input.expiresAt,
      status: 'pending'
    };
  }

  async verifyWebhook({ rawBody, body, headers = {} }) {
    this.verifyWebhookAuth(rawBody, headers);

    const transactionId = String(body.id ?? '').trim();
    if (!transactionId) {
      throw Object.assign(new Error('SePay transaction id is required'), { statusCode: 400 });
    }

    if (transactionId === '0') {
      const fingerprint = createHash('sha256').update(rawBody).digest('hex').slice(0, 24);
      return {
        id: `sepay_test_${fingerprint}`,
        test: true,
        provider: this.name,
        providerPaymentId: '',
        reference: '',
        bankReference: 'test',
        amount: Number(body.transferAmount || 0),
        currency: 'VND',
        status: 'ignored',
        raw: body,
        receivedAt: nowIso()
      };
    }

    const accountNumber = String(body.accountNumber || '').trim();
    if (
      config.sepay.webhookAccountNumbers.length
      && !config.sepay.webhookAccountNumbers.includes(accountNumber)
    ) {
      throw Object.assign(new Error('Unexpected SePay destination account'), { statusCode: 401 });
    }

    const gateway = String(body.gateway || '').trim();
    if (
      config.sepay.webhookGateways.length
      && !config.sepay.webhookGateways.some((value) => value.toLowerCase() === gateway.toLowerCase())
    ) {
      throw Object.assign(new Error('Unexpected SePay gateway'), { statusCode: 401 });
    }

    const code = String(body.code || '').trim();
    const bankReference = String(body.referenceCode || transactionId).trim();
    const transferType = String(body.transferType || '').toLowerCase();
    const isIncoming = transferType === 'in';
    const amount = Number(body.transferAmount || 0);
    if (isIncoming && (!Number.isSafeInteger(amount) || amount <= 0)) {
      throw Object.assign(new Error('Invalid SePay transfer amount'), { statusCode: 400 });
    }

    return {
      id: `sepay_${transactionId}`,
      provider: this.name,
      providerPaymentId: code,
      reference: code,
      bankReference,
      amount,
      currency: 'VND',
      status: isIncoming ? 'paid' : 'ignored',
      raw: body,
      receivedAt: nowIso()
    };
  }

  verifyWebhookAuth(rawBody, headers) {
    const authMode = config.sepay.webhookAuth;
    if (authMode === 'none') {
      if (process.env.NODE_ENV === 'production') {
        throw Object.assign(new Error('SEPAY_WEBHOOK_AUTH=none is not allowed in production'), { statusCode: 500 });
      }
      return;
    }

    if (authMode === 'api_key' || authMode === 'apikey') {
      if (!strongWebhookCredential(config.sepay.webhookApiKey)) {
        throw Object.assign(new Error('SEPAY_WEBHOOK_API_KEY is missing or too weak'), { statusCode: 500 });
      }
      const expected = `Apikey ${config.sepay.webhookApiKey}`;
      if (!safeEqualText(headers.authorization, expected)) {
        throw Object.assign(new Error('Invalid SePay API key'), { statusCode: 401 });
      }
      return;
    }

    if (authMode !== 'hmac') {
      throw Object.assign(new Error(`Unsupported SEPAY_WEBHOOK_AUTH: ${authMode}`), { statusCode: 500 });
    }

    if (!strongWebhookCredential(config.sepay.webhookSecret)) {
      throw Object.assign(new Error('SEPAY_WEBHOOK_SECRET is missing or too weak'), { statusCode: 500 });
    }

    const signature = String(headers['x-sepay-signature'] || '');
    const timestamp = String(headers['x-sepay-timestamp'] || '');
    const timestampSeconds = Number(timestamp);

    if (!signature || !timestamp || !Number.isFinite(timestampSeconds)) {
      throw Object.assign(new Error('Missing SePay signature headers'), { statusCode: 401 });
    }

    const drift = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
    if (drift > 300) {
      throw Object.assign(new Error('Expired SePay webhook timestamp'), { statusCode: 401 });
    }

    const expected = `sha256=${createHmac('sha256', config.sepay.webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')}`;

    if (!safeEqualText(signature, expected)) {
      throw Object.assign(new Error('Invalid SePay webhook signature'), { statusCode: 401 });
    }
  }

  async getPaymentStatus() {
    return { status: 'pending' };
  }
}

export const paymentProviders = {
  mock: new MockPaymentProvider(),
  sepay: new SePayPaymentProvider()
};

if (!paymentProviders[config.payment.provider] && process.env.NODE_ENV === 'production') {
  throw new Error(`Unsupported PAYMENT_PROVIDER: ${config.payment.provider}`);
}

export const paymentProvider = paymentProviders[config.payment.provider] || paymentProviders.mock;
