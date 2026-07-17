import { createHash } from 'node:crypto';

export const MEMBER_FULFILLMENT_PROVIDERS = Object.freeze({
  CHATGPT: 'chatgpt',
  CANVA: 'canva'
});

export const MEMBER_OPERATION_ACTIVE_STATUSES = Object.freeze([
  'queued',
  'retrying',
  'running'
]);

export const MEMBER_OPERATION_TERMINAL_STATUSES = Object.freeze([
  'succeeded',
  'partially_succeeded',
  'failed'
]);

const knownStatuses = new Set([
  ...MEMBER_OPERATION_ACTIVE_STATUSES,
  ...MEMBER_OPERATION_TERMINAL_STATUSES
]);
const terminalStatuses = new Set(MEMBER_OPERATION_TERMINAL_STATUSES);
const supportedProviders = new Set(Object.values(MEMBER_FULFILLMENT_PROVIDERS));
const retryableHttpStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
const maxIdempotencyGeneration = 9999;
const operationIdPattern = /^op_[A-Za-z0-9_-]{8,128}$/;

const defaults = Object.freeze({
  requestTimeoutMs: 10_000,
  pollIntervalMs: 1_000,
  operationTimeoutMs: 180_000,
  maxPollAttempts: 300,
  maxSubmitAttempts: 3,
  retryDelayMs: 500,
  maxResponseBytes: 512 * 1024,
  maxEmails: 200
});

export class MemberFulfillmentClientError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MemberFulfillmentClientError';
    this.code = String(options.code || 'MEMBER_SERVICE_ERROR');
    this.statusCode = Number.isInteger(options.statusCode) ? options.statusCode : undefined;
    this.retryable = Boolean(options.retryable);
    this.provider = options.provider || undefined;
    this.operationId = options.operationId || undefined;
    this.submissionMayHaveBeenAccepted = Boolean(options.submissionMayHaveBeenAccepted);
    this.upstreamCode = safeCode(options.upstreamCode);
    this.retryAfterMs = Number.isFinite(Number(options.retryAfterMs))
      ? Math.max(0, Number(options.retryAfterMs))
      : undefined;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
      provider: this.provider,
      operationId: this.operationId,
      submissionMayHaveBeenAccepted: this.submissionMayHaveBeenAccepted,
      upstreamCode: this.upstreamCode,
      retryAfterMs: this.retryAfterMs
    };
  }
}

function safeCode(value) {
  const code = String(value || '').trim();
  return /^[A-Za-z0-9_.:-]{1,100}$/.test(code) ? code : undefined;
}

function boundedInteger(value, fallback, { min, max, name }) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function normalizeProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (!supportedProviders.has(provider)) {
    throw new TypeError('Member fulfillment provider must be chatgpt or canva');
  }
  return provider;
}

export function normalizeMemberServiceBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new TypeError('Member service base URL is invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new TypeError('Member service base URL must use HTTP(S) without embedded credentials');
  }
  const hostname = parsed.hostname.toLowerCase();
  const privateRailwayHttp = parsed.protocol === 'http:' && hostname.endsWith('.railway.internal');
  const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
  if (parsed.protocol !== 'https:' && !privateRailwayHttp && !localHttp) {
    throw new TypeError('Member service base URL must use HTTPS, Railway private HTTP, or loopback HTTP');
  }
  parsed.search = '';
  parsed.hash = '';
  const pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = pathname && pathname !== '/' ? pathname : '/api/v1';
  return parsed.toString().replace(/\/$/, '');
}

function orderIdFrom(value) {
  const raw = typeof value === 'object' && value !== null ? value.id : value;
  const orderId = String(raw || '').trim();
  if (!orderId || orderId.length > 500) {
    throw new TypeError('A valid order id is required for member fulfillment');
  }
  return orderId;
}

export function createMemberFulfillmentIdempotencyKey(order, provider, generation = 0) {
  const normalizedProvider = normalizeProvider(provider);
  const orderId = orderIdFrom(order);
  const normalizedGeneration = boundedInteger(generation, 0, {
    min: 0,
    max: maxIdempotencyGeneration,
    name: 'generation'
  });
  const digest = createHash('sha256')
    .update(`${normalizedProvider}\0${orderId}`, 'utf8')
    .digest('hex')
    .slice(0, 40);
  return `seat-${normalizedProvider}-${digest}-g${normalizedGeneration}`;
}

function normalizeEmails(input, maxEmails) {
  const raw = Array.isArray(input)
    ? input.flatMap((value) => String(value ?? '').split(/[;,\r\n]+/))
    : String(input ?? '').split(/[;,\r\n]+/);
  const emails = [];
  const seen = new Set();
  for (const value of raw) {
    const email = String(value || '').trim().toLowerCase();
    if (!email) continue;
    if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new TypeError('Member fulfillment contains an invalid email address');
    }
    if (!seen.has(email)) {
      seen.add(email);
      emails.push(email);
    }
    if (emails.length > maxEmails) {
      throw new TypeError(`Member fulfillment accepts at most ${maxEmails} emails`);
    }
  }
  if (!emails.length) throw new TypeError('Member fulfillment requires at least one email');
  return emails;
}

function normalizeAccountRefs(value) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new TypeError('accountRefs must be an array when provided');
  const refs = [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))];
  if (!refs.length) throw new TypeError('accountRefs cannot be empty when provided');
  if (refs.some((entry) => entry.length > 320)) throw new TypeError('Member service account reference is invalid');
  return refs;
}

export function buildMemberFulfillmentRequest(provider, options = {}) {
  const normalizedProvider = normalizeProvider(provider);
  const maxEmails = boundedInteger(options.maxEmails, defaults.maxEmails, {
    min: 1,
    max: 1000,
    name: 'maxEmails'
  });
  const emails = normalizeEmails(options.emails, maxEmails);
  const mode = String(options.mode || 'targeted').trim().toLowerCase();

  if (mode === 'allocation') {
    const accountRefs = normalizeAccountRefs(options.accountRefs);
    const body = { emails };
    if (accountRefs) {
      if (normalizedProvider === MEMBER_FULFILLMENT_PROVIDERS.CHATGPT) {
        body.adminAccountIds = accountRefs;
      } else {
        body.accountRefs = accountRefs;
      }
    }
    return { method: 'POST', path: '/member-allocations', body, emails };
  }

  if (mode !== 'targeted') throw new TypeError('Member fulfillment mode must be targeted or allocation');
  const accountRef = String(options.accountRef || '').trim();
  if (!accountRef || accountRef.length > 320) {
    throw new TypeError('A valid accountRef is required for targeted member fulfillment');
  }
  const prefix = normalizedProvider === MEMBER_FULFILLMENT_PROVIDERS.CHATGPT
    ? '/admin-accounts/'
    : '/canva-accounts/';
  return {
    method: 'POST',
    path: `${prefix}${encodeURIComponent(accountRef)}/invitations`,
    body: { emails },
    emails
  };
}

export function isTerminalMemberOperationStatus(status) {
  return terminalStatuses.has(String(status || '').trim().toLowerCase());
}

export function parseMemberOperationEnvelope(provider, payload) {
  const normalizedProvider = normalizeProvider(provider);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw malformedResponse(normalizedProvider);
  }

  const operation = normalizedProvider === MEMBER_FULFILLMENT_PROVIDERS.CHATGPT
    ? payload.data
    : payload.operation;
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    throw malformedResponse(normalizedProvider);
  }

  const operationId = String(operation.operationId || '').trim();
  const status = String(operation.status || '').trim().toLowerCase();
  if (!operationIdPattern.test(operationId) || !knownStatuses.has(status)) {
    throw malformedResponse(normalizedProvider);
  }

  const replayed = normalizedProvider === MEMBER_FULFILLMENT_PROVIDERS.CHATGPT
    ? Boolean(payload.meta?.replayed)
    : Boolean(payload.replayed);
  const normalized = {
    provider: normalizedProvider,
    operationId,
    type: safeCode(operation.type),
    status,
    terminal: isTerminalMemberOperationStatus(status),
    succeeded: status === 'succeeded',
    partiallySucceeded: status === 'partially_succeeded',
    failed: status === 'failed',
    replayed,
    progress: operation.progress && typeof operation.progress === 'object'
      ? operation.progress
      : undefined,
    attempts: Number.isFinite(Number(operation.attempts)) ? Number(operation.attempts) : undefined,
    submittedAt: operation.submittedAt || undefined,
    startedAt: operation.startedAt || undefined,
    completedAt: operation.completedAt || undefined
  };
  if (operation.result !== undefined) normalized.result = operation.result;
  if (operation.error && typeof operation.error === 'object') {
    normalized.error = {
      code: safeCode(operation.error.code),
      retryable: Boolean(operation.error.retryable)
    };
  }
  return normalized;
}

function malformedResponse(provider) {
  return new MemberFulfillmentClientError('Member service returned a malformed operation response', {
    code: 'MEMBER_SERVICE_MALFORMED_RESPONSE',
    retryable: false,
    provider
  });
}

function operationIdFromEnvelope(provider, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const operation = provider === MEMBER_FULFILLMENT_PROVIDERS.CHATGPT
    ? payload.data
    : payload.operation;
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return undefined;
  const operationId = String(operation.operationId || '').trim();
  return operationIdPattern.test(operationId) ? operationId : undefined;
}

function retryAfterMs(headers) {
  const value = String(headers?.get?.('retry-after') || '').trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

async function readJsonResponse(response, maxResponseBytes, provider) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new MemberFulfillmentClientError('Member service response exceeded the configured limit', {
      code: 'MEMBER_SERVICE_RESPONSE_TOO_LARGE',
      retryable: false,
      provider
    });
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) {
    throw new MemberFulfillmentClientError('Member service response exceeded the configured limit', {
      code: 'MEMBER_SERVICE_RESPONSE_TOO_LARGE',
      retryable: false,
      provider
    });
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new MemberFulfillmentClientError('Member service returned invalid JSON', {
      code: 'MEMBER_SERVICE_INVALID_JSON',
      retryable: response.status >= 500,
      provider,
      statusCode: response.status
    });
  }
}

function safeHttpError(response, payload, provider) {
  const upstreamCode = safeCode(payload?.code || payload?.error?.code);
  const retryable = Boolean(payload?.retryable) || retryableHttpStatuses.has(response.status);
  return new MemberFulfillmentClientError('Member service request was rejected', {
    code: 'MEMBER_SERVICE_HTTP_ERROR',
    statusCode: response.status,
    retryable,
    provider,
    operationId: operationIdFromEnvelope(provider, payload),
    upstreamCode,
    retryAfterMs: retryAfterMs(response.headers)
  });
}

function makeTimedSignal(parentSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const onAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  else parentSignal?.addEventListener?.('abort', onAbort, { once: true });
  timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timer);
      parentSignal?.removeEventListener?.('abort', onAbort);
    }
  };
}

function abortedError(provider, timedOut, operationId) {
  return new MemberFulfillmentClientError(
    timedOut ? 'Member service request timed out' : 'Member fulfillment was aborted',
    {
      code: timedOut ? 'MEMBER_SERVICE_REQUEST_TIMEOUT' : 'MEMBER_FULFILLMENT_ABORTED',
      retryable: timedOut,
      provider,
      operationId
    }
  );
}

function abortableSleep(ms, signal, provider, sleepImpl) {
  if (ms <= 0) {
    if (signal?.aborted) return Promise.reject(abortedError(provider, false));
    return Promise.resolve();
  }
  if (sleepImpl) return sleepImpl(ms, signal);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortedError(provider, false));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortedError(provider, false));
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

export function createMemberFulfillmentClient(options = {}) {
  const provider = normalizeProvider(options.provider);
  const baseUrl = normalizeMemberServiceBaseUrl(options.baseUrl);
  const apiKey = String(options.apiKey || '').trim();
  if (!apiKey || apiKey.length > 500) throw new TypeError('Member service API key is required');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');

  const requestTimeoutMs = boundedInteger(options.requestTimeoutMs, defaults.requestTimeoutMs, {
    min: 1,
    max: 120_000,
    name: 'requestTimeoutMs'
  });
  const pollIntervalMs = boundedInteger(options.pollIntervalMs, defaults.pollIntervalMs, {
    min: 0,
    max: 60_000,
    name: 'pollIntervalMs'
  });
  const operationTimeoutMs = boundedInteger(options.operationTimeoutMs, defaults.operationTimeoutMs, {
    min: 1,
    max: 30 * 60_000,
    name: 'operationTimeoutMs'
  });
  const maxPollAttempts = boundedInteger(options.maxPollAttempts, defaults.maxPollAttempts, {
    min: 1,
    max: 10_000,
    name: 'maxPollAttempts'
  });
  const maxSubmitAttempts = boundedInteger(options.maxSubmitAttempts, defaults.maxSubmitAttempts, {
    min: 1,
    max: 10,
    name: 'maxSubmitAttempts'
  });
  const retryDelayMs = boundedInteger(options.retryDelayMs, defaults.retryDelayMs, {
    min: 0,
    max: 60_000,
    name: 'retryDelayMs'
  });
  const maxResponseBytes = boundedInteger(options.maxResponseBytes, defaults.maxResponseBytes, {
    min: 1024,
    max: 10 * 1024 * 1024,
    name: 'maxResponseBytes'
  });
  const maxEmails = boundedInteger(options.maxEmails, defaults.maxEmails, {
    min: 1,
    max: 1000,
    name: 'maxEmails'
  });
  const sleepImpl = options.sleepImpl;
  const now = typeof options.now === 'function' ? options.now : Date.now;

  async function request(method, path, { body, idempotencyKey, signal, operationId } = {}) {
    const timed = makeTimedSignal(signal, requestTimeoutMs);
    const submissionRequest = String(method || '').toUpperCase() === 'POST';
    let response;
    try {
      const headers = {
        Accept: 'application/json',
        'X-API-Key': apiKey
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timed.signal,
        redirect: 'error'
      });
      const payload = await readJsonResponse(response, maxResponseBytes, provider);
      if (!response.ok) throw safeHttpError(response, payload, provider);
      return { response, payload };
    } catch (error) {
      const submissionMayHaveBeenAccepted = Boolean(
        submissionRequest
        && (!response || response.ok || response.status === 408 || response.status >= 500)
      );
      if (error instanceof MemberFulfillmentClientError) {
        if (submissionMayHaveBeenAccepted) error.submissionMayHaveBeenAccepted = true;
        throw error;
      }
      if (timed.signal.aborted || error?.name === 'AbortError') {
        const aborted = abortedError(provider, timed.timedOut(), operationId);
        aborted.submissionMayHaveBeenAccepted = submissionMayHaveBeenAccepted;
        throw aborted;
      }
      throw new MemberFulfillmentClientError('Member service network request failed', {
        code: 'MEMBER_SERVICE_NETWORK_ERROR',
        retryable: true,
        provider,
        operationId,
        submissionMayHaveBeenAccepted
      });
    } finally {
      timed.cleanup();
    }
  }

  async function submitOperation(input = {}) {
    const requestData = buildMemberFulfillmentRequest(provider, {
      ...input,
      maxEmails
    });
    const idempotencyKey = createMemberFulfillmentIdempotencyKey(
      input.order ?? input.orderId,
      provider,
      input.generation ?? 0
    );
    const { response, payload } = await request(requestData.method, requestData.path, {
      body: requestData.body,
      idempotencyKey,
      signal: input.signal
    });
    const operationId = operationIdFromEnvelope(provider, payload);
    if (![200, 202].includes(response.status)) {
      throw new MemberFulfillmentClientError('Member service did not accept the operation', {
        code: 'MEMBER_SERVICE_OPERATION_NOT_ACCEPTED',
        statusCode: response.status,
        retryable: response.status >= 500,
        provider,
        operationId,
        submissionMayHaveBeenAccepted: response.status >= 200 && response.status < 300
      });
    }
    try {
      return {
        ...parseMemberOperationEnvelope(provider, payload),
        idempotencyKey
      };
    } catch (error) {
      if (error instanceof MemberFulfillmentClientError) {
        error.submissionMayHaveBeenAccepted = true;
        error.operationId ||= operationId;
      }
      throw error;
    }
  }

  async function getOperation(operationId, { signal } = {}) {
    const normalizedId = String(operationId || '').trim();
    if (!operationIdPattern.test(normalizedId)) throw new TypeError('A valid operationId is required');
    const { payload } = await request('GET', `/operations/${encodeURIComponent(normalizedId)}`, {
      signal,
      operationId: normalizedId
    });
    return parseMemberOperationEnvelope(provider, payload);
  }

  async function pollOperation(operationId, input = {}) {
    const timeoutMs = boundedInteger(input.operationTimeoutMs, operationTimeoutMs, {
      min: 1,
      max: 30 * 60_000,
      name: 'operationTimeoutMs'
    });
    const attemptLimit = boundedInteger(input.maxPollAttempts, maxPollAttempts, {
      min: 1,
      max: 10_000,
      name: 'maxPollAttempts'
    });
    const intervalMs = boundedInteger(input.pollIntervalMs, pollIntervalMs, {
      min: 0,
      max: 60_000,
      name: 'pollIntervalMs'
    });
    const startedAt = now();
    let lastOperation;
    let attempts = 0;
    while (attempts < attemptLimit && now() - startedAt < timeoutMs) {
      if (input.signal?.aborted) throw abortedError(provider, false, operationId);
      attempts += 1;
      try {
        lastOperation = await getOperation(operationId, { signal: input.signal });
        if (lastOperation.terminal) return { ...lastOperation, pollAttempts: attempts };
      } catch (error) {
        if (!(error instanceof MemberFulfillmentClientError) || !error.retryable) throw error;
      }
      const remainingMs = timeoutMs - (now() - startedAt);
      if (attempts >= attemptLimit || remainingMs <= 0) break;
      await abortableSleep(Math.min(intervalMs, remainingMs), input.signal, provider, sleepImpl);
    }
    throw new MemberFulfillmentClientError('Member operation did not finish within the configured polling bounds', {
      code: 'MEMBER_OPERATION_POLL_TIMEOUT',
      retryable: true,
      provider,
      operationId: String(operationId || '').trim()
    });
  }

  async function submitAndPoll(input = {}) {
    const timeoutMs = boundedInteger(input.operationTimeoutMs, operationTimeoutMs, {
      min: 1,
      max: 30 * 60_000,
      name: 'operationTimeoutMs'
    });
    const startedAt = now();
    let submitted;
    let lastError;
    for (let attempt = 1; attempt <= maxSubmitAttempts; attempt += 1) {
      try {
        submitted = await submitOperation(input);
        break;
      } catch (error) {
        lastError = error;
        if (!(error instanceof MemberFulfillmentClientError) || !error.retryable || attempt >= maxSubmitAttempts) {
          throw error;
        }
        const remainingMs = timeoutMs - (now() - startedAt);
        if (remainingMs <= 0) throw error;
        const requestedDelay = Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : retryDelayMs * attempt;
        await abortableSleep(Math.min(requestedDelay, remainingMs), input.signal, provider, sleepImpl);
      }
    }
    if (!submitted) throw lastError;
    if (submitted.terminal) return { ...submitted, pollAttempts: 0 };
    const remainingMs = timeoutMs - (now() - startedAt);
    if (remainingMs <= 0) {
      throw new MemberFulfillmentClientError('Member operation did not finish within the configured polling bounds', {
        code: 'MEMBER_OPERATION_POLL_TIMEOUT',
        retryable: true,
        provider,
        operationId: submitted.operationId
      });
    }
    const completed = await pollOperation(submitted.operationId, {
      ...input,
      operationTimeoutMs: remainingMs
    });
    return {
      ...completed,
      idempotencyKey: submitted.idempotencyKey,
      replayed: submitted.replayed || completed.replayed
    };
  }

  return Object.freeze({
    provider,
    baseUrl,
    submitOperation,
    getOperation,
    pollOperation,
    submitAndPoll
  });
}

export async function submitAndPollMemberFulfillment(options = {}, input = {}) {
  return createMemberFulfillmentClient(options).submitAndPoll(input);
}
