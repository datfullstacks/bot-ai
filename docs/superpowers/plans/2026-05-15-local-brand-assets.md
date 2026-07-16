# Local Brand Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use local PNG files from `public/brand` as the preferred logo source for catalog brands that have matching local assets.

**Architecture:** Keep `public/brand-assets.js` as the single shared brand asset registry. Admin UI continues to render `getBrandAsset(brand).logo`, while Telegram keeps using the existing compact text icon path.

**Tech Stack:** Node.js ES modules, browser static assets under `public`, existing regression scripts.

---

### Task 1: Update Brand Asset Registry

**Files:**
- Modify: `public/brand-assets.js`
- Test: `scripts/brand-assets-regression-test.js`
- Test: `scripts/admin-dashboard-ui-regression-test.js`

- [ ] **Step 1: Update failing expectations first**

Change `expectedLogos` in `scripts/brand-assets-regression-test.js` so local brands expect local PNG paths:

```js
const expectedLogos = new Map([
  ['chatgpt', '/brand/ChatGPT.png'],
  ['claude', '/brand/Claude.png'],
  ['gemini', '/brand/Gemini.png'],
  ['perplexity', '/brand/Perplexity.png'],
  ['canva', 'simple-icons@latest/icons/canva.svg'],
  ['capcut', 'upload.wikimedia.org/wikipedia/commons/1/1c/Capcut-icon.svg'],
  ['google', 'simple-icons@latest/icons/google.svg'],
  ['microsoft', 'simple-icons@latest/icons/microsoft.svg'],
  ['notion', '/brand/Notion.png'],
  ['telegram', 'simple-icons@latest/icons/telegram.svg'],
  ['tiktok', 'simple-icons@latest/icons/tiktok.svg'],
  ['discord', 'simple-icons@latest/icons/discord.svg']
]);
```

Change the AI brand expectations in `scripts/admin-dashboard-ui-regression-test.js`:

```js
for (const [brand, expected] of [
  ['ChatGPT', '/brand/ChatGPT.png'],
  ['Claude', '/brand/Claude.png'],
  ['Gemini', '/brand/Gemini.png'],
  ['Telegram', 'telegram.svg']
]) {
  const asset = getBrandAsset(brand);
  assert.ok(brandAssets.toLowerCase().includes(brand.toLowerCase()), `Brand asset map should include ${brand}.`);
  assert.ok(asset.logo.includes(expected), `Brand asset map should use the expected logo source for ${brand}.`);
  assert.equal(asset.exact, true, `${brand} should use an exact brand logo.`);
}
```

- [ ] **Step 2: Run focused tests and confirm they fail before implementation**

Run:

```powershell
npm run test:brand-icons
npm run test:admin-dashboard-ui
```

Expected: tests fail because `public/brand-assets.js` still points `ChatGPT`, `Claude`, `Gemini`, `Perplexity`, and `Notion` at remote Simple Icons URLs.

- [ ] **Step 3: Implement local PNG source helper**

In `public/brand-assets.js`, add a local helper and source metadata:

```js
const localBrandSource = '/brand';

function localBrandLogo(fileName, icon, fallbackIcon) {
  return {
    icon,
    logo: `${localBrandSource}/${fileName}`,
    fallbackIcon,
    sourceName: 'Local brand asset',
    sourceUrl: `${localBrandSource}/${fileName}`,
    exact: true
  };
}
```

Then change matching entries in `BRAND_ASSETS`:

```js
chatgpt: localBrandLogo('ChatGPT.png', '🤖', 'bot'),
claude: localBrandLogo('Claude.png', '🧠', 'brain'),
gemini: localBrandLogo('Gemini.png', '✨', 'sparkles'),
perplexity: localBrandLogo('Perplexity.png', '🔎', 'search'),
notion: localBrandLogo('Notion.png', '▣', 'notebook-tabs'),
```

Keep existing remote entries for `canva`, `capcut`, `google`, `microsoft`, `telegram`, `tiktok`, and `discord`.

- [ ] **Step 4: Run focused tests and confirm they pass**

Run:

```powershell
npm run test:brand-icons
npm run test:admin-dashboard-ui
```

Expected: both scripts pass and report JSON success.

### Task 2: Final Verification

**Files:**
- Verify: `public/brand-assets.js`
- Verify: `scripts/brand-assets-regression-test.js`
- Verify: `scripts/admin-dashboard-ui-regression-test.js`

- [ ] **Step 1: Run syntax and relevant regression checks**

Run:

```powershell
npm run check
npm run test:telegram
npm run test:brand-icons
npm run test:admin-dashboard-ui
```

Expected: all commands exit with status 0.

- [ ] **Step 2: Inspect worktree**

Run:

```powershell
git status --short
```

Expected: modified files include the local brand asset implementation and the docs created for this change. Existing untracked repository files may still appear because this checkout started with untracked files.
