import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { config } from './config.js';

const rejectedCustomEmojiIds = new Set();

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
  const payload = hasRejectedCustomEmojiEntity(sanitized.entities, 'entities')
    ? fallbackMessagePayload(sanitized, options)
    : sanitized;

  try {
    return await telegramJson('sendMessage', payload);
  } catch (error) {
    if (!shouldRetryWithoutCustomEmoji(error, payload, 'entities')) throw error;
    rememberRejectedCustomEmojiIds(payload.entities, 'entities');
    return telegramJson('sendMessage', fallbackMessagePayload(payload, options));
  }
}

export async function sendTelegramAnimation(chatId, animation, options = {}) {
  return telegramJson('sendAnimation', sanitizeTelegramOptions({
    chat_id: chatId,
    animation,
    parse_mode: 'HTML',
    ...options
  }, 'caption'));
}

export async function sendTelegramPhotoFile(chatId, photoPath, options = {}) {
  if (!config.telegram.token || !photoPath) return { skipped: true };
  const photoBytes = readFileSync(photoPath);
  const sanitized = sanitizeTelegramOptions(options, 'caption');
  const initialOptions = hasRejectedCustomEmojiEntity(sanitized.caption_entities, 'caption_entities')
    ? fallbackPhotoOptions(sanitized, options)
    : sanitized;
  const form = buildTelegramPhotoForm(chatId, photoPath, photoBytes, initialOptions);

  const response = await fetch(apiUrl('sendPhoto'), {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Telegram sendPhoto failed: ${response.status} ${body}`);
    error.status = response.status;
    error.body = body;
    if (!shouldRetryWithoutCustomEmoji(error, initialOptions, 'caption_entities')) throw error;
    rememberRejectedCustomEmojiIds(initialOptions.caption_entities, 'caption_entities');
    const fallbackForm = buildTelegramPhotoForm(chatId, photoPath, photoBytes, fallbackPhotoOptions(initialOptions, options));
    const fallbackResponse = await fetch(apiUrl('sendPhoto'), {
      method: 'POST',
      body: fallbackForm
    });
    if (!fallbackResponse.ok) {
      const fallbackBody = await fallbackResponse.text();
      const fallbackError = new Error(`Telegram sendPhoto failed: ${fallbackResponse.status} ${fallbackBody}`);
      fallbackError.status = fallbackResponse.status;
      fallbackError.body = fallbackBody;
      throw fallbackError;
    }
    return fallbackResponse.json();
  }
  return response.json();
}

function buildTelegramPhotoForm(chatId, photoPath, photoBytes, options = {}) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', new Blob([photoBytes], { type: 'image/png' }), basename(photoPath));
  for (const [key, value] of Object.entries(options)) {
    if (key.startsWith('_')) continue;
    if (value === undefined || value === null || value === '') continue;
    form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return form;
}

export async function sendTelegramSticker(chatId, sticker, options = {}) {
  if (!config.telegram.token || !sticker) return { skipped: true };
  return telegramJson('sendSticker', {
    chat_id: chatId,
    sticker,
    ...options
  });
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
  if (!config.telegram.customTextEmoji || !Array.isArray(payload?.[entityField]) || !payload[entityField].length) return false;
  const details = `${error?.message || ''} ${error?.body || ''}`;
  return /ENTITY_TEXT_INVALID|CUSTOM_EMOJI_INVALID|DOCUMENT_INVALID/i.test(details);
}

function hasRejectedCustomEmojiEntity(entities = [], scope = '') {
  return Array.isArray(entities)
    && entities.some((entity) => entity?.type === 'custom_emoji' && rejectedCustomEmojiIds.has(rejectedCustomEmojiKey(entity.custom_emoji_id, scope)));
}

function rememberRejectedCustomEmojiIds(entities = [], scope = '') {
  for (const entity of entities || []) {
    if (entity?.type === 'custom_emoji' && entity.custom_emoji_id) {
      rejectedCustomEmojiIds.add(rejectedCustomEmojiKey(entity.custom_emoji_id, scope));
    }
  }
}

function rejectedCustomEmojiKey(customEmojiId, scope) {
  return `${scope}:${customEmojiId}`;
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
