import assert from 'node:assert/strict';
import {
  buildSeatEntitlements,
  buildSeatGuardView,
  cancelSeatGuardInvitation,
  getSeatGuardSnapshot,
  removeSeatGuardMember,
  seatTermMonths
} from '../src/seatGuard.js';
import { memberIntegrationTargetFingerprint } from '../src/seatFulfillmentAutomation.js';

const integration = {
  enabled: true,
  serviceUrl: 'http://localhost:3002/api/v1',
  apiKey: 'gsk_test',
  seatGuardApiKey: 'gsk_seat_guard_test',
  accountRef: 'account-1',
  skus: ['chatgpt-business-seat-1m'],
  protectedEmails: ['staff@example.com'],
  defaultSeatTermMonths: 1,
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
assert.equal(entitlementByEmail.get('renew@example.com').expiresAt, '2026-08-01T00:00:00.000Z');

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

const januaryEnd = order('ord_january_end', 'month-end@example.com', 'delivered', '2026-01-31T00:00:00.000Z');
const leapYearEnd = order('ord_leap_end', 'leap@example.com', 'delivered', '2024-01-31T00:00:00.000Z');
const calendarEntitlements = new Map(buildSeatEntitlements([januaryEnd, leapYearEnd], {
  integration,
  nowMs: Date.parse('2024-02-01T00:00:00.000Z')
}).map((entry) => [entry.email, entry]));
assert.equal(calendarEntitlements.get('month-end@example.com').expiresAt, '2026-02-28T00:00:00.000Z');
assert.equal(calendarEntitlements.get('leap@example.com').expiresAt, '2024-02-29T00:00:00.000Z');

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
assert.equal(pagedByEmail.get('duplicate@example.com').expiresAt, '2026-08-01T00:00:00.000Z');
assert.equal(pagedByEmail.get('second@example.com').state, 'pending');

console.log(JSON.stringify({
  ok: true,
  checked: 'Seat Guard entitlement, classification, and confirmed removal policy'
}, null, 2));
