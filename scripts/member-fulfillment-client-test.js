import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  MemberFulfillmentClientError,
  buildMemberFulfillmentRequest,
  createMemberFulfillmentClient,
  createMemberFulfillmentIdempotencyKey,
  isTerminalMemberOperationStatus,
  normalizeMemberServiceBaseUrl,
  parseMemberOperationEnvelope
} from '../src/memberFulfillmentClient.js';

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function withServer(handler, callback) {
  const server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 'TEST_HANDLER_FAILED', detail: error.message }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers
  });
  res.end(payload);
}

function operation(id, status, extras = {}) {
  return {
    operationId: id,
    type: 'invite_members',
    status,
    progress: { completed: status === 'succeeded' ? 1 : 0, total: 1, message: status },
    attempts: 1,
    ...extras
  };
}

assert.equal(
  normalizeMemberServiceBaseUrl('https://members.example.test/'),
  'https://members.example.test/api/v1'
);
assert.equal(
  normalizeMemberServiceBaseUrl('https://members.example.test/custom/api/v1/'),
  'https://members.example.test/custom/api/v1'
);
assert.throws(
  () => normalizeMemberServiceBaseUrl('https://user:pass@members.example.test'),
  /without embedded credentials/
);
assert.throws(
  () => normalizeMemberServiceBaseUrl('http://members.example.test/api/v1'),
  /HTTPS, Railway private HTTP, or loopback HTTP/
);
assert.equal(
  normalizeMemberServiceBaseUrl('http://gpt-member-service.railway.internal:3002'),
  'http://gpt-member-service.railway.internal:3002/api/v1'
);

const firstKey = createMemberFulfillmentIdempotencyKey({ id: 'ord_123' }, 'chatgpt');
assert.equal(firstKey, createMemberFulfillmentIdempotencyKey('ord_123', 'chatgpt'));
assert.notEqual(firstKey, createMemberFulfillmentIdempotencyKey('ord_123', 'canva'));
assert.notEqual(firstKey, createMemberFulfillmentIdempotencyKey('ord_123', 'chatgpt', 1));
assert.match(firstKey, /^[A-Za-z0-9._:-]{8,128}$/);
assert.ok(!firstKey.includes('ord_123'), 'Idempotency keys must not expose order ids.');

assert.deepEqual(
  buildMemberFulfillmentRequest('chatgpt', {
    mode: 'allocation',
    emails: [' A@Example.com ', 'a@example.com', 'b@example.com'],
    accountRefs: ['admin-a', 'admin-b']
  }),
  {
    method: 'POST',
    path: '/member-allocations',
    body: {
      emails: ['a@example.com', 'b@example.com'],
      adminAccountIds: ['admin-a', 'admin-b']
    },
    emails: ['a@example.com', 'b@example.com']
  }
);
assert.deepEqual(
  buildMemberFulfillmentRequest('canva', {
    mode: 'allocation',
    emails: ['canva@example.com'],
    accountRefs: ['canva-team']
  }).body,
  { emails: ['canva@example.com'], accountRefs: ['canva-team'] }
);

const parsedChatGpt = parseMemberOperationEnvelope('chatgpt', {
  data: operation('op_chatgpt_parse', 'queued'),
  meta: { replayed: true }
});
assert.equal(parsedChatGpt.operationId, 'op_chatgpt_parse');
assert.equal(parsedChatGpt.replayed, true);
assert.equal(parsedChatGpt.terminal, false);
const parsedCanva = parseMemberOperationEnvelope('canva', {
  operation: operation('op_canva_parse', 'partially_succeeded'),
  replayed: false
});
assert.equal(parsedCanva.partiallySucceeded, true);
assert.equal(parsedCanva.terminal, true);
assert.equal(isTerminalMemberOperationStatus('failed'), true);
assert.equal(isTerminalMemberOperationStatus('running'), false);
assert.throws(
  () => parseMemberOperationEnvelope('canva', { data: operation('wrong_envelope', 'queued') }),
  (error) => error.code === 'MEMBER_SERVICE_MALFORMED_RESPONSE'
);

await withServer(async (req, res) => {
  globalThis.__gptRequests ||= [];
  const body = req.method === 'POST' ? await readJson(req) : undefined;
  globalThis.__gptRequests.push({
    method: req.method,
    url: req.url,
    apiKey: req.headers['x-api-key'],
    idempotencyKey: req.headers['idempotency-key'],
    body
  });
  const postCount = globalThis.__gptRequests.filter((item) => item.method === 'POST').length;
  const getCount = globalThis.__gptRequests.filter((item) => item.method === 'GET').length;
  if (req.method === 'POST' && postCount === 1) {
    sendJson(res, 503, {
      code: 'WORKER_UNAVAILABLE',
      detail: 'secret-gsk-test and buyer@example.com must never enter a client error',
      retryable: true
    }, { 'retry-after': '0' });
    return;
  }
  if (req.method === 'POST') {
    sendJson(res, 202, {
      data: operation('op_chatgpt_live', 'queued'),
      meta: { replayed: true }
    });
    return;
  }
  sendJson(res, 200, {
    data: getCount === 1
      ? operation('op_chatgpt_live', 'running')
      : operation('op_chatgpt_live', 'succeeded', {
        result: { invited: ['buyer@example.com'], duplicates: [] }
      }),
    meta: { replayed: false }
  });
}, async (baseUrl) => {
  globalThis.__gptRequests = [];
  const client = createMemberFulfillmentClient({
    provider: 'chatgpt',
    baseUrl,
    apiKey: 'secret-gsk-test',
    requestTimeoutMs: 500,
    pollIntervalMs: 0,
    retryDelayMs: 0,
    maxSubmitAttempts: 2,
    maxPollAttempts: 5
  });
  const result = await client.submitAndPoll({
    order: { id: 'ord_chatgpt_live' },
    emails: ['Buyer@Example.com'],
    accountRef: 'admin@example.com'
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.operationId, 'op_chatgpt_live');
  assert.equal(result.replayed, true);
  assert.equal(result.pollAttempts, 2);
  assert.deepEqual(result.result.invited, ['buyer@example.com']);

  const posts = globalThis.__gptRequests.filter((item) => item.method === 'POST');
  assert.equal(posts.length, 2, 'A retryable submit should be retried within its bound.');
  assert.equal(posts[0].idempotencyKey, posts[1].idempotencyKey, 'Submit retries must reuse one key.');
  assert.equal(posts[0].apiKey, 'secret-gsk-test');
  assert.equal(posts[0].url, '/api/v1/admin-accounts/admin%40example.com/invitations');
  assert.deepEqual(posts[0].body, { emails: ['buyer@example.com'] });
  assert.equal(globalThis.__gptRequests.filter((item) => item.method === 'GET').length, 2);
  delete globalThis.__gptRequests;
});

await withServer(async (req, res) => {
  globalThis.__canvaRequests ||= [];
  const body = req.method === 'POST' ? await readJson(req) : undefined;
  globalThis.__canvaRequests.push({
    method: req.method,
    url: req.url,
    apiKey: req.headers['x-api-key'],
    idempotencyKey: req.headers['idempotency-key'],
    body
  });
  if (req.method === 'POST') {
    sendJson(res, 200, {
      operation: operation('op_canva_live', 'queued'),
      replayed: true
    });
    return;
  }
  sendJson(res, 200, {
    operation: operation('op_canva_live', 'partially_succeeded', {
      result: {
        invited: [{ email: 'canva-one@example.com', accountId: 'team-a' }],
        duplicates: [],
        notAllocated: ['canva-two@example.com']
      }
    })
  });
}, async (baseUrl) => {
  globalThis.__canvaRequests = [];
  const client = createMemberFulfillmentClient({
    provider: 'canva',
    baseUrl: `${baseUrl}/api/v1`,
    apiKey: 'canva-gsk-test',
    requestTimeoutMs: 500,
    pollIntervalMs: 0,
    maxPollAttempts: 2
  });
  const result = await client.submitAndPoll({
    orderId: 'ord_canva_live',
    mode: 'allocation',
    emails: ['canva-one@example.com', 'canva-two@example.com'],
    accountRefs: ['team-a']
  });
  assert.equal(result.status, 'partially_succeeded');
  assert.equal(result.partiallySucceeded, true);
  assert.equal(result.replayed, true);
  assert.equal(result.pollAttempts, 1);
  const post = globalThis.__canvaRequests.find((item) => item.method === 'POST');
  assert.equal(post.url, '/api/v1/member-allocations');
  assert.equal(post.apiKey, 'canva-gsk-test');
  assert.deepEqual(post.body, {
    emails: ['canva-one@example.com', 'canva-two@example.com'],
    accountRefs: ['team-a']
  });
  delete globalThis.__canvaRequests;
});

{
  const apiKey = 'gsk_secret_value_that_must_not_leak';
  const email = 'private-buyer@example.com';
  const capturedLogs = [];
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  console.error = (...values) => capturedLogs.push(values);
  console.warn = (...values) => capturedLogs.push(values);
  const client = createMemberFulfillmentClient({
    provider: 'chatgpt',
    baseUrl: 'https://member.invalid/api/v1',
    apiKey,
    maxSubmitAttempts: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      code: 'INVALID_EMAILS',
      detail: `${email} and ${apiKey}`,
      retryable: false
    }), {
      status: 422,
      headers: { 'content-type': 'application/problem+json' }
    })
  });
  try {
    await assert.rejects(
      () => client.submitOperation({
        orderId: 'ord_redaction',
        emails: [email],
        accountRef: 'admin-account'
      }),
      (error) => {
        assert.ok(error instanceof MemberFulfillmentClientError);
        const visible = `${error.stack}\n${JSON.stringify(error)}`;
        assert.ok(!visible.includes(apiKey));
        assert.ok(!visible.includes(email));
        assert.equal(error.upstreamCode, 'INVALID_EMAILS');
        assert.equal(error.submissionMayHaveBeenAccepted, false);
        return true;
      }
    );
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
  assert.deepEqual(capturedLogs, [], 'The client must not log upstream payloads.');
}

{
  let redirectMode = '';
  const client = createMemberFulfillmentClient({
    provider: 'chatgpt',
    baseUrl: 'https://member.invalid/api/v1',
    apiKey: 'gsk_redirect_guard',
    fetchImpl: async (_url, options) => {
      redirectMode = options.redirect;
      return new Response(JSON.stringify({
        data: operation('op_redirect_guard', 'succeeded', {
          result: { invited: ['redirect@example.com'], duplicateDetails: [] }
        }),
        meta: { replayed: false }
      }), { status: 202, headers: { 'content-type': 'application/json' } });
    }
  });
  await client.submitOperation({
    orderId: 'ord_redirect_guard',
    emails: ['redirect@example.com'],
    accountRef: 'admin-account'
  });
  assert.equal(redirectMode, 'error', 'Authenticated member requests must never follow redirects.');
}

{
  const client = createMemberFulfillmentClient({
    provider: 'canva',
    baseUrl: 'https://canva.invalid/api/v1',
    apiKey: 'gsk_timeout_secret',
    requestTimeoutMs: 20,
    maxSubmitAttempts: 1,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      const fail = () => reject(Object.assign(new Error('fetch aborted'), { name: 'AbortError' }));
      if (options.signal.aborted) fail();
      else options.signal.addEventListener('abort', fail, { once: true });
    })
  });
  await assert.rejects(
    () => client.submitOperation({
      orderId: 'ord_timeout',
      emails: ['timeout@example.com'],
      accountRef: 'team-a'
    }),
    (error) => (
      error.code === 'MEMBER_SERVICE_REQUEST_TIMEOUT'
      && error.retryable === true
      && error.submissionMayHaveBeenAccepted === true
    )
  );
}

{
  const client = createMemberFulfillmentClient({
    provider: 'chatgpt',
    baseUrl: 'https://member.invalid/api/v1',
    apiKey: 'gsk_network_secret',
    maxSubmitAttempts: 1,
    fetchImpl: async () => {
      throw new Error('socket reset after request write');
    }
  });
  await assert.rejects(
    () => client.submitOperation({
      orderId: 'ord_network_unknown',
      emails: ['network@example.com'],
      accountRef: 'admin-account'
    }),
    (error) => (
      error.code === 'MEMBER_SERVICE_NETWORK_ERROR'
      && error.retryable === true
      && error.submissionMayHaveBeenAccepted === true
    )
  );
}

{
  const client = createMemberFulfillmentClient({
    provider: 'chatgpt',
    baseUrl: 'https://member.invalid/api/v1',
    apiKey: 'gsk_5xx_secret',
    maxSubmitAttempts: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      data: operation('op_accepted_then_5xx', 'queued')
    }), {
      status: 503,
      headers: { 'content-type': 'application/json' }
    })
  });
  await assert.rejects(
    () => client.submitOperation({
      orderId: 'ord_5xx_unknown',
      emails: ['five@example.com'],
      accountRef: 'admin-account'
    }),
    (error) => (
      error.code === 'MEMBER_SERVICE_HTTP_ERROR'
      && error.retryable === true
      && error.submissionMayHaveBeenAccepted === true
      && error.operationId === 'op_accepted_then_5xx'
    )
  );
}

{
  const client = createMemberFulfillmentClient({
    provider: 'canva',
    baseUrl: 'https://canva.invalid/api/v1',
    apiKey: 'gsk_malformed_secret',
    maxSubmitAttempts: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      operation: operation('op_malformed_accepted', 'unknown_status')
    }), {
      status: 202,
      headers: { 'content-type': 'application/json' }
    })
  });
  await assert.rejects(
    () => client.submitOperation({
      orderId: 'ord_malformed_unknown',
      emails: ['malformed@example.com'],
      accountRef: 'team-a'
    }),
    (error) => (
      error.code === 'MEMBER_SERVICE_MALFORMED_RESPONSE'
      && error.submissionMayHaveBeenAccepted === true
      && error.operationId === 'op_malformed_accepted'
    )
  );
}

{
  const controller = new AbortController();
  const client = createMemberFulfillmentClient({
    provider: 'chatgpt',
    baseUrl: 'https://member.invalid/api/v1',
    apiKey: 'gsk_abort_secret',
    requestTimeoutMs: 1000,
    maxSubmitAttempts: 1,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      const fail = () => reject(Object.assign(new Error('fetch aborted'), { name: 'AbortError' }));
      if (options.signal.aborted) fail();
      else options.signal.addEventListener('abort', fail, { once: true });
    })
  });
  const pending = client.submitOperation({
    orderId: 'ord_abort',
    emails: ['abort@example.com'],
    accountRef: 'admin-account',
    signal: controller.signal
  });
  controller.abort();
  await assert.rejects(
    () => pending,
    (error) => error.code === 'MEMBER_FULFILLMENT_ABORTED' && error.retryable === false
  );
}

{
  let getCount = 0;
  const fetchImpl = async (_url, options) => {
    if (options.method === 'POST') {
      return new Response(JSON.stringify({
        data: operation('op_poll_bound', 'queued'),
        meta: { replayed: false }
      }), { status: 202, headers: { 'content-type': 'application/json' } });
    }
    getCount += 1;
    return new Response(JSON.stringify({
      data: operation('op_poll_bound', 'running'),
      meta: { replayed: false }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createMemberFulfillmentClient({
    provider: 'chatgpt',
    baseUrl: 'https://member.invalid/api/v1',
    apiKey: 'gsk_poll_secret',
    fetchImpl,
    pollIntervalMs: 0,
    maxPollAttempts: 2,
    operationTimeoutMs: 1000
  });
  await assert.rejects(
    () => client.submitAndPoll({
      orderId: 'ord_poll_bound',
      emails: ['poll@example.com'],
      accountRef: 'admin-account'
    }),
    (error) => error.code === 'MEMBER_OPERATION_POLL_TIMEOUT' && error.operationId === 'op_poll_bound'
  );
  assert.equal(getCount, 2, 'Polling must stop at maxPollAttempts.');
}

console.log(JSON.stringify({
  ok: true,
  testedProviders: ['chatgpt', 'canva'],
  idempotency: 'deterministic',
  polling: 'bounded',
  redaction: 'verified'
}, null, 2));
