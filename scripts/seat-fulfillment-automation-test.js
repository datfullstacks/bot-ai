import assert from 'node:assert/strict';
import { MemberFulfillmentClientError } from '../src/memberFulfillmentClient.js';
import { assertMemberSkuRouting, boundedInteger } from '../src/config.js';
import {
  assertMemberFulfillmentSucceeded,
  memberIntegrationForOrder,
  memberIntegrationTargetFingerprint,
  processSeatFulfillment,
  requestSeatFulfillmentRetry,
  sweepSeatFulfillments
} from '../src/seatFulfillmentAutomation.js';

assert.equal(boundedInteger('', 7, { name: 'TEST', min: 1, max: 10 }), 7);
assert.equal(boundedInteger('10', 7, { name: 'TEST', min: 1, max: 10 }), 10);
assert.throws(
  () => boundedInteger('not-a-number', 7, { name: 'MEMBER_FULFILLMENT_CONCURRENCY', min: 1, max: 10 }),
  /MEMBER_FULFILLMENT_CONCURRENCY must be an integer/
);
assert.throws(
  () => assertMemberSkuRouting({
    chatgpt: { skus: ['shared-seat'] },
    canva: { skus: ['shared-seat'] }
  }),
  /routed to both chatgpt and canva/
);
assert.throws(
  () => assertMemberSkuRouting({ chatgpt: { skus: ['duplicate', 'duplicate'] } }),
  /duplicate SKU/
);

function settings(overrides = {}) {
  return {
    concurrency: 2,
    retryBaseMs: 1000,
    maxRetries: 8,
    integrations: {
      chatgpt: {
        enabled: true,
        serviceUrl: 'http://gpt-member-service.railway.internal:3002/api/v1',
        apiKey: 'gsk_chatgpt_test',
        accountRef: 'admin@example.com',
        skus: ['chatgpt-business-seat-1m'],
        requestTimeoutMs: 1000,
        operationTimeoutMs: 1000,
        pollIntervalMs: 0
      },
      canva: {
        enabled: true,
        serviceUrl: 'http://canva-member-api.railway.internal:3012/api/v1',
        apiKey: 'gsk_canva_test',
        accountRef: 'canva-admin@example.com',
        skus: ['canva-pro-1m', 'canva-pro-6m'],
        requestTimeoutMs: 1000,
        operationTimeoutMs: 1000,
        pollIntervalMs: 0
      }
    },
    ...overrides
  };
}

function targetFingerprint(provider, memberSettings) {
  return memberIntegrationTargetFingerprint(provider, memberSettings.integrations[provider]);
}

function seatOrder({ id = 'ord_test', sku = 'chatgpt-business-seat-1m', emails = ['buyer@example.com'] } = {}) {
  return {
    id,
    status: 'awaiting_fulfillment',
    productSku: sku,
    productSnapshot: { fulfillmentMode: 'seat_email' },
    fulfillment: {
      mode: 'seat_email',
      recipients: emails.map((email) => ({ email, status: 'pending' }))
    }
  };
}

function harness(order, memberSettings, clientFactory) {
  const automationUpdates = [];
  const completions = [];
  return {
    automationUpdates,
    completions,
    dependencies: {
      settings: memberSettings,
      async getOrder(id) {
        assert.equal(id, order.id);
        return { order };
      },
      async listOrders() {
        return { items: [order] };
      },
      async updateAutomation(actorId, id, patch) {
        assert.equal(id, order.id);
        automationUpdates.push({ actorId, patch: structuredClone(patch) });
        order.fulfillment.automation = {
          ...(order.fulfillment.automation || {}),
          ...structuredClone(patch)
        };
        return order;
      },
      async complete(actorId, id, input) {
        assert.equal(id, order.id);
        completions.push({ actorId, input });
        order.status = 'delivered';
        order.fulfillment.recipients = order.fulfillment.recipients.map((recipient) => ({
          ...recipient,
          status: 'invited'
        }));
        return { order, fulfilled: order.fulfillment.recipients.length };
      },
      createClient: clientFactory
    }
  };
}

const chatgptOrder = seatOrder();
assert.equal(memberIntegrationForOrder(chatgptOrder, settings()).provider, 'chatgpt');
assert.equal(memberIntegrationForOrder(seatOrder({ sku: 'canva-pro-6m' }), settings()).provider, 'canva');
assert.equal(memberIntegrationForOrder(seatOrder({ sku: 'claude-business-seat-1x-1m' }), settings()), null);
assert.equal(memberIntegrationForOrder({ ...chatgptOrder, productSnapshot: { fulfillmentMode: 'inventory' }, fulfillment: {} }, settings()), null);
{
  const lockedOrder = seatOrder({ id: 'ord_seat_access_busy' });
  const test = harness(lockedOrder, settings(), () => {
    throw new Error('The member client must not be created while the Seat access lock is busy.');
  });
  test.dependencies.withSeatAccessLocks = async () => ({ acquired: false, value: undefined });
  const result = await processSeatFulfillment(lockedOrder.id, { dependencies: test.dependencies });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'seat_access_busy');
  assert.equal(test.automationUpdates.length, 0);
  assert.equal(test.completions.length, 0);
}
{
  const fencedOrder = seatOrder({ id: 'ord_cleanup_still_pending' });
  const test = harness(fencedOrder, settings(), () => {
    throw new Error('Fulfillment must not create a member client while an older cleanup is unresolved.');
  });
  test.dependencies.withSeatAccessLocks = async (scope, callback) => ({
    acquired: true,
    value: await callback({ storage: 'local', client: null })
  });
  test.dependencies.reconcileSeatAccessFences = async () => ({
    ok: false,
    reason: 'seat_cleanup_pending',
    email: 'buyer@example.com',
    operationId: 'op_old_cleanup_0001'
  });
  const result = await processSeatFulfillment(fencedOrder.id, { dependencies: test.dependencies });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'seat_cleanup_pending');
  assert.equal(result.operationId, 'op_old_cleanup_0001');
  assert.equal(test.automationUpdates.length, 0);
  assert.equal(test.completions.length, 0);
}
{
  const pinnedOrder = seatOrder({ id: 'ord_provider_pinned' });
  pinnedOrder.fulfillment.automation = { provider: 'chatgpt', status: 'blocked' };
  const remappedSettings = settings();
  remappedSettings.integrations.chatgpt.skus = [];
  remappedSettings.integrations.canva.skus.push(pinnedOrder.productSku);
  assert.equal(
    memberIntegrationForOrder(pinnedOrder, remappedSettings).provider,
    'chatgpt',
    'An active order must keep its original provider even if SKU routing changes.'
  );
}

assert.equal(assertMemberFulfillmentSucceeded('chatgpt', {
  succeeded: true,
  result: {
    invited: ['one@example.com'],
    duplicateDetails: [{ email: 'two@example.com', reason: 'already_in_target' }]
  }
}, ['one@example.com', 'two@example.com']), true);
assert.throws(
  () => assertMemberFulfillmentSucceeded('chatgpt', {
    succeeded: true,
    operationId: 'op_cross_account',
    result: {
      invited: [],
      duplicates: ['buyer@example.com'],
      duplicateDetails: [{ email: 'buyer@example.com', reason: 'assigned_to_another_account' }]
    }
  }, ['buyer@example.com']),
  (error) => error.code === 'MEMBER_FULFILLMENT_INCOMPLETE'
);
assert.equal(assertMemberFulfillmentSucceeded('canva', {
  succeeded: true,
  result: { invited: ['one@example.com'], duplicates: ['two@example.com'] }
}, ['one@example.com', 'two@example.com']), true);
assert.throws(
  () => assertMemberFulfillmentSucceeded('chatgpt', {
    operationId: 'op_terminal_error',
    failed: true,
    succeeded: false,
    error: { code: 'UPSTREAM_RATE_LIMITED', retryable: true }
  }, ['one@example.com']),
  (error) => error.upstreamCode === 'UPSTREAM_RATE_LIMITED' && error.retryable === false
);

{
  const order = seatOrder({ emails: ['A@example.com', 'b@example.com'] });
  let deliveredNotice = 0;
  let seatLockHeld = false;
  const test = harness(order, settings(), () => ({
    async submitOperation(input) {
      assert.equal(input.accountRef, 'admin@example.com');
      assert.deepEqual(input.emails, ['a@example.com', 'b@example.com']);
      assert.equal(input.generation, 0);
      return { operationId: 'op_success_submit', status: 'queued', terminal: false };
    },
    async pollOperation(operationId) {
      assert.equal(operationId, 'op_success_submit');
      return {
        operationId,
        status: 'succeeded',
        terminal: true,
        succeeded: true,
        result: { invited: ['a@example.com', 'b@example.com'], duplicateDetails: [] }
      };
    }
  }));
  test.dependencies.withSeatAccessLocks = async (scope, callback) => {
    seatLockHeld = true;
    try {
      return { acquired: true, value: await callback({ storage: 'local', client: null }) };
    } finally {
      seatLockHeld = false;
    }
  };
  const result = await processSeatFulfillment(order.id, {
    dependencies: test.dependencies,
    onDelivered: async () => {
      assert.equal(seatLockHeld, false, 'Telegram delivery notices must run after releasing the Seat lock.');
      deliveredNotice += 1;
    },
    throwOnError: true
  });
  assert.equal(result.ok, true);
  assert.equal(order.status, 'delivered');
  assert.equal(order.fulfillment.automation.status, 'succeeded');
  assert.equal(order.fulfillment.automation.operationId, 'op_success_submit');
  assert.match(order.fulfillment.automation.entitlementTargetFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(test.completions.length, 1);
  assert.equal(deliveredNotice, 1);
}

{
  const order = seatOrder({ id: 'ord_retryable' });
  let calls = 0;
  const generations = [];
  const test = harness(order, settings(), () => ({
    async submitOperation(input) {
      calls += 1;
      generations.push(input.generation);
      if (calls === 1) {
        throw new MemberFulfillmentClientError('Member service network request failed', {
          code: 'MEMBER_SERVICE_NETWORK_ERROR',
          provider: 'chatgpt',
          retryable: true
        });
      }
      return {
        operationId: 'op_retry_success',
        status: 'succeeded',
        terminal: true,
        succeeded: true,
        result: { invited: ['buyer@example.com'], duplicateDetails: [] }
      };
    },
    async pollOperation() {
      throw new Error('poll should not be called for a terminal submit');
    }
  }));
  const first = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(first.ok, false);
  assert.equal(order.fulfillment.automation.status, 'retrying');
  assert.equal(order.fulfillment.automation.retryCount, 1);
  assert.ok(order.fulfillment.automation.nextRetryAt);
  const notDue = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(notDue.reason, 'not_due');
  const retried = await processSeatFulfillment(order.id, {
    dependencies: test.dependencies,
    force: true,
    throwOnError: true
  });
  assert.equal(retried.ok, true);
  assert.deepEqual(generations, [0, 0], 'Transport retry must reuse the same idempotency generation.');
}

{
  const order = seatOrder({ id: 'ord_partial' });
  const generations = [];
  let calls = 0;
  const test = harness(order, settings(), () => ({
    async submitOperation(input) {
      calls += 1;
      generations.push(input.generation);
      if (calls === 1) {
        return {
          operationId: 'op_partial_result',
          status: 'partially_succeeded',
          terminal: true,
          succeeded: false,
          partiallySucceeded: true,
          result: { invited: [], notAllocated: ['buyer@example.com'] }
        };
      }
      return {
        operationId: 'op_manual_retry',
        status: 'succeeded',
        terminal: true,
        succeeded: true,
        result: { invited: ['buyer@example.com'], duplicateDetails: [] }
      };
    },
    async pollOperation() {
      throw new Error('poll should not be called');
    }
  }));
  const partial = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(partial.ok, false);
  assert.equal(order.fulfillment.automation.status, 'failed');
  const skipped = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(skipped.reason, 'not_due');
  const retried = await processSeatFulfillment(order.id, {
    dependencies: test.dependencies,
    force: true,
    throwOnError: true
  });
  assert.equal(retried.ok, true);
  assert.deepEqual(generations, [0, 1], 'A manual retry after terminal failure must use a new generation.');
}

{
  const order = seatOrder({ id: 'ord_config_block' });
  const blockedSettings = settings();
  blockedSettings.integrations.chatgpt.apiKey = '';
  let called = 0;
  const test = harness(order, blockedSettings, () => {
    called += 1;
    return {};
  });
  const blocked = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(blocked.reason, 'api_key_missing');
  assert.equal(order.fulfillment.automation.status, 'blocked');
  assert.equal(called, 0);
}

{
  const order = seatOrder({ id: 'ord_retry_exhausted' });
  const exhaustedSettings = settings({ maxRetries: 0 });
  const test = harness(order, exhaustedSettings, () => ({
    async submitOperation() {
      throw new MemberFulfillmentClientError('Member service unavailable', {
        code: 'MEMBER_SERVICE_NETWORK_ERROR',
        provider: 'chatgpt',
        retryable: true
      });
    },
    async pollOperation() { throw new Error('not reached'); }
  }));
  const result = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(result.ok, false);
  assert.equal(order.fulfillment.automation.status, 'failed');
  assert.equal(order.fulfillment.automation.retryCount, 1);
  assert.equal(order.fulfillment.automation.nextRetryAt, null);
  assert.equal(order.fulfillment.automation.error.retryable, false);
  assert.equal(result.error.retryable, false, 'The returned error must match the persisted retry decision.');
}

{
  const order = seatOrder({ id: 'ord_retry_exhausted_unknown_submission' });
  const exhaustedSettings = settings({ maxRetries: 0 });
  const test = harness(order, exhaustedSettings, () => ({
    async submitOperation() {
      throw new MemberFulfillmentClientError('Connection closed after submit', {
        code: 'MEMBER_SERVICE_NETWORK_ERROR',
        provider: 'chatgpt',
        retryable: true,
        submissionMayHaveBeenAccepted: true
      });
    },
    async pollOperation() { throw new Error('not reached'); }
  }));
  const result = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(result.ok, false);
  assert.equal(order.fulfillment.automation.status, 'verification_required');
  assert.equal(order.fulfillment.automation.retryCount, 1);
  assert.equal(order.fulfillment.automation.nextRetryAt, null);
  assert.equal(order.fulfillment.automation.error.retryable, false);
  const stopped = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(stopped.reason, 'not_due', 'Unknown accepted submissions must stop for explicit reconciliation after retries are exhausted.');
}

{
  const order = seatOrder({ id: 'ord_operation_id_write_race' });
  const test = harness(order, settings(), () => ({
    async submitOperation() {
      return { operationId: 'op_survives_state_write', status: 'queued', terminal: false };
    },
    async pollOperation() { throw new Error('poll must not run after the state write fails'); }
  }));
  const updateAutomation = test.dependencies.updateAutomation;
  let updateCalls = 0;
  test.dependencies.updateAutomation = async (...args) => {
    updateCalls += 1;
    if (updateCalls === 2) throw new Error('temporary database write failure');
    return updateAutomation(...args);
  };

  const result = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(result.ok, false);
  assert.equal(order.fulfillment.automation.status, 'verification_required');
  assert.equal(order.fulfillment.automation.operationId, 'op_survives_state_write');
  assert.equal(updateCalls, 3, 'The catch path must persist the accepted operation id after the failed state write.');
}

{
  const order = seatOrder({ id: 'ord_rejected_with_operation_id' });
  const test = harness(order, settings(), () => ({
    async submitOperation() {
      throw new MemberFulfillmentClientError('Existing operation requires reconciliation', {
        code: 'MEMBER_SERVICE_HTTP_ERROR',
        provider: 'chatgpt',
        retryable: false,
        operationId: 'op_existing_reconcile'
      });
    },
    async pollOperation() { throw new Error('not reached'); }
  }));
  const result = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(result.ok, false);
  assert.equal(order.fulfillment.automation.status, 'verification_required');
  assert.equal(order.fulfillment.automation.operationId, 'op_existing_reconcile');
}

{
  const order = seatOrder({ id: 'ord_config_lost_after_submit' });
  order.fulfillment.automation = {
    provider: 'chatgpt',
    status: 'processing',
    attempt: 1,
    retryCount: 0,
    operationId: 'op_needs_reconciliation',
    idempotencyKey: 'member_fulfillment_existing'
  };
  const blockedSettings = settings();
  blockedSettings.integrations.chatgpt.apiKey = '';
  const test = harness(order, blockedSettings, () => {
    throw new Error('client must not be created while configuration is missing');
  });
  const result = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(result.reason, 'api_key_missing');
  assert.equal(order.fulfillment.automation.status, 'verification_required');
  assert.equal(order.fulfillment.automation.operationId, 'op_needs_reconciliation');
  assert.equal(order.fulfillment.automation.idempotencyKey, 'member_fulfillment_existing');
}

{
  const order = seatOrder({ id: 'ord_durable_retry' });
  const memberSettings = settings();
  order.fulfillment.automation = {
    provider: 'chatgpt',
    status: 'failed',
    attempt: 2,
    retryCount: 8,
    operationId: 'op_terminal_failure',
    idempotencyKey: 'member_fulfillment_old',
    targetFingerprint: targetFingerprint('chatgpt', memberSettings),
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:01:00.000Z',
    error: { code: 'UPSTREAM_FAILED', message: 'failed', retryable: false }
  };
  const generations = [];
  const test = harness(order, memberSettings, () => ({
    async submitOperation(input) {
      generations.push(input.generation);
      return {
        operationId: 'op_new_generation',
        status: 'succeeded',
        terminal: true,
        succeeded: true,
        result: { invited: ['buyer@example.com'], duplicateDetails: [] }
      };
    },
    async pollOperation() { throw new Error('not reached'); }
  }));
  const requested = await requestSeatFulfillmentRetry(order.id, {
    actorId: 'admin-test',
    dependencies: test.dependencies
  });
  assert.equal(requested.queued, true);
  assert.equal(requested.provider, 'chatgpt');
  assert.equal(test.automationUpdates.at(-1).actorId, 'admin-test');
  assert.equal(order.fulfillment.automation.status, 'retry_requested');
  assert.equal(order.fulfillment.automation.attempt, 3);
  assert.equal(order.fulfillment.automation.retryCount, 0);
  assert.equal(order.fulfillment.automation.operationId, 'op_terminal_failure');
  assert.equal(order.fulfillment.automation.idempotencyKey, '');
  assert.equal(order.fulfillment.automation.nextRetryAt, null);
  assert.equal(order.fulfillment.automation.error, null);

  const processed = await processSeatFulfillment(order.id, {
    dependencies: test.dependencies,
    throwOnError: true
  });
  assert.equal(processed.ok, true);
  assert.deepEqual(generations, [2], 'A persisted retry after terminal failure must use the new generation without force.');
}

{
  const order = seatOrder({ id: 'ord_failed_key_fix' });
  const memberSettings = settings();
  let submitCalls = 0;
  const test = harness(order, memberSettings, (clientOptions) => ({
    async submitOperation() {
      submitCalls += 1;
      if (clientOptions.apiKey === 'gsk_chatgpt_test') {
        throw new MemberFulfillmentClientError('Unauthorized', {
          code: 'MEMBER_SERVICE_HTTP_ERROR',
          statusCode: 401,
          provider: 'chatgpt',
          retryable: false
        });
      }
      return {
        operationId: 'op_key_fixed_success',
        status: 'succeeded',
        terminal: true,
        succeeded: true,
        result: { invited: ['buyer@example.com'], duplicateDetails: [] }
      };
    },
    async pollOperation() { throw new Error('not reached'); }
  }));
  const failed = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(failed.ok, false);
  assert.equal(order.fulfillment.automation.status, 'failed');
  assert.equal(order.fulfillment.automation.operationId, '');
  assert.ok(order.fulfillment.automation.targetFingerprint);

  memberSettings.integrations.chatgpt.apiKey = 'gsk_chatgpt_fixed';
  memberSettings.integrations.chatgpt.accountRef = 'fixed-admin@example.com';
  const restartSweep = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(restartSweep.reason, 'not_due');
  assert.equal(
    order.fulfillment.automation.status,
    'failed',
    'A definitive pre-submission failure must remain retryable when Railway restarts with a corrected target.'
  );
  await requestSeatFulfillmentRetry(order.id, { dependencies: test.dependencies });
  assert.equal(order.fulfillment.automation.targetFingerprint, '');
  const recovered = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(recovered.ok, true);
  assert.equal(order.status, 'delivered');
  assert.equal(submitCalls, 2);
}

{
  const order = seatOrder({ id: 'ord_confirm_retarget_after_restart' });
  const originalSettings = settings();
  order.fulfillment.automation = {
    provider: 'chatgpt',
    status: 'verification_required',
    attempt: 1,
    retryCount: 1,
    operationId: '',
    idempotencyKey: 'seat-chatgpt-old-target-g1',
    targetFingerprint: targetFingerprint('chatgpt', originalSettings),
    error: {
      code: 'integration_target_changed',
      message: 'Member service target changed while this order was active',
      retryable: false
    }
  };
  const changedSettings = settings();
  changedSettings.integrations.chatgpt.accountRef = 'corrected-admin@example.com';
  const test = harness(order, changedSettings, () => ({
    async submitOperation() {
      return {
        operationId: 'op_retarget_success',
        status: 'succeeded',
        terminal: true,
        succeeded: true,
        result: { invited: ['buyer@example.com'], duplicateDetails: [] }
      };
    },
    async pollOperation() { throw new Error('not reached'); }
  }));

  await assert.rejects(
    requestSeatFulfillmentRetry(order.id, { dependencies: test.dependencies }),
    (error) => error.statusCode === 409 && error.code === 'TARGET_CHANGE_CONFIRMATION_REQUIRED'
  );
  assert.equal(order.fulfillment.automation.status, 'verification_required');

  await requestSeatFulfillmentRetry(order.id, {
    dependencies: test.dependencies,
    confirmTargetChange: true
  });
  assert.equal(order.fulfillment.automation.status, 'retry_requested');
  assert.equal(order.fulfillment.automation.attempt, 2);
  assert.equal(order.fulfillment.automation.idempotencyKey, '');
  assert.equal(order.fulfillment.automation.targetFingerprint, '');
  const recovered = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(recovered.ok, true);
  assert.equal(order.status, 'delivered');
}

{
  const order = seatOrder({ id: 'ord_target_drift' });
  const originalSettings = settings();
  order.fulfillment.automation = {
    provider: 'chatgpt',
    status: 'retry_requested',
    attempt: 1,
    targetFingerprint: targetFingerprint('chatgpt', originalSettings)
  };
  const changedSettings = settings();
  changedSettings.integrations.chatgpt.accountRef = 'different-admin@example.com';
  const test = harness(order, changedSettings, () => {
    throw new Error('Target drift must be blocked before creating a client');
  });
  const result = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(result.reason, 'integration_target_changed');
  assert.equal(order.fulfillment.automation.status, 'verification_required');
  assert.equal(order.fulfillment.automation.error.code, 'integration_target_changed');
}

{
  const order = seatOrder({ id: 'ord_resume_local_completion' });
  order.fulfillment.automation = {
    provider: 'chatgpt',
    status: 'succeeded',
    attempt: 1,
    operationId: 'op_already_verified'
  };
  const unavailableSettings = settings();
  unavailableSettings.integrations.chatgpt.enabled = false;
  unavailableSettings.integrations.chatgpt.apiKey = '';
  const test = harness(order, unavailableSettings, () => {
    throw new Error('A verified operation must complete locally without calling the member service');
  });
  const result = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(result.ok, true);
  assert.equal(result.reconciled, true);
  assert.equal(order.status, 'delivered');
  assert.equal(test.completions.length, 1);
  assert.equal(
    order.fulfillment.automation.entitlementTargetFingerprint,
    undefined,
    'A persisted success without a matching credential-bound target must remain fail-closed.'
  );
}

{
  const order = seatOrder({ id: 'ord_retry_reconcile' });
  const memberSettings = settings();
  order.fulfillment.automation = {
    provider: 'chatgpt',
    status: 'verification_required',
    attempt: 4,
    retryCount: 2,
    operationId: 'op_existing',
    idempotencyKey: 'member_fulfillment_existing',
    targetFingerprint: targetFingerprint('chatgpt', memberSettings)
  };
  const test = harness(order, memberSettings, () => ({}));
  await requestSeatFulfillmentRetry(order.id, { dependencies: test.dependencies });
  assert.equal(order.fulfillment.automation.status, 'retry_requested');
  assert.equal(order.fulfillment.automation.attempt, 4);
  assert.equal(order.fulfillment.automation.operationId, 'op_existing');
  assert.equal(order.fulfillment.automation.idempotencyKey, 'member_fulfillment_existing');
  assert.equal(order.fulfillment.automation.retryCount, 0);
}

{
  const order = seatOrder({ id: 'ord_retry_unknown_then_config_missing' });
  const memberSettings = settings();
  order.fulfillment.automation = {
    provider: 'chatgpt',
    status: 'verification_required',
    attempt: 2,
    retryCount: 1,
    operationId: '',
    idempotencyKey: 'seat-chatgpt-unknown-g1',
    targetFingerprint: targetFingerprint('chatgpt', memberSettings)
  };
  const test = harness(order, memberSettings, () => {
    throw new Error('Missing configuration must stop before client creation');
  });
  await requestSeatFulfillmentRetry(order.id, { dependencies: test.dependencies });
  assert.equal(order.fulfillment.automation.status, 'retry_requested');
  memberSettings.integrations.chatgpt.apiKey = '';
  const result = await processSeatFulfillment(order.id, { dependencies: test.dependencies });
  assert.equal(result.reason, 'api_key_missing');
  assert.equal(
    order.fulfillment.automation.status,
    'verification_required',
    'An unknown prior submission must not be downgraded when configuration disappears.'
  );
  assert.equal(order.fulfillment.automation.idempotencyKey, 'seat-chatgpt-unknown-g1');
}

{
  for (const status of ['processing', 'succeeded']) {
    const order = seatOrder({ id: `ord_retry_reject_${status}` });
    order.fulfillment.automation = { provider: 'chatgpt', status, attempt: 1 };
    const test = harness(order, settings(), () => ({}));
    await assert.rejects(
      requestSeatFulfillmentRetry(order.id, { dependencies: test.dependencies }),
      (error) => error.statusCode === 409 && error.message.includes(status)
    );
  }
}

{
  const first = seatOrder({ id: 'ord_sweep_gpt' });
  const manual = seatOrder({ id: 'ord_sweep_claude', sku: 'claude-business-seat-1x-1m' });
  const test = harness(first, settings(), () => ({
    async submitOperation() {
      return {
        operationId: 'op_sweep_success',
        status: 'succeeded',
        terminal: true,
        succeeded: true,
        result: { invited: ['buyer@example.com'], duplicateDetails: [] }
      };
    },
    async pollOperation() { throw new Error('not reached'); }
  }));
  test.dependencies.listOrders = async () => ({ items: [first, manual] });
  const results = await sweepSeatFulfillments({ dependencies: test.dependencies });
  assert.equal(results.length, 1, 'Claude Seat must remain manual and stay out of automated sweeps.');
  assert.equal(first.status, 'delivered');
  assert.equal(manual.status, 'awaiting_fulfillment');
}

{
  const newest = seatOrder({ id: 'ord_page_newest' });
  const manual = seatOrder({ id: 'ord_page_manual', sku: 'claude-business-seat-1x-1m' });
  const oldest = seatOrder({ id: 'ord_page_oldest' });
  const orders = new Map([[newest.id, newest], [manual.id, manual], [oldest.id, oldest]]);
  const pageRequests = [];
  const submitted = [];
  const pagedSettings = settings({ concurrency: 1 });
  const dependencies = {
    settings: pagedSettings,
    async listOrders(query) {
      pageRequests.push({ ...query });
      if (query.offset === 0) return { items: [newest, manual], hasMore: true };
      if (query.offset === 2) return { items: [oldest], hasMore: false };
      throw new Error(`unexpected offset ${query.offset}`);
    },
    async getOrder(id) {
      return { order: orders.get(id) };
    },
    async updateAutomation(actorId, id, patch) {
      const order = orders.get(id);
      order.fulfillment.automation = { ...(order.fulfillment.automation || {}), ...structuredClone(patch) };
      return order;
    },
    async complete(actorId, id) {
      const order = orders.get(id);
      order.status = 'delivered';
      return { order, fulfilled: 1 };
    },
    createClient() {
      return {
        async submitOperation(input) {
          submitted.push(input.orderId);
          return {
            operationId: `op_${input.orderId}`,
            status: 'succeeded',
            terminal: true,
            succeeded: true,
            result: { invited: ['buyer@example.com'], duplicateDetails: [] }
          };
        },
        async pollOperation() { throw new Error('not reached'); }
      };
    }
  };
  const results = await sweepSeatFulfillments({ dependencies });
  assert.equal(results.length, 2);
  assert.deepEqual(pageRequests.map((query) => query.offset), [0, 2]);
  assert.ok(pageRequests.every((query) => query.limit === 500));
  assert.deepEqual(submitted, ['ord_page_oldest', 'ord_page_newest'], 'The complete sweep should process oldest eligible orders first.');
  assert.equal(oldest.status, 'delivered');
  assert.equal(newest.status, 'delivered');
  assert.equal(manual.status, 'awaiting_fulfillment');
}

{
  let releaseList;
  const gate = new Promise((resolve) => { releaseList = resolve; });
  let listCalls = 0;
  const dependencies = {
    settings: settings(),
    async listOrders() {
      listCalls += 1;
      await gate;
      return { items: [], hasMore: false };
    }
  };
  const firstSweep = sweepSeatFulfillments({ dependencies });
  const overlappingSweep = sweepSeatFulfillments({ dependencies });
  assert.equal(firstSweep, overlappingSweep, 'Overlapping sweeps must share one in-flight promise.');
  assert.equal(listCalls, 1);
  releaseList();
  await Promise.all([firstSweep, overlappingSweep]);
  assert.equal(listCalls, 1);
  await sweepSeatFulfillments({ dependencies });
  assert.equal(listCalls, 2, 'A completed sweep must release the single-flight lock.');
}

console.log(JSON.stringify({ ok: true, checked: 'automatic GPT and Canva Seat fulfillment orchestration' }, null, 2));
