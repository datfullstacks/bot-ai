import assert from 'node:assert/strict';
import {
  generateGeminiProductDraft,
  geminiProductAssistantStatus,
  normalizeGeminiProductDraft,
  normalizeProductAssistantInput
} from '../src/geminiProductAssistant.js';
import { normalizeProductEmoji } from '../src/catalog.js';

assert.deepEqual(geminiProductAssistantStatus({ apiKey: '', model: 'gemini-2.5-flash' }), {
  configured: false,
  model: 'gemini-2.5-flash'
});
assert.equal(normalizeProductEmoji('✨', { strict: true }), '✨');
assert.equal(normalizeProductEmoji('👨‍💻', { strict: true }), '👨‍💻');
assert.throws(
  () => normalizeProductEmoji('✨🚀', { strict: true }),
  /exactly one emoji/
);
assert.throws(
  () => normalizeProductAssistantInput({}),
  /nhập mô tả ngắn/i
);
await assert.rejects(
  generateGeminiProductDraft({ brief: 'Gemini Advanced một tháng' }, {
    geminiConfig: { apiKey: '', model: 'gemini-2.5-flash', requestTimeoutMs: 1000 },
    fetchImpl: async () => { throw new Error('must not call fetch'); }
  }),
  (error) => error.statusCode === 503 && error.code === 'gemini_not_configured'
);

let requestUrl = '';
let requestOptions;
const responseDraft = {
  category: 'AI Accounts',
  brand: 'Gemini',
  packageType: 'Advanced 1M',
  name: 'Gemini Advanced - 1 tháng',
  sku: 'Gemini Advanced 1M',
  emoji: '✨',
  description: 'Gói Gemini Advanced cho học tập, research và công việc hằng ngày.',
  officialPriceNote: '',
  accountType: 'Tài khoản riêng theo mô tả bàn giao.',
  warrantyPolicy: 'Bảo hành theo điều kiện shop xác nhận.',
  replacementPolicy: 'Đổi khi dữ liệu bàn giao lỗi và được xác minh.'
};
const result = await generateGeminiProductDraft({
  brief: 'Gemini Advanced 1 tháng cho research',
  current: { brand: 'Gemini', fulfillmentMode: 'inventory', deliveryMode: 'text' }
}, {
  geminiConfig: { apiKey: 'test-secret-key', model: 'gemini-2.5-flash', requestTimeoutMs: 1000 },
  fetchImpl: async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(responseDraft) }] } }]
      })
    };
  }
});

assert.match(requestUrl, /gemini-2\.5-flash:generateContent$/);
assert.equal(requestUrl.includes('test-secret-key'), false, 'API key must never appear in the URL.');
assert.equal(requestOptions.headers['x-goog-api-key'], 'test-secret-key');
const requestBody = JSON.parse(requestOptions.body);
assert.equal(requestBody.generationConfig.responseMimeType, 'application/json');
assert.equal(requestBody.generationConfig.responseSchema.properties.emoji.type, 'STRING');
assert.match(requestBody.contents[0].parts[0].text, /không tự bịa giá hãng/i);
assert.equal(result.model, 'gemini-2.5-flash');
assert.equal(result.draft.sku, 'gemini-advanced-1m');
assert.equal(result.draft.emoji, '✨');
assert.equal(result.draft.description, responseDraft.description);

const fallback = normalizeGeminiProductDraft({
  brand: 'Claude',
  name: 'Claude Pro',
  sku: 'Claude Pro 1M',
  emoji: 'not-an-emoji'
});
assert.equal(fallback.emoji, '🧠');
assert.equal(fallback.sku, 'claude-pro-1m');

console.log(JSON.stringify({
  ok: true,
  checked: 'Gemini product drafts, structured output, secret isolation and product emoji validation'
}, null, 2));
