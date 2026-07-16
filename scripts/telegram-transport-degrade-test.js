import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataFile = resolve(process.cwd(), 'data', `telegram-transport-degrade-${process.pid}-${Date.now()}.json`);

process.env.STORE_DRIVER = 'json';
process.env.DATA_FILE = dataFile;
process.env.TELEGRAM_BOT_TOKEN = '123:test';
process.env.TELEGRAM_CUSTOM_TEXT_EMOJI = 'true';

const { sendTelegramMessage } = await import('../src/telegramTransport.js');

const calls = [];
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  calls.push({ url: String(url), body });
  const hasCustomEmoji = body.entities?.some((entity) => entity.type === 'custom_emoji');
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

  console.log(JSON.stringify({ ok: true, checked: 'telegram custom emoji degrade tracking' }, null, 2));
} finally {
  await rm(dataFile, { force: true });
}
