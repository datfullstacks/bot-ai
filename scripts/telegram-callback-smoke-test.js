import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataFile = resolve(process.cwd(), 'data', `telegram-callback-smoke-${process.pid}-${Date.now()}.json`);
const startImageFile = resolve(process.cwd(), 'data', `telegram-callback-start-${process.pid}-${Date.now()}.png`);

process.env.STORE_DRIVER = 'json';
process.env.DATA_FILE = dataFile;
process.env.BASE_URL = 'http://localhost:3000';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.SALES_ENABLED = 'true';
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
let releaseChatMenuRequest;
let blockChatMenuRequest = true;
globalThis.fetch = async (url, options) => {
  const call = { url: String(url), body: parseTelegramBody(options.body) };
  calls.push(call);
  if (blockChatMenuRequest && call.url.includes('/setChatMenuButton')) {
    return new Promise((resolveRequest) => {
      releaseChatMenuRequest = () => resolveRequest(telegramSuccess());
    });
  }
  if (call.url.includes('/sendPhoto')) {
    return telegramSuccess({
      ok: true,
      result: {
        message_id: calls.length,
        photo: [{ file_id: 'cached_start_photo_file_id' }]
      }
    });
  }
  return telegramSuccess();
};

try {
  await writeFile(startImageFile, Buffer.from('fake-start-image'));
  await storage.initStore();

  const firstStart = telegram.handleTelegramUpdate({
    message: {
      chat: { id: 91000 },
      message_id: 54,
      text: '/start',
      from: { id: 91000, username: 'start-buyer', first_name: 'Start' }
    }
  });
  const completedBeforeChatMenu = await Promise.race([
    firstStart.then(() => true),
    new Promise((resolveRace) => setTimeout(() => resolveRace(false), 250))
  ]);
  if (!completedBeforeChatMenu) releaseChatMenuRequest?.();
  assert.equal(completedBeforeChatMenu, true, '/start must not wait for setChatMenuButton.');
  releaseChatMenuRequest?.();
  blockChatMenuRequest = false;
  await firstStart;
  await new Promise((resolveImmediate) => setImmediate(resolveImmediate));

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

  calls.length = 0;
  await telegram.handleTelegramUpdate({
    message: {
      chat: { id: 91000 },
      message_id: 55,
      text: '/start',
      from: { id: 91000, username: 'start-buyer', first_name: 'Start' }
    }
  });
  assert.equal(
    calls.some((call) => call.url.includes('/setChatMenuButton')),
    false,
    'A chat with a configured command menu should use the in-process cache.'
  );
  const cachedStartPhoto = calls.find((call) => call.url.includes('/sendPhoto'));
  assert.equal(
    cachedStartPhoto?.body.photo,
    'cached_start_photo_file_id',
    'A successful local upload should reuse Telegram file_id on the next /start.'
  );

  const products = await shop.listProducts();
  const product = products.find((item) => item.sku === 'chatgpt-plus-1m');
  assert.ok(product, 'Default catalog should include ChatGPT Plus.');
  await shop.importInventory('telegram-smoke', product.id, ['chatgpt-plus-login|secret']);

  calls.length = 0;
  await telegram.handleTelegramUpdate({
    callback_query: {
      id: 'cb_pkg_1',
      data: `pkg:${product.id}`,
      message: { chat: { id: 91001 }, message_id: 55 },
      from: { id: 91001, username: 'callback-buyer', first_name: 'Callback' }
    }
  });
  assert.ok(calls.some((call) => call.url.includes('/editMessageText') && call.body.text.includes('Loại tài khoản')));
  assert.equal((await storage.readStore()).orders.length, 0, 'Viewing a package must not create an order.');

  calls.length = 0;
  await telegram.handleTelegramUpdate({
    callback_query: {
      id: 'cb_buy_review_1',
      data: `buy:${product.id}:1`,
      message: { chat: { id: 91001 }, message_id: 55 },
      from: { id: 91001, username: 'callback-buyer', first_name: 'Callback' }
    }
  });
  assert.ok(calls.some((call) => call.url.includes('/editMessageText') && call.body.text.includes('Xác nhận mua')));
  assert.equal((await storage.readStore()).orders.length, 0, 'Reviewing checkout must not reserve inventory.');

  calls.length = 0;
  const confirmUpdate = {
    callback_query: {
      id: 'cb_confirm_1',
      data: `confirm:${product.id}:1`,
      message: { chat: { id: 91001 }, message_id: 55 },
      from: { id: 91001, username: 'callback-buyer', first_name: 'Callback' }
    }
  };
  await telegram.handleTelegramUpdate(confirmUpdate);
  assert.ok(calls.some((call) => call.url.includes('/answerCallbackQuery')), 'Callback should be answered.');
  const receiptCall = calls.find((call) => call.url.includes('/editMessageText') && call.body.text.includes('Đơn đã tạo'));
  assert.ok(receiptCall, 'Only confirmation should create an order receipt.');
  assert.ok(receiptCall.body.reply_markup.inline_keyboard.flat().some((button) => (
    button.text === 'Thanh toán' && button.url && button.icon_custom_emoji_id
  )));
  assert.ok(receiptCall.body.reply_markup.inline_keyboard.flat().some((button) => (
    ['Xem QR', 'Hủy đơn'].includes(button.text) && button.icon_custom_emoji_id
  )));

  await telegram.handleTelegramUpdate(confirmUpdate);
  let db = await storage.readStore();
  assert.equal(db.orders.length, 1, 'Double confirmation must reuse the same checkout.');
  assert.equal(db.payments.length, 1, 'Double confirmation must not create a second payment.');
  assert.equal(db.orders[0].productSku, 'chatgpt-plus-1m');

  const orderId = db.orders[0].id;
  await telegram.handleTelegramUpdate({
    callback_query: {
      id: 'cb_cancel_forged',
      data: `cancel_yes:${orderId}`,
      message: { chat: { id: 91002 }, message_id: 56 },
      from: { id: 91002, username: 'other-buyer', first_name: 'Other' }
    }
  });
  db = await storage.readStore();
  assert.equal(db.orders[0].status, 'pending_payment', 'Another Telegram user must not cancel this order.');

  await telegram.handleTelegramUpdate({
    callback_query: {
      id: 'cb_cancel_owner',
      data: `cancel_yes:${orderId}`,
      message: { chat: { id: 91001 }, message_id: 55 },
      from: { id: 91001, username: 'callback-buyer', first_name: 'Callback' }
    }
  });
  db = await storage.readStore();
  assert.equal(db.orders[0].status, 'cancelled');
  assert.equal(db.inventory.find((item) => item.productId === product.id).status, 'available');

  console.log(JSON.stringify({ ok: true, checked: 'telegram checkout confirmation and buyer cancellation' }, null, 2));
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

function telegramSuccess(payload = { ok: true }) {
  return {
    ok: true,
    async json() {
      return payload;
    }
  };
}
