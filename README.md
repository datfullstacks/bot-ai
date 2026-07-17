# KAITO AI SHOP

Node.js app for the KAITO AI SHOP Telegram sales bot with a web admin dashboard.

It includes:

- Telegram bot commands for product browsing and ordering.
- Four-step Telegram checkout: category, brand, package details, then explicit confirmation.
- Admin dashboard for products, inventory, orders, payments, and audit logs.
- AES-256-GCM inventory encryption, reservation, buyer cancellation, payment resume, and delivery.
- Payment provider adapter with mock and SePay providers.
- Manual payment-review resolution for approving delivery or marking a review order refunded.
- Signed dashboard sessions and built-in password hashing.
- JSON storage for local dev, PostgreSQL storage for production-style deployment.
- In-memory rate limits for local dev, Redis-backed rate limits when `REDIS_URL` is set.

## Run

```powershell
copy .env.example .env
npm.cmd run check
npm.cmd test
npm.cmd start
```

Open:

```text
http://localhost:3000
```

Default development login if no `.env` is configured:

```text
admin / admin123
```

Change `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `AUTH_SECRET` before real use.

## Project Structure

Runtime modules are organized by responsibility:

```text
src/
  server.js                 HTTP entry point and API routing
  shop.js                   Thin facade that selects the active shop store
  shopStores/
    jsonShopStore.js        JSON/document-mode shop implementation
    postgresShopStore.js    PostgreSQL row-mode shop implementation
  storage.js                Generic snapshot storage facade
  storageMode.js            Central storage-mode selection
  telegram.js               Telegram sales-flow orchestration
  telegramTransport.js      Telegram Bot API transport and fallback handling
  telegramEmoji*.js         Emoji registry, resolution, and health checks
  telegramOffsetStore.js    Persistent Telegram polling offset
```

Both shop stores expose the same public contract. Callers import only
`src/shop.js` and do not select a backend themselves.

## Verification

Run syntax checks and the local JSON smoke suite:

```powershell
npm.cmd run verify
```

The smoke test creates a temporary data file, then verifies admin login/logout, product creation, inventory import, paid delivery, duplicate payment idempotency, payment review approval, payment review refund, cancellation, and dashboard summary counts.

When `DATABASE_URL` points to a real PostgreSQL instance, run the same flow through the row-level production path:

```powershell
npm.cmd run test:postgres
```

Run configuration preflight:

```powershell
npm.cmd run preflight
npm.cmd run preflight:production
```

`preflight:production` exits non-zero if required production settings still have warnings.

Backup the active store:

```powershell
npm.cmd run backup
npm.cmd run backup -- --out backups\manual-backup.json
```

Restore is intentionally destructive and requires `--yes`:

```powershell
npm.cmd run restore -- --file backups\manual-backup.json --yes
```

Backups include encrypted inventory payloads and sold-order delivery payloads. Keep the
`backups/` directory private and preserve `INVENTORY_ENCRYPTION_KEY`; losing or rotating
the key without migration makes encrypted stock unreadable. Older plaintext data remains
readable for compatibility and should be replaced with encrypted inventory before launch.
The same commands work against JSON storage or PostgreSQL depending on `STORE_DRIVER`.

## Production Storage

Local development uses:

```text
STORE_DRIVER=json
```

Production-style deployment should use PostgreSQL and Redis:

```text
STORE_DRIVER=postgres
POSTGRES_WRITE_MODE=row
DATABASE_URL=postgres://user:password@host:5432/mmo_shop
DATABASE_POOL_MAX=10
REDIS_URL=redis://host:6379
```

Schema is auto-created on startup. If you already have local JSON data and want to import it into PostgreSQL:

```powershell
$env:STORE_DRIVER='postgres'
$env:DATABASE_URL='postgres://user:password@host:5432/mmo_shop'
npm.cmd run migrate:postgres
```

`docker-compose.yml` is included for an app + PostgreSQL + Redis deployment template.

## Railway Deployment

Deploy the application service from this repository, then add Railway-managed
PostgreSQL and Redis services to the same project. The root `Dockerfile` and
`railway.toml` are detected automatically.

Set these variables on the application service:

```text
NODE_ENV=production
BASE_URL=https://your-generated-domain.up.railway.app
STORE_DRIVER=postgres
POSTGRES_WRITE_MODE=row
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_POOL_MAX=10
REDIS_URL=${{Redis.REDIS_URL}}
REDIS_KEY_PREFIX=kaito-ai-shop
AUTH_SECRET=<long-random-secret>
ADMIN_USERNAME=<admin-username>
ADMIN_PASSWORD=<strong-password>
INVENTORY_ENCRYPTION_KEY=<64-hex-character-key>
SALES_ENABLED=false
SALES_TEST_TELEGRAM_IDS=<owner-telegram-user-id>

PAYMENT_PROVIDER=sepay
SEPAY_ACCOUNT_NUMBER=<bank-account-or-va>
SEPAY_BANK_CODE=<vietqr-bank-code>
SEPAY_QR_TEMPLATE=compact
SEPAY_PAYMENT_PREFIX=KAITO
SEPAY_MEMO_SUFFIX=thanh toan don hang
SEPAY_WEBHOOK_AUTH=hmac
SEPAY_WEBHOOK_SECRET=<same-secret-configured-in-sepay>
SEPAY_WEBHOOK_ACCOUNT_NUMBERS=<expected-webhook-account-number>
```

The `Postgres` and `Redis` names in the reference variables must match the
actual Railway service names. Do not set `PORT` on the `bot-ai` service;
Railway injects it.

### Automatic ChatGPT and Canva Seat fulfillment

The bot calls the three API services over Railway private networking. It never
calls browser workers directly. Set a stable target port on each API
service so the bot can address it privately:

```text
# gpt-member-service
PORT=3002

# canva-member-api
PORT=3012

# claude-member-api
PORT=3022
```

Then add these variables to `bot-ai`:

```text
GPT_MEMBER_SERVICE_ENABLED=true
GPT_MEMBER_SERVICE_URL=http://${{gpt-member-service.RAILWAY_PRIVATE_DOMAIN}}:${{gpt-member-service.PORT}}/api/v1
GPT_MEMBER_SERVICE_API_KEY=<raw-gsk-key-with-members:add>
GPT_SEAT_GUARD_API_KEY=<separate-raw-gsk-key-with-accounts:read,members:remove>
GPT_MEMBER_ACCOUNT_REF=<Mongo-id-workspace-UUID-or-admin-email>
GPT_MEMBER_SKUS=chatgpt-business-seat-1m
GPT_SEAT_PROTECTED_EMAILS=<owner-or-staff-emails-comma-separated>
GPT_SEAT_DEFAULT_TERM_MONTHS=1
GPT_SEAT_GUARD_MAX_RESPONSE_BYTES=2097152
GPT_SEAT_EXPIRY_AUTO_REMOVE=false
GPT_SEAT_EXPIRY_SWEEP_MS=900000
GPT_SEAT_EXPIRY_BATCH_SIZE=10
GPT_SEAT_EXPIRY_GRACE_MS=0
GPT_SEAT_EXPIRY_RETRY_WINDOW_MS=900000

CANVA_MEMBER_SERVICE_ENABLED=true
CANVA_MEMBER_SERVICE_URL=http://${{canva-member-api.RAILWAY_PRIVATE_DOMAIN}}:${{canva-member-api.PORT}}/api/v1
CANVA_MEMBER_SERVICE_API_KEY=<raw-gsk-key-with-members:add>
CANVA_MEMBER_ACCOUNT_REF=<registered-Canva-account-id-or-login-email>
CANVA_MEMBER_SKUS=canva-pro-1m,canva-pro-6m

CLAUDE_MEMBER_SERVICE_ENABLED=true
CLAUDE_MEMBER_SERVICE_URL=http://${{claude-member-api.RAILWAY_PRIVATE_DOMAIN}}:${{claude-member-api.PORT}}/api/v1
CLAUDE_MEMBER_SERVICE_API_KEY=<raw-gsk-key-with-members:add>
CLAUDE_MEMBER_ACCOUNT_REF=<registered-Claude-account-id-org-UUID-or-login-email>
CLAUDE_MEMBER_SKUS=claude-business-seat-1x-1m,claude-business-seat-6-5x-1m
# Optional when standard and premium SKUs use different organizations:
CLAUDE_MEMBER_ACCOUNT_REFS_BY_SKU={"claude-business-seat-1x-1m":"standard-owner@example.com","claude-business-seat-6-5x-1m":"premium-owner@example.com"}
```

Use a new least-privilege `gsk_...` key and copy its raw value when it is
created; a stored API-key hash cannot be converted back to the raw key. GPT,
Canva and Claude account references are explicit so an order cannot be assigned to
an unintended admin account.

Each active order pins a fingerprint of its provider, private service URL,
API key and target account. Changing any of those values while an order is
still awaiting fulfillment pauses that order in `verification_required`
instead of risking an invitation to a different account. Finish, verify or
clean up active operations before rotating these variables. Delivered orders
also store a separate non-secret entitlement target fingerprint (provider,
service URL and account reference), so later API-key rotation does not disable
their 30-day lifecycle. Legacy delivered orders are backfilled only when their
automation succeeded and the old credential-bound fingerprint still matches;
all other old orders fail closed as **needs review**.

The member APIs return durable asynchronous operations. The bot stores the
operation id, polls until `succeeded`, and only then marks the order delivered.
Network timeouts reuse the same idempotency generation; terminal or partial
failures stay in `awaiting_fulfillment` for an admin retry. Claude Seat orders
use the same durable operation contract as Canva. A per-SKU account mapping can
route the 1x and 6.5x products to different Claude organizations.

The admin dashboard includes **Seat Guard** for the configured ChatGPT target.
It reads live members and pending invitations, compares them with paid Seat
orders, and highlights unauthorized, expired, unverified allow-list, or
needs-review entries. The member-service `allowedMembers` list is operational
state, not proof of payment: entries found only there are shown as **unverified
allow-list** and can be reviewed manually. Owner/admin roles and
`GPT_SEAT_PROTECTED_EMAILS` are never offered for removal. Removing a member or
cancelling an invitation requires an exact email confirmation, uses an
idempotent action generation, and is written to the bot audit log.

Seat time starts at `deliveredAt` (or the fulfillment completion timestamp).
Each configured Seat month is exactly 30 x 24 hours, so a 1M ChatGPT Seat
expires after 30 days rather than after a variable-length calendar month.
Missing delivery timestamps fail closed to **needs review** rather than using
the earlier payment time. Repeated delivered orders for the same email extend
the previous entitlement, while paid orders still awaiting fulfillment remain
authorized. New Seat products should set `seatTermMonths`; legacy orders fall
back to the duration encoded in the SKU/package and then
`GPT_SEAT_DEFAULT_TERM_MONTHS`. Orders whose saved integration target cannot be
matched to the current ChatGPT target also fail closed to **needs review**.

Seat Guard intentionally starts in review/manual-removal mode. Set
`GPT_SEAT_EXPIRY_AUTO_REMOVE=true` only after reviewing the first Seat Guard
snapshot. Automatic cleanup requires PostgreSQL row mode and a guard key with
`accounts:read,members:remove`. It only acts on bot orders with a verified
target and an expired delivery term; active, pending, needs-review,
manual-allow-list, owner/admin, and `GPT_SEAT_PROTECTED_EMAILS` entries are
never auto-removed. `DATABASE_POOL_MAX` must be at least
`(2 * MEMBER_FULFILLMENT_CONCURRENCY) + 2` (6 with the defaults; the recommended
value remains 10). Cleanup uses a shared per-email PostgreSQL advisory lock,
rechecks orders after taking the lock, and stores a durable cleanup fence before
calling the member service. Fulfillment must reconcile that fence before it can
invite the same email, so a timed-out old removal cannot delete a newly renewed
Seat. The worker removes the live member or invitation, polls the durable
operation, and verifies that `allowedMembers` no longer contains the email. It
never replaces the whole upstream allow-list.

Generate separate values for `AUTH_SECRET`, `TELEGRAM_WEBHOOK_SECRET`,
`SEPAY_WEBHOOK_SECRET`, and `INVENTORY_ENCRYPTION_KEY`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never reuse or rotate `INVENTORY_ENCRYPTION_KEY` after importing stock unless
the stored inventory is migrated to the new key.

For the simplest single-replica Telegram deployment:

```text
TELEGRAM_BOT_TOKEN=<bot-token>
TELEGRAM_POLLING=true
TELEGRAM_WEBHOOK_SECRET=<long-random-secret>
TELEGRAM_BOT_USERNAME=<bot-username-without-at>
TELEGRAM_SUPPORT_HANDLE=@your_support
```

Keep the application at one replica while polling. For webhook mode, set
`TELEGRAM_POLLING=false`, configure `TELEGRAM_WEBHOOK_SECRET`, and register:

```powershell
curl.exe -X POST "https://api.telegram.org/bot<token>/setWebhook" `
  -d "url=https://<railway-domain>/api/public/telegram/webhook?secret=<webhook-secret>"
```

After Railway generates a public domain, verify:

```text
GET https://<railway-domain>/api/healthz
GET https://<railway-domain>/api/readyz
```

The local `docker-compose.yml` contains development credentials and should not
be used as production secrets on Railway.

Keep `SALES_ENABLED=false` during setup. In the admin dashboard:

1. Update every active product with description, account type, warranty and replacement policy.
2. Choose a delivery mode for each product:
   - `text`: send decrypted inventory directly in a Telegram message.
   - `file`: generate one UTF-8 `.txt` document in memory and send it through Telegram.
3. Import one complete delivery payload per inventory line. File mode packages the
   same text payloads into a generated TXT; inventory values are never treated as
   filesystem paths or uploaded files.
4. Configure and test the SePay webhook.
5. Put only the owner/test Telegram user ID in `SALES_TEST_TELEGRAM_IDS`, create
   a controlled order with `/buy <sku> 1` while public sales remain closed,
   then run a small real transfer and confirm automatic delivery.
6. Remove `SALES_TEST_TELEGRAM_IDS`, set `SALES_ENABLED=true`, and redeploy only
   after every readiness warning except the intentional `sales` closed warning
   has been cleared.

## System Status

Health and readiness endpoints:

```text
GET /api/healthz
GET /api/readyz
```

The admin dashboard has a **System** tab backed by:

```text
GET /api/system/status
```

It shows safe, masked configuration status for storage, Redis, Telegram, payment provider, webhook URLs, session secret, admin password hardening, runtime counts, and warning items that still need production configuration.

## Telegram

Set these values in `.env`:

```text
TELEGRAM_BOT_TOKEN=123456:bot-token
TELEGRAM_POLLING=true
BASE_URL=https://your-domain.example
```

For webhook mode, point Telegram to:

```text
POST /api/public/telegram/webhook?secret=TELEGRAM_WEBHOOK_SECRET
```

Bot commands:

```text
/start
/products
/orders
/support
/account
/buy <sku> [qty]
```

The customer flow is:

```text
Danh mục → Nhãn hàng → Gói → Xác nhận mua → Thanh toán
```

Selecting a package does not reserve inventory. Only the final confirmation creates
an order. Pending orders can be reopened from **Đơn hàng**, paid from the existing
payment link/QR, or cancelled by their owner to release inventory.

On startup, the app publishes these commands to Telegram with `setMyCommands` for the default scope plus common Telegram client languages, then enables the command menu with `setChatMenuButton`. When a customer messages `/start`, the bot also applies the command menu to that chat so desktop/mobile clients can refresh the menu without typing commands by hand.

The legacy sales-sticker environment variables are retained for compatibility, but the current customer flow does not send them automatically. Setting these values alone will not add a sticker to a screen:

```text
TELEGRAM_START_STICKER_ID=
TELEGRAM_CATALOG_STICKER_ID=
TELEGRAM_BRAND_STICKER_ID=
TELEGRAM_ORDER_STICKER_ID=
TELEGRAM_DELIVERY_STICKER_ID=
```

### Custom emoji pack automation

The brand emoji source files live in:

```text
public/brand/emoji
```

They must be static `.png` or `.webp` files at exactly `100x100` pixels for Telegram custom emoji. Set your personal Telegram user id before running the live creator:

```text
TELEGRAM_OWNER_USER_ID=123456789
TELEGRAM_BOT_USERNAME=your_bot_username
```

Preview the pack without calling Telegram:

```powershell
npm.cmd run telegram:create-custom-emojis -- --dry-run
```

Create the custom emoji pack through the Bot API:

```powershell
npm.cmd run telegram:create-custom-emojis -- --yes
```

The script uploads the files with `uploadStickerFile`, creates a `custom_emoji` sticker set, then writes the resulting ids to:

```text
data/telegram-custom-emoji-map.json
```

Restart the app after this file is created. The Telegram bot reads the map on startup and adds `icon_custom_emoji_id` to brand and package inline buttons when a matching brand id exists.

For animated customer-facing brand icons, generate WEBM motion assets from the exact local logos, then create a video custom emoji pack:

```powershell
npm.cmd run telegram:generate-brand-motion
npm.cmd run telegram:create-custom-emojis -- --format video --source public/brand/motion-emoji --base kaito_ai_shop_brand_motion --title "KAITO AI SHOP Brand Motion" --yes
```

The video pack writes the same `data/telegram-custom-emoji-map.json` file. The customer runtime uses its `custom_emoji_id` values for animated brand icons. The map tooling may also record `file_id` values, but custom-emoji packs are not sent as regular sales stickers by the current flow.

For slogan visuals in welcome and status messages, generate both PNG images for Telegram media captions and WEBM files for custom emoji packs:

```powershell
npm.cmd run telegram:generate-slogan-motion
npm.cmd run telegram:generate-slogan-motion -- --slogan welcome="Chọn nhanh, nhận ngay" --slogan payment="Thanh toán chuẩn, giao tự động"
```

The PNG images are written to `public/brand/slogan-image`. The bot sends the welcome PNG as the Telegram media and uses the welcome text as the message caption, so the image stays clean and the caption remains editable.

For a fixed `/start` hero image, set or replace:

```text
TELEGRAM_START_IMAGE_FILE_ID=
TELEGRAM_START_IMAGE_URL=
TELEGRAM_START_IMAGE_FILE=public/brand/start/welcome.png
```

The bot uses the fastest available source in this order: Telegram `file_id`, public
HTTPS URL, then local file upload. When the URL is blank and the local file is under
`public/`, its URL is derived automatically from `BASE_URL`. A successful send is
cached as a Telegram `file_id` for later `/start` requests. If the local image is
missing, the bot falls back to `public/brand/slogan-image/welcome.png`.

The separate slogan custom-emoji pack is optional and is no longer part of production readiness. If you still want to maintain it, upload the videos and write the ids to the slogan map:

```powershell
npm.cmd run telegram:create-custom-emojis -- --format video --source public/brand/slogan-emoji --output data/telegram-slogan-emoji-map.json --base kaito_ai_shop_slogan_motion --title "KAITO AI SHOP Slogan Motion" --yes
```

Restart the app after `data/telegram-slogan-emoji-map.json` exists. The bot uses that map for animated slogan icons in catalog, checkout, payment, delivery, support, and related customer messages, while falling back to normal emoji when an ID is unavailable.

Custom emoji can also be sent in normal message text and photo captions with Telegram `entities` / `caption_entities`. It is enabled by default:

```text
TELEGRAM_CUSTOM_TEXT_EMOJI=true
TELEGRAM_CUSTOM_EMOJI_CAPABILITY_COOLDOWN_MS=60000
TELEGRAM_CUSTOM_EMOJI_MAP_FILE=data/telegram-custom-emoji-map.json
TELEGRAM_UI_EMOJI_MAP_FILE=data/telegram-ui-emoji-map.json
TELEGRAM_SLOGAN_EMOJI_MAP_FILE=data/telegram-slogan-emoji-map.json
TELEGRAM_SLOGAN_TILE_EMOJI_MAP_FILE=data/telegram-slogan-tile-emoji-map.json
TELEGRAM_BANNER_EMOJI_MAP_FILE=data/telegram-banner-emoji-map.json
TELEGRAM_NEWS_EMOJI_MAP_FILE=data/telegram-news-emoji-map.json
TELEGRAM_FLAME_EMOJI_MAP_FILE=data/telegram-flame-emoji-map.json
TELEGRAM_GAME_EMOJI_MAP_FILE=data/telegram-game-emoji-map.json
TELEGRAM_ROBO_EMOJI_MAP_FILE=data/telegram-robo-emoji-map.json
TELEGRAM_RETRO_FONT_EMOJI_MAP_FILE=data/telegram-retro-font-emoji-map.json
TELEGRAM_EMOJI_REQUIRED_PACKS=brand,ui,sloganTile,news,flame,game,robo,retro
TELEGRAM_EMOJI_HEALTH_REPORT_FILE=data/telegram-emoji-health-report.json
TELEGRAM_EMOJI_HEALTH_MAX_AGE_HOURS=24
TELEGRAM_EMOJI_RELEASE_REPORT_FILE=data/telegram-emoji-release-report.json
```

The required runtime packs are:

- `brand`: brand and package buttons
- `ui`: menu and navigation actions
- `sloganTile`: the animated `DAILY UPDATE` line on `/start`
- `news`, `flame`, and `game`: animated welcome/menu accents
- `robo`: reaction and compact action icons
- `retro`: the animated `KAITO KID AI SHOP` heading

`banner` and `slogan` are retired from readiness and may be absent. `TELEGRAM_EMOJI_REQUIRED_PACKS` is merged with the runtime baseline after removing those retired names, so old production values such as `banner,ui,slogan` or the previous full pack list normalize to the eight packs above instead of requiring deleted packs. Pack names are normalized without losing the camel-case `sloganTile` registry key.

The `news` map is synchronized from the public Telegram custom-emoji set
[`NewsEmoji`](https://t.me/addemoji/NewsEmoji); it is not built from local binary
assets. The command loads `TELEGRAM_BOT_TOKEN` from `.env` through the normal app
configuration:

```powershell
npm.cmd run telegram:sync-news-emojis -- --dry-run
npm.cmd run telegram:sync-news-emojis
```

The live command calls `getStickerSet` and rewrites
`data/telegram-news-emoji-map.json` with all 100 remote IDs, file IDs, exact
fallback emoji, and deterministic aliases. It refuses to write when fewer than
100 unique IDs are returned or when the pack order/fallback emoji differs from
the reviewed definition table. Runtime readiness requires both the 100 unique
News IDs and these compatibility aliases: `fast`, `newsflash`, `auto247`,
`tracking`, `adminchat`, `adminshield`, `adminboom`, `adminfire`, and
`adminhundred`.

When Telegram rejects custom emoji in text or captions, the transport retries without those entities while preserving animated inline-button icons. A generic text capability rejection starts a short cooldown controlled by `TELEGRAM_CUSTOM_EMOJI_CAPABILITY_COOLDOWN_MS`, preventing every `/start` request from repeating the same slow failed text attempt; the bot automatically probes text emoji again after the cooldown. Button-icon failures are degraded only for the affected request, while an explicitly rejected button ID is cached by ID. Set `TELEGRAM_CUSTOM_TEXT_EMOJI=false` to strip text/caption entities and button custom-emoji icons up front.

For the neon menu icon sheet, place the source image at `public/brand/menu-neon/source.png` or pass it directly, then generate tightly cropped PNG sources and Telegram-ready WEBM animations:

```powershell
npm.cmd run telegram:generate-menu-motion -- --source "C:\Users\Dat\Downloads\ChatGPT Image May 20, 2026, 03_03_35 AM.png"
```

The crop sources are written to `public/brand/menu-emoji-source`, the animated WEBM files are written to `public/brand/menu-emoji`, and crop metadata is saved in `data/telegram-menu-motion-assets.json`. Upload the generated WEBM files as the UI custom emoji pack with:

```powershell
npm.cmd run telegram:create-custom-emojis -- --format video --source public/brand/menu-emoji --output data/telegram-ui-emoji-map.json --base kaito_ai_shop_menu_motion --title "KAITO AI SHOP Menu Motion" --yes
```

Restart the app after `data/telegram-ui-emoji-map.json` exists so the Telegram menu buttons can use the animated custom emoji IDs.

Generate the six-part animated `/start` slogan tile and upload it through the release workflow:

```powershell
npm.cmd run telegram:generate-slogan-tiles
npm.cmd run telegram:release-emojis -- --packs slogan-tiles --yes
```

The former GiaSieuRe-style KAITO banner pack is optional tooling and is no longer checked by runtime readiness. To recreate it for experiments, generate the 32 Telegram-ready WEBM tiles and preview sheet, then upload them as a separate video custom emoji pack:

```powershell
npm.cmd run telegram:generate-banner-emojis
npm.cmd run telegram:create-custom-emojis -- --format video --source public/brand/banner-emoji --output data/telegram-banner-emoji-map.json --base kaito_ai_shop_banner_motion --title "KAITO AI SHOP Banner Motion" --yes
```

For the production-grade one-command path, generate assets, upload the owned pack, write the banner map, and save a release report with:

```powershell
npm.cmd run telegram:release-emojis -- --packs banner --yes
```

The V1 banner keys are:

```text
kaito, welcome, products, orders, support, account, checkin, minigame, vip, hot, new, sale, auto247, trusted, delivery, payment, ai, mmo, instant, secure, guide, contact, stock, soldout, review, refund, combo, member, news, event, policy, logout
```

After upload and app restart, probe only the banner/text-entity path in a real Telegram chat:

```powershell
npm.cmd run telegram:probe-custom-emojis -- --chat-id 123456789 --only banner
npm.cmd run telegram:emoji-health -- --chat-id 123456789 --write-report
```

If `getCustomEmojiStickers` returns every requested ID but the send probe fails with
`400 Bad Request: DOCUMENT_INVALID`, the map is valid but the bot is not allowed to
send custom emoji. Make sure the Telegram account that actually owns the bot in
BotFather has an active Premium subscription, or that the bot qualifies through an
additional username purchased on Fragment, then run the probe again.

When custom emoji is enabled and a bot token is configured, readiness also requires a successful live emoji health report that covers every required pack. Validation checks every configured ID in batches of 200 and verifies its Telegram fallback emoji when the map provides one. The report is tied to a SHA-256 fingerprint of the current bot token and ID/emoji map without storing the token itself, so run `telegram:emoji-health` again after rotating the bot token or changing any emoji map. A missing, mismatched, failed, or stale report is reported as a readiness warning. Local runs without a Telegram token do not require a live report.

## Payment Provider

The app supports `mock` and `sepay`.

Mock is the default so the full order flow can be tested without real bank credentials.

To use SePay:

```text
PAYMENT_PROVIDER=sepay
SEPAY_ACCOUNT_NUMBER=your_bank_or_va_account
SEPAY_BANK_CODE=Vietcombank
SEPAY_PAYMENT_PREFIX=KAITO
SEPAY_WEBHOOK_AUTH=hmac
SEPAY_WEBHOOK_SECRET=your_sepay_webhook_secret
SEPAY_WEBHOOK_ACCOUNT_NUMBERS=account_number_expected_in_webhook
```

Configure the SePay webhook URL:

```text
POST https://your-domain.example/api/public/payments/sepay-webhook
```

Configure SePay payment-code extraction with:

- Prefix: `KAITO`
- Minimum suffix: `15`
- Maximum suffix: `15`
- Character type: letters and numbers
- Event: incoming money
- Content type: JSON
- Skip transactions without a payment code: enabled
- Prefix filter: `KAITO`
- Authentication: HMAC-SHA256

The app puts the generated reference in the transfer memo and also scans webhook
`content` as a fallback. Authenticated test/unmatched transactions are recorded and
acknowledged without settling an order. Repeated transaction ids remain idempotent.

SePay requires a `200` or `201` response with `{"success":true}`. The endpoint
commits the payment first, responds immediately, then sends the Telegram delivery
notification asynchronously.

Provider contract:

- `createPayment(input)`
- `verifyWebhook(input)`
- `getPaymentStatus(providerPaymentId)`

The order service is already idempotent for repeated payment events.

## Order Safety and Traffic

Important defaults are configurable in `.env`:

```text
ORDER_TTL_MINUTES=15
MAX_ORDER_QUANTITY=20
MAX_PENDING_ORDERS_PER_USER=3
RATE_LIMIT_PUBLIC_PER_MINUTE=600
RATE_LIMIT_ADMIN_PER_MINUTE=300
RATE_LIMIT_TELEGRAM_USER_PER_MINUTE=30
RATE_LIMIT_TELEGRAM_BUY_PER_MINUTE=6
```

Order handling is conservative:

- Only `pending_payment` orders can be auto-delivered.
- A package/detail click never reserves stock; only explicit confirmation creates an order.
- Telegram confirmation uses an idempotency key so double taps reuse the same order/payment.
- Buyers can view or cancel only their own pending orders.
- Expired, cancelled, mismatched, or otherwise closed orders move to `payment_review` when money arrives.
- Amount mismatch never delivers inventory automatically.
- Payment events must match the payment provider; mock events cannot settle SePay orders.
- The mock webhook is disabled in production and requires a signature when enabled locally.
- Delivery requires the reserved inventory count to match the order quantity.
- Admins can resolve `payment_review` orders by approving delivery from reserved/available stock or marking the order refunded.
- Admin order/payment/audit APIs are paginated by default.

For production traffic, run with `STORE_DRIVER=postgres`, `POSTGRES_WRITE_MODE=row`, and `REDIS_URL`. In this mode, the hot order/payment/inventory paths use PostgreSQL row locks and `FOR UPDATE SKIP LOCKED` against the affected documents instead of loading and rewriting the whole store. Admin/config writes remain compatible with the document store shape.

Set `POSTGRES_WRITE_MODE=document` only as a fallback compatibility mode. It uses the older whole-store transaction plus advisory lock, which is safer than JSON storage but is not intended for high write traffic.

For very large traffic, the next step is fully normalized SQL tables for `orders`, `inventory`, `payments`, and `payment_events`, plus queue workers for webhook and Telegram delivery fan-out.
