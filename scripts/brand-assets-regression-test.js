import assert from 'node:assert/strict';
import { DEFAULT_CATALOG_PRODUCTS } from '../src/catalog.js';
import { getBrandAsset, normalizeBrandKey } from '../public/brand-assets.js';

const expectedLogos = new Map([
  ['chatgpt', '/brand/ChatGPT.png'],
  ['claude', '/brand/Claude.png'],
  ['gemini', '/brand/Gemini.png'],
  ['perplexity', '/brand/Perplexity.png'],
  ['cursor', '/brand/Cursor.png'],
  ['canva', 'simple-icons@latest/icons/canva.svg'],
  ['capcut', 'upload.wikimedia.org/wikipedia/commons/1/1c/Capcut-icon.svg'],
  ['figma', 'simple-icons@latest/icons/figma.svg'],
  ['google', 'simple-icons@latest/icons/google.svg'],
  ['gmail', 'simple-icons@latest/icons/gmail.svg'],
  ['microsoft', 'simple-icons@latest/icons/microsoft.svg'],
  ['notion', '/brand/Notion.png'],
  ['paypal', 'simple-icons@latest/icons/paypal.svg'],
  ['telegram', 'simple-icons@latest/icons/telegram.svg'],
  ['tiktok', 'simple-icons@latest/icons/tiktok.svg'],
  ['facebook', 'simple-icons@latest/icons/facebook.svg'],
  ['discord', 'simple-icons@latest/icons/discord.svg']
]);

const catalogBrands = [...new Set(DEFAULT_CATALOG_PRODUCTS.map((product) => product.brand))];
for (const brand of catalogBrands) {
  const key = normalizeBrandKey(brand);
  const asset = getBrandAsset(brand);
  assert.ok(asset.logo, `${brand} should have an exact brand logo URL.`);
  assert.ok(asset.sourceName, `${brand} should record the icon source.`);
  assert.ok(asset.sourceUrl, `${brand} should record a source page URL.`);
  assert.ok(asset.logo.includes(expectedLogos.get(key)), `${brand} should use the expected brand logo source.`);
  assert.equal(asset.exact, true, `${brand} should be marked as an exact brand asset.`);
}

console.log(JSON.stringify({ ok: true, checked: 'brand icon sources', brands: catalogBrands.length }, null, 2));
