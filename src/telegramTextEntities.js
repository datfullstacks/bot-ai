const OPEN_TAGS = new Map([
  ['<b>', 'bold'],
  ['<strong>', 'bold'],
  ['<code>', 'code']
]);

const CLOSE_TAGS = new Map([
  ['</b>', 'bold'],
  ['</strong>', 'bold'],
  ['</code>', 'code']
]);

const HTML_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['#39', "'"]
]);

export function buildCustomEmojiEntityPayload(htmlText, customEmojiCandidates = [], options = {}) {
  if (options.enabled === false) return null;

  const parsed = parseLimitedHtml(String(htmlText || ''));
  const customEntities = [];
  const nextOffsetByEmoji = new Map();

  for (const candidate of customEmojiCandidates) {
    const emoji = String(candidate?.emoji || '');
    const customEmojiId = String(candidate?.customEmojiId || candidate?.id || '');
    if (!emoji || !customEmojiId) continue;

    const from = nextOffsetByEmoji.get(emoji) || 0;
    const offset = parsed.text.indexOf(emoji, from);
    if (offset === -1) continue;

    nextOffsetByEmoji.set(emoji, offset + emoji.length);
    customEntities.push({
      type: 'custom_emoji',
      offset,
      length: emoji.length,
      custom_emoji_id: customEmojiId
    });
  }

  if (!customEntities.length) return null;

  return {
    text: parsed.text,
    entities: [...parsed.entities, ...customEntities]
      .filter((entity) => entity.length > 0)
      .sort((left, right) => left.offset - right.offset || right.length - left.length)
  };
}

export function parseLimitedHtml(htmlText) {
  let text = '';
  const entities = [];
  const stack = [];

  for (let index = 0; index < htmlText.length;) {
    const tag = matchTag(htmlText, index, OPEN_TAGS);
    if (tag) {
      stack.push({ type: tag.type, offset: text.length });
      index += tag.source.length;
      continue;
    }

    const closeTag = matchTag(htmlText, index, CLOSE_TAGS);
    if (closeTag) {
      const stackIndex = stack.findLastIndex((item) => item.type === closeTag.type);
      if (stackIndex !== -1) {
        const [opened] = stack.splice(stackIndex, 1);
        entities.push({
          type: opened.type,
          offset: opened.offset,
          length: text.length - opened.offset
        });
      }
      index += closeTag.source.length;
      continue;
    }

    const ignoredTag = matchIgnoredTag(htmlText, index);
    if (ignoredTag) {
      index += ignoredTag.length;
      continue;
    }

    const decoded = decodeHtmlEntityAt(htmlText, index);
    if (decoded) {
      text += decoded.value;
      index += decoded.length;
      continue;
    }

    text += htmlText[index];
    index += 1;
  }

  return { text, entities };
}

function matchTag(text, index, tags) {
  for (const [source, type] of tags.entries()) {
    if (text.slice(index, index + source.length).toLowerCase() === source) {
      return { source: text.slice(index, index + source.length), type };
    }
  }
  return null;
}

function matchIgnoredTag(text, index) {
  for (const tag of ['<i>', '</i>', '<em>', '</em>']) {
    if (text.slice(index, index + tag.length).toLowerCase() === tag) return tag;
  }
  return '';
}

function decodeHtmlEntityAt(text, index) {
  if (text[index] !== '&') return null;
  const semicolon = text.indexOf(';', index + 1);
  if (semicolon === -1 || semicolon - index > 12) return null;

  const name = text.slice(index + 1, semicolon);
  if (HTML_ENTITIES.has(name)) {
    return { value: HTML_ENTITIES.get(name), length: semicolon - index + 1 };
  }

  if (/^#x[0-9a-f]+$/i.test(name)) {
    return { value: String.fromCodePoint(Number.parseInt(name.slice(2), 16)), length: semicolon - index + 1 };
  }

  if (/^#[0-9]+$/.test(name)) {
    return { value: String.fromCodePoint(Number.parseInt(name.slice(1), 10)), length: semicolon - index + 1 };
  }

  return null;
}
