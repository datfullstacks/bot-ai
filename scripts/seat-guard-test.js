import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { config } from '../src/config.js';
import {
  getSeatAccessFence,
  putSeatAccessFence,
  reconcileSeatAccessFences
} from '../src/seatAccessFence.js';
import {
  buildSeatEntitlements,
  buildSeatGuardView,
  backfillLegacySeatEntitlementTargets,
  cancelSeatGuardInvitation,
  cleanupExpiredSeatAccess,
  getSeatGuardOperation,
  getSeatGuardSnapshot,
  removeSeatGuardMember,
  seatTermMonths,
  sweepExpiredSeatAccess
} from '../src/seatGuard.js';
import { lockSeatAccessTransaction, withSeatAccessLocks } from '../src/seatAccessLock.js';
import {
  memberIntegrationEntitlementFingerprint,
  memberIntegrationTargetFingerprint
} from '../src/seatFulfillmentAutomation.js';

const integration = {
  enabled: true,
  serviceUrl: 'http://localhost:3002/api/v1',
  apiKey: 'gsk_test',
  seatGuardApiKey: 'gsk_seat_guard_test',
  accountRef: 'account-1',
  skus: ['chatgpt-business-seat-1m'],
  protectedEmails: ['staff@example.com'],
  defaultSeatTermMonths: 1,
  expiryAutoRemove: true,
  expirySweepMs: 900000,
  expiryBatchSize: 10,
  expiryGraceMs: 0,
  expiryRetryWindowMs: 21600000,
  requestTimeoutMs: 1000,
  operationTimeoutMs: 1000,
  pollIntervalMs: 100
};

function order(id, email, status, deliveredAt, sku = 'chatgpt-business-seat-1m') {
  return {
    id,
    status,
    productSku: sku,
    productName: 'ChatGPT Business Seat',
    productSnapshot: { fulfillmentMode: 'seat_email', packageType: 'Business Seat 1M' },
    deliveredAt,
    fulfillment: {
      mode: 'seat_email',
      automation: {
        provider: 'chatgpt',
        targetFingerprint: memberIntegrationTargetFingerprint('chatgpt', integration)
      },
      recipients: [{ email, status: status === 'delivered' ? 'invited' : 'pending' }]
    }
  };
}

assert.equal(seatTermMonths({ productSku: 'canva-pro-6m' }), 6);
assert.equal(seatTermMonths({ productSku: 'claude-business-seat-6-5x-1m' }), 1);
assert.equal(seatTermMonths({ productSnapshot: { seatTermMonths: 12 } }), 12);

const nowMs = Date.parse('2026-07-17T00:00:00.000Z');
const entitlements = buildSeatEntitlements([
  order('ord_active', 'active@example.com', 'delivered', '2026-07-01T00:00:00.000Z'),
  order('ord_expired', 'expired@example.com', 'delivered', '2026-05-01T00:00:00.000Z'),
  order('ord_pending', 'pending@example.com', 'awaiting_fulfillment', null),
  order('ord_renew_1', 'renew@example.com', 'delivered', '2026-06-01T00:00:00.000Z'),
  order('ord_renew_2', 'renew@example.com', 'delivered', '2026-06-15T00:00:00.000Z')
], { integration, nowMs });

const entitlementByEmail = new Map(entitlements.map((entry) => [entry.email, entry]));
assert.equal(entitlementByEmail.get('active@example.com').state, 'active');
assert.equal(entitlementByEmail.get('expired@example.com').state, 'expired');
assert.equal(entitlementByEmail.get('pending@example.com').state, 'pending');
assert.equal(entitlementByEmail.get('renew@example.com').state, 'active');
assert.equal(entitlementByEmail.get('renew@example.com').expiresAt, '2026-07-31T00:00:00.000Z');

const wrongTargetOrder = order('ord_wrong_target', 'wrong-target@example.com', 'delivered', '2026-07-01T00:00:00.000Z');
wrongTargetOrder.fulfillment.automation.targetFingerprint = 'old-target-fingerprint';
const missingTargetOrder = order('ord_missing_target', 'missing-target@example.com', 'delivered', '2026-07-01T00:00:00.000Z');
delete missingTargetOrder.fulfillment.automation.targetFingerprint;
const missingDeliveryOrder = order('ord_missing_delivery', 'missing-delivery@example.com', 'delivered', null);
missingDeliveryOrder.paidAt = '2026-07-01T00:00:00.000Z';
const reviewEntitlements = buildSeatEntitlements([
  wrongTargetOrder,
  missingTargetOrder,
  missingDeliveryOrder
], { integration, nowMs });
for (const entitlement of reviewEntitlements) {
  assert.equal(entitlement.state, 'review', `${entitlement.email} must fail closed to review.`);
}

const stableTargetOrder = order('ord_stable_target', 'stable-target@example.com', 'delivered', '2026-07-01T00:00:00.000Z');
stableTargetOrder.fulfillment.automation.entitlementTargetFingerprint = memberIntegrationEntitlementFingerprint(
  'chatgpt',
  integration
);
const rotatedIntegration = { ...integration, apiKey: 'gsk_rotated_fulfillment_key' };
assert.notEqual(
  memberIntegrationTargetFingerprint('chatgpt', integration),
  memberIntegrationTargetFingerprint('chatgpt', rotatedIntegration),
  'An in-flight operation target must remain credential-pinned.'
);
assert.equal(
  memberIntegrationEntitlementFingerprint('chatgpt', integration),
  memberIntegrationEntitlementFingerprint('chatgpt', rotatedIntegration),
  'Delivered entitlement identity must survive an API-key rotation.'
);
assert.equal(
  buildSeatEntitlements([stableTargetOrder], { integration: rotatedIntegration, nowMs })[0].state,
  'active'
);

{
  const legacyOrder = order(
    'ord_legacy_entitlement_target',
    'legacy-target@example.com',
    'delivered',
    '2026-07-01T00:00:00.000Z'
  );
  legacyOrder.fulfillment.automation.status = 'succeeded';
  const failedLegacyOrder = order(
    'ord_failed_legacy_entitlement_target',
    'failed-legacy-target@example.com',
    'delivered',
    '2026-07-01T00:00:00.000Z'
  );
  failedLegacyOrder.fulfillment.automation.status = 'failed';
  const calls = [];
  const result = await backfillLegacySeatEntitlementTargets({
    integration,
    orders: [legacyOrder, stableTargetOrder, wrongTargetOrder, failedLegacyOrder],
    dependencies: {
      async backfillSeatEntitlementTarget(actorId, orderId, input) {
        calls.push({ actorId, orderId, input });
        return { updated: true };
      }
    }
  });
  assert.deepEqual(
    { checked: result.checked, candidates: result.candidates, updated: result.updated },
    { checked: 4, candidates: 1, updated: 1 }
  );
  assert.deepEqual(calls, [{
    actorId: 'seat-entitlement-backfill',
    orderId: legacyOrder.id,
    input: {
      expectedTargetFingerprint: memberIntegrationTargetFingerprint('chatgpt', integration),
      entitlementTargetFingerprint: memberIntegrationEntitlementFingerprint('chatgpt', integration)
    }
  }]);

  const afterKeyRotation = await backfillLegacySeatEntitlementTargets({
    integration: rotatedIntegration,
    orders: [legacyOrder],
    dependencies: {
      async backfillSeatEntitlementTarget() {
        throw new Error('A legacy entitlement must fail closed after its fulfillment key changes.');
      }
    }
  });
  assert.equal(afterKeyRotation.candidates, 0);
  assert.equal(afterKeyRotation.updated, 0);

  const missingStatus = order(
    'ord_missing_status_legacy_entitlement_target',
    'missing-status-target@example.com',
    'delivered',
    '2026-07-01T00:00:00.000Z'
  );
  const unsafeStates = await backfillLegacySeatEntitlementTargets({
    integration,
    orders: [failedLegacyOrder, missingStatus],
    dependencies: {
      async backfillSeatEntitlementTarget() {
        throw new Error('Unverified legacy deliveries must not receive a stable entitlement target.');
      }
    }
  });
  assert.equal(unsafeStates.candidates, 0);
  assert.equal(unsafeStates.updated, 0);
}

const januaryEnd = order('ord_january_end', 'month-end@example.com', 'delivered', '2026-01-31T00:00:00.000Z');
const leapYearEnd = order('ord_leap_end', 'leap@example.com', 'delivered', '2024-01-31T00:00:00.000Z');
const fixedTermEntitlements = new Map(buildSeatEntitlements([januaryEnd, leapYearEnd], {
  integration,
  nowMs: Date.parse('2024-02-01T00:00:00.000Z')
}).map((entry) => [entry.email, entry]));
assert.equal(fixedTermEntitlements.get('month-end@example.com').expiresAt, '2026-03-02T00:00:00.000Z');
assert.equal(fixedTermEntitlements.get('leap@example.com').expiresAt, '2024-03-01T00:00:00.000Z');

const boundaryOrder = order('ord_boundary', 'boundary@example.com', 'delivered', '2026-07-01T00:00:00.000Z');
assert.equal(
  buildSeatEntitlements([boundaryOrder], { integration, nowMs: Date.parse('2026-07-30T23:59:59.999Z') })[0].state,
  'active',
  'A Seat must remain active until the complete 30-day term has elapsed.'
);
assert.equal(
  buildSeatEntitlements([boundaryOrder], { integration, nowMs: Date.parse('2026-07-31T00:00:00.000Z') })[0].state,
  'expired',
  'A Seat must expire exactly at deliveredAt + 30 days.'
);

const observedCreatedAt = '2026-07-01T00:00:00.000Z';

const remote = {
  account: {
    id: 'account-1',
    email: 'owner@example.com',
    allowedMembers: ['active@example.com', 'expired@example.com', 'manual@example.com']
  },
  members: [
    { id: 'member-owner', email: 'owner@example.com', role: 'owner', createdAt: observedCreatedAt },
    { id: 'member-active', email: 'active@example.com', role: 'member', createdAt: observedCreatedAt },
    { id: 'member-expired', email: 'expired@example.com', role: 'member', createdAt: observedCreatedAt },
    { id: 'member-manual', email: 'manual@example.com', role: 'member', createdAt: observedCreatedAt },
    { id: 'member-unknown', email: 'unknown@example.com', role: 'member', createdAt: observedCreatedAt },
    { id: 'member-admin', email: 'another-admin@example.com', role: 'workspace-admin', createdAt: observedCreatedAt },
    { id: 'member-unknown-role', email: 'unknown-role@example.com', role: 'billing-manager', createdAt: observedCreatedAt }
  ],
  invitations: [
    { id: 'invite-pending', email: 'pending@example.com', role: 'member', createdAt: observedCreatedAt },
    { id: 'invite-unknown', email: 'invite-unknown@example.com', role: 'member', createdAt: observedCreatedAt },
    { email: 'invite-no-id@example.com', role: 'member', createdAt: observedCreatedAt }
  ],
  observedAt: '2026-07-17T00:00:00.000Z'
};
const view = buildSeatGuardView({
  identity: { permissions: ['accounts:read', 'members:add', 'members:remove'] },
  remote,
  entitlements,
  protectedEmails: integration.protectedEmails
});
const memberById = new Map(view.members.map((member) => [member.id, member]));
assert.equal(memberById.get('member-owner').classification, 'protected');
assert.equal(memberById.get('member-admin').classification, 'protected');
assert.equal(memberById.get('member-unknown-role').classification, 'review');
assert.equal(memberById.get('member-unknown-role').removable, false);
assert.equal(memberById.get('member-active').classification, 'valid_order');
assert.equal(memberById.get('member-expired').classification, 'expired');
assert.equal(memberById.get('member-expired').removable, true);
assert.equal(memberById.get('member-manual').classification, 'manual_allowed');
assert.equal(memberById.get('member-manual').removable, true);
assert.equal(memberById.get('member-unknown').classification, 'unauthorized');
assert.equal(view.invitations.find((item) => item.id === 'invite-pending').cancelable, false);
assert.equal(view.invitations.find((item) => item.id === 'invite-unknown').cancelable, true);
assert.equal(view.invitations.find((item) => item.email === 'invite-no-id@example.com').actionRef, 'invite-no-id@example.com');
assert.equal(view.invitations.find((item) => item.email === 'invite-no-id@example.com').cancelable, true);
assert.equal(view.summary.unauthorizedMembers, 1);
assert.equal(view.summary.unauthorizedInvitations, 2);
const missingLifecycleView = buildSeatGuardView({
  identity: { permissions: ['accounts:read', 'members:remove'] },
  remote: {
    account: remote.account,
    members: [{ id: 'member-no-created-at', email: 'no-lifecycle@example.com', role: 'member' }],
    invitations: []
  },
  entitlements: []
});
assert.equal(missingLifecycleView.members[0].classification, 'unauthorized');
assert.equal(missingLifecycleView.members[0].removable, true);

for (const provider of ['canva', 'claude']) {
  const providerIntegration = {
    ...integration,
    serviceUrl: `http://localhost:${provider === 'canva' ? 3012 : 3022}/api/v1`,
    apiKey: `${provider}-fulfillment-key`,
    seatGuardApiKey: `${provider}-guard-key`,
    accountRef: `${provider}-account`,
    skus: [`${provider}-seat-1m`],
    protectedEmails: [`staff@${provider}.example`],
    expiryAutoRemove: false
  };
  const providerOrder = {
    id: `ord_${provider}_active`,
    status: 'delivered',
    productSku: `${provider}-seat-1m`,
    productName: `${provider} Seat`,
    productSnapshot: { fulfillmentMode: 'seat_email', seatTermMonths: 1 },
    deliveredAt: '2026-07-01T00:00:00.000Z',
    fulfillment: {
      mode: 'seat_email',
      automation: {
        provider,
        entitlementTargetFingerprint: memberIntegrationEntitlementFingerprint(provider, providerIntegration)
      },
      recipients: [{ email: `active@${provider}.example`, status: 'invited' }]
    }
  };
  const providerEntitlements = buildSeatEntitlements([providerOrder], {
    provider,
    integration: providerIntegration,
    nowMs
  });
  assert.equal(providerEntitlements[0].state, 'active');

  const memberEmail = `rogue@${provider}.example`;
  const memberRefCalls = [];
  const clientOptions = [];
  const providerDependencies = {
    async listOrders() { return { items: [providerOrder], hasMore: false }; },
    async listSeatOrdersForEmails() { return [providerOrder]; },
    createClient(options) {
      clientOptions.push(options);
      return {
        async getIdentity() { return { permissions: ['accounts:read', 'members:remove'] }; },
        async getAccountMembers() {
          return {
            account: { id: providerIntegration.accountRef, loginEmail: `owner@${provider}.example` },
            members: [{
              id: provider === 'claude' ? 'remote-member-id' : undefined,
              email: memberEmail,
              displayName: provider === 'canva' ? 'Canva Rogue' : undefined,
              fullName: provider === 'claude' ? 'Claude Rogue' : undefined,
              role: 'member',
              createdAt: observedCreatedAt
            }],
            invitations: [],
            observedAt: '2026-07-18T02:00:00.000Z'
          };
        },
        async removeAccountMember(accountRef, memberRef, input) {
          memberRefCalls.push({ accountRef, memberRef, input });
          return { operationId: `op_${provider}_remove_0001`, status: 'queued', terminal: false };
        },
        async pollOperation(operationId) {
          return { operationId, status: 'succeeded', terminal: true, succeeded: true };
        }
      };
    }
  };
  const providerSnapshot = await getSeatGuardSnapshot({
    provider,
    integration: providerIntegration,
    dependencies: providerDependencies,
    nowMs
  });
  assert.equal(providerSnapshot.provider, provider);
  assert.equal(providerSnapshot.members[0].actionRef, memberEmail, `${provider} removals must use email references.`);
  assert.equal(providerSnapshot.members[0].name, provider === 'canva' ? 'Canva Rogue' : 'Claude Rogue');

  const removal = await removeSeatGuardMember(memberEmail, {
    expectedEmail: memberEmail,
    confirmation: `REMOVE ${memberEmail}`,
    actionRequestId: `action-${provider}-remove-0001`
  }, {
    provider,
    integration: providerIntegration,
    dependencies: providerDependencies,
    nowMs
  });
  assert.equal(removal.operationId, `op_${provider}_remove_0001`);
  assert.equal(memberRefCalls[0].memberRef, memberEmail);
  assert.ok(clientOptions.every((options) => options.provider === provider));
  assert.ok(clientOptions.every((options) => options.apiKey === providerIntegration.seatGuardApiKey));
}

const calls = [];
const listOrderCalls = [];
const clientOptions = [];
const dependencies = {
  async listOrders(options) {
    listOrderCalls.push(options);
    return {
      items: [order('ord_expired', 'expired@example.com', 'delivered', '2026-05-01T00:00:00.000Z')],
      hasMore: false
    };
  },
  async listSeatOrdersForEmails() {
    return [order('ord_expired', 'expired@example.com', 'delivered', '2026-05-01T00:00:00.000Z')];
  },
  createClient(options) {
    clientOptions.push(options);
    return {
      async getIdentity() {
        return { permissions: ['accounts:read', 'members:remove'] };
      },
      async getAccountMembers() {
        return {
          account: remote.account,
          members: [
            { id: 'member-expired', email: 'expired@example.com', role: 'member', createdAt: observedCreatedAt },
            { id: 'member-unknown', email: 'unknown@example.com', role: 'member', createdAt: observedCreatedAt }
          ],
          invitations: [
            { id: 'invite-unknown', email: 'invite-unknown@example.com', role: 'member', createdAt: observedCreatedAt },
            { email: 'invite-no-id@example.com', role: 'member', createdAt: observedCreatedAt }
          ],
          observedAt: remote.observedAt
        };
      },
      async removeAccountMember(accountRef, memberId, options) {
        calls.push({ action: 'remove', accountRef, memberId, options });
        return { operationId: 'op_remove_test', status: 'queued' };
      },
      async cancelAccountInvitation(accountRef, invitationId, options) {
        calls.push({ action: 'cancel', accountRef, invitationId, options });
        return { operationId: 'op_cancel_test', status: 'queued' };
      },
      async pollOperation(operationId) {
        return { operationId, status: 'succeeded', terminal: true, succeeded: true };
      }
    };
  }
};

await assert.rejects(
  removeSeatGuardMember('member-unknown', {
    expectedEmail: 'unknown@example.com',
    confirmation: 'REMOVE wrong@example.com',
    actionRequestId: 'action-remove-wrong-0001'
  }, { dependencies, integration, nowMs }),
  /Type REMOVE unknown@example.com/
);
const removed = await removeSeatGuardMember('member-unknown', {
  expectedEmail: 'unknown@example.com',
  confirmation: 'REMOVE unknown@example.com',
  actionRequestId: 'action-remove-unknown-0001'
}, { dependencies, integration, nowMs });
assert.equal(removed.operationId, 'op_remove_test');
assert.match(calls[0].options.idempotencyKey, /^seat-guard-remove-/);
assert.equal(
  (await getSeatAccessFence(
    { provider: 'chatgpt', accountRef: integration.accountRef, email: 'unknown@example.com' },
    { lockContext: { storage: 'local', client: null } }
  )).operationId,
  'op_remove_test',
  'Manual removal must leave a fence until its asynchronous operation becomes terminal.'
);

await assert.rejects(
  removeSeatGuardMember('member-expired', {
    expectedEmail: 'changed@example.com',
    confirmation: 'REMOVE expired@example.com',
    actionRequestId: 'action-remove-expired-0001'
  }, { dependencies, integration, nowMs }),
  /email changed/
);
const canceled = await cancelSeatGuardInvitation('invite-unknown', {
  expectedEmail: 'invite-unknown@example.com',
  confirmation: 'CANCEL invite-unknown@example.com',
  actionRequestId: 'action-cancel-unknown-0001'
}, { dependencies, integration, nowMs });
assert.equal(canceled.operationId, 'op_cancel_test');
assert.match(calls[1].options.idempotencyKey, /^seat-guard-cancel-/);

const canceledByEmail = await cancelSeatGuardInvitation('invite-no-id@example.com', {
  expectedEmail: 'invite-no-id@example.com',
  confirmation: 'CANCEL invite-no-id@example.com',
  actionRequestId: 'action-cancel-no-id-0001'
}, { dependencies, integration, nowMs });
assert.equal(canceledByEmail.operationId, 'op_cancel_test');
assert.equal(calls[2].invitationId, 'invite-no-id@example.com');

await removeSeatGuardMember('member-unknown', {
  expectedEmail: 'unknown@example.com',
  confirmation: 'REMOVE unknown@example.com',
  actionRequestId: 'action-remove-unknown-0002'
}, { dependencies, integration, nowMs });
assert.notEqual(
  calls[0].options.idempotencyKey,
  calls[3].options.idempotencyKey,
  'An explicit retry generation must not replay a terminal failed operation.'
);
await removeSeatGuardMember('member-unknown', {
  expectedEmail: 'unknown@example.com',
  confirmation: 'REMOVE unknown@example.com',
  actionRequestId: 'action-remove-unknown-0002'
}, { dependencies, integration, nowMs });
assert.equal(
  calls[3].options.idempotencyKey,
  calls[4].options.idempotencyKey,
  'Retrying the same ambiguous action generation must reuse its idempotency key.'
);

{
  const deletedOperationFences = [];
  const operation = await getSeatGuardOperation('op_remove_test', {
    integration,
    dependencies: {
      createClient() {
        return {
          async getOperation(operationId) {
            return { operationId, status: 'succeeded', terminal: true, succeeded: true };
          }
        };
      },
      async deleteSeatAccessFencesByOperationId(operationId, fenceOptions) {
        deletedOperationFences.push({ operationId, fenceOptions });
        return 1;
      }
    }
  });
  assert.equal(operation.terminal, true);
  assert.deepEqual(deletedOperationFences, [{
    operationId: 'op_remove_test',
    fenceOptions: { provider: 'chatgpt', accountRef: integration.accountRef }
  }]);
}

await getSeatGuardSnapshot({ dependencies, integration, nowMs });
assert.ok(listOrderCalls.every((options) => options.status === undefined), 'Seat Guard should use one all-status order scan.');
assert.ok(clientOptions.every((options) => options.apiKey === integration.seatGuardApiKey));
assert.ok(clientOptions.every((options) => options.maxResponseBytes === 2 * 1024 * 1024));

const paginationCalls = [];
const duplicateOrder = order('ord_duplicate', 'duplicate@example.com', 'delivered', '2026-07-01T00:00:00.000Z');
const pagedSnapshot = await getSeatGuardSnapshot({
  integration,
  nowMs,
  dependencies: {
    async listOrders(options) {
      paginationCalls.push(options);
      if (options.offset === 0) return { items: [duplicateOrder], hasMore: true };
      return {
        items: [duplicateOrder, order('ord_second', 'second@example.com', 'awaiting_fulfillment', null)],
        hasMore: false
      };
    },
    createClient() {
      return {
        async getIdentity() { return { permissions: ['accounts:read'] }; },
        async getAccountMembers() {
          return { account: remote.account, members: [], invitations: [], observedAt: remote.observedAt };
        }
      };
    }
  }
});
const pagedByEmail = new Map(pagedSnapshot.entitlements.map((entry) => [entry.email, entry]));
assert.deepEqual(paginationCalls.map((options) => options.offset), [0, 1]);
assert.equal(pagedByEmail.get('duplicate@example.com').expiresAt, '2026-07-31T00:00:00.000Z');
assert.equal(pagedByEmail.get('second@example.com').state, 'pending');

function createExpiryHarness({
  email,
  remoteKind = 'member',
  orders,
  permissions = ['accounts:read', 'members:remove'],
  ownerEmail = 'owner@example.com',
  pollError = null,
  transitionInvitationToMember = false,
  pollOperationOverride = null
}) {
  const normalized = email.toLowerCase();
  const calls = [];
  const audits = [];
  const lockScopes = [];
  const remoteState = {
    account: {
      id: integration.accountRef,
      email: ownerEmail,
      allowedMembers: [normalized]
    },
    members: remoteKind === 'member'
      ? [{ id: `member-${normalized}`, email: normalized, role: 'member', createdAt: observedCreatedAt }]
      : [],
    invitations: remoteKind === 'invitation'
      ? [{ id: `invite-${normalized}`, email: normalized, role: 'member', createdAt: observedCreatedAt }]
      : [],
    observedAt: new Date(nowMs).toISOString()
  };
  const orderItems = orders || [order(`ord-expiry-${remoteKind}`, normalized, 'delivered', '2026-05-01T00:00:00.000Z')];

  const dependencies = {
    async listOrders() {
      return { items: orderItems, hasMore: false };
    },
    async listSeatOrdersForEmails() {
      return orderItems;
    },
    createClient() {
      return {
        async getIdentity() {
          return { permissions };
        },
        async getAccountMembers() {
          return structuredClone(remoteState);
        },
        async removeAccountMember(accountRef, memberId, options) {
          calls.push({ action: 'remove', accountRef, reference: memberId, options });
          remoteState.members = remoteState.members.filter((item) => item.id !== memberId);
          remoteState.account.allowedMembers = remoteState.account.allowedMembers.filter((item) => item !== normalized);
          return { operationId: 'op_expiry_member_0001', status: 'queued', terminal: false };
        },
        async cancelAccountInvitation(accountRef, invitationRef, options) {
          calls.push({ action: 'cancel', accountRef, reference: invitationRef, options });
          remoteState.invitations = remoteState.invitations.filter((item) => item.email !== normalized);
          if (transitionInvitationToMember && calls.filter((item) => item.action === 'cancel').length === 1) {
            remoteState.members = [{
              id: `member-after-invite-${normalized}`,
              email: normalized,
              role: 'member',
              createdAt: observedCreatedAt
            }];
          } else {
            remoteState.account.allowedMembers = remoteState.account.allowedMembers.filter((item) => item !== normalized);
          }
          return { operationId: 'op_expiry_invite_0001', status: 'queued', terminal: false };
        },
        async pollOperation(operationId) {
          if (pollOperationOverride) return pollOperationOverride(operationId);
          if (pollError) {
            throw Object.assign(new Error(pollError.message || 'operation timeout'), {
              code: pollError.code || 'MEMBER_SERVICE_OPERATION_TIMEOUT',
              operationId
            });
          }
          return { operationId, status: 'succeeded', terminal: true, succeeded: true };
        }
      };
    },
    async withSeatAccessLocks(scope, callback) {
      lockScopes.push(structuredClone(scope));
      return { acquired: true, value: await callback() };
    },
    async recordAudit(...args) {
      audits.push(args);
    }
  };
  return { calls, audits, dependencies, lockScopes, remoteState };
}

{
  const email = 'expired-member@example.com';
  const test = createExpiryHarness({ email, remoteKind: 'member' });
  const result = await cleanupExpiredSeatAccess(email, { dependencies: test.dependencies, integration, nowMs });
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'member');
  assert.equal(test.calls.length, 1);
  assert.equal(test.calls[0].action, 'remove');
  assert.equal(test.calls[0].reference, `member-${email}`);
  assert.match(test.calls[0].options.idempotencyKey, /^seat-guard-expire-member-/);
  assert.deepEqual(test.lockScopes[0].emails, [email]);
  assert.equal(test.remoteState.account.allowedMembers.includes(email), false);
  assert.equal(test.audits[0][1], 'seat_guard.expiry_cleanup_succeeded');
}

{
  const email = 'expired-invitation@example.com';
  const test = createExpiryHarness({ email, remoteKind: 'invitation' });
  const result = await cleanupExpiredSeatAccess(email, { dependencies: test.dependencies, integration, nowMs });
  assert.equal(result.kind, 'invitation');
  assert.equal(test.calls[0].action, 'cancel');
  assert.equal(test.calls[0].reference, `invite-${email}`);
  assert.equal(test.remoteState.invitations.length, 0);
  assert.equal(test.remoteState.account.allowedMembers.length, 0);
}

{
  const email = 'accepted-during-cleanup@example.com';
  const test = createExpiryHarness({
    email,
    remoteKind: 'invitation',
    transitionInvitationToMember: true
  });
  const result = await cleanupExpiredSeatAccess(email, { dependencies: test.dependencies, integration, nowMs });
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'member');
  assert.deepEqual(test.calls.map((item) => item.action), ['cancel', 'remove']);
  assert.equal(test.remoteState.members.length, 0);
  assert.equal(test.remoteState.account.allowedMembers.length, 0);
}

{
  const email = 'expired-allowlist-only@example.com';
  const test = createExpiryHarness({ email, remoteKind: 'allowlist' });
  const result = await cleanupExpiredSeatAccess(email, { dependencies: test.dependencies, integration, nowMs });
  assert.equal(result.kind, 'allowlist');
  assert.equal(test.calls[0].action, 'cancel');
  assert.equal(test.calls[0].reference, email, 'A stale allow-list entry must be reconciled through the email invitation endpoint.');
  assert.equal(test.remoteState.account.allowedMembers.length, 0);
}

{
  const email = 'renewing@example.com';
  const delivered = order('ord-expired-before-renewal', email, 'delivered', '2026-05-01T00:00:00.000Z');
  const pendingRenewal = order('ord-pending-renewal', email, 'awaiting_fulfillment', null);
  const test = createExpiryHarness({ email, orders: [delivered, pendingRenewal] });
  const result = await cleanupExpiredSeatAccess(email, { dependencies: test.dependencies, integration, nowMs });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'no_longer_expired_or_eligible');
  assert.equal(test.calls.length, 0, 'A pending renewal must stop automatic removal.');
}

{
  const email = 'staff-expired@example.com';
  const protectedIntegration = { ...integration, protectedEmails: [email] };
  const test = createExpiryHarness({ email });
  const result = await cleanupExpiredSeatAccess(email, {
    dependencies: test.dependencies,
    integration: protectedIntegration,
    nowMs
  });
  assert.equal(result.skipped, true);
  assert.equal(test.calls.length, 0, 'A protected email must never be removed automatically.');
}

{
  const email = 'owner-expired@example.com';
  const test = createExpiryHarness({ email, ownerEmail: email });
  const result = await cleanupExpiredSeatAccess(email, { dependencies: test.dependencies, integration, nowMs });
  assert.equal(result.skipped, true);
  assert.equal(test.calls.length, 0, 'The workspace owner must never be removed automatically.');
}

{
  const email = 'permission-expired@example.com';
  const test = createExpiryHarness({ email, permissions: ['accounts:read'] });
  await assert.rejects(
    cleanupExpiredSeatAccess(email, { dependencies: test.dependencies, integration, nowMs }),
    (error) => error.statusCode === 403 && /members:remove/.test(error.message)
  );
  assert.equal(test.calls.length, 0);
}

{
  const email = 'timeout-fence@example.com';
  const scope = { provider: 'chatgpt', accountRef: integration.accountRef, email };
  const test = createExpiryHarness({
    email,
    pollError: { code: 'MEMBER_SERVICE_OPERATION_TIMEOUT', message: 'poll timed out' }
  });
  await assert.rejects(
    cleanupExpiredSeatAccess(email, { dependencies: test.dependencies, integration, nowMs }),
    (error) => error.code === 'MEMBER_SERVICE_OPERATION_TIMEOUT'
  );
  const pendingFence = await getSeatAccessFence(scope, { lockContext: { storage: 'local', client: null } });
  assert.equal(pendingFence.operationId, 'op_expiry_member_0001');
  assert.equal(pendingFence.status, 'uncertain');

  const reconciled = await reconcileSeatAccessFences({
    provider: 'chatgpt',
    accountRef: integration.accountRef,
    emails: [email]
  }, {
    integration,
    lockContext: { storage: 'local', client: null },
    dependencies: {
      createClient() {
        return {
          async pollOperation(operationId) {
            return { operationId, status: 'succeeded', terminal: true, succeeded: true };
          }
        };
      }
    }
  });
  assert.equal(reconciled.ok, true);
  assert.equal(
    await getSeatAccessFence(scope, { lockContext: { storage: 'local', client: null } }),
    null,
    'A terminal cleanup must clear its durable fence before a renewal can continue.'
  );
}

{
  const email = 'submitting-fence@example.com';
  const scope = { provider: 'chatgpt', accountRef: integration.accountRef, email };
  const idempotencyKey = 'seat-guard-recovery-idempotency-0001';
  await putSeatAccessFence(scope, {
    source: 'expiry',
    actionKind: 'member',
    externalRef: 'member-submitting-fence',
    idempotencyKey,
    operationId: null,
    status: 'submitting'
  }, { lockContext: { storage: 'local', client: null } });
  const replayCalls = [];
  const reconciled = await reconcileSeatAccessFences({
    provider: 'chatgpt',
    accountRef: integration.accountRef,
    emails: [email]
  }, {
    integration,
    lockContext: { storage: 'local', client: null },
    dependencies: {
      createClient() {
        return {
          async removeAccountMember(accountRef, memberId, options) {
            replayCalls.push({ accountRef, memberId, options });
            return { operationId: 'op_replayed_cleanup_0001', status: 'queued', terminal: false };
          },
          async pollOperation(operationId) {
            return { operationId, status: 'failed', terminal: true, failed: true };
          }
        };
      }
    }
  });
  assert.equal(reconciled.ok, true, 'A terminal failed cleanup is safe to fence off before inviting again.');
  assert.equal(replayCalls[0].options.idempotencyKey, idempotencyKey);
  assert.equal(await getSeatAccessFence(scope, { lockContext: { storage: 'local', client: null } }), null);
}

{
  const email = 'failed-fence-retry@example.com';
  const scope = { provider: 'chatgpt', accountRef: integration.accountRef, email };
  const oldIdempotencyKey = 'seat-guard-old-failed-generation-0001';
  await putSeatAccessFence(scope, {
    source: 'expiry',
    actionKind: 'member',
    externalRef: `member-${email}`,
    idempotencyKey: oldIdempotencyKey,
    operationId: 'op_previous_failed_0001',
    status: 'failed'
  }, { lockContext: { storage: 'local', client: null } });
  const test = createExpiryHarness({
    email,
    pollOperationOverride(operationId) {
      return operationId === 'op_previous_failed_0001'
        ? { operationId, status: 'failed', terminal: true, failed: true }
        : { operationId, status: 'succeeded', terminal: true, succeeded: true };
    }
  });
  const result = await cleanupExpiredSeatAccess(email, { dependencies: test.dependencies, integration, nowMs });
  assert.equal(result.ok, true);
  assert.equal(test.calls.length, 1);
  assert.notEqual(
    test.calls[0].options.idempotencyKey,
    oldIdempotencyKey,
    'A terminal failed cleanup must retry with a fresh idempotency generation.'
  );
}

{
  const email = 'missing-operation-fence@example.com';
  const scope = { provider: 'chatgpt', accountRef: integration.accountRef, email };
  await putSeatAccessFence(scope, {
    source: 'expiry',
    actionKind: 'member',
    externalRef: `member-${email}`,
    idempotencyKey: 'seat-guard-missing-operation-0001',
    operationId: 'op_missing_cleanup_0001',
    status: 'uncertain'
  }, { lockContext: { storage: 'local', client: null } });
  const reconciled = await reconcileSeatAccessFences({
    provider: 'chatgpt',
    accountRef: integration.accountRef,
    emails: [email]
  }, {
    integration,
    lockContext: { storage: 'local', client: null },
    dependencies: {
      createClient() {
        return {
          async pollOperation() {
            throw Object.assign(new Error('operation no longer retained'), { statusCode: 404 });
          },
          async removeAccountMember() {
            throw new Error('A missing old operation must be cleared and reclassified by the caller, not replayed blindly.');
          }
        };
      }
    }
  });
  assert.equal(reconciled.ok, true);
  assert.equal(reconciled.results[0].status, 'operation_missing');
  assert.equal(await getSeatAccessFence(scope, { lockContext: { storage: 'local', client: null } }), null);
}

{
  const upperScope = { provider: 'CHATGPT', accountRef: 'ACCOUNT-1', email: 'CaseFence@Example.com' };
  await putSeatAccessFence(upperScope, {
    actionKind: 'invitation',
    externalRef: 'casefence@example.com',
    idempotencyKey: 'seat-guard-case-fence-0001',
    status: 'submitting'
  }, { lockContext: { storage: 'local', client: null } });
  const sameFence = await getSeatAccessFence({
    provider: 'chatgpt',
    accountRef: 'account-1',
    email: 'casefence@example.com'
  }, { lockContext: { storage: 'local', client: null } });
  assert.equal(sameFence.externalRef, 'casefence@example.com');
}

{
  const email = 'sweep-expired@example.com';
  const disabledTest = createExpiryHarness({ email });
  const disabled = await sweepExpiredSeatAccess({
    dependencies: disabledTest.dependencies,
    integration: { ...integration, expiryAutoRemove: false },
    nowMs,
    allowNonPostgres: true
  });
  assert.equal(disabled.reason, 'disabled');
  assert.equal(disabledTest.calls.length, 0);

  const previousStorage = {
    driver: config.storage.driver,
    postgresWriteMode: config.storage.postgresWriteMode,
    databaseUrl: config.database.url,
    databasePoolMax: config.database.poolMax
  };
  config.storage.driver = 'json';
  config.storage.postgresWriteMode = 'row';
  try {
    const blocked = await sweepExpiredSeatAccess({
      dependencies: disabledTest.dependencies,
      integration,
      nowMs
    });
    assert.equal(blocked.reason, 'postgres_row_mode_required');
  } finally {
    config.storage.driver = previousStorage.driver;
    config.storage.postgresWriteMode = previousStorage.postgresWriteMode;
  }

  config.storage.driver = 'postgres';
  config.storage.postgresWriteMode = 'row';
  config.database.url = 'postgresql://seat-guard-test.invalid/test';
  config.database.poolMax = 5;
  try {
    const blocked = await sweepExpiredSeatAccess({
      dependencies: disabledTest.dependencies,
      integration,
      nowMs
    });
    assert.equal(blocked.reason, 'database_pool_too_small');
    assert.equal(blocked.requiredDatabasePoolMax, 6);
  } finally {
    config.storage.driver = previousStorage.driver;
    config.storage.postgresWriteMode = previousStorage.postgresWriteMode;
    config.database.url = previousStorage.databaseUrl;
    config.database.poolMax = previousStorage.databasePoolMax;
  }

  const enabledTest = createExpiryHarness({ email });
  const swept = await sweepExpiredSeatAccess({
    dependencies: enabledTest.dependencies,
    integration,
    nowMs,
    allowNonPostgres: true
  });
  assert.equal(swept.ok, true);
  assert.equal(swept.results.length, 1);
  assert.equal(enabledTest.calls.length, 1);
}

{
  let releaseList;
  let listCalls = 0;
  const listGate = new Promise((resolve) => { releaseList = resolve; });
  const dependencies = {
    async listOrders() {
      listCalls += 1;
      if (listCalls === 1) await listGate;
      return { items: [], hasMore: false };
    },
    createClient() {
      return {
        async getIdentity() { return { permissions: ['accounts:read', 'members:remove'] }; },
        async getAccountMembers() {
          return {
            account: { id: integration.accountRef, email: 'owner@example.com', allowedMembers: [] },
            members: [],
            invitations: []
          };
        }
      };
    },
    async withSeatAccessLocks(scope, callback) {
      return { acquired: true, value: await callback() };
    },
    async recordAudit() {}
  };
  const first = sweepExpiredSeatAccess({ dependencies, integration, nowMs, allowNonPostgres: true });
  const second = sweepExpiredSeatAccess({ dependencies, integration, nowMs, allowNonPostgres: true });
  assert.equal(first, second, 'Concurrent expiry sweeps must share one in-flight promise.');
  releaseList();
  await first;
  await sweepExpiredSeatAccess({ dependencies, integration, nowMs, allowNonPostgres: true });
  assert.equal(listCalls, 2, 'A completed sweep must release its single-flight guard.');
}

{
  const email = 'lock-test@example.com';
  let releaseFirst;
  const held = new Promise((resolve) => { releaseFirst = resolve; });
  const first = withSeatAccessLocks(
    { provider: 'chatgpt', accountRef: integration.accountRef, emails: [email] },
    async () => held,
    { forceLocal: true }
  );
  const blocked = await withSeatAccessLocks(
    { provider: 'chatgpt', accountRef: integration.accountRef, emails: [email.toUpperCase()] },
    async () => 'must-not-run',
    { forceLocal: true }
  );
  assert.equal(blocked.acquired, false, 'The same normalized email must not be processed concurrently.');
  const parallel = await withSeatAccessLocks(
    { provider: 'chatgpt', accountRef: integration.accountRef, emails: ['different@example.com'] },
    async () => 'parallel-ok',
    { forceLocal: true }
  );
  assert.deepEqual(parallel, { acquired: true, value: 'parallel-ok' });
  releaseFirst();
  assert.equal((await first).acquired, true);
  const retried = await withSeatAccessLocks(
    { provider: 'chatgpt', accountRef: integration.accountRef, emails: [email] },
    async () => 'retry-ok',
    { forceLocal: true }
  );
  assert.deepEqual(retried, { acquired: true, value: 'retry-ok' });
}

{
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [{ locked: true }] };
    }
  };
  const count = await lockSeatAccessTransaction(client, {
    provider: 'CHATGPT',
    accountRef: 'ACCOUNT-1',
    emails: ['Z@example.com', 'a@example.com', 'z@example.com']
  });
  assert.equal(count, 2);
  assert.ok(queries.every((item) => item.sql.includes('pg_try_advisory_xact_lock')));
  assert.deepEqual(queries.map((item) => item.params[0]), [
    'seat-access:chatgpt:account-1:a@example.com',
    'seat-access:chatgpt:account-1:z@example.com'
  ]);
  await assert.rejects(
    lockSeatAccessTransaction({
      async query() { return { rows: [{ locked: false }] }; }
    }, {
      provider: 'chatgpt',
      accountRef: 'account-1',
      emails: ['busy@example.com']
    }),
    (error) => error.statusCode === 503 && error.code === 'SEAT_ACCESS_BUSY' && error.retryable === true
  );
}

{
  const postgresStoreSource = await readFile(
    new URL('../src/shopStores/postgresShopStore.js', import.meta.url),
    'utf8'
  );
  assert.ok(
    (postgresStoreSource.match(/await lockSeatPaymentTransition\(client, order\)/g) || []).length >= 2,
    'Both webhook payment and manual review approval must lock every provider Seat email before authorization becomes active.'
  );
  assert.ok(postgresStoreSource.includes('integration.accountRefsBySku?.[sku] || integration.accountRef'));
}

console.log(JSON.stringify({
  ok: true,
  checked: 'Seat Guard entitlement, 30-day expiry cleanup, locking, and confirmed removal policy'
}, null, 2));
