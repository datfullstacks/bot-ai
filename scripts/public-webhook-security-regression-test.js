import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const port = 32000 + (process.pid % 1000);
const dataFile = resolve(process.cwd(), 'data', `webhook-security-${process.pid}-${Date.now()}.json`);
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['src/server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    BASE_URL: 'https://shop.example.test',
    STORE_DRIVER: 'json',
    DATA_FILE: dataFile,
    DATABASE_URL: '',
    REDIS_URL: '',
    SALES_ENABLED: 'false',
    PAYMENT_PROVIDER: 'sepay',
    SEPAY_ACCOUNT_NUMBER: '1234567890',
    SEPAY_BANK_CODE: 'MBBank',
    SEPAY_WEBHOOK_AUTH: 'hmac',
    SEPAY_WEBHOOK_SECRET: '44'.repeat(32),
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_POLLING: 'true',
    TELEGRAM_WEBHOOK_SECRET: ''
  },
  stdio: 'ignore',
  windowsHide: true
});

try {
  await waitForServer();

  const readinessResponse = await fetch(`${baseUrl}/api/readyz`);
  const readiness = await readinessResponse.json();
  assert.equal(readiness.ok, false, 'Readiness must report false while production configuration has warnings.');
  assert.equal(
    readiness.checks.some((check) => check.id === 'sepay_account_allowlist' && check.status === 'warning'),
    true,
    'Production readiness must require a SePay destination account allowlist.'
  );

  const mockResponse = await fetch(`${baseUrl}/api/public/payments/mock-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  assert.equal(mockResponse.status, 404, 'Production must not expose the mock payment webhook.');

  const telegramResponse = await fetch(`${baseUrl}/api/public/telegram/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  assert.equal(telegramResponse.status, 404, 'Polling mode must not expose the Telegram webhook.');

  const sepayResponse = await fetch(`${baseUrl}/api/public/payments/sepay-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 1,
      transferType: 'in',
      transferAmount: 1000
    })
  });
  assert.equal(sepayResponse.status, 401, 'Unsigned SePay webhook requests must be rejected.');

  console.log(JSON.stringify({ ok: true, checked: 'public webhook production security' }, null, 2));
} finally {
  child.kill();
  await rm(dataFile, { force: true });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error('Security regression server did not start');
}
