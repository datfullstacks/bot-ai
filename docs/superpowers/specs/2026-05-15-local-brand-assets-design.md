# Local Brand Assets Design

## Goal

Use the PNG files in `public/brand` as the product brand logo source wherever the app can render image assets, especially the admin product and brand views.

## Scope

- Update `public/brand-assets.js` so matching brands resolve to local `/brand/*.png` files.
- Keep existing remote logo sources for catalog brands that do not currently have matching local PNG files.
- Keep Telegram bot menu labels text/emoji based because Telegram inline buttons and HTML text do not render local PNG images.
- Preserve the existing `getBrandAsset`, `brandIcon`, and `normalizeBrandKey` API so admin UI and Telegram code keep their current integration points.
- Update regression tests to expect local PNG paths for brands covered by `public/brand`.

## Brand Mapping

Local logo mappings should include catalog brands that already have assets:

- `ChatGPT` -> `/brand/ChatGPT.png`
- `Claude` -> `/brand/Claude.png`
- `Gemini` -> `/brand/Gemini.png`
- `Perplexity` -> `/brand/Perplexity.png`
- `Notion` -> `/brand/Notion.png`

Existing sources remain for brands without local files, including `Canva`, `CapCut`, `Google`, `Microsoft`, `Telegram`, `TikTok`, and `Discord`.

## Telegram Behavior

Telegram product and brand lists will continue to show brand names with compact text icons. Real PNG display in Telegram requires a separate media message via `sendPhoto` or similar, so that is intentionally outside this first change.

## Verification

Run the syntax check and focused brand tests:

- `npm run check`
- `npm run test:brand-icons`

If Telegram text tests depend on brand emoji values, update expectations only when the displayed Telegram text intentionally changes.
