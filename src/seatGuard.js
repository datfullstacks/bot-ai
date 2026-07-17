import { createHash } from 'node:crypto';
import { config } from './config.js';
import { createMemberFulfillmentClient } from './memberFulfillmentClient.js';
import {
  deleteSeatAccessFence,
  deleteSeatAccessFencesByOperationId,
  getSeatAccessFence,
  putSeatAccessFence,
  reconcileSeatAccessFences,
  seatExpiryStorageStatus
} from './seatAccessFence.js';
import { withSeatAccessLocks } from './seatAccessLock.js';
import {
  memberIntegrationEntitlementFingerprint,
  memberIntegrationTargetFingerprint
} from './seatFulfillmentAutomation.js';
import {
  backfillSeatEntitlementTarget,
  listOrders,
  listSeatOrdersForEmails,
  recordAudit
} from './shop.js';

const protectedRoles = new Set(['owner', 'admin']);
const ordinaryMemberRoles = new Set(['member', 'standard-user', 'standard_user', 'user']);
const removableClassifications = new Set(['unauthorized', 'expired', 'manual_allowed']);
const activeOrderStatuses = new Set(['awaiting_fulfillment', 'delivered']);
const actionRequestIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const seatTermDays = 30;
const dayMs = 24 * 60 * 60_000;
let expirySweepPromise = null;
let entitlementBackfillPromise = null;

function normalizedEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function validDate(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : null;
}

function addSeatTerm(timestamp, months) {
  return timestamp + (months * seatTermDays * dayMs);
}

export function seatTermMonths(order = {}, fallback = 1) {
  const explicit = Number(order.productSnapshot?.seatTermMonths ?? order.seatTermMonths);
  if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 120) return explicit;
  const sku = String(order.productSku || order.sku || '').trim().toLowerCase();
  const skuMatch = sku.match(/(?:^|[-_])(\d{1,3})m(?:$|[-_])/);
  if (skuMatch) return Math.min(120, Math.max(1, Number(skuMatch[1])));
  const packageType = String(order.productSnapshot?.packageType || order.packageType || '');
  const packageMatch = packageType.match(/\b(\d{1,3})\s*(?:m|month|months|tháng)\b/i);
  if (packageMatch) return Math.min(120, Math.max(1, Number(packageMatch[1])));
  return Math.min(120, Math.max(1, Number(fallback) || 1));
}

function chatGptSeatOrderScope(order, integration) {
  if (!activeOrderStatuses.has(String(order?.status || '').trim())) return false;
  const provider = String(
    order?.fulfillment?.automation?.provider
    || order?.automaticFulfillmentProvider
    || ''
  ).trim().toLowerCase();
  if (provider && provider !== 'chatgpt') return false;
  const sku = String(order?.productSku || '').trim().toLowerCase();
  if (!provider && !(Array.isArray(integration?.skus) && integration.skus.includes(sku))) return false;

  const automation = order?.fulfillment?.automation || {};
  const entitlementFingerprint = String(automation.entitlementTargetFingerprint || '').trim();
  const storedFingerprint = String(automation.targetFingerprint || '').trim();
  if (!entitlementFingerprint && !storedFingerprint) return 'review';
  try {
    const currentFingerprint = entitlementFingerprint
      ? memberIntegrationEntitlementFingerprint('chatgpt', integration)
      : memberIntegrationTargetFingerprint('chatgpt', integration);
    return (entitlementFingerprint || storedFingerprint) === currentFingerprint
      ? 'current'
      : 'review';
  } catch {
    return 'review';
  }
}

function recipientEmails(order = {}) {
  return [...new Set((Array.isArray(order.fulfillment?.recipients) ? order.fulfillment.recipients : [])
    .map((recipient) => normalizedEmail(recipient?.email))
    .filter(Boolean))];
}

export function buildSeatEntitlements(orders = [], options = {}) {
  const nowMs = Number(options.nowMs ?? Date.now());
  const defaultTermMonths = Number(options.defaultTermMonths || 1);
  const integration = options.integration || config.memberFulfillment.integrations.chatgpt;
  const grouped = new Map();

  for (const order of orders) {
    const targetScope = chatGptSeatOrderScope(order, integration);
    if (!targetScope) continue;
    for (const email of recipientEmails(order)) {
      const entry = grouped.get(email) || { email, delivered: [], pending: [], targetReview: [] };
      if (targetScope === 'review') {
        entry.targetReview.push(order);
        grouped.set(email, entry);
        continue;
      }
      if (order.status === 'awaiting_fulfillment') {
        entry.pending.push(order);
      } else {
        entry.delivered.push(order);
      }
      grouped.set(email, entry);
    }
  }

  return [...grouped.values()].map((entry) => {
    const delivered = entry.delivered
      .map((order) => ({
        order,
        deliveredAt: validDate(order.deliveredAt || order.fulfillment?.completedAt),
        months: seatTermMonths(order, defaultTermMonths)
      }))
      .sort((left, right) => (left.deliveredAt ?? Number.MAX_SAFE_INTEGER) - (right.deliveredAt ?? Number.MAX_SAFE_INTEGER));
    let entitlementEnd = null;
    let invalidDeliveredDate = false;
    for (const item of delivered) {
      if (item.deliveredAt === null) {
        invalidDeliveredDate = true;
        continue;
      }
      const start = Math.max(item.deliveredAt, entitlementEnd || item.deliveredAt);
      entitlementEnd = addSeatTerm(start, item.months);
    }
    const hasPending = entry.pending.length > 0;
    const state = invalidDeliveredDate
      ? 'review'
      : entitlementEnd !== null && entitlementEnd > nowMs
        ? 'active'
        : hasPending
          ? 'pending'
          : entry.targetReview.length
            ? 'review'
            : entitlementEnd !== null
              ? 'expired'
              : 'pending';
    const allOrders = [...entry.delivered, ...entry.pending, ...entry.targetReview];
    return {
      email: entry.email,
      state,
      expiresAt: entitlementEnd === null ? null : new Date(entitlementEnd).toISOString(),
      orderIds: [...new Set(allOrders.map((order) => String(order.id || '')).filter(Boolean))],
      productNames: [...new Set(allOrders.map((order) => String(order.productName || order.productSku || '')).filter(Boolean))],
      telegramIds: [...new Set(allOrders.map((order) => String(order.telegramId || '')).filter(Boolean))]
    };
  }).sort((left, right) => left.email.localeCompare(right.email));
}

function classificationFor(subject, context) {
  const email = normalizedEmail(subject?.email);
  const role = String(subject?.role || '').trim().toLowerCase();
  if (
    (email && (email === context.ownerEmail || context.protectedEmails.has(email)))
    || protectedRoles.has(role)
    || /(^|[-_\s])(owner|admin)(?:$|[-_\s])/.test(role)
  ) {
    return { classification: 'protected', entitlement: context.entitlements.get(email) || null };
  }
  if (!email) return { classification: 'review', entitlement: null };
  if (context.subjectKind === 'member' && (!role || !ordinaryMemberRoles.has(role))) {
    return { classification: 'review', entitlement: context.entitlements.get(email) || null };
  }
  const entitlement = context.entitlements.get(email) || null;
  if (entitlement?.state === 'active' || entitlement?.state === 'pending') {
    return { classification: 'valid_order', entitlement };
  }
  if (entitlement?.state === 'expired') return { classification: 'expired', entitlement };
  if (entitlement?.state === 'review') return { classification: 'review', entitlement };
  if (context.allowedEmails.has(email)) return { classification: 'manual_allowed', entitlement: null };
  return { classification: 'unauthorized', entitlement: null };
}

function decorateSubject(subject, context, actionKey, subjectKind) {
  const { classification, entitlement } = classificationFor(subject, { ...context, subjectKind });
  const id = String(subject?.id || '').trim();
  const email = normalizedEmail(subject?.email) || null;
  const actionRef = subjectKind === 'invitation' ? (id || email || '') : id;
  const lifecycleEvidence = String(subject?.createdAt || '').trim();
  const policyAllowsAction = removableClassifications.has(classification);
  return {
    id,
    actionRef,
    email,
    name: String(subject?.name || '') || null,
    role: String(subject?.role || '') || null,
    status: String(subject?.status || '') || null,
    createdAt: subject?.createdAt || null,
    classification,
    lifecycleKnown: Boolean(lifecycleEvidence),
    [actionKey]: Boolean(context.canRemove && actionRef && policyAllowsAction),
    expiresAt: entitlement?.expiresAt || null,
    orderIds: entitlement?.orderIds || []
  };
}

export function buildSeatGuardView({ identity = {}, remote = {}, entitlements = [], protectedEmails = [] } = {}) {
  const permissions = Array.isArray(identity.permissions) ? identity.permissions.map(String) : [];
  const canRead = permissions.includes('accounts:read') || permissions.includes('accounts:write');
  const canRemove = permissions.includes('members:remove') || permissions.includes('accounts:write');
  const account = remote.account || {};
  const context = {
    ownerEmail: normalizedEmail(account.email),
    protectedEmails: new Set(protectedEmails.map(normalizedEmail).filter(Boolean)),
    allowedEmails: new Set((account.allowedMembers || []).map(normalizedEmail).filter(Boolean)),
    entitlements: new Map(entitlements.map((entry) => [entry.email, entry])),
    canRemove
  };
  const members = (remote.members || []).map((member) => decorateSubject(member, context, 'removable', 'member'));
  const invitations = (remote.invitations || []).map((invitation) => decorateSubject(invitation, context, 'cancelable', 'invitation'));
  const presentEmails = new Set([...members, ...invitations].map((item) => item.email).filter(Boolean));
  const missingAuthorized = entitlements.filter((entry) => (
    ['active', 'pending'].includes(entry.state) && !presentEmails.has(entry.email)
  ));
  const memberCount = (classification) => members.filter((item) => item.classification === classification).length;
  const invitationCount = (classification) => invitations.filter((item) => item.classification === classification).length;
  return {
    configured: true,
    permissions,
    capabilities: { canRead, canRemove },
    account,
    observedAt: remote.observedAt || null,
    summary: {
      members: members.length,
      pendingInvitations: invitations.length,
      validMembers: memberCount('valid_order'),
      manualAllowedMembers: memberCount('manual_allowed'),
      protectedMembers: memberCount('protected'),
      unauthorizedMembers: memberCount('unauthorized'),
      expiredMembers: memberCount('expired'),
      reviewMembers: memberCount('review'),
      unauthorizedInvitations: invitationCount('unauthorized'),
      expiredInvitations: invitationCount('expired'),
      reviewInvitations: invitationCount('review'),
      missingAuthorized: missingAuthorized.length
    },
    members,
    invitations,
    entitlements,
    missingAuthorized
  };
}

function guardConfig() {
  const integration = config.memberFulfillment.integrations.chatgpt;
  if (
    !integration.enabled
    || !integration.serviceUrl
    || !(integration.seatGuardApiKey || integration.apiKey)
    || !integration.accountRef
  ) {
    throw Object.assign(new Error('ChatGPT Seat Guard is not fully configured'), { statusCode: 503 });
  }
  return integration;
}

function defaultDependencies() {
  return {
    listOrders,
    listSeatOrdersForEmails,
    backfillSeatEntitlementTarget,
    createClient: createMemberFulfillmentClient,
    deleteSeatAccessFence,
    deleteSeatAccessFencesByOperationId,
    getSeatAccessFence,
    putSeatAccessFence,
    reconcileSeatAccessFences,
    recordAudit,
    withSeatAccessLocks
  };
}

async function listAllOrders(dependencies) {
  const items = [];
  const seenIds = new Set();
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    const result = await dependencies.listOrders({ limit: 500, offset });
    for (const order of result.items || []) {
      const id = String(order?.id || '').trim();
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      items.push(order);
    }
    if (!result.hasMore) return items;
    offset += result.items?.length || 0;
    if (!result.items?.length) break;
  }
  throw Object.assign(new Error('Seat order history is too large to reconcile safely'), { statusCode: 503 });
}

function legacyEntitlementBackfillConfigured(integration = {}) {
  return Boolean(
    integration.enabled
    && integration.serviceUrl
    && integration.apiKey
    && integration.accountRef
  );
}

export async function backfillLegacySeatEntitlementTargets(options = {}) {
  const integration = options.integration || config.memberFulfillment.integrations.chatgpt;
  if (!legacyEntitlementBackfillConfigured(integration)) {
    return { skipped: true, reason: 'not_configured', checked: 0, updated: 0 };
  }

  const dependencies = { ...defaultDependencies(), ...(options.dependencies || {}) };
  const expectedTargetFingerprint = memberIntegrationTargetFingerprint('chatgpt', integration);
  const entitlementTargetFingerprint = memberIntegrationEntitlementFingerprint('chatgpt', integration);
  const orders = options.orders || await listAllOrders(dependencies);
  const candidates = orders.filter((order) => {
    const automation = order?.fulfillment?.automation || {};
    return Boolean(
      order?.id
      && order.status === 'delivered'
      && automation.status === 'succeeded'
      && !automation.entitlementTargetFingerprint
      && automation.targetFingerprint === expectedTargetFingerprint
      && chatGptSeatOrderScope(order, integration) === 'current'
    );
  });

  let updated = 0;
  for (const order of candidates) {
    const result = await dependencies.backfillSeatEntitlementTarget(
      'seat-entitlement-backfill',
      order.id,
      { expectedTargetFingerprint, entitlementTargetFingerprint }
    );
    if (result?.updated) updated += 1;
  }
  return { ok: true, checked: orders.length, candidates: candidates.length, updated };
}

export function startSeatEntitlementTargetBackfill(options = {}) {
  const integration = options.integration || config.memberFulfillment.integrations.chatgpt;
  if (!legacyEntitlementBackfillConfigured(integration)) return null;
  const intervalMs = Math.max(60_000, Number(options.intervalMs || 24 * 60 * 60_000));
  const run = () => {
    if (entitlementBackfillPromise) return entitlementBackfillPromise;
    const tracked = backfillLegacySeatEntitlementTargets(options)
      .then((result) => {
        if (result.updated) {
          console.log(`[seat-guard] backfilled ${result.updated} legacy Seat entitlement target(s)`);
        }
        return result;
      })
      .catch((error) => {
        console.error('[seat-guard] entitlement backfill failed:', String(error?.message || error).slice(0, 300));
      })
      .finally(() => {
        if (entitlementBackfillPromise === tracked) entitlementBackfillPromise = null;
      });
    entitlementBackfillPromise = tracked;
    return tracked;
  };
  setImmediate(run);
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

function clientFor(integration, dependencies) {
  return dependencies.createClient({
    provider: 'chatgpt',
    baseUrl: integration.serviceUrl,
    apiKey: integration.seatGuardApiKey || integration.apiKey,
    requestTimeoutMs: integration.requestTimeoutMs,
    operationTimeoutMs: integration.operationTimeoutMs,
    pollIntervalMs: integration.pollIntervalMs,
    maxResponseBytes: integration.seatGuardMaxResponseBytes || 2 * 1024 * 1024
  });
}

async function loadSeatGuardContext(options = {}) {
  const integration = options.integration || guardConfig();
  const dependencies = { ...defaultDependencies(), ...(options.dependencies || {}) };
  const client = clientFor(integration, dependencies);
  const entitlementEmails = (options.entitlementEmails || []).map(normalizedEmail).filter(Boolean);
  const [identity, remote, orders] = await Promise.all([
    client.getIdentity(),
    client.getAccountMembers(integration.accountRef),
    entitlementEmails.length
      ? dependencies.listSeatOrdersForEmails(entitlementEmails)
      : listAllOrders(dependencies)
  ]);
  const entitlements = buildSeatEntitlements(orders, {
    integration,
    defaultTermMonths: integration.defaultSeatTermMonths,
    nowMs: options.nowMs
  });
  const view = buildSeatGuardView({
    identity,
    remote,
    entitlements,
    protectedEmails: integration.protectedEmails || []
  });
  const storage = seatExpiryStorageStatus();
  view.expiryAutomation = {
    enabled: Boolean(integration.expiryAutoRemove),
    storageReady: storage.ready,
    storageReason: storage.rowMode ? (storage.poolReady ? null : 'database_pool_too_small') : 'postgres_row_mode_required',
    databasePoolMax: storage.poolMax,
    requiredDatabasePoolMax: storage.requiredPoolMax,
    termDays: seatTermDays,
    sweepMs: Number(integration.expirySweepMs || 15 * 60_000),
    batchSize: Number(integration.expiryBatchSize || 10),
    graceMs: Number(integration.expiryGraceMs || 0)
  };
  return { integration, client, view };
}

export async function getSeatGuardSnapshot(options = {}) {
  return (await loadSeatGuardContext(options)).view;
}

function mutationKey(action, accountRef, externalId, email, generationEvidence, actionRequestId) {
  const digest = createHash('sha256')
    .update([action, accountRef, externalId, email, generationEvidence, actionRequestId].join('\0'), 'utf8')
    .digest('hex')
    .slice(0, 40);
  return `seat-guard-${action}-${digest}`;
}

function requireActionRequestId(value) {
  const actionRequestId = String(value || '').trim();
  if (!actionRequestIdPattern.test(actionRequestId)) {
    throw Object.assign(new Error('A valid Seat Guard actionRequestId is required'), { statusCode: 400 });
  }
  return actionRequestId;
}

function expectedConfirmation(action, email) {
  return `${action} ${email}`;
}

function fenceScope(integration, email) {
  return { provider: 'chatgpt', accountRef: integration.accountRef, email };
}

function fenceDependencies(dependencies) {
  return {
    createClient: dependencies.createClient,
    getFence: dependencies.getSeatAccessFence,
    putFence: dependencies.putSeatAccessFence,
    deleteFence: dependencies.deleteSeatAccessFence
  };
}

async function reconcileGuardFence(email, integration, dependencies, lockContext) {
  return dependencies.reconcileSeatAccessFences({
    provider: 'chatgpt',
    accountRef: integration.accountRef,
    emails: [email]
  }, {
    integration,
    lockContext,
    dependencies: fenceDependencies(dependencies)
  });
}

async function saveSubmittedFence(scope, fence, operation, dependencies, lockContext) {
  if (operation?.terminal) {
    await dependencies.deleteSeatAccessFence(scope, { lockContext });
    return;
  }
  await dependencies.putSeatAccessFence(scope, {
    ...fence,
    operationId: operation?.operationId || null,
    status: 'pending'
  }, { lockContext });
}

async function submitFencedMutation(scope, fence, submit, dependencies, lockContext) {
  let operation;
  try {
    operation = await submit();
    await saveSubmittedFence(scope, fence, operation, dependencies, lockContext);
    return operation;
  } catch (error) {
    const operationId = error?.operationId || operation?.operationId || null;
    if (operationId || error?.submissionMayHaveBeenAccepted === true || operation) {
      await dependencies.putSeatAccessFence(scope, {
        ...fence,
        operationId,
        status: 'uncertain',
        errorCode: String(error?.code || 'SEAT_CLEANUP_SUBMISSION_UNCERTAIN').slice(0, 100)
      }, { lockContext }).catch(() => {});
    } else {
      await dependencies.deleteSeatAccessFence(scope, { lockContext }).catch(() => {});
    }
    if (operationId && error && typeof error === 'object' && !error.operationId) error.operationId = operationId;
    throw error;
  }
}

export async function removeSeatGuardMember(memberId, input = {}, options = {}) {
  const actionRequestId = requireActionRequestId(input.actionRequestId);
  const integration = options.integration || guardConfig();
  const dependencies = { ...defaultDependencies(), ...(options.dependencies || {}) };
  const expectedEmail = normalizedEmail(input.expectedEmail);
  if (!expectedEmail) throw Object.assign(new Error('A valid member email is required'), { statusCode: 400 });

  const locked = await dependencies.withSeatAccessLocks({
    provider: 'chatgpt',
    accountRef: integration.accountRef,
    emails: [expectedEmail]
  }, async (lockContext) => {
    const reconciled = await reconcileGuardFence(expectedEmail, integration, dependencies, lockContext);
    if (!reconciled.ok) {
      throw Object.assign(new Error('A previous Seat removal is still pending'), {
        statusCode: 409,
        code: 'SEAT_CLEANUP_PENDING',
        operationId: reconciled.operationId
      });
    }

    const context = await loadSeatGuardContext({
      ...options,
      integration,
      dependencies,
      entitlementEmails: [expectedEmail]
    });
    if (!context.view.capabilities.canRemove) {
      throw Object.assign(new Error('The member-service API key needs members:remove permission'), { statusCode: 403 });
    }
    const member = context.view.members.find((item) => item.actionRef === String(memberId || '').trim());
    if (!member) throw Object.assign(new Error('The live ChatGPT member was not found'), { statusCode: 404 });
    if (!member.removable || !member.email) {
      throw Object.assign(new Error('This member is protected or still has valid Seat authorization'), { statusCode: 409 });
    }
    if (expectedEmail !== member.email) {
      throw Object.assign(new Error('Member email changed; refresh Seat Guard before removing'), { statusCode: 409 });
    }
    if (String(input.confirmation || '') !== expectedConfirmation('REMOVE', member.email)) {
      throw Object.assign(new Error(`Type REMOVE ${member.email} to confirm`), { statusCode: 400 });
    }
    const idempotencyKey = mutationKey(
      'remove',
      context.integration.accountRef,
      member.id,
      member.email,
      member.createdAt,
      actionRequestId
    );
    const scope = fenceScope(context.integration, member.email);
    const fence = {
      source: 'manual',
      actionKind: 'member',
      externalRef: member.id,
      idempotencyKey,
      operationId: null,
      status: 'submitting',
      createdAt: new Date().toISOString()
    };
    await dependencies.putSeatAccessFence(scope, fence, { lockContext });
    const operation = await submitFencedMutation(
      scope,
      fence,
      () => context.client.removeAccountMember(context.integration.accountRef, member.id, { idempotencyKey }),
      dependencies,
      lockContext
    );
    return { ok: true, operationId: operation.operationId, actionRequestId, operation, member };
  });
  if (!locked.acquired) {
    throw Object.assign(new Error('This Seat email is already being changed'), { statusCode: 409, code: 'SEAT_ACCESS_BUSY' });
  }
  return locked.value;
}

export async function cancelSeatGuardInvitation(invitationId, input = {}, options = {}) {
  const actionRequestId = requireActionRequestId(input.actionRequestId);
  const integration = options.integration || guardConfig();
  const dependencies = { ...defaultDependencies(), ...(options.dependencies || {}) };
  const expectedEmail = normalizedEmail(input.expectedEmail);
  if (!expectedEmail) throw Object.assign(new Error('A valid invitation email is required'), { statusCode: 400 });

  const locked = await dependencies.withSeatAccessLocks({
    provider: 'chatgpt',
    accountRef: integration.accountRef,
    emails: [expectedEmail]
  }, async (lockContext) => {
    const reconciled = await reconcileGuardFence(expectedEmail, integration, dependencies, lockContext);
    if (!reconciled.ok) {
      throw Object.assign(new Error('A previous Seat removal is still pending'), {
        statusCode: 409,
        code: 'SEAT_CLEANUP_PENDING',
        operationId: reconciled.operationId
      });
    }

    const context = await loadSeatGuardContext({
      ...options,
      integration,
      dependencies,
      entitlementEmails: [expectedEmail]
    });
    if (!context.view.capabilities.canRemove) {
      throw Object.assign(new Error('The member-service API key needs members:remove permission'), { statusCode: 403 });
    }
    const invitation = context.view.invitations.find((item) => item.actionRef === String(invitationId || '').trim());
    if (!invitation) throw Object.assign(new Error('The pending ChatGPT invitation was not found'), { statusCode: 404 });
    if (!invitation.cancelable || !invitation.email) {
      throw Object.assign(new Error('This invitation is protected or still has valid Seat authorization'), { statusCode: 409 });
    }
    if (expectedEmail !== invitation.email) {
      throw Object.assign(new Error('Invitation email changed; refresh Seat Guard before cancelling'), { statusCode: 409 });
    }
    if (String(input.confirmation || '') !== expectedConfirmation('CANCEL', invitation.email)) {
      throw Object.assign(new Error(`Type CANCEL ${invitation.email} to confirm`), { statusCode: 400 });
    }
    const idempotencyKey = mutationKey(
      'cancel',
      context.integration.accountRef,
      invitation.actionRef,
      invitation.email,
      invitation.createdAt,
      actionRequestId
    );
    const scope = fenceScope(context.integration, invitation.email);
    const fence = {
      source: 'manual',
      actionKind: 'invitation',
      externalRef: invitation.actionRef,
      idempotencyKey,
      operationId: null,
      status: 'submitting',
      createdAt: new Date().toISOString()
    };
    await dependencies.putSeatAccessFence(scope, fence, { lockContext });
    const operation = await submitFencedMutation(
      scope,
      fence,
      () => context.client.cancelAccountInvitation(
        context.integration.accountRef,
        invitation.actionRef,
        { idempotencyKey }
      ),
      dependencies,
      lockContext
    );
    return { ok: true, operationId: operation.operationId, actionRequestId, operation, invitation };
  });
  if (!locked.acquired) {
    throw Object.assign(new Error('This Seat email is already being changed'), { statusCode: 409, code: 'SEAT_ACCESS_BUSY' });
  }
  return locked.value;
}

function automaticExpiryCandidate(view, integration, email, nowMs) {
  const normalized = normalizedEmail(email);
  const entitlement = view.entitlements.find((item) => item.email === normalized);
  const expiresAtMs = validDate(entitlement?.expiresAt);
  const graceMs = Math.max(0, Number(integration.expiryGraceMs || 0));
  if (
    !normalized
    || entitlement?.state !== 'expired'
    || expiresAtMs === null
    || expiresAtMs + graceMs > nowMs
  ) return null;

  const ownerEmail = normalizedEmail(view.account?.email);
  const protectedEmails = new Set((integration.protectedEmails || []).map(normalizedEmail).filter(Boolean));
  if (normalized === ownerEmail || protectedEmails.has(normalized)) return null;

  const member = view.members.find((item) => item.email === normalized);
  if (member) {
    return member.classification === 'expired' && member.removable
      ? { kind: 'member', reference: member.actionRef, subject: member, entitlement }
      : null;
  }
  const invitation = view.invitations.find((item) => item.email === normalized);
  if (invitation) {
    return invitation.classification === 'expired' && invitation.cancelable
      ? { kind: 'invitation', reference: invitation.actionRef, subject: invitation, entitlement }
      : null;
  }
  const allowed = new Set((view.account?.allowedMembers || []).map(normalizedEmail).filter(Boolean));
  return allowed.has(normalized)
    ? { kind: 'allowlist', reference: normalized, subject: null, entitlement }
    : null;
}

async function safeExpiryAudit(dependencies, action, email, details = {}) {
  try {
    await dependencies.recordAudit('seat-expiry', action, 'chatgpt_seat', email, details);
  } catch (error) {
    console.error('[seat-expiry] audit failed:', String(error?.message || error).slice(0, 300));
  }
}

function assertExpiryOperationSucceeded(operation) {
  if (operation?.succeeded || operation?.status === 'succeeded') return;
  const error = Object.assign(new Error('Seat expiry cleanup operation did not succeed'), {
    code: operation?.error?.code || 'SEAT_EXPIRY_OPERATION_FAILED',
    operationId: operation?.operationId
  });
  throw error;
}

async function verifyExpiryCleanup(client, accountRef, email) {
  const remote = await client.getAccountMembers(accountRef);
  const allowed = new Set((remote.account?.allowedMembers || []).map(normalizedEmail).filter(Boolean));
  const liveMember = (remote.members || []).some((item) => normalizedEmail(item?.email) === email);
  const liveInvitation = (remote.invitations || []).some((item) => normalizedEmail(item?.email) === email);
  if (allowed.has(email) || liveMember || liveInvitation) {
    throw Object.assign(new Error('Expired Seat cleanup is not yet visible in the live workspace'), {
      code: 'SEAT_EXPIRY_VERIFICATION_PENDING'
    });
  }
  return remote;
}

function seatEmailStillPresent(view, email) {
  return (view.members || []).some((item) => item.email === email)
    || (view.invitations || []).some((item) => item.email === email)
    || (view.account?.allowedMembers || []).some((item) => normalizedEmail(item) === email);
}

async function executeExpiryCandidate(candidate, context, options) {
  const {
    dependencies,
    integration,
    lockContext,
    normalized,
    nowMs,
    retryGeneration
  } = options;
  const action = candidate.kind === 'member' ? 'expire-member' : 'expire-invitation';
  const idempotencyKey = mutationKey(
    action,
    integration.accountRef,
    candidate.reference,
    normalized,
    candidate.entitlement.expiresAt,
    retryGeneration
  );
  const scope = fenceScope(integration, normalized);
  const fence = {
    source: 'expiry',
    actionKind: candidate.kind === 'member' ? 'member' : 'invitation',
    externalRef: candidate.reference,
    idempotencyKey,
    entitlementExpiresAt: candidate.entitlement.expiresAt,
    orderIds: candidate.entitlement.orderIds,
    operationId: null,
    status: 'submitting',
    createdAt: new Date(nowMs).toISOString()
  };
  await dependencies.putSeatAccessFence(scope, fence, { lockContext });

  let submitted;
  let operation;
  let terminalOutcomeKnown = false;
  try {
    submitted = await submitFencedMutation(
      scope,
      fence,
      () => candidate.kind === 'member'
        ? context.client.removeAccountMember(integration.accountRef, candidate.reference, { idempotencyKey })
        : context.client.cancelAccountInvitation(integration.accountRef, candidate.reference, { idempotencyKey }),
      dependencies,
      lockContext
    );
    operation = submitted.terminal
      ? submitted
      : await context.client.pollOperation(submitted.operationId);
    terminalOutcomeKnown = Boolean(operation?.terminal);
    if (terminalOutcomeKnown) {
      if (operation?.succeeded || operation?.status === 'succeeded') {
        await dependencies.deleteSeatAccessFence(scope, { lockContext });
      } else {
        await dependencies.putSeatAccessFence(scope, {
          ...fence,
          operationId: operation?.operationId || submitted.operationId || null,
          status: operation?.status || 'failed',
          errorCode: String(operation?.error?.code || 'SEAT_EXPIRY_OPERATION_FAILED').slice(0, 100)
        }, { lockContext });
      }
    }
    assertExpiryOperationSucceeded(operation);
  } catch (error) {
    if (error && typeof error === 'object' && !error.operationId) {
      error.operationId = submitted?.operationId;
    }
    if (submitted && !terminalOutcomeKnown && !submitted.terminal) {
      await dependencies.putSeatAccessFence(scope, {
        ...fence,
        operationId: error?.operationId || null,
        status: 'uncertain',
        errorCode: String(error?.code || 'SEAT_EXPIRY_CLEANUP_UNCERTAIN').slice(0, 100)
      }, { lockContext }).catch(() => {});
    }
    throw error;
  }
  return {
    ok: true,
    email: normalized,
    kind: candidate.kind,
    expiresAt: candidate.entitlement.expiresAt,
    orderIds: candidate.entitlement.orderIds,
    submittedOperationId: submitted.operationId,
    operation
  };
}

export async function cleanupExpiredSeatAccess(email, options = {}) {
  const integration = options.integration || guardConfig();
  const dependencies = { ...defaultDependencies(), ...(options.dependencies || {}) };
  const nowMs = Number(options.nowMs ?? Date.now());
  const normalized = normalizedEmail(email);
  if (!normalized) throw Object.assign(new Error('A valid Seat email is required'), { statusCode: 400 });

  const locked = await dependencies.withSeatAccessLocks({
    provider: 'chatgpt',
    accountRef: integration.accountRef,
    emails: [normalized]
  }, async (lockContext) => {
    const reconciled = await reconcileGuardFence(normalized, integration, dependencies, lockContext);
    if (!reconciled.ok) {
      return {
        skipped: true,
        reason: 'seat_cleanup_pending',
        email: normalized,
        operationId: reconciled.operationId || null
      };
    }

    let context = await loadSeatGuardContext({
      integration,
      dependencies,
      nowMs,
      entitlementEmails: [normalized]
    });
    if (!context.view.capabilities.canRemove) {
      throw Object.assign(new Error('The Seat expiry key needs members:remove permission'), { statusCode: 403 });
    }
    const retryWindowMs = Math.max(15 * 60_000, Number(integration.expiryRetryWindowMs || 15 * 60_000));
    const previousFailure = reconciled.results?.find((item) => (
      item.email === normalized && !['succeeded', 'already_absent'].includes(String(item.status || ''))
    ));
    const retryGeneration = previousFailure?.operationId
      ? `after-${previousFailure.operationId}`
      : `window-${Math.floor(nowMs / retryWindowMs)}`;
    let completedResult = null;
    for (let pass = 0; pass < 3; pass += 1) {
      const candidate = automaticExpiryCandidate(context.view, integration, normalized, nowMs);
      if (!candidate) {
        if (completedResult && !seatEmailStillPresent(context.view, normalized)) return completedResult;
        return { skipped: true, reason: 'no_longer_expired_or_eligible', email: normalized };
      }

      completedResult = await executeExpiryCandidate(candidate, context, {
        dependencies,
        integration,
        lockContext,
        normalized,
        nowMs,
        retryGeneration: `${retryGeneration}-pass-${pass}`
      });
      try {
        await verifyExpiryCleanup(context.client, integration.accountRef, normalized);
        return completedResult;
      } catch (error) {
        if (error?.code !== 'SEAT_EXPIRY_VERIFICATION_PENDING' || pass === 2) throw error;
        context = await loadSeatGuardContext({
          integration,
          dependencies,
          nowMs,
          entitlementEmails: [normalized]
        });
      }
    }
    return completedResult;
  });

  if (!locked.acquired) return { skipped: true, reason: 'seat_access_busy', email: normalized };
  const result = locked.value;
  if (result?.ok) {
    const details = {
      kind: result.kind,
      expiresAt: result.expiresAt,
      orderIds: result.orderIds,
      operationId: result.operation?.operationId || result.submittedOperationId
    };
    await safeExpiryAudit(dependencies, 'seat_guard.expiry_cleanup_succeeded', normalized, details);
  }
  return result;
}

async function runExpiredSeatSweep(options = {}) {
  const integration = options.integration || config.memberFulfillment.integrations.chatgpt;
  if (!integration.expiryAutoRemove) return { skipped: true, reason: 'disabled', results: [] };
  const storage = seatExpiryStorageStatus();
  if (!storage.ready && options.allowNonPostgres !== true) {
    return {
      skipped: true,
      reason: storage.rowMode ? 'database_pool_too_small' : 'postgres_row_mode_required',
      requiredDatabasePoolMax: storage.requiredPoolMax,
      results: []
    };
  }

  const dependencies = { ...defaultDependencies(), ...(options.dependencies || {}) };
  const nowMs = Number(options.nowMs ?? Date.now());
  const context = await loadSeatGuardContext({ integration, dependencies, nowMs });
  if (!context.view.capabilities.canRemove) {
    return { skipped: true, reason: 'members_remove_permission_required', results: [] };
  }
  const batchSize = Math.max(1, Math.min(100, Number(integration.expiryBatchSize || 10)));
  const emails = context.view.entitlements
    .map((entitlement) => automaticExpiryCandidate(context.view, integration, entitlement.email, nowMs))
    .filter(Boolean)
    .sort((left, right) => String(left.entitlement.expiresAt).localeCompare(String(right.entitlement.expiresAt)))
    .slice(0, batchSize)
    .map((candidate) => candidate.entitlement.email);

  const results = [];
  for (const candidateEmail of emails) {
    try {
      results.push(await cleanupExpiredSeatAccess(candidateEmail, {
        integration,
        dependencies,
        nowMs
      }));
    } catch (error) {
      await safeExpiryAudit(dependencies, 'seat_guard.expiry_cleanup_failed', candidateEmail, {
        code: String(error?.code || 'SEAT_EXPIRY_CLEANUP_FAILED').slice(0, 100),
        operationId: error?.operationId || null
      });
      results.push({
        ok: false,
        email: candidateEmail,
        code: error?.code || 'SEAT_EXPIRY_CLEANUP_FAILED'
      });
    }
  }
  return { ok: results.every((item) => item.ok !== false), results };
}

export function sweepExpiredSeatAccess(options = {}) {
  if (expirySweepPromise) return expirySweepPromise;
  const tracked = runExpiredSeatSweep(options).finally(() => {
    if (expirySweepPromise === tracked) expirySweepPromise = null;
  });
  expirySweepPromise = tracked;
  return tracked;
}

export function startSeatExpiryAutomation(options = {}) {
  const integration = options.integration || config.memberFulfillment.integrations.chatgpt;
  if (!integration.expiryAutoRemove) return null;
  if (!seatExpiryStorageStatus().ready && options.allowNonPostgres !== true) return null;
  const intervalMs = Math.max(60_000, Number(integration.expirySweepMs || 15 * 60_000));
  const run = () => sweepExpiredSeatAccess(options).catch((error) => {
    console.error('[seat-expiry] sweep failed:', String(error?.message || error).slice(0, 300));
  });
  setImmediate(run);
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

export async function getSeatGuardOperation(operationId, options = {}) {
  const integration = options.integration || guardConfig();
  const dependencies = { ...defaultDependencies(), ...(options.dependencies || {}) };
  const operation = await clientFor(integration, dependencies).getOperation(operationId);
  if (operation?.terminal) {
    try {
      await dependencies.deleteSeatAccessFencesByOperationId(operation.operationId, {
        provider: 'chatgpt',
        accountRef: integration.accountRef
      });
    } catch (error) {
      console.error('[seat-guard] terminal fence cleanup failed:', String(error?.message || error).slice(0, 300));
    }
  }
  return operation;
}
