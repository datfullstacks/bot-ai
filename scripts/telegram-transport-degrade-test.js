import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataFile = resolve(process.cwd(), 'data', `telegram-transport-degrade-${process.pid}-${Date.now()}.json`);
const photoFile = resolve(process.cwd(), 'data', `telegram-transport-degrade-${process.pid}-${Date.now()}.png`);

process.env.STORE_DRIVER = 'json';
process.env.DATA_FILE = dataFile;
process.env.TELEGRAM_BOT_TOKEN = '123:test';
process.env.TELEGRAM_CUSTOM_TEXT_EMOJI = 'true';

const { config } = await import('../src/config.js');
const {
  editTelegramMessage,
  sendTelegramAnimation,
  sendTelegramMessage,
  sendTelegramPhotoFile,
  sendTelegramPhotoUrl,
  sendTelegramSticker,
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
  const buttonCustomEmojiIds = collectButtonCustomEmojiIds(body.reply_markup);
  if (buttonCustomEmojiIds.length) {
    const rejectedButtonCustomEmojiId = buttonCustomEmojiIds
      .find((customEmojiId) => customEmojiId.startsWith('ce_bad_'));
    const hasGenericButtonCustomEmojiId = buttonCustomEmojiIds
      .some((customEmojiId) => customEmojiId.startsWith('ce_generic_'));
    const shouldRejectButtonCustomEmoji = Boolean(
      rejectedButtonCustomEmojiId || hasGenericButtonCustomEmojiId
    );
    return {
      ok: !shouldRejectButtonCustomEmoji,
      status: shouldRejectButtonCustomEmoji ? 400 : 200,
      async text() {
        return JSON.stringify({
          ok: false,
          description: rejectedButtonCustomEmojiId
            ? `Bad Request: BUTTON_CUSTOM_EMOJI_INVALID for icon_custom_emoji_id "${rejectedButtonCustomEmojiId}"`
            : 'Bad Request: CUSTOM_EMOJI_INVALID'
        });
      },
      async json() {
        return { ok: true, result: { message_id: calls.length } };
      }
    };
  }
  const customEmojiIds = [
    ...(body.entities || []),
    ...(body.caption_entities || [])
  ]
    .filter((entity) => entity.type === 'custom_emoji')
    .map((entity) => entity.custom_emoji_id);
  if (customEmojiIds.length) {
    const rejectedCustomEmojiId = customEmojiIds
      .find((customEmojiId) => customEmojiId.startsWith('ce_bad_'));
    const hasGenericCustomEmojiId = customEmojiIds
      .some((customEmojiId) => customEmojiId.startsWith('ce_generic_'));
    const shouldRejectCustomEmoji = Boolean(rejectedCustomEmojiId || hasGenericCustomEmojiId);
    return {
      ok: !shouldRejectCustomEmoji,
      status: shouldRejectCustomEmoji ? 400 : 200,
      async text() {
        return JSON.stringify({
          ok: false,
          description: rejectedCustomEmojiId
            ? `Bad Request: CUSTOM_EMOJI_INVALID for custom_emoji_id "${rejectedCustomEmojiId}"`
            : 'Bad Request: CUSTOM_EMOJI_INVALID'
        });
      },
      async json() {
        return { ok: true, result: { message_id: calls.length } };
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
  await writeFile(photoFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const customOptions = {
    parse_mode: undefined,
    entities: [
      {
        type: 'custom_emoji',
        offset: 0,
        length: 'X'.length,
        custom_emoji_id: 'ce_bad_custom'
      },
      {
        type: 'custom_emoji',
        offset: 1,
        length: 'Y'.length,
        custom_emoji_id: 'ce_good_custom'
      }
    ],
    _fallback_text: '<b>Fallback</b> XY',
    _fallback_parse_mode: 'HTML'
  };

  await sendTelegramMessage(9001, 'XY', customOptions);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.entities[0].custom_emoji_id, 'ce_bad_custom');
  assert.equal(calls[0].body.entities[1].custom_emoji_id, 'ce_good_custom');
  assert.equal(calls[1].body.text, '<b>Fallback</b> XY');
  assert.equal(calls[1].body.entities, undefined);

  calls.length = 0;
  await sendTelegramMessage(9001, 'XY', customOptions);
  assert.equal(calls.length, 1, 'Known rejected custom emoji should skip the entity attempt.');
  assert.equal(calls[0].body.text, '<b>Fallback</b> XY');
  assert.equal(calls[0].body.entities, undefined);

  calls.length = 0;
  await sendTelegramMessage(9001, 'Y', {
    parse_mode: undefined,
    entities: [{
      type: 'custom_emoji',
      offset: 0,
      length: 'Y'.length,
      custom_emoji_id: 'ce_good_custom'
    }]
  });
  assert.equal(calls.length, 1, 'A valid sibling entity ID must not be cached as rejected.');
  assert.equal(calls[0].body.entities[0].custom_emoji_id, 'ce_good_custom');

  const customButtonKeyboard = {
    inline_keyboard: [[
      {
        text: 'Buy',
        callback_data: 'buy:42',
        icon_custom_emoji_id: 'ce_bad_button',
        style: 'success'
      },
      {
        text: 'Docs',
        url: 'https://example.test/docs',
        icon_custom_emoji_id: 'ce_good_button_url',
        style: 'primary'
      }
    ], [
      {
        text: 'Copy',
        copy_text: { text: 'ORDER-42' }
      }
    ]]
  };

  calls.length = 0;
  await sendTelegramMessage(9001, 'Button fallback', {
    reply_markup: customButtonKeyboard
  });
  assert.equal(calls.length, 2, 'sendMessage should retry without rejected button custom emojis.');
  assert.deepEqual(calls[0].body.reply_markup, customButtonKeyboard);
  assert.equal(collectButtonCustomEmojiIds(calls[1].body.reply_markup).length, 0);
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].text, 'Buy');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].callback_data, 'buy:42');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].style, 'success');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][1].url, 'https://example.test/docs');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][1].style, 'primary');
  assert.deepEqual(
    calls[1].body.reply_markup.inline_keyboard[1][0].copy_text,
    { text: 'ORDER-42' }
  );

  calls.length = 0;
  await sendTelegramMessage(9001, 'Known button fallback', {
    reply_markup: customButtonKeyboard
  });
  assert.equal(calls.length, 1, 'Known rejected button custom emoji should skip the icon attempt.');
  assert.equal(collectButtonCustomEmojiIds(calls[0].body.reply_markup).length, 0);

  calls.length = 0;
  await sendTelegramMessage(9001, 'Valid button icon', {
    reply_markup: {
      inline_keyboard: [[{
        text: 'Docs',
        url: 'https://example.test/docs',
        icon_custom_emoji_id: 'ce_good_button_url',
        style: 'primary'
      }]]
    }
  });
  assert.equal(calls.length, 1, 'A valid sibling button ID must not be cached as rejected.');
  assert.equal(
    calls[0].body.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id,
    'ce_good_button_url'
  );

  calls.length = 0;
  await editTelegramMessage(9001, 77, '<b>Edited</b>');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes('/editMessageText'));
  assert.equal(calls[0].body.message_id, 77);

  calls.length = 0;
  await editTelegramMessage(9001, 78, 'Edited button', {
    reply_markup: {
      inline_keyboard: [[{
        text: 'Back',
        callback_data: 'back:catalog',
        icon_custom_emoji_id: 'ce_bad_edit_button',
        style: 'danger'
      }]]
    }
  });
  assert.equal(calls.length, 2, 'editMessageText should retry without rejected button custom emojis.');
  assert.ok(calls.every((call) => call.url.includes('/editMessageText')));
  assert.equal(calls[1].body.message_id, 78);
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].callback_data, 'back:catalog');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].style, 'danger');
  assert.equal(collectButtonCustomEmojiIds(calls[1].body.reply_markup).length, 0);

  calls.length = 0;
  const notModified = await editTelegramMessage(9001, 77, 'same');
  assert.equal(notModified.notModified, true);

  calls.length = 0;
  await sendTelegramAnimation(9001, 'animation-file-id', {
    caption: 'Animation button',
    reply_markup: {
      inline_keyboard: [[{
        text: 'Continue',
        callback_data: 'animation:continue',
        icon_custom_emoji_id: 'ce_bad_animation_button',
        style: 'success'
      }]]
    }
  });
  assert.equal(calls.length, 2, 'sendAnimation should retry without rejected button custom emojis.');
  assert.ok(calls.every((call) => call.url.includes('/sendAnimation')));
  assert.equal(calls[1].body.animation, 'animation-file-id');
  assert.equal(calls[1].body.caption, 'Animation button');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].callback_data, 'animation:continue');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].style, 'success');
  assert.equal(collectButtonCustomEmojiIds(calls[1].body.reply_markup).length, 0);

  calls.length = 0;
  await sendTelegramSticker(9001, 'sticker-file-id', {
    reply_markup: {
      inline_keyboard: [[{
        text: 'Open',
        url: 'https://example.test/sticker',
        icon_custom_emoji_id: 'ce_bad_sticker_button',
        style: 'primary'
      }]]
    }
  });
  assert.equal(calls.length, 2, 'sendSticker should retry without rejected button custom emojis.');
  assert.ok(calls.every((call) => call.url.includes('/sendSticker')));
  assert.equal(calls[1].body.sticker, 'sticker-file-id');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].url, 'https://example.test/sticker');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].style, 'primary');
  assert.equal(collectButtonCustomEmojiIds(calls[1].body.reply_markup).length, 0);

  calls.length = 0;
  await sendTelegramPhotoUrl(9001, 'https://example.test/banner.png', {
    caption: 'Photo URL button',
    reply_markup: {
      inline_keyboard: [[{
        text: 'Open',
        url: 'https://example.test/open',
        icon_custom_emoji_id: 'ce_bad_photo_url_button',
        style: 'primary'
      }]]
    }
  });
  assert.equal(calls.length, 2, 'URL sendPhoto should retry without rejected button custom emojis.');
  assert.ok(calls.every((call) => call.url.includes('/sendPhoto')));
  assert.equal(calls[1].body.photo, 'https://example.test/banner.png');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].url, 'https://example.test/open');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].style, 'primary');
  assert.equal(collectButtonCustomEmojiIds(calls[1].body.reply_markup).length, 0);

  calls.length = 0;
  await sendTelegramPhotoFile(9001, photoFile, {
    caption: 'Photo file button',
    reply_markup: {
      inline_keyboard: [[{
        text: 'Orders',
        callback_data: 'orders:mine',
        icon_custom_emoji_id: 'ce_bad_photo_file_button'
      }]]
    }
  });
  assert.equal(calls.length, 2, 'Multipart sendPhoto should retry without rejected button custom emojis.');
  assert.ok(calls.every((call) => call.url.includes('/sendPhoto')));
  assert.equal(calls[0].body.photo.name, photoFile.split(/[\\/]/).at(-1));
  assert.equal(calls[1].body.photo.name, photoFile.split(/[\\/]/).at(-1));
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].callback_data, 'orders:mine');
  assert.equal(collectButtonCustomEmojiIds(calls[1].body.reply_markup).length, 0);

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
  const documentButtonText = 'document-button-content-must-stay-exact';
  await sendTelegramTextDocument(9001, documentButtonText, 'button-delivery.txt', {
    caption: 'Document button retry',
    reply_markup: {
      inline_keyboard: [[{
        text: 'Delivery',
        callback_data: 'delivery:view',
        icon_custom_emoji_id: 'ce_bad_document_button',
        style: 'success'
      }]]
    }
  });
  assert.equal(calls.length, 2, 'sendDocument should retry without rejected button custom emojis.');
  assert.ok(calls.every((call) => call.url.includes('/sendDocument')));
  assert.equal(await calls[0].body.document.text(), documentButtonText);
  assert.equal(await calls[1].body.document.text(), documentButtonText);
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].callback_data, 'delivery:view');
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].style, 'success');
  assert.equal(collectButtonCustomEmojiIds(calls[1].body.reply_markup).length, 0);

  calls.length = 0;
  await sendTelegramMessage(9001, 'X', {
    parse_mode: undefined,
    entities: [{
      type: 'custom_emoji',
      offset: 0,
      length: 1,
      custom_emoji_id: 'ce_generic_entity'
    }],
    _fallback_text: 'X',
    reply_markup: {
      inline_keyboard: [[{
        text: 'Generic',
        callback_data: 'generic:button',
        icon_custom_emoji_id: 'ce_generic_button'
      }]]
    }
  });
  assert.equal(calls.length, 3, 'A generic custom emoji error should degrade entities and button icons safely.');
  assert.equal(calls[0].body.entities[0].custom_emoji_id, 'ce_generic_entity');
  assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id, 'ce_generic_button');
  assert.equal(calls[1].body.entities, undefined);
  assert.equal(calls[1].body.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id, 'ce_generic_button');
  assert.equal(calls[2].body.entities, undefined);
  assert.equal(collectButtonCustomEmojiIds(calls[2].body.reply_markup).length, 0);

  calls.length = 0;
  await sendTelegramMessage(9001, 'X', {
    parse_mode: undefined,
    entities: [{
      type: 'custom_emoji',
      offset: 0,
      length: 1,
      custom_emoji_id: 'ce_generic_entity'
    }],
    _fallback_text: 'X',
    reply_markup: {
      inline_keyboard: [[{
        text: 'Generic',
        callback_data: 'generic:button',
        icon_custom_emoji_id: 'ce_generic_button'
      }]]
    }
  });
  assert.equal(
    calls.length,
    3,
    'An error without an exact ID must degrade only the current request, not blacklist its IDs.'
  );
  assert.equal(calls[0].body.entities[0].custom_emoji_id, 'ce_generic_entity');
  assert.equal(
    calls[0].body.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id,
    'ce_generic_button'
  );

  calls.length = 0;
  await sendTelegramMessage(9001, 'Bold', {
    parse_mode: undefined,
    entities: [{
      type: 'bold',
      offset: 0,
      length: 4
    }],
    reply_markup: {
      inline_keyboard: [[{
        text: 'Generic only',
        callback_data: 'generic:button-only',
        icon_custom_emoji_id: 'ce_generic_button_only'
      }]]
    }
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body.entities, [{
    type: 'bold',
    offset: 0,
    length: 4
  }], 'Button fallback must preserve unrelated text entities.');
  assert.equal(collectButtonCustomEmojiIds(calls[1].body.reply_markup).length, 0);

  calls.length = 0;
  const originalCustomTextEmoji = config.telegram.customTextEmoji;
  try {
    config.telegram.customTextEmoji = false;
    await sendTelegramMessage(9001, 'Disabled globally', {
      entities: [{
        type: 'custom_emoji',
        offset: 0,
        length: 1,
        custom_emoji_id: 'ce_disabled_entity'
      }],
      reply_markup: {
        inline_keyboard: [[{
          text: 'Disabled',
          callback_data: 'disabled:button',
          icon_custom_emoji_id: 'ce_disabled_button',
          style: 'danger'
        }]]
      }
    });
    assert.equal(calls.length, 1, 'Global custom emoji disable should avoid a rejected first attempt.');
    assert.equal(calls[0].body.entities, undefined);
    assert.equal(collectButtonCustomEmojiIds(calls[0].body.reply_markup).length, 0);
    assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].callback_data, 'disabled:button');
    assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].style, 'danger');
  } finally {
    config.telegram.customTextEmoji = originalCustomTextEmoji;
  }

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
    checked: 'telegram custom emoji entity and button degrade tracking across messages, edits, media, stickers, and documents'
  }, null, 2));
} finally {
  await rm(dataFile, { force: true });
  await rm(photoFile, { force: true });
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

function collectButtonCustomEmojiIds(value, ids = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectButtonCustomEmojiIds(item, ids);
    return ids;
  }
  if (!value || typeof value !== 'object') return ids;
  if (value.icon_custom_emoji_id) ids.push(value.icon_custom_emoji_id);
  for (const nested of Object.values(value)) collectButtonCustomEmojiIds(nested, ids);
  return ids;
}
