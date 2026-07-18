import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const photoFile = resolve(process.cwd(), 'data', `telegram-media-cache-${process.pid}-${Date.now()}.png`);

process.env.REDIS_URL = '';
process.env.TELEGRAM_BOT_TOKEN = '123:media-cache-test';
process.env.TELEGRAM_MEDIA_FILE_ID_CACHE = 'true';
process.env.TELEGRAM_MEDIA_FILE_ID_CACHE_TTL_SECONDS = '3600';

const { config } = await import('../src/config.js');
const {
  editTelegramPhotoFile,
  sendTelegramPhotoFile
} = await import('../src/telegramTransport.js');
const { resetTelegramMediaMemoryCache } = await import('../src/telegramMediaCache.js');

const calls = [];
let uploadCount = 0;
let rejectCachedReferenceOnce = false;

globalThis.fetch = async (url, options) => {
  const multipart = options.body instanceof FormData;
  const body = parseTelegramBody(options.body);
  calls.push({ url: String(url), body, multipart });

  const photoReference = body.photo || body.media?.media;
  if (
    rejectCachedReferenceOnce
    && !multipart
    && String(photoReference || '').startsWith('tg-photo-file-id-')
  ) {
    rejectCachedReferenceOnce = false;
    return telegramError(400, 'Bad Request: wrong file identifier/HTTP URL specified');
  }

  const fileId = multipart
    ? `tg-photo-file-id-${++uploadCount}`
    : String(photoReference || 'tg-photo-file-id-reference');
  return {
    ok: true,
    async json() {
      return {
        ok: true,
        result: {
          message_id: calls.length,
          photo: [{ file_id: fileId, width: 320, height: 180 }]
        }
      };
    }
  };
};

try {
  await writeFile(photoFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]));

  await sendTelegramPhotoFile(9001, photoFile, { caption: 'First upload' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].multipart, true, 'The first send should upload the local image bytes.');
  assert.equal(calls[0].body.photo.name, photoFile.split(/[\\/]/).at(-1));

  calls.length = 0;
  await sendTelegramPhotoFile(9002, photoFile, { caption: 'Cached send' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].multipart, false, 'A repeated send should use Telegram JSON instead of multipart upload.');
  assert.equal(calls[0].body.photo, 'tg-photo-file-id-1');

  calls.length = 0;
  await editTelegramPhotoFile(9002, 77, photoFile, { caption: 'Cached edit' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].multipart, false, 'Media edits should reuse the same cached Telegram file_id.');
  assert.equal(calls[0].body.media.media, 'tg-photo-file-id-1');
  assert.equal(calls[0].body.media.caption, 'Cached edit');

  calls.length = 0;
  rejectCachedReferenceOnce = true;
  await sendTelegramPhotoFile(9003, photoFile, { caption: 'Recover stale cache' });
  assert.equal(calls.length, 2, 'An invalid cached file_id should be evicted and uploaded once.');
  assert.equal(calls[0].multipart, false);
  assert.equal(calls[0].body.photo, 'tg-photo-file-id-1');
  assert.equal(calls[1].multipart, true);

  calls.length = 0;
  await sendTelegramPhotoFile(9004, photoFile, { caption: 'Recovered cache' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].multipart, false);
  assert.equal(calls[0].body.photo, 'tg-photo-file-id-2');

  await writeFile(photoFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x02]));
  calls.length = 0;
  await sendTelegramPhotoFile(9005, photoFile, { caption: 'Changed image' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].multipart, true, 'Changing file bytes should produce a new cache key.');

  resetTelegramMediaMemoryCache();
  const originalCacheEnabled = config.telegram.mediaFileIdCache;
  try {
    config.telegram.mediaFileIdCache = false;
    calls.length = 0;
    await sendTelegramPhotoFile(9006, photoFile);
    await sendTelegramPhotoFile(9006, photoFile);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.multipart), 'The kill switch should preserve direct upload behavior.');
  } finally {
    config.telegram.mediaFileIdCache = originalCacheEnabled;
  }

  console.log(JSON.stringify({
    ok: true,
    checked: 'Telegram photo file_id caching, edit reuse, stale recovery and content invalidation'
  }, null, 2));
} finally {
  resetTelegramMediaMemoryCache();
  await rm(photoFile, { force: true });
}

function telegramError(status, description) {
  return {
    ok: false,
    status,
    async text() {
      return JSON.stringify({ ok: false, description });
    }
  };
}

function parseTelegramBody(body) {
  if (body instanceof FormData) {
    const parsed = {};
    for (const [key, value] of body.entries()) {
      if (['reply_markup', 'caption_entities', 'entities', 'media'].includes(key)) {
        parsed[key] = JSON.parse(value);
      } else {
        parsed[key] = value;
      }
    }
    return parsed;
  }
  return JSON.parse(body);
}
