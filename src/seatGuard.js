import { createHash } from 'node:crypto';
import { config } from './config.js';
import { createMemberFulfillmentClient } from './memberFulfillmentClient.js';
import { memberIntegrationTargetFingerprint } from './seatFulfillmentAutomation.js';
import { listOrders } from './shop.js';

const protectedRoles = new Set(['owner', 'admin']);
const ordinaryMemberRoles = new Set(['member', 'standard-user', 'standard_user', 'user']);
const removableClassifications = new Set(['unauthorized', 'expired', 'manual_allowed']);
const activeOrderStatuses = new Set(['awaiting_fulfillment', 'delivered']);
const actionRequestIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;

function normalizedEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function validDate(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : null;
}

function addUtcMonths(timestamp, months) {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
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

  const storedFingerprint = String(order?.fulfillment?.automation?.targetFingerprint || '').trim();
  if (!storedFingerprint) return 'review';
  try {
    return storedFingerprint === memberIntegrationTargetFingerprint('chatgpt', integration)
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
      entitlementEnd = addUtcMonths(start, item.months);
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
  return { listOrders, createClient: createMemberFulfillmentClient };
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
  const [identity, remote, orders] = await Promise.all([
    client.getIdentity(),
    client.getAccountMembers(integration.accountRef),
    listAllOrders(dependencies)
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

export async function removeSeatGuardMember(memberId, input = {}, options = {}) {
  const actionRequestId = requireActionRequestId(input.actionRequestId);
  const context = await loadSeatGuardContext(options);
  if (!context.view.capabilities.canRemove) {
    throw Object.assign(new Error('The member-service API key needs members:remove permission'), { statusCode: 403 });
  }
  const member = context.view.members.find((item) => item.actionRef === String(memberId || '').trim());
  if (!member) throw Object.assign(new Error('The live ChatGPT member was not found'), { statusCode: 404 });
  if (!member.removable || !member.email) {
    throw Object.assign(new Error('This member is protected or still has valid Seat authorization'), { statusCode: 409 });
  }
  if (normalizedEmail(input.expectedEmail) !== member.email) {
    throw Object.assign(new Error('Member email changed; refresh Seat Guard before removing'), { statusCode: 409 });
  }
  if (String(input.confirmation || '') !== expectedConfirmation('REMOVE', member.email)) {
    throw Object.assign(new Error(`Type REMOVE ${member.email} to confirm`), { statusCode: 400 });
  }
  const operation = await context.client.removeAccountMember(context.integration.accountRef, member.id, {
    idempotencyKey: mutationKey(
      'remove',
      context.integration.accountRef,
      member.id,
      member.email,
      member.createdAt,
      actionRequestId
    )
  });
  return { ok: true, operationId: operation.operationId, actionRequestId, operation, member };
}

export async function cancelSeatGuardInvitation(invitationId, input = {}, options = {}) {
  const actionRequestId = requireActionRequestId(input.actionRequestId);
  const context = await loadSeatGuardContext(options);
  if (!context.view.capabilities.canRemove) {
    throw Object.assign(new Error('The member-service API key needs members:remove permission'), { statusCode: 403 });
  }
  const invitation = context.view.invitations.find((item) => item.actionRef === String(invitationId || '').trim());
  if (!invitation) throw Object.assign(new Error('The pending ChatGPT invitation was not found'), { statusCode: 404 });
  if (!invitation.cancelable || !invitation.email) {
    throw Object.assign(new Error('This invitation is protected or still has valid Seat authorization'), { statusCode: 409 });
  }
  if (normalizedEmail(input.expectedEmail) !== invitation.email) {
    throw Object.assign(new Error('Invitation email changed; refresh Seat Guard before cancelling'), { statusCode: 409 });
  }
  if (String(input.confirmation || '') !== expectedConfirmation('CANCEL', invitation.email)) {
    throw Object.assign(new Error(`Type CANCEL ${invitation.email} to confirm`), { statusCode: 400 });
  }
  const operation = await context.client.cancelAccountInvitation(
    context.integration.accountRef,
    invitation.actionRef,
    {
      idempotencyKey: mutationKey(
        'cancel',
        context.integration.accountRef,
        invitation.actionRef,
        invitation.email,
        invitation.createdAt,
        actionRequestId
      )
    }
  );
  return { ok: true, operationId: operation.operationId, actionRequestId, operation, invitation };
}

export async function getSeatGuardOperation(operationId, options = {}) {
  const integration = options.integration || guardConfig();
  const dependencies = { ...defaultDependencies(), ...(options.dependencies || {}) };
  return clientFor(integration, dependencies).getOperation(operationId);
}
