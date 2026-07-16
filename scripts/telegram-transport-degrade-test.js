import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataFile = resolve(process.cwd(), 'data', `telegram-transport-degrade-${process.pid}-${Date.now()}.json`);

process.env.STORE_DRIVER = 'json';
process.env.DATA_FILE = dataFile;
process.env.TELEGRAM_BOT_TOKEN = '123:test';
process.env.TELEGRAM_CUSTOM_TEXT_EMOJI = 'true';

const { config } = await import('../src/config.js');
const {
  editTelegramMessage,
  sendTelegramMessage,
  sendTelegramTextDocument
} = await import('../src/telegramTransport.js');

const calls = [];
globalThis.fetch = async (url, options) => {
  const body = parseTelegramBody(options.body);
  calls.push({ url: String(url), body });
  if (body.text === 'same') {
    return {
      ok: false,
      status: 400,
      async text() {
        return JSON.stringify({ ok: false, description: 'Bad Request: message is not modified' });
      }
    };
  }
  if (body.caption === 'force-document-failure') {
    return {
      ok: false,
      status: 500,
      async text() {
        return JSON.stringify({ ok: false, description: 'Internal Server Error' });
      }
    };
  }
  const hasCustomEmoji = [
    ...(body.entities || []),
    ...(body.caption_entities || [])
  ].some((entity) => entity.type === 'custom_emoji');
  if (hasCustomEmoji) {
    return {
      ok: false,
      status: 400,
      async text() {
        return JSON.stringify({ ok: false, description: 'Bad Request: CUSTOM_EMOJI_INVALID' });
      }
    };
  }
  return {
    ok: true,
    async json() {
      return { ok: true, result: { message_id: calls.length } };
    }
  };
};

try {
  await writeFile(dataFile, '{}', 'utf8');

  const customOptions = {
    parse_mode: undefined,
    entities: [{
      type: 'custom_emoji',
      offset: 0,
      length: 'X'.length,
      custom_emoji_id: 'ce_bad_custom'
    }],
    _fallback_text: '<b>Fallback</b> X',
    _fallback_parse_mode: 'HTML'
  };

  await sendTelegramMessage(9001, 'X', customOptions);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.entities[0].custom_emoji_id, 'ce_bad_custom');
  assert.equal(calls[1].body.text, '<b>Fallback</b> X');
  assert.equal(calls[1].body.entities, undefined);

  calls.length = 0;
  await sendTelegramMessage(9001, 'X', customOptions);
  assert.equal(calls.length, 1, 'Known rejected custom emoji should skip the entity attempt.');
  assert.equal(calls[0].body.text, '<b>Fallback</b> X');
  assert.equal(calls[0].body.entities, undefined);

  calls.length = 0;
  await editTelegramMessage(9001, 77, '<b>Edited</b>');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/editMessageText'));
  assert.equal(calls[0].body.message_id, 77);

  calls.length = 0;
  const notModified = await editTelegramMessage(9001, 77, 'same');
  assert.equal(notModified.notModified, true);

  calls.length = 0;
  const documentText = 'tài khoản|mật khẩu\n第二行<&>';
  await sendTelegramTextDocument(
    9001,
    documentText,
    '..\\..//orders/order:42.exe',
    {
      caption: '<tg-emoji emoji-id="ce_delivery">📦</tg-emoji> <b>Đã giao hàng</b>',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: 'Đơn hàng', callback_data: 'orders:mine' }]]
      }
    }
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/sendDocument'));
  assert.equal(calls[0].body.chat_id, '9001');
  assert.equal(calls[0].body.document.name, 'order_42.exe.txt');
  assert.equal(calls[0].body.document.type, 'text/plain; charset=utf-8');
  assert.equal(await calls[0].body.document.text(), documentText);
  assert.equal(calls[0].body.caption, '📦 <b>Đã giao hàng</b>');
  assert.equal(calls[0].body.parse_mode, 'HTML');
  assert.equal(
    calls[0].body.reply_markup.inline_keyboard[0][0].callback_data,
    'orders:mine'
  );

  calls.length = 0;
  const documentFallbackText = 'secret|must-stay-exact';
  await sendTelegramTextDocument(9001, documentFallbackText, 'delivery.txt', {
    caption: '📦 document retry',
    parse_mode: undefined,
    caption_entities: [{
      type: 'custom_emoji',
      offset: 0,
      length: '📦'.length,
      custom_emoji_id: 'ce_bad_document'
    }],
    _fallback_caption: '<b>Fallback</b> 📦 document retry',
    _fallback_parse_mode: 'HTML'
  });
  assert.equal(calls.length, 2, 'sendDocument should retry without rejected caption custom emoji.');
  assert.ok(calls.every((call) => call.url.includes('/sendDocument')));
  assert.equal(await calls[0].body.document.text(), documentFallbackText);
  assert.equal(await calls[1].body.document.text(), documentFallbackText);
  assert.equal(calls[0].body.caption_entities[0].custom_emoji_id, 'ce_bad_document');
  assert.equal(calls[1].body.caption_entities, undefined);
  assert.equal(calls[1].body.caption, '<b>Fallback</b> 📦 document retry');
  assert.equal(calls[1].body.parse_mode, 'HTML');

  calls.length = 0;
  const sensitiveText = 'DO_NOT_INCLUDE_THIS_SECRET_IN_ERRORS';
  await assert.rejects(
    () => sendTelegramTextDocument(9001, sensitiveText, 'delivery.txt', {
      caption: 'force-document-failure'
    }),
    (error) => {
      assert.equal(error.status, 500);
      assert.equal(error.message.includes(sensitiveText), false);
      return true;
    }
  );

  calls.length = 0;
  const originalToken = config.telegram.token;
  try {
    config.telegram.token = '';
    const skipped = await sendTelegramTextDocument(
      9001,
      'not sent',
      'not-sent.txt'
    );
    assert.equal(skipped.skipped, true);
    assert.equal(calls.length, 0);
  } finally {
    config.telegram.token = originalToken;
  }

  console.log(JSON.stringify({
    ok: true,
    checked: 'telegram custom emoji degrade tracking, edit fallback, and in-memory text documents'
  }, null, 2));
} finally {
  await rm(dataFile, { force: true });
}

function parseTelegramBody(body) {
  if (body instanceof FormData) {
    const parsed = {};
    for (const [key, value] of body.entries()) {
      if (['reply_markup', 'caption_entities', 'entities'].includes(key)) {
        parsed[key] = JSON.parse(value);
      } else {
        parsed[key] = value;
      }
    }
    return parsed;
  }
  return JSON.parse(body);
}
