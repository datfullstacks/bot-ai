import { createHash } from 'node:crypto';
import { config, nowIso } from './config.js';
import {
  MemberFulfillmentClientError,
  createMemberFulfillmentClient,
  createMemberFulfillmentIdempotencyKey,
  normalizeMemberServiceBaseUrl
} from './memberFulfillmentClient.js';
import {
  completeSeatFulfillment,
  getDeliveryForOrder,
  listOrders,
  updateSeatFulfillmentAutomation
} from './shop.js';

const activeOrders = new Set();
const terminalAutomationStatuses = new Set(['failed', 'verification_required']);
let sweepPromise = null;

function normalizedSku(order = {}) {
  return String(order.productSku || order.sku || '').trim().toLowerCase();
}

function isSeatOrder(order = {}) {
  return [order.fulfillment?.mode, order.productSnapshot?.fulfillmentMode]
    .some((value) => String(value || '').trim().toLowerCase() === 'seat_email');
}

export function memberIntegrationForOrder(order, settings = config.memberFulfillment) {
  if (!isSeatOrder(order)) return null;
  const pinnedProvider = String(order.fulfillment?.automation?.provider || '').trim().toLowerCase();
  if (['chatgpt', 'canva'].includes(pinnedProvider)) {
    return { provider: pinnedProvider, integration: settings?.integrations?.[pinnedProvider] || {} };
  }
  const sku = normalizedSku(order);
  for (const provider of ['chatgpt', 'canva']) {
    const integration = settings?.integrations?.[provider];
    if (integration?.skus?.includes(sku)) return { provider, integration };
  }
  return null;
}

export function memberIntegrationTargetFingerprint(provider, integration = {}) {
  const serviceUrl = normalizeMemberServiceBaseUrl(integration.serviceUrl);
  return createHash('sha256')
    .update([
      String(provider || '').trim().toLowerCase(),
      serviceUrl,
      String(integration.accountRef || '').trim(),
      String(integration.apiKey || '').trim()
    ].join('\0'), 'utf8')
    .digest('hex');
}

function recipientEmails(order = {}) {
  const recipients = Array.isArray(order.fulfillment?.recipients)
    ? order.fulfillment.recipients
    : [];
  return recipients
    .map((recipient) => String(recipient?.email || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

function integrationProblem(integration = {}) {
  if (!integration.enabled) return 'integration_disabled';
  if (!integration.serviceUrl) return 'service_url_missing';
  try {
    normalizeMemberServiceBaseUrl(integration.serviceUrl);
  } catch {
    return 'service_url_invalid';
  }
  if (!integration.apiKey) return 'api_key_missing';
  if (String(integration.apiKey).length > 500) return 'api_key_invalid';
  if (!integration.accountRef) return 'account_ref_missing';
  if (String(integration.accountRef).length > 320) return 'account_ref_invalid';
  return '';
}

function successfulEmails(provider, result = {}) {
  const successful = new Set();
  const addEmail = (value) => {
    const email = String(typeof value === 'string' ? value : value?.email || '').trim().toLowerCase();
    if (email) successful.add(email);
  };
  (Array.isArray(result.invited) ? result.invited : []).forEach(addEmail);
  if (provider === 'chatgpt') {
    (Array.isArray(result.duplicateDetails) ? result.duplicateDetails : [])
      .filter((item) => item?.reason === 'already_in_target')
      .forEach(addEmail);
  } else {
    (Array.isArray(result.duplicates) ? result.duplicates : []).forEach(addEmail);
  }
  return successful;
}

class MemberFulfillmentOutcomeError extends Error {
  constructor(message, { code, operation, retryable = false, upstreamCode } = {}) {
    super(message);
    this.name = 'MemberFulfillmentOutcomeError';
    this.code = code || 'MEMBER_FULFILLMENT_INCOMPLETE';
    this.operationId = operation?.operationId;
    this.retryable = retryable;
    this.upstreamCode = upstreamCode || operation?.error?.code;
  }
}

export function assertMemberFulfillmentSucceeded(provider, operation, emails) {
  if (!operation?.succeeded) {
    const code = operation?.partiallySucceeded
      ? 'MEMBER_OPERATION_PARTIALLY_SUCCEEDED'
      : 'MEMBER_OPERATION_FAILED';
    throw new MemberFulfillmentOutcomeError('Member operation did not fully succeed', {
      code,
      operation,
      upstreamCode: operation?.error?.code,
      retryable: false
    });
  }
  const successful = successfulEmails(provider, operation.result);
  const missing = emails.filter((email) => !successful.has(email));
  if (missing.length > 0) {
    throw new MemberFulfillmentOutcomeError('Member operation did not confirm every recipient in the target account', {
      code: 'MEMBER_FULFILLMENT_INCOMPLETE',
      operation,
      retryable: false
    });
  }
  return true;
}

function safeError(error) {
  return {
    code: String(error?.upstreamCode || error?.code || 'MEMBER_FULFILLMENT_FAILED').slice(0, 120),
    message: String(error?.message || 'Member fulfillment failed').slice(0, 500),
    retryable: Boolean(error?.retryable)
  };
}

function retryAt(error, retryCount, settings = config.memberFulfillment) {
  if (!error?.retryable) return null;
  const requested = Number(error.retryAfterMs || 0);
  const exponential = Number(settings.retryBaseMs || 30_000) * (2 ** Math.max(0, retryCount - 1));
  const delay = Math.min(15 * 60_000, Math.max(requested, exponential));
  return new Date(Date.now() + delay).toISOString();
}

function dueForAttempt(automation, force) {
  if (force) return true;
  if (terminalAutomationStatuses.has(automation?.status)) return false;
  if (!automation?.nextRetryAt) return true;
  return Date.parse(automation.nextRetryAt) <= Date.now();
}

function attemptNumber(automation, provider, force) {
  const current = Math.max(1, Number.parseInt(automation?.attempt, 10) || 1);
  if (automation?.provider !== provider) return 1;
  if (force && automation?.status === 'failed') return Math.min(100, current + 1);
  return current;
}

async function storeBlocked(order, provider, reason, dependencies) {
  const current = order.fulfillment?.automation;
  const hasUnresolvedSubmission = Boolean(
    current?.operationId
    || current?.status === 'verification_required'
    || (
      current?.idempotencyKey
      && ['processing', 'retrying', 'retry_requested'].includes(current?.status)
    )
  );
  const status = hasUnresolvedSubmission
    ? 'verification_required'
    : 'blocked';
  if (current?.status === status && current?.error?.code === reason) {
    return current;
  }
  return dependencies.updateAutomation('member-fulfillment', order.id, {
    provider,
    status,
    attempt: Math.max(1, Number(current?.attempt || 1)),
    retryCount: Math.max(0, Number(current?.retryCount || 0)),
    error: { code: reason, message: 'Member service integration is not fully configured', retryable: false },
    nextRetryAt: null
  });
}

async function storeVerificationRequired(order, provider, reason, message, dependencies) {
  const current = order.fulfillment?.automation || {};
  if (current.status === 'verification_required' && current.error?.code === reason) {
    return current;
  }
  return dependencies.updateAutomation('member-fulfillment', order.id, {
    provider,
    status: 'verification_required',
    attempt: Math.max(1, Number(current.attempt || 1)),
    retryCount: Math.max(0, Number(current.retryCount || 0)),
    error: { code: reason, message, retryable: false },
    nextRetryAt: null
  });
}

function defaultDependencies() {
  return {
    getOrder: getDeliveryForOrder,
    listOrders,
    updateAutomation: updateSeatFulfillmentAutomation,
    complete: completeSeatFulfillment,
    createClient: createMemberFulfillmentClient,
    settings: config.memberFulfillment
  };
}

export async function processSeatFulfillment(orderId, options = {}) {
  const dependencies = { ...defaultDependencies(), ...(options.dependencies || {}) };
  const key = String(orderId || '').trim();
  if (!key) throw new TypeError('orderId is required');
  if (activeOrders.has(key)) return { skipped: true, reason: 'already_processing' };
  activeOrders.add(key);
  let submittedOperationId = '';
  let submissionMayHaveBeenAccepted = false;
  let terminalOutcomeKnown = false;

  try {
    const delivery = await dependencies.getOrder(key);
    const order = delivery?.order;
    if (!order || order.status !== 'awaiting_fulfillment') {
      return { skipped: true, reason: 'not_awaiting_fulfillment', order };
    }
    const persistedAutomation = order.fulfillment?.automation || {};
    if (persistedAutomation.status === 'succeeded') {
      const persistedProvider = String(persistedAutomation.provider || 'reconcile').trim().toLowerCase();
      const completed = await dependencies.complete(`member-service:${persistedProvider}`, order.id, {
        note: `Automatic ${persistedProvider} member invitation was already verified (${persistedAutomation.operationId || 'operation persisted'})`
      });
      await options.onDelivered?.(completed.order);
      return { ok: true, provider: persistedProvider, reconciled: true, ...completed };
    }
    const match = memberIntegrationForOrder(order, dependencies.settings);
    if (!match) return { skipped: true, reason: 'manual_fulfillment', order };
    const { provider, integration } = match;
    const problem = integrationProblem(integration);
    if (problem) {
      await storeBlocked(order, provider, problem, dependencies);
      return { skipped: true, reason: problem, provider, order };
    }

    const automation = order.fulfillment?.automation || {};
    const targetFingerprint = memberIntegrationTargetFingerprint(provider, integration);
    const storedTargetFingerprint = String(automation.targetFingerprint || '').trim();
    const unpinnedExternalRisk = Boolean(
      !storedTargetFingerprint
      && (
        automation.operationId
        || automation.idempotencyKey
        || ['processing', 'retrying', 'verification_required'].includes(automation.status)
      )
    );
    if (unpinnedExternalRisk) {
      await storeVerificationRequired(
        order,
        provider,
        'integration_target_unpinned',
        'Existing member operation has no pinned target; verify it before continuing',
        dependencies
      );
      return { skipped: true, reason: 'integration_target_unpinned', provider, order };
    }
    if (storedTargetFingerprint && storedTargetFingerprint !== targetFingerprint) {
      await storeVerificationRequired(
        order,
        provider,
        'integration_target_changed',
        'Member service target changed while this order was active; restore or verify the original target',
        dependencies
      );
      return { skipped: true, reason: 'integration_target_changed', provider, order };
    }
    if (!dueForAttempt(automation, options.force === true)) {
      return { skipped: true, reason: 'not_due', provider, order };
    }
    const emails = recipientEmails(order);
    if (!emails.length) {
      await storeBlocked(order, provider, 'recipient_emails_missing', dependencies);
      return { skipped: true, reason: 'recipient_emails_missing', provider, order };
    }

    const attempt = attemptNumber(automation, provider, options.force === true);
    const sameAttempt = automation.provider === provider && Number(automation.attempt || 1) === attempt;
    const retryCount = sameAttempt ? Math.max(0, Number(automation.retryCount || 0)) : 0;
    const generation = attempt - 1;
    const idempotencyKey = createMemberFulfillmentIdempotencyKey(order, provider, generation);
    const startedAt = automation.provider === provider && automation.attempt === attempt
      ? automation.startedAt || nowIso()
      : nowIso();
    await dependencies.updateAutomation(`member-service:${provider}`, order.id, {
      provider,
      status: 'processing',
      attempt,
      retryCount,
      targetFingerprint,
      idempotencyKey,
      operationId: automation.provider === provider && automation.attempt === attempt
        ? automation.operationId || ''
        : '',
      startedAt,
      nextRetryAt: null,
      error: null
    });

    const client = dependencies.createClient({
      provider,
      baseUrl: integration.serviceUrl,
      apiKey: integration.apiKey,
      requestTimeoutMs: integration.requestTimeoutMs,
      operationTimeoutMs: integration.operationTimeoutMs,
      pollIntervalMs: integration.pollIntervalMs
    });

    let operation = await client.submitOperation({
      orderId: order.id,
      generation,
      mode: 'targeted',
      accountRef: integration.accountRef,
      emails
    });
    submittedOperationId = operation.operationId;
    submissionMayHaveBeenAccepted = true;
    terminalOutcomeKnown = Boolean(operation.terminal);
    await dependencies.updateAutomation(`member-service:${provider}`, order.id, {
      provider,
      status: 'processing',
      attempt,
      retryCount,
      idempotencyKey,
      operationId: operation.operationId,
      error: null
    });
    if (!operation.terminal) {
      operation = await client.pollOperation(operation.operationId);
      submittedOperationId = operation.operationId || submittedOperationId;
      terminalOutcomeKnown = Boolean(operation.terminal);
    }
    assertMemberFulfillmentSucceeded(provider, operation, emails);
    await dependencies.updateAutomation(`member-service:${provider}`, order.id, {
      provider,
      status: 'succeeded',
      attempt,
      retryCount,
      idempotencyKey,
      operationId: operation.operationId,
      completedAt: nowIso(),
      nextRetryAt: null,
      error: null
    });
    const completed = await dependencies.complete(`member-service:${provider}`, order.id, {
      note: `Automatic ${provider} member invitation verified (${operation.operationId})`
    });
    await options.onDelivered?.(completed.order);
    return { ok: true, provider, operation, ...completed };
  } catch (error) {
    if (submittedOperationId && !error.operationId) error.operationId = submittedOperationId;
    if (submissionMayHaveBeenAccepted && !terminalOutcomeKnown) {
      error.submissionMayHaveBeenAccepted = true;
    }
    let resultError = safeError(error);
    let current;
    try {
      current = (await dependencies.getOrder(key))?.order;
    } catch {
      current = null;
    }
    if (current?.status === 'delivered') {
      return { ok: true, duplicate: true, order: current };
    }

    const match = memberIntegrationForOrder(current || {}, dependencies.settings);
    const provider = error?.provider || match?.provider || current?.fulfillment?.automation?.provider;
    if (current?.status === 'awaiting_fulfillment' && provider) {
      const automation = current.fulfillment?.automation || {};
      const attempt = Math.max(1, Number.parseInt(automation.attempt, 10) || 1);
      const retryCount = Math.max(0, Number.parseInt(automation.retryCount, 10) || 0) + 1;
      const configuredMaxRetries = Number(dependencies.settings.maxRetries);
      const maxRetries = Number.isInteger(configuredMaxRetries) ? configuredMaxRetries : 8;
      const retryable = Boolean(
        error instanceof MemberFulfillmentClientError
        && error.retryable
        && retryCount <= maxRetries
      );
      const verificationRequired = Boolean(
        !terminalOutcomeKnown
        && (error.operationId || submissionMayHaveBeenAccepted || error.submissionMayHaveBeenAccepted)
        && !retryable
      );
      const automationError = safeError(error);
      automationError.retryable = retryable;
      resultError = automationError;
      await dependencies.updateAutomation(`member-service:${provider}`, key, {
        provider,
        status: retryable ? 'retrying' : verificationRequired ? 'verification_required' : 'failed',
        attempt,
        retryCount,
        operationId: error.operationId || submittedOperationId || automation.operationId || '',
        error: automationError,
        nextRetryAt: retryable ? retryAt(error, retryCount, dependencies.settings) : null
      }).catch(() => {});
    }
    if (options.throwOnError) throw error;
    return { ok: false, provider, error: resultError };
  } finally {
    activeOrders.delete(key);
  }
}

export async function requestSeatFulfillmentRetry(orderId, options = {}) {
  const dependencies = { ...defaultDependencies(), ...(options.dependencies || {}) };
  const key = String(orderId || '').trim();
  if (!key) throw new TypeError('orderId is required');

  const delivery = await dependencies.getOrder(key);
  const order = delivery?.order;
  if (!order || order.status !== 'awaiting_fulfillment') {
    throw Object.assign(new Error('Only orders awaiting fulfillment can be retried'), { statusCode: 409 });
  }

  const match = memberIntegrationForOrder(order, dependencies.settings);
  if (!match) {
    throw Object.assign(new Error('This order is not routed to an automatic member integration'), { statusCode: 409 });
  }

  const { provider } = match;
  const automation = order.fulfillment?.automation || {};
  const status = String(automation.status || '').trim().toLowerCase();
  if (status === 'processing' || status === 'succeeded') {
    throw Object.assign(new Error(`Automatic fulfillment is already ${status}`), { statusCode: 409 });
  }

  const sameProvider = !automation.provider || automation.provider === provider;
  if (!sameProvider && automation.operationId) {
    throw Object.assign(
      new Error('Clean up or verify the existing external operation before changing member provider'),
      { statusCode: 409 }
    );
  }
  const newGeneration = sameProvider && status === 'failed';
  const attempt = newGeneration
    ? Math.min(100, Math.max(1, Number.parseInt(automation.attempt, 10) || 1) + 1)
    : sameProvider
      ? Math.max(1, Number.parseInt(automation.attempt, 10) || 1)
      : 1;
  const patch = {
    provider,
    status: 'retry_requested',
    attempt,
    retryCount: 0,
    nextRetryAt: null,
    error: null
  };
  if (newGeneration || !sameProvider) {
    patch.idempotencyKey = '';
    patch.startedAt = null;
    patch.completedAt = null;
  }
  if (newGeneration && !automation.operationId) patch.targetFingerprint = '';
  if (!sameProvider) patch.operationId = '';

  const updatedOrder = await dependencies.updateAutomation(
    String(options.actorId || 'admin').trim() || 'admin',
    key,
    patch
  );
  return { ok: true, queued: true, provider, order: updatedOrder };
}

async function runWithConcurrency(items, concurrency, worker) {
  const queue = [...items];
  const results = [];
  const count = Math.min(queue.length, Math.max(1, concurrency));
  await Promise.all(Array.from({ length: count }, async () => {
    while (queue.length) {
      const item = queue.shift();
      results.push(await worker(item));
    }
  }));
  return results;
}

async function listAllAwaitingOrders(dependencies) {
  const orders = [];
  const seen = new Set();
  const limit = 500;
  let offset = 0;

  while (true) {
    const page = await dependencies.listOrders({
      status: 'awaiting_fulfillment',
      limit,
      offset
    });
    const items = Array.isArray(page?.items) ? page.items : [];
    for (const order of items) {
      const id = String(order?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      orders.push(order);
    }
    if (!page?.hasMore || items.length === 0) break;
    offset += items.length;
  }

  return orders.reverse();
}

async function runSeatFulfillmentSweep(options = {}) {
  const dependencies = { ...defaultDependencies(), ...(options.dependencies || {}) };
  const orders = await listAllAwaitingOrders(dependencies);
  const eligible = orders.filter((order) => memberIntegrationForOrder(order, dependencies.settings));
  return runWithConcurrency(
    eligible,
    Math.max(1, Number(dependencies.settings?.concurrency || 2)),
    (order) => processSeatFulfillment(order.id, {
      dependencies,
      onDelivered: options.onDelivered
    })
  );
}

export function sweepSeatFulfillments(options = {}) {
  if (sweepPromise) return sweepPromise;
  const tracked = runSeatFulfillmentSweep(options).finally(() => {
    if (sweepPromise === tracked) sweepPromise = null;
  });
  sweepPromise = tracked;
  return tracked;
}

export function startSeatFulfillmentAutomation(options = {}) {
  const intervalMs = Math.max(10_000, Number(config.memberFulfillment.sweepIntervalMs || 30_000));
  const run = () => sweepSeatFulfillments(options).catch((error) => {
    console.error('[member-fulfillment] sweep failed:', String(error?.message || error).slice(0, 300));
  });
  setImmediate(run);
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}
