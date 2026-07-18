import { config } from './config.js';
import { createMemberFulfillmentClient } from './memberFulfillmentClient.js';
import { withPostgresClient } from './postgresStore.js';

const localFences = new Map();

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizedScope(scope = {}) {
  const provider = String(scope.provider || '').trim().toLowerCase();
  const accountRef = String(scope.accountRef || '').trim().toLowerCase();
  const email = normalizedEmail(scope.email);
  if (!provider || !accountRef || !email) {
    throw new TypeError('Seat access fence requires provider, accountRef, and email');
  }
  return { provider, accountRef, email };
}

function fenceKey(scope) {
  return [scope.provider, scope.accountRef, scope.email].join('\0');
}

function postgresRowMode() {
  return config.storage.driver === 'postgres'
    && config.storage.postgresWriteMode !== 'document'
    && Boolean(config.database.url);
}

async function withFenceStorage(options, postgresCallback, localCallback) {
  const lockContext = options?.lockContext;
  if (lockContext?.storage === 'postgres' && lockContext.client) {
    return postgresCallback(lockContext.client);
  }
  if (lockContext?.storage === 'local' || !postgresRowMode()) return localCallback();
  return withPostgresClient(postgresCallback);
}

export function seatExpiryStorageStatus(settings = config.memberFulfillment) {
  const concurrency = Math.max(1, Number(settings?.concurrency || 1));
  const requiredPoolMax = (2 * concurrency) + 2;
  const rowMode = config.storage.driver === 'postgres'
    && config.storage.postgresWriteMode !== 'document'
    && Boolean(config.database.url);
  const poolMax = Number(config.database.poolMax || 0);
  return {
    ready: rowMode && poolMax >= requiredPoolMax,
    rowMode,
    poolReady: poolMax >= requiredPoolMax,
    poolMax,
    requiredPoolMax
  };
}

export async function getSeatAccessFence(scopeInput, options = {}) {
  const scope = normalizedScope(scopeInput);
  return withFenceStorage(options, async (client) => {
    const result = await client.query(
      `SELECT fence
       FROM seat_access_fences
       WHERE provider = $1 AND account_ref = $2 AND email = $3`,
      [scope.provider, scope.accountRef, scope.email]
    );
    return result.rows[0]?.fence || null;
  }, async () => localFences.get(fenceKey(scope)) || null);
}

export async function putSeatAccessFence(scopeInput, fenceInput, options = {}) {
  const scope = normalizedScope(scopeInput);
  const fence = {
    ...(fenceInput || {}),
    provider: scope.provider,
    accountRef: scope.accountRef,
    email: scope.email,
    updatedAt: new Date().toISOString()
  };
  return withFenceStorage(options, async (client) => {
    await client.query(
      `INSERT INTO seat_access_fences (provider, account_ref, email, fence, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (provider, account_ref, email)
       DO UPDATE SET fence = EXCLUDED.fence, updated_at = now()`,
      [scope.provider, scope.accountRef, scope.email, JSON.stringify(fence)]
    );
    return fence;
  }, async () => {
    localFences.set(fenceKey(scope), structuredClone(fence));
    return fence;
  });
}

export async function deleteSeatAccessFence(scopeInput, options = {}) {
  const scope = normalizedScope(scopeInput);
  return withFenceStorage(options, async (client) => {
    await client.query(
      `DELETE FROM seat_access_fences
       WHERE provider = $1 AND account_ref = $2 AND email = $3`,
      [scope.provider, scope.accountRef, scope.email]
    );
    return true;
  }, async () => localFences.delete(fenceKey(scope)));
}

export async function deleteSeatAccessFencesByOperationId(operationIdInput, options = {}) {
  const operationId = String(operationIdInput || '').trim();
  if (!operationId) return 0;
  const provider = String(options.provider || '').trim().toLowerCase();
  const accountRef = String(options.accountRef || '').trim().toLowerCase();
  return withFenceStorage(options, async (client) => {
    const scoped = Boolean(provider && accountRef);
    const result = await client.query(scoped
      ? `DELETE FROM seat_access_fences
         WHERE fence->>'operationId' = $1 AND provider = $2 AND account_ref = $3`
      : `DELETE FROM seat_access_fences
         WHERE fence->>'operationId' = $1`,
    scoped ? [operationId, provider, accountRef] : [operationId]);
    return result.rowCount || 0;
  }, async () => {
    let deleted = 0;
    for (const [key, fence] of localFences.entries()) {
      if (String(fence?.operationId || '') !== operationId) continue;
      if (provider && String(fence?.provider || '').trim().toLowerCase() !== provider) continue;
      if (accountRef && String(fence?.accountRef || '').trim().toLowerCase() !== accountRef) continue;
      localFences.delete(key);
      deleted += 1;
    }
    return deleted;
  });
}

function clientForFence(provider, integration, dependencies) {
  return dependencies.createClient({
    provider,
    baseUrl: integration.serviceUrl,
    apiKey: integration.seatGuardApiKey || integration.apiKey,
    requestTimeoutMs: integration.requestTimeoutMs,
    operationTimeoutMs: integration.operationTimeoutMs,
    pollIntervalMs: integration.pollIntervalMs,
    maxResponseBytes: integration.seatGuardMaxResponseBytes || 2 * 1024 * 1024
  });
}

async function submitFenceOperation(client, fence) {
  const input = { idempotencyKey: fence.idempotencyKey };
  return fence.actionKind === 'member'
    ? client.removeAccountMember(fence.accountRef, fence.externalRef, input)
    : client.cancelAccountInvitation(fence.accountRef, fence.externalRef, input);
}

async function submitAndPollFence(client, fenceScope, fence, dependencies, lockContext) {
  let operation = await submitFenceOperation(client, fence);
  await dependencies.putFence(fenceScope, {
    ...fence,
    operationId: operation.operationId,
    status: operation.terminal ? operation.status : 'pending'
  }, { lockContext });
  if (!operation.terminal) operation = await client.pollOperation(operation.operationId);
  return operation;
}

export async function reconcileSeatAccessFences(scopeInput, options = {}) {
  const provider = String(scopeInput?.provider || '').trim().toLowerCase();
  const accountRef = String(scopeInput?.accountRef || '').trim();
  const emails = [...new Set((scopeInput?.emails || []).map(normalizedEmail).filter(Boolean))].sort();
  const dependencies = {
    createClient: createMemberFulfillmentClient,
    getFence: getSeatAccessFence,
    putFence: putSeatAccessFence,
    deleteFence: deleteSeatAccessFence,
    ...(options.dependencies || {})
  };
  let client;
  const results = [];

  for (const email of emails) {
    const fenceScope = { provider, accountRef, email };
    let fence = await dependencies.getFence(fenceScope, { lockContext: options.lockContext });
    if (!fence) continue;
    client ||= clientForFence(provider, options.integration || {}, dependencies);

    try {
      let operation;
      if (fence.operationId) {
        try {
          operation = await client.pollOperation(fence.operationId);
        } catch (error) {
          if (Number(error?.statusCode) !== 404) throw error;
          await dependencies.deleteFence(fenceScope, { lockContext: options.lockContext });
          results.push({ email, operationId: fence.operationId, status: 'operation_missing' });
          continue;
        }
      } else {
        operation = await submitAndPollFence(
          client,
          fenceScope,
          fence,
          dependencies,
          options.lockContext
        );
      }

      if (!operation?.terminal) {
        return { ok: false, reason: 'seat_cleanup_pending', email, operationId: operation?.operationId || fence.operationId };
      }
      await dependencies.deleteFence(fenceScope, { lockContext: options.lockContext });
      results.push({ email, operationId: operation.operationId, status: operation.status });
    } catch (error) {
      await dependencies.putFence(fenceScope, {
        ...fence,
        operationId: error?.operationId || fence.operationId || null,
        status: 'uncertain',
        errorCode: String(error?.code || 'SEAT_CLEANUP_RECONCILE_FAILED').slice(0, 100)
      }, { lockContext: options.lockContext }).catch(() => {});
      return {
        ok: false,
        reason: 'seat_cleanup_pending',
        email,
        operationId: error?.operationId || fence.operationId || null,
        errorCode: String(error?.code || 'SEAT_CLEANUP_RECONCILE_FAILED').slice(0, 100)
      };
    }
  }

  return { ok: true, results };
}
