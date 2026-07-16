import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { config } from '../src/config.js';

const RETRO_ALT = '\u{1F524}';

const args = parseArgs(process.argv.slice(2));
const token = config.telegram.token;
const chatId = args.chatId || process.env.TELEGRAM_PROBE_CHAT_ID || process.env.TELEGRAM_TEST_CHAT_ID || '';
const only = String(args.only || '').trim().toLowerCase();
const delayMs = Number(args.delayMs || 650);
const photoPath = resolve(process.cwd(), args.photo || config.telegram.startImageFile || '');
const includeCaptionEntities = Boolean(args.includeCaptionEntities || args.includeCaption);

if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN.');
if (!chatId) {
  throw new Error('Missing chat id. Run: npm.cmd run telegram:probe-custom-emojis -- --chat-id YOUR_TELEGRAM_ID');
}

const maps = {
  robo: loadJson(config.telegram.roboEmojiMapFile),
  slogan: loadJson(config.telegram.sloganEmojiMapFile),
  sloganTile: loadJson(config.telegram.sloganTileEmojiMapFile),
  ui: loadJson(config.telegram.uiEmojiMapFile),
  banner: loadJson(config.telegram.bannerEmojiMapFile),
  retro: loadJson(config.telegram.retroFontEmojiMapFile)
};

const variants = buildVariants({ chatId, photoPath, maps })
  .filter((variant) => !only || variant.name.toLowerCase().includes(only))
  .filter((variant) => includeCaptionEntities || !variant.name.toLowerCase().startsWith('photo-caption-entities-'));

if (!variants.length) throw new Error(`No probe variants matched --only "${only}".`);

const ids = unique(variants.flatMap((variant) => variant.customEmojiIds || []));
if (ids.length) {
  const stickerCheck = await telegramJson('getCustomEmojiStickers', { custom_emoji_ids: ids.slice(0, 200) });
  console.log(JSON.stringify({
    probe: 'getCustomEmojiStickers',
    ok: stickerCheck.ok,
    requested: ids.length,
    returned: Array.isArray(stickerCheck.result) ? stickerCheck.result.length : 0
  }, null, 2));
}

const results = [];
for (const variant of variants) {
  await sleep(delayMs);
  const result = await runVariant(variant);
  results.push(result);
  const status = result.ok ? 'OK' : 'FAIL';
  console.log(`[probe] ${status} ${variant.name}: ${result.summary}`);
}

const passed = results.filter((result) => result.ok).length;
console.log(JSON.stringify({
  ok: true,
  checked: variants.length,
  passed,
  failed: variants.length - passed,
  note: 'OK variants were actually sent to the target Telegram chat.'
}, null, 2));

function buildVariants({ chatId, photoPath, maps }) {
  const roboWave = emojiCandidate('robo.wave', '👋', roboAliasId(maps.robo, 'wave'));
  const roboWow = emojiCandidate('robo.wow', '🤩', roboAliasId(maps.robo, 'wow'));
  const roboHundred = emojiCandidate('robo.hundred', '💯', roboAliasId(maps.robo, 'hundred'));
  const sloganWelcome = emojiCandidate('slogan.welcome', '✨', mappedId(maps.slogan, 'welcome'));
  const sloganCatalog = emojiCandidate('slogan.catalog', '🛍️', mappedId(maps.slogan, 'catalog'));
  const sloganPayment = emojiCandidate('slogan.payment', '💳', mappedId(maps.slogan, 'payment'));
  const sloganDelivery = emojiCandidate('slogan.delivery', '📦', mappedId(maps.slogan, 'delivery'));
  const uiProducts = emojiCandidate('ui.products', '🛒', mappedId(maps.ui, 'products'));
  const uiTopup = emojiCandidate('ui.topup', '💳', mappedId(maps.ui, 'topup'));

  const welcomeEntities = buildWelcomeEntityText({
    wave: roboWave,
    welcome: sloganWelcome,
    wow: roboWow,
    catalog: sloganCatalog,
    payment: sloganPayment,
    delivery: sloganDelivery,
    hundred: roboHundred,
    products: uiProducts,
    topup: uiTopup
  });
  const retroTitle = buildRetroTitle('KAITO KID AI SHOP', maps.retro);
  const bannerTitle = buildBannerEntityText({
    kaito: emojiCandidate('banner.kaito', '✨', mappedId(maps.banner, 'kaito')),
    hot: emojiCandidate('banner.hot', '🔥', mappedId(maps.banner, 'hot')),
    vip: emojiCandidate('banner.vip', '👑', mappedId(maps.banner, 'vip')),
    minigame: emojiCandidate('banner.minigame', '🎮', mappedId(maps.banner, 'minigame'))
  });
  const dailyUpdateTiles = buildSloganTileEntityText(maps.sloganTile, 'daily_update');

  const variants = [
    jsonVariant('message-html-robo-solo', 'sendMessage', {
      chat_id: chatId,
      text: `${htmlEmoji(roboWave)} HTML solo`,
      parse_mode: 'HTML'
    }, [roboWave]),
    jsonVariant('message-html-robo-with-bold', 'sendMessage', {
      chat_id: chatId,
      text: `${htmlEmoji(roboWave)} <b>KAITO KID AI SHOP</b> HTML bold`,
      parse_mode: 'HTML'
    }, [roboWave]),
    jsonVariant('message-entities-robo-solo', 'sendMessage', {
      chat_id: chatId,
      ...singleEntityPayload(roboWave, ' entity solo')
    }, [roboWave]),
    jsonVariant('message-entities-robo-with-bold', 'sendMessage', entityWithBoldPayload(roboWave), [roboWave]),
    jsonVariant('message-html-slogan-solo', 'sendMessage', {
      chat_id: chatId,
      text: `${htmlEmoji(sloganWelcome)} slogan HTML solo`,
      parse_mode: 'HTML'
    }, [sloganWelcome]),
    jsonVariant('message-entities-slogan-solo', 'sendMessage', {
      chat_id: chatId,
      ...singleEntityPayload(sloganWelcome, ' slogan entity solo')
    }, [sloganWelcome]),
    jsonVariant('message-entities-retro-title', 'sendMessage', {
      chat_id: chatId,
      ...retroTitle
    }, retroTitle.customEmojiIds),
    jsonVariant('message-entities-welcome-nonoverlap', 'sendMessage', {
      chat_id: chatId,
      ...welcomeEntities
    }, welcomeEntities.customEmojiIds),
    jsonVariant('message-entities-banner-title', 'sendMessage', {
      chat_id: chatId,
      ...bannerTitle
    }, bannerTitle.customEmojiIds),
    jsonVariant('message-entities-slogan-tiles-daily-update', 'sendMessage', {
      chat_id: chatId,
      ...dailyUpdateTiles
    }, dailyUpdateTiles.customEmojiIds),
    jsonVariant('message-html-welcome-short', 'sendMessage', {
      chat_id: chatId,
      text: [
        `${htmlEmoji(roboWave)} ${htmlEmoji(sloganWelcome)} <b>KAITO KID AI SHOP</b> chào bạn`,
        `<i>${htmlEmoji(roboWow)} Shop AI/MMO tự động</i>`
      ].join('\n'),
      parse_mode: 'HTML'
    }, [roboWave, sloganWelcome, roboWow])
  ];

  if (existsSync(photoPath)) {
    variants.push(
      photoVariant('photo-caption-html-robo-solo', chatId, photoPath, {
        caption: `${htmlEmoji(roboWave)} photo HTML solo`,
        parse_mode: 'HTML'
      }, [roboWave]),
      photoVariant('photo-caption-entities-robo-solo', chatId, photoPath, singleCaptionEntityPayload(roboWave, ' photo entity solo'), [roboWave]),
      photoVariant('photo-caption-entities-retro-title', chatId, photoPath, retroCaptionPayload(retroTitle), retroTitle.customEmojiIds),
      photoVariant('photo-caption-entities-banner-title', chatId, photoPath, captionPayload(bannerTitle), bannerTitle.customEmojiIds),
      photoVariant('photo-caption-entities-slogan-tiles-daily-update', chatId, photoPath, captionPayload(dailyUpdateTiles), dailyUpdateTiles.customEmojiIds),
      photoVariant('photo-caption-entities-welcome-nonoverlap', chatId, photoPath, captionPayload(welcomeEntities), welcomeEntities.customEmojiIds)
    );
  }

  return variants.filter((variant) => {
    if (!variant.customEmojiIds?.length) {
      variant.skipReason = 'missing custom emoji id';
      return false;
    }
    return true;
  });
}

function buildWelcomeEntityText(parts) {
  const builder = entityBuilder();
  builder.custom(parts.wave).text(' ').custom(parts.welcome).text(' ');
  builder.bold('KAITO KID AI SHOP').text(' chào bạn\n');
  builder.custom(parts.wow).text(' Shop AI/MMO tự động: ');
  builder.custom(parts.catalog).text(' Chọn nhanh - ');
  builder.custom(parts.payment).text(' Thanh toán gọn - ');
  builder.custom(parts.delivery).text(' Nhận hàng liền ');
  builder.custom(parts.hundred).text('\n\n');
  builder.custom(parts.products).text(' Sản phẩm hot luôn sẵn trong menu\n');
  builder.custom(parts.topup).text(' Nạp tiền/đặt gói riêng khi cần');
  return builder.payload();
}

function buildBannerEntityText(parts) {
  const builder = entityBuilder();
  builder.custom(parts.kaito).text(' KAITO KID AI SHOP\n');
  builder.custom(parts.hot).text(' HOT DEAL  ');
  builder.custom(parts.vip).text(' VIP SLOT  ');
  builder.custom(parts.minigame).text(' MINIGAME');
  return builder.payload();
}

function buildSloganTileEntityText(map, key) {
  const slogan = map.slogans?.[key] || {};
  const builder = entityBuilder();
  for (const tile of slogan.tiles || []) {
    builder.custom(emojiCandidate(`slogan-tile.${tile.key || tile.index}`, tile.emoji || slogan.emoji || '\u{1F3AB}', tile.customEmojiId));
  }
  builder.text(' chào bạn');
  return builder.payload();
}

function buildRetroTitle(title, retroMap) {
  const builder = entityBuilder();
  for (const character of title) {
    if (character === ' ') {
      builder.text(' ');
      continue;
    }
    const id = retroMap.customEmojiIdsByCharacter?.[character.toUpperCase()];
    builder.custom(emojiCandidate(`retro.${character}`, retroAlt(character, retroMap), id));
  }
  builder.text(' chào bạn');
  return builder.payload();
}

function retroAlt(character, retroMap) {
  return retroMap.customEmojiAltByCharacter?.[String(character || '').toUpperCase()] || RETRO_ALT;
}

function entityBuilder() {
  let text = '';
  const entities = [];
  return {
    text(value) {
      text += String(value || '');
      return this;
    },
    custom(candidate) {
      const fallback = String(candidate?.emoji || '');
      if (!candidate?.id || !fallback) {
        text += fallback;
        return this;
      }
      const offset = text.length;
      text += fallback;
      entities.push({
        type: 'custom_emoji',
        offset,
        length: fallback.length,
        custom_emoji_id: candidate.id
      });
      return this;
    },
    bold(value) {
      const source = String(value || '');
      const offset = text.length;
      text += source;
      entities.push({ type: 'bold', offset, length: source.length });
      return this;
    },
    payload() {
      return {
        text,
        entities,
        customEmojiIds: entities
          .filter((entity) => entity.type === 'custom_emoji')
          .map((entity) => entity.custom_emoji_id)
      };
    }
  };
}

function singleEntityPayload(candidate, suffix) {
  const text = `${candidate.emoji}${suffix}`;
  return {
    text,
    entities: [{
      type: 'custom_emoji',
      offset: 0,
      length: candidate.emoji.length,
      custom_emoji_id: candidate.id
    }]
  };
}

function singleCaptionEntityPayload(candidate, suffix) {
  const payload = singleEntityPayload(candidate, suffix);
  return {
    caption: payload.text,
    caption_entities: payload.entities
  };
}

function entityWithBoldPayload(candidate) {
  const builder = entityBuilder();
  builder.custom(candidate).text(' ').bold('KAITO KID AI SHOP').text(' entity + bold');
  return {
    chat_id: chatId,
    ...builder.payload()
  };
}

function captionPayload(payload) {
  return {
    caption: payload.text,
    caption_entities: payload.entities
  };
}

function retroCaptionPayload(retroPayload) {
  return captionPayload(retroPayload);
}

function htmlEmoji(candidate) {
  return `<tg-emoji emoji-id="${escapeHtml(candidate.id)}">${escapeHtml(candidate.emoji)}</tg-emoji>`;
}

function emojiCandidate(name, emoji, id) {
  return {
    name,
    emoji: String(emoji || ''),
    id: String(id || '')
  };
}

function roboAliasId(map, alias) {
  return map.customEmojiIdsByAlias?.[alias]?.[0] || '';
}

function mappedId(map, key) {
  const byFile = map.customEmojiIdsByFile || {};
  const direct = byFile[`${key}.webm`] || byFile[`${key}.png`] || byFile[`${key}.webp`];
  if (direct) return direct;
  const normalized = normalizeKey(key);
  return map.customEmojiIdsByBrand?.[normalized]?.[0] || '';
}

function jsonVariant(name, method, payload, candidatesOrIds) {
  return {
    name,
    method,
    kind: 'json',
    payload,
    customEmojiIds: toCustomEmojiIds(candidatesOrIds)
  };
}

function photoVariant(name, chatId, photoPath, options, candidatesOrIds) {
  return {
    name,
    method: 'sendPhoto',
    kind: 'photo',
    chatId,
    photoPath,
    options,
    customEmojiIds: toCustomEmojiIds(candidatesOrIds)
  };
}

function toCustomEmojiIds(values) {
  return unique((Array.isArray(values) ? values : [values])
    .map((value) => (typeof value === 'string' ? value : value?.id || value))
    .filter(Boolean));
}

async function runVariant(variant) {
  try {
    const response = variant.kind === 'photo'
      ? await telegramPhoto(variant.chatId, variant.photoPath, variant.options)
      : await telegramJson(variant.method, variant.payload);
    return {
      name: variant.name,
      ok: Boolean(response.ok),
      summary: response.ok
        ? `message_id=${response.result?.message_id || 'n/a'}`
        : response.description || 'not ok'
    };
  } catch (error) {
    return {
      name: variant.name,
      ok: false,
      summary: error.message
    };
  }
}

async function telegramJson(method, payload) {
  const response = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseTelegramResponse(method, response);
}

async function telegramPhoto(chatId, photoPath, options = {}) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', new Blob([readFileSync(photoPath)], { type: 'image/png' }), basename(photoPath));
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === '') continue;
    form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }

  const response = await fetch(apiUrl('sendPhoto'), {
    method: 'POST',
    body: form
  });
  return parseTelegramResponse('sendPhoto', response);
}

async function parseTelegramResponse(method, response) {
  let bodyText = '';
  let data = {};
  try {
    bodyText = await response.text();
    data = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    data = { ok: false, description: bodyText || 'Telegram returned a non-JSON response.' };
  }

  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status || 'unknown'} ${data.description || bodyText || 'unknown error'}`);
  }
  return data;
}

function apiUrl(method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

function loadJson(filePath) {
  if (!filePath || !existsSync(filePath)) return {};
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
