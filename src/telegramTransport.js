import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { config } from './config.js';

const rejectedCustomEmojiIds = new Set();
const customEmojiCapabilityCooldownMs = normalizeCustomEmojiCapabilityCooldownMs(
  process.env.TELEGRAM_CUSTOM_EMOJI_CAPABILITY_COOLDOWN_MS
);
let customEmojiEntityCapabilityRejectedUntil = 0;

function normalizeCustomEmojiCapabilityCooldownMs(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60_000;
}

function apiUrl(method) {
  return `https://api.telegram.org/bot${config.telegram.token}/${method}`;
}

export function stripCustomEmojiTags(text) {
  return String(text || '').replace(/<tg-emoji\s+emoji-id="[^"]+">([\s\S]*?)<\/tg-emoji>/g, '$1');
}

function sanitizeTelegramOptions(options = {}, field = '') {
  const sanitized = { ...options };
  if (!config.telegram.customTextEmoji) {
    delete sanitized.entities;
    delete sanitized.caption_entities;
    if (sanitized.reply_markup) {
      sanitized.reply_markup = stripButtonCustomEmojiIcons(sanitized.reply_markup);
    }
  }
  delete sanitized._fallback_text;
  delete sanitized._fallback_caption;
  delete sanitized._fallback_parse_mode;

  if (field && sanitized[field]) {
    sanitized[field] = stripCustomEmojiTags(sanitized[field]);
  }

  return sanitized;
}

export async function telegramJson(method, payload) {
  if (!config.telegram.token) return { skipped: true };
  const response = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Telegram ${method} failed: ${response.status} ${body}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return response.json();
}

export async function sendTelegramMessage(chatId, text, options = {}) {
  const sanitized = sanitizeTelegramOptions({
    chat_id: chatId,
    text: stripCustomEmojiTags(text),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options
  }, 'text');
  const payload = applyKnownCustomEmojiFallbacks(
    sanitized,
    'entities',
    (current) => fallbackMessagePayload(current, options)
  );
  return telegramJsonWithCustomEmojiFallback(
    'sendMessage',
    payload,
    'entities',
    (current) => fallbackMessagePayload(current, options)
  );
}

export async function editTelegramMessage(chatId, messageId, text, options = {}) {
  const sanitized = sanitizeTelegramOptions({
    chat_id: chatId,
    message_id: messageId,
    text: stripCustomEmojiTags(text),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options
  }, 'text');
  const payload = applyKnownCustomEmojiFallbacks(
    sanitized,
    'entities',
    (current) => fallbackMessagePayload(current, options)
  );

  try {
    return await telegramJsonWithCustomEmojiFallback(
      'editMessageText',
      payload,
      'entities',
      (current) => fallbackMessagePayload(current, options)
    );
  } catch (error) {
    if (/message is not modified/i.test(`${error.message || ''} ${error.body || ''}`)) {
      return { ok: true, notModified: true };
    }
    throw error;
  }
}

export async function sendTelegramAnimation(chatId, animation, options = {}) {
  const sanitized = sanitizeTelegramOptions({
    chat_id: chatId,
    animation,
    parse_mode: 'HTML',
    ...options
  }, 'caption');
  const payload = applyKnownCustomEmojiFallbacks(
    sanitized,
    'caption_entities',
    (current) => fallbackPhotoOptions(current, options)
  );
  return telegramJsonWithCustomEmojiFallback(
    'sendAnimation',
    payload,
    'caption_entities',
    (current) => fallbackPhotoOptions(current, options)
  );
}

export async function sendTelegramPhotoUrl(chatId, photoUrl, options = {}) {
  if (!config.telegram.token || !photoUrl) return { skipped: true };
  const sanitized = sanitizeTelegramOptions({
    chat_id: chatId,
    photo: photoUrl,
    parse_mode: 'HTML',
    ...options
  }, 'caption');
  const payload = applyKnownCustomEmojiFallbacks(
    sanitized,
    'caption_entities',
    (current) => fallbackPhotoOptions(current, options)
  );
  return telegramJsonWithCustomEmojiFallback(
    'sendPhoto',
    payload,
    'caption_entities',
    (current) => fallbackPhotoOptions(current, options)
  );
}

export async function sendTelegramPhotoFile(chatId, photoPath, options = {}) {
  if (!config.telegram.token || !photoPath) return { skipped: true };
  const photoBytes = readFileSync(photoPath);
  const sanitized = sanitizeTelegramOptions(options, 'caption');
  let currentOptions = applyKnownCustomEmojiFallbacks(
    sanitized,
    'caption_entities',
    (current) => fallbackPhotoOptions(current, options)
  );

  while (true) {
    const form = buildTelegramPhotoForm(chatId, photoPath, photoBytes, currentOptions);
    const response = await fetch(apiUrl('sendPhoto'), {
      method: 'POST',
      body: form
    });
    if (response.ok) return response.json();

    const body = await response.text();
    const error = new Error(`Telegram sendPhoto failed: ${response.status} ${body}`);
    error.status = response.status;
    error.body = body;
    const fallback = nextCustomEmojiFallback(
      error,
      currentOptions,
      'caption_entities',
      (current) => fallbackPhotoOptions(current, options)
    );
    if (!fallback) throw error;
    currentOptions = fallback;
  }
}

export async function editTelegramPhotoFile(chatId, messageId, photoPath, options = {}) {
  if (!config.telegram.token || !messageId || !photoPath) return { skipped: true };
  const photoBytes = readFileSync(photoPath);
  const sanitized = sanitizeTelegramOptions(options, 'caption');
  let currentOptions = applyKnownCustomEmojiFallbacks(
    sanitized,
    'caption_entities',
    (current) => fallbackPhotoOptions(current, options)
  );

  while (true) {
    const form = buildTelegramEditPhotoForm(chatId, messageId, photoPath, photoBytes, currentOptions);
    const response = await fetch(apiUrl('editMessageMedia'), {
      method: 'POST',
      body: form
    });
    if (response.ok) return response.json();

    const body = await response.text();
    if (/message is not modified/i.test(body)) return { ok: true, notModified: true };
    const error = new Error(`Telegram editMessageMedia failed: ${response.status} ${body}`);
    error.status = response.status;
    error.body = body;
    const fallback = nextCustomEmojiFallback(
      error,
      currentOptions,
      'caption_entities',
      (current) => fallbackPhotoOptions(current, options)
    );
    if (!fallback) throw error;
    currentOptions = fallback;
  }
}

export async function sendTelegramTextDocument(chatId, text, filename, options = {}) {
  if (!config.telegram.token) return { skipped: true };

  const documentBytes = Buffer.from(String(text ?? ''), 'utf8');
  const safeFilename = safeTelegramTextFilename(filename);
  const sanitized = sanitizeTelegramOptions(options, 'caption');
  let currentOptions = applyKnownCustomEmojiFallbacks(
    sanitized,
    'caption_entities',
    (current) => fallbackPhotoOptions(current, options)
  );

  while (true) {
    const form = buildTelegramTextDocumentForm(
      chatId,
      safeFilename,
      documentBytes,
      currentOptions
    );
    const response = await fetch(apiUrl('sendDocument'), {
      method: 'POST',
      body: form
    });
    if (response.ok) return response.json();

    const body = await response.text();
    const retryError = { status: response.status, body };
    const fallback = nextCustomEmojiFallback(
      retryError,
      currentOptions,
      'caption_entities',
      (current) => fallbackPhotoOptions(current, options)
    );
    if (!fallback) throw telegramDocumentError(response.status);
    currentOptions = fallback;
  }
}

function buildTelegramPhotoForm(chatId, photoPath, photoBytes, options = {}) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', new Blob([photoBytes], { type: photoContentType(photoPath) }), basename(photoPath));
  for (const [key, value] of Object.entries(options)) {
    if (key.startsWith('_')) continue;
    if (value === undefined || value === null || value === '') continue;
    form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return form;
}

function buildTelegramEditPhotoForm(chatId, messageId, photoPath, photoBytes, options = {}) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('message_id', String(messageId));
  form.append('photo', new Blob([photoBytes], { type: photoContentType(photoPath) }), basename(photoPath));

  const media = { type: 'photo', media: 'attach://photo' };
  const mediaOptionKeys = new Set([
    'caption',
    'parse_mode',
    'caption_entities',
    'show_caption_above_media',
    'has_spoiler'
  ]);
  for (const [key, value] of Object.entries(options)) {
    if (key.startsWith('_')) continue;
    if (value === undefined || value === null || value === '') continue;
    if (mediaOptionKeys.has(key)) media[key] = value;
    else form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  form.append('media', JSON.stringify(media));
  return form;
}

function photoContentType(photoPath) {
  const normalized = String(photoPath || '').toLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

function buildTelegramTextDocumentForm(chatId, filename, documentBytes, options = {}) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append(
    'document',
    new Blob([documentBytes], { type: 'text/plain; charset=utf-8' }),
    filename
  );
  for (const [key, value] of Object.entries(options)) {
    if (key.startsWith('_')) continue;
    if (value === undefined || value === null || value === '') continue;
    form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return form;
}

function safeTelegramTextFilename(filename) {
  const leaf = String(filename || '')
    .replaceAll('\\', '/')
    .split('/')
    .at(-1)
    .replace(/\.txt$/i, '');
  const stem = leaf
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 92);
  return `${stem || 'kaito-delivery'}.txt`;
}

function telegramDocumentError(status) {
  const error = new Error(`Telegram sendDocument failed: ${status}`);
  error.status = status;
  return error;
}

export async function sendTelegramSticker(chatId, sticker, options = {}) {
  if (!config.telegram.token || !sticker) return { skipped: true };
  const payload = applyKnownCustomEmojiFallbacks(
    sanitizeTelegramOptions({
      chat_id: chatId,
      sticker,
      ...options
    }),
    '',
    (current) => current
  );
  return telegramJsonWithCustomEmojiFallback(
    'sendSticker',
    payload,
    '',
    (current) => current
  );
}

export async function answerCallbackQuery(callbackQueryId, text = '') {
  if (!config.telegram.token || !callbackQueryId) return { skipped: true };
  return telegramJson('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false
  });
}

export function telegramUpdatesUrl(offset) {
  return apiUrl(`getUpdates?timeout=25&offset=${offset}`);
}

function shouldRetryWithoutCustomEmoji(error, payload, entityField) {
  if (
    !config.telegram.customTextEmoji
    || !Array.isArray(payload?.[entityField])
    || !payload[entityField].some((entity) => entity?.type === 'custom_emoji')
  ) return false;
  const details = `${error?.message || ''} ${error?.body || ''}`;
  return /ENTITY_TEXT_INVALID|CUSTOM_EMOJI_INVALID|DOCUMENT_INVALID/i.test(details);
}

function shouldRetryWithoutButtonCustomEmoji(error, payload) {
  if (!config.telegram.customTextEmoji || !hasButtonCustomEmojiIcons(payload?.reply_markup)) return false;
  const details = `${error?.message || ''} ${error?.body || ''}`;
  return /CUSTOM[\s_-]*EMOJI|EMOJI[\s_-]*CUSTOM|ICON_CUSTOM_EMOJI_ID|BUTTON_TYPE_INVALID|DOCUMENT_INVALID/i.test(details);
}

function isButtonCustomEmojiError(error) {
  const details = `${error?.message || ''} ${error?.body || ''}`;
  return /BUTTON[^\r\n]*CUSTOM[\s_-]*EMOJI|CUSTOM[\s_-]*EMOJI[^\r\n]*BUTTON|ICON_CUSTOM_EMOJI_ID|BUTTON_TYPE_INVALID/i.test(details);
}

function hasCustomEmojiEntities(entities = []) {
  return Array.isArray(entities)
    && entities.some((entity) => entity?.type === 'custom_emoji');
}

function isCustomEmojiEntityCapabilityCooldownActive() {
  if (Date.now() >= customEmojiEntityCapabilityRejectedUntil) {
    customEmojiEntityCapabilityRejectedUntil = 0;
    return false;
  }
  return true;
}

function startCustomEmojiEntityCapabilityCooldown() {
  customEmojiEntityCapabilityRejectedUntil = Date.now() + customEmojiCapabilityCooldownMs;
}

function isGenericCustomEmojiCapabilityError(error, payload, entityField) {
  const details = `${error?.message || ''} ${error?.body || ''}`;
  if (!/CUSTOM[\s_-]*EMOJI[\s_-]*INVALID|DOCUMENT_INVALID/i.test(details)) return false;

  const entities = Array.isArray(payload?.[entityField]) ? payload[entityField] : [];
  const candidateIds = [
    ...entities
      .filter((entity) => entity?.type === 'custom_emoji')
      .map((entity) => String(entity.custom_emoji_id || '')),
    ...collectButtonCustomEmojiIds(payload?.reply_markup)
  ].filter(Boolean);

  return candidateIds.length > 0
    && !candidateIds.some((customEmojiId) => errorMentionsCustomEmojiId(details, customEmojiId));
}

function hasRejectedCustomEmojiEntity(entities = [], scope = '') {
  return Array.isArray(entities)
    && entities.some((entity) => entity?.type === 'custom_emoji' && rejectedCustomEmojiIds.has(rejectedCustomEmojiKey(entity.custom_emoji_id, scope)));
}

function rememberRejectedCustomEmojiIds(error, entities = [], scope = '') {
  const candidateIds = (entities || [])
    .filter((entity) => entity?.type === 'custom_emoji')
    .map((entity) => entity.custom_emoji_id);
  rememberMentionedCustomEmojiIds(error, candidateIds, scope);
}

function rejectedCustomEmojiKey(customEmojiId, scope) {
  return `${scope}:${customEmojiId}`;
}

function hasButtonCustomEmojiIcons(value) {
  if (Array.isArray(value)) return value.some(hasButtonCustomEmojiIcons);
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, 'icon_custom_emoji_id')) return true;
  return Object.values(value).some(hasButtonCustomEmojiIcons);
}

function hasRejectedButtonCustomEmoji(replyMarkup) {
  return collectButtonCustomEmojiIds(replyMarkup)
    .some((customEmojiId) => rejectedCustomEmojiIds.has(rejectedCustomEmojiKey(customEmojiId, 'reply_markup')));
}

function rememberRejectedButtonCustomEmojiIds(error, replyMarkup) {
  rememberMentionedCustomEmojiIds(
    error,
    collectButtonCustomEmojiIds(replyMarkup),
    'reply_markup'
  );
}

function rememberMentionedCustomEmojiIds(error, candidateIds, scope) {
  const details = `${error?.message || ''} ${error?.body || ''}`;
  const uniqueIds = new Set(
    (candidateIds || [])
      .map((customEmojiId) => String(customEmojiId || '').trim())
      .filter(Boolean)
  );
  for (const customEmojiId of uniqueIds) {
    if (errorMentionsCustomEmojiId(details, customEmojiId)) {
      rejectedCustomEmojiIds.add(rejectedCustomEmojiKey(customEmojiId, scope));
    }
  }
}

function errorMentionsCustomEmojiId(details, customEmojiId) {
  const escapedId = customEmojiId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_-])${escapedId}($|[^A-Za-z0-9_-])`).test(details);
}

function collectButtonCustomEmojiIds(value, ids = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectButtonCustomEmojiIds(item, ids);
    return ids;
  }
  if (!value || typeof value !== 'object') return ids;
  if (value.icon_custom_emoji_id) ids.push(String(value.icon_custom_emoji_id));
  for (const nested of Object.values(value)) collectButtonCustomEmojiIds(nested, ids);
  return ids;
}

function stripButtonCustomEmojiIcons(value) {
  if (Array.isArray(value)) return value.map(stripButtonCustomEmojiIcons);
  if (!value || typeof value !== 'object') return value;

  const stripped = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'icon_custom_emoji_id') continue;
    stripped[key] = stripButtonCustomEmojiIcons(nested);
  }
  return stripped;
}

function fallbackButtonPayload(payload) {
  return {
    ...payload,
    reply_markup: stripButtonCustomEmojiIcons(payload.reply_markup)
  };
}

function applyKnownCustomEmojiFallbacks(payload, entityField, fallbackEntityPayload) {
  let fallback = payload;
  if (
    isCustomEmojiEntityCapabilityCooldownActive()
    && hasCustomEmojiEntities(fallback?.[entityField])
  ) {
    fallback = fallbackEntityPayload(fallback);
  }
  if (hasRejectedCustomEmojiEntity(fallback?.[entityField], entityField)) {
    fallback = fallbackEntityPayload(fallback);
  }
  if (hasRejectedButtonCustomEmoji(fallback?.reply_markup)) {
    fallback = fallbackButtonPayload(fallback);
  }
  return fallback;
}

function nextCustomEmojiFallback(error, payload, entityField, fallbackEntityPayload) {
  if (isButtonCustomEmojiError(error) && shouldRetryWithoutButtonCustomEmoji(error, payload)) {
    rememberRejectedButtonCustomEmojiIds(error, payload.reply_markup);
    return fallbackButtonPayload(payload);
  }
  if (
    hasCustomEmojiEntities(payload?.[entityField])
    && isGenericCustomEmojiCapabilityError(error, payload, entityField)
  ) {
    startCustomEmojiEntityCapabilityCooldown();
    return fallbackEntityPayload(payload);
  }
  if (
    hasButtonCustomEmojiIcons(payload?.reply_markup)
    && isGenericCustomEmojiCapabilityError(error, payload, entityField)
  ) {
    return fallbackButtonPayload(payload);
  }
  if (shouldRetryWithoutCustomEmoji(error, payload, entityField)) {
    rememberRejectedCustomEmojiIds(error, payload[entityField], entityField);
    return fallbackEntityPayload(payload);
  }
  if (shouldRetryWithoutButtonCustomEmoji(error, payload)) {
    rememberRejectedButtonCustomEmojiIds(error, payload.reply_markup);
    return fallbackButtonPayload(payload);
  }
  return null;
}

async function telegramJsonWithCustomEmojiFallback(method, payload, entityField, fallbackEntityPayload) {
  let currentPayload = payload;
  while (true) {
    try {
      return await telegramJson(method, currentPayload);
    } catch (error) {
      const fallback = nextCustomEmojiFallback(
        error,
        currentPayload,
        entityField,
        fallbackEntityPayload
      );
      if (!fallback) throw error;
      currentPayload = fallback;
    }
  }
}

function fallbackMessagePayload(payload, options = {}) {
  const fallback = { ...payload };
  delete fallback.entities;
  fallback.text = stripCustomEmojiTags(options._fallback_text || payload.text || '');
  fallback.parse_mode = options._fallback_parse_mode || 'HTML';
  return fallback;
}

function fallbackPhotoOptions(payload, options = {}) {
  const fallback = { ...payload };
  delete fallback.caption_entities;
  fallback.caption = stripCustomEmojiTags(options._fallback_caption || payload.caption || '');
  fallback.parse_mode = options._fallback_parse_mode || 'HTML';
  return fallback;
}
