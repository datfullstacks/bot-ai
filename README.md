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
actual Railway service names. Do not set `PORT`; Railway injects it.

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
2. Import one complete delivery payload per inventory line.
3. Configure and test the SePay webhook.
4. Put only the owner/test Telegram user ID in `SALES_TEST_TELEGRAM_IDS`, create
   a controlled order with `/buy <sku> 1` while public sales remain closed,
   then run a small real transfer and confirm automatic delivery.
5. Remove `SALES_TEST_TELEGRAM_IDS`, set `SALES_ENABLED=true`, and redeploy only
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

Optional sales stickers can be configured with Telegram `file_id` values. The bot sends them before the matching text screen and silently skips blank values:

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

The video pack writes the same `data/telegram-custom-emoji-map.json` file, including both `custom_emoji_id` values for button icons and `file_id` values for sending the matching brand sticker in the customer flow.

For slogan visuals in welcome and status messages, generate both PNG images for Telegram media captions and WEBM files for custom emoji packs:

```powershell
npm.cmd run telegram:generate-slogan-motion
npm.cmd run telegram:generate-slogan-motion -- --slogan welcome="Chọn nhanh, nhận ngay" --slogan payment="Thanh toán chuẩn, giao tự động"
```

The PNG images are written to `public/brand/slogan-image`. The bot sends the welcome PNG as the Telegram media and uses the welcome text as the message caption, so the image stays clean and the caption remains editable.

For a fixed `/start` hero image, set or replace:

```text
TELEGRAM_START_IMAGE_FILE=public/brand/start/welcome.png
```

This image is sent above the `/start` caption. If it is missing, the bot falls back to `public/brand/slogan-image/welcome.png`.

Then upload those videos as a separate custom emoji pack and write the ids to the slogan map:

```powershell
npm.cmd run telegram:create-custom-emojis -- --format video --source public/brand/slogan-emoji --output data/telegram-slogan-emoji-map.json --base kaito_ai_shop_slogan_motion --title "KAITO AI SHOP Slogan Motion" --yes
```

Restart the app after `data/telegram-slogan-emoji-map.json` exists. The bot uses that map to render animated `<tg-emoji>` icons in customer-facing welcome, catalog, payment, delivery, and support messages, while falling back to normal emoji when the pack is not configured.

Custom emoji can also be sent in normal message text and photo captions with Telegram `entities` / `caption_entities`. It is enabled by default:

```text
TELEGRAM_CUSTOM_TEXT_EMOJI=true
TELEGRAM_BANNER_EMOJI_MAP_FILE=data/telegram-banner-emoji-map.json
TELEGRAM_EMOJI_REQUIRED_PACKS=banner,ui,slogan
TELEGRAM_EMOJI_HEALTH_REPORT_FILE=data/telegram-emoji-health-report.json
TELEGRAM_EMOJI_RELEASE_REPORT_FILE=data/telegram-emoji-release-report.json
```

When Telegram rejects a custom emoji entity, the transport retries the same message as plain HTML text so customers still receive the fallback emoji. Set `TELEGRAM_CUSTOM_TEXT_EMOJI=false` to strip text/caption custom emoji entities and keep only ordinary fallback emoji.

For the neon menu icon sheet, place the source image at `public/brand/menu-neon/source.png` or pass it directly, then generate tightly cropped PNG sources and Telegram-ready WEBM animations:

```powershell
npm.cmd run telegram:generate-menu-motion -- --source "C:\Users\Dat\Downloads\ChatGPT Image May 20, 2026, 03_03_35 AM.png"
```

The crop sources are written to `public/brand/menu-emoji-source`, the animated WEBM files are written to `public/brand/menu-emoji`, and crop metadata is saved in `data/telegram-menu-motion-assets.json`. Upload the generated WEBM files as the UI custom emoji pack with:

```powershell
npm.cmd run telegram:create-custom-emojis -- --format video --source public/brand/menu-emoji --output data/telegram-ui-emoji-map.json --base kaito_ai_shop_menu_motion --title "KAITO AI SHOP Menu Motion" --yes
```

Restart the app after `data/telegram-ui-emoji-map.json` exists so the Telegram menu buttons can use the animated custom emoji IDs.

For GiaSieuRe-style KAITO banner emoji, generate the 32 Telegram-ready WEBM tiles and preview sheet, then upload them as a separate video custom emoji pack:

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
