# KAITO AI SHOP Sales System Design

## Goal

Build the first useful slice of the KAITO AI SHOP sales system: make the Telegram buyer journey feel premium and conversion-focused, while giving the admin dashboard faster control over product brand/package/pricing.

## Scope

Phase B is the target for this slice:

- Telegram full sales experience: stronger copy, cleaner button flows, optional sticker media per stage, and callback behavior tracking.
- Admin commerce ops: product cards should let admins quickly edit brand, category, package, name, price, sort order, and jump into stock import.

Deep analytics dashboards, content engine CRUD, campaign scheduling, and automated upsell campaigns are intentionally deferred. This slice should create the structure those can build on.

## Telegram Design

The bot keeps the button-first flow:

1. `/start` sends a concise premium intro and the main menu.
2. Catalog shows category counts and routes into brand selection.
3. Brand selection shows brand-specific context and then package buttons.
4. Package buttons put available offers first, show price clearly, and provide back/order navigation.
5. Order and delivery messages use sales-safe wording: clear reservation, payment reference, delivery expectation, and post-delivery next action.

Sticker/media assets are optional runtime configuration. If an env value exists for a stage, the bot sends the sticker before the related text message. If the value is missing, the flow remains text-only and does not fail.

## Admin Design

The existing Products tab remains the main catalog surface. Product cards gain a compact inline editor so an admin can change operational selling fields without recreating products:

- category
- brand
- package type
- name
- price
- currency
- sort order
- active state

Each product card also has an import-stock action that switches to the Inventory tab and selects the product. The backend already supports `PATCH /api/products/:id`, so this slice mainly exposes that existing API in the UI and keeps regression coverage around the async submit path.

## Data And Tracking

Telegram callback interactions should write audit events without blocking the user flow. Events include catalog, category, brand, buy, soldout, and orders clicks. This gives a lightweight behavior trail now and a future source for conversion dashboards.

## Testing

Use regression tests before implementation:

- Telegram message regression test should fail until sticker calls, stronger copy, back buttons, and callback audit tracking exist.
- Admin dashboard UI regression test should fail until the inline product editor and import-stock action exist.
- Existing `npm.cmd run verify` remains the final gate.
