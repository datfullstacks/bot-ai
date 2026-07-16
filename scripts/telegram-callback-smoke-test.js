import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataFile = resolve(process.cwd(), 'data', `telegram-callback-smoke-${process.pid}-${Date.now()}.json`);
const startImageFile = resolve(process.cwd(), 'data', `telegram-callback-start-${process.pid}-${Date.now()}.png`);

process.env.STORE_DRIVER = 'json';
process.env.DATA_FILE = dataFile;
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.TELEGRAM_BOT_TOKEN = '123:test';
process.env.TELEGRAM_POLLING = 'false';
process.env.TELEGRAM_WELCOME_ANIMATION_URL = 'https://cdn.example.local/kaito-welcome.gif';
process.env.TELEGRAM_START_IMAGE_FILE = startImageFile;
process.env.AUTH_SECRET ||= 'telegram-callback-smoke-auth-secret';
process.env.PAYMENT_WEBHOOK_SECRET ||= 'telegram-callback-smoke-payment-secret';

const storage = await import('../src/storage.js');
const shop = await import('../src/shop.js');
const telegram = await import('../src/telegram.js');

const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), body: parseTelegramBody(options.body) });
  return {
    ok: true,
    async json() {
      return { ok: true };
    }
  };
};

try {
  await writeFile(startImageFile, Buffer.from('fake-start-image'));
  await storage.initStore();

  await telegram.handleTelegramUpdate({
    message: {
      chat: { id: 91000 },
      message_id: 54,
      text: '/start',
      from: { id: 91000, username: 'start-buyer', first_name: 'Start' }
    }
  });

  const animationCall = calls.find((call) => call.url.includes('/sendAnimation'));
  assert.equal(animationCall, undefined, '/start should not send a separate visual message.');
  const startCall = calls.find((call) => call.url.includes('/sendPhoto') && String(call.body.chat_id) === '91000');
  assert.ok(startCall, '/start should send the welcome image.');
  assert.equal(startCall.body.photo.name, startImageFile.split(/[\\/]/).at(-1));
  assert.equal(startCall.body.caption, undefined);
  assert.equal(startCall.body.reply_markup, undefined);
  const startMessageCall = calls.find((call) => call.url.includes('/sendMessage') && String(call.body.chat_id) === '91000');
  assert.ok(startMessageCall, '/start should send the menu text separately from the image.');
  assert.ok(startMessageCall.body.reply_markup?.inline_keyboard?.flat().some((button) => button.callback_data === 'catalog:all'));

  const products = await shop.listProducts();
  const product = products.find((item) => item.sku === 'chatgpt-plus-1m');
  assert.ok(product, 'Default catalog should include ChatGPT Plus.');
  await shop.importInventory('telegram-smoke', product.id, ['chatgpt-plus-login|secret']);

  await telegram.handleTelegramUpdate({
    callback_query: {
      id: 'cb_buy_1',
      data: 'buy:chatgpt-plus-1m:1',
      message: { chat: { id: 91001 }, message_id: 55 },
      from: { id: 91001, username: 'callback-buyer', first_name: 'Callback' }
    }
  });

  const sendMessageCalls = calls.filter((call) => call.url.includes('/sendMessage'));
  assert.ok(calls.some((call) => call.url.includes('/answerCallbackQuery')), 'Callback should be answered.');
  assert.ok(sendMessageCalls.some((call) => call.body.text.includes('Đơn đã tạo')), 'Buy callback should create an order message.');
  assert.ok(sendMessageCalls.some((call) => call.body.text.includes('Link thanh toán')), 'Order message should include payment URL.');

  const db = await storage.readStore();
  assert.equal(db.orders.length, 1);
  assert.equal(db.orders[0].productSku, 'chatgpt-plus-1m');

  console.log(JSON.stringify({ ok: true, checked: 'telegram buy callback' }, null, 2));
} finally {
  await rm(dataFile, { force: true });
  await rm(startImageFile, { force: true });
}

function parseTelegramBody(body) {
  if (body instanceof FormData) {
    const parsed = {};
    for (const [key, value] of body.entries()) {
      parsed[key] = key === 'reply_markup' ? JSON.parse(value) : value;
    }
    return parsed;
  }
  return JSON.parse(body);
}
