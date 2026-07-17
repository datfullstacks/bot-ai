const DELIVERY_MODES = new Set(['text', 'file']);
const FULFILLMENT_MODES = new Set(['inventory', 'seat_email']);
const LEGACY_SEAT_EMAIL_SKUS = new Set([
  'chatgpt-business-seat-1m',
  'claude-business-seat-1x-1m',
  'claude-business-seat-6-5x-1m',
  'canva-pro-1m',
  'canva-pro-6m'
]);

export function isDeliveryMode(value) {
  return DELIVERY_MODES.has(String(value || '').trim().toLowerCase());
}

export function normalizeDeliveryMode(value, { strict = false } = {}) {
  const mode = String(value || 'text').trim().toLowerCase();
  if (isDeliveryMode(mode)) return mode;
  if (strict) {
    throw Object.assign(
      new Error('Delivery mode must be text or file'),
      { statusCode: 400 }
    );
  }
  return 'text';
}

export function isFulfillmentMode(value) {
  return FULFILLMENT_MODES.has(String(value || '').trim().toLowerCase());
}

export function normalizeFulfillmentMode(value, { strict = false, sku = '' } = {}) {
  const raw = String(value || '').trim().toLowerCase();
  if (isFulfillmentMode(raw)) return raw;
  if (!raw && LEGACY_SEAT_EMAIL_SKUS.has(String(sku || '').trim().toLowerCase())) return 'seat_email';
  if (!raw) return 'inventory';
  if (strict) {
    throw Object.assign(
      new Error('Fulfillment mode must be inventory or seat_email'),
      { statusCode: 400 }
    );
  }
  return 'inventory';
}

export function isSeatEmailFulfillment(product = {}) {
  return normalizeFulfillmentMode(product.fulfillmentMode, { sku: product.sku }) === 'seat_email';
}

export const DEFAULT_CATALOG_PRODUCTS = [
  {
    sku: 'chatgpt-plus-1m',
    category: 'AI Accounts',
    brand: 'ChatGPT',
    packageType: 'Plus 1M',
    name: 'ChatGPT Plus - 1 tháng',
    description: 'Gói tài khoản ChatGPT Plus 1 tháng, giao thông tin sử dụng sau thanh toán.',
    price: 99000,
    currency: 'VND',
    sortOrder: 10,
    hot: true,
    officialPriceNote: 'OpenAI Plus: $20/mo'
  },
  {
    sku: 'chatgpt-business-seat-1m',
    category: 'AI Accounts',
    brand: 'ChatGPT',
    packageType: 'Business Seat 1M',
    name: 'ChatGPT Business Seat 1M',
    description: 'Seat thành viên ChatGPT Business trong 1 tháng, cấp quyền truy cập qua workspace do shop quản lý.',
    price: 400000,
    currency: 'VND',
    sortOrder: 20,
    hot: true,
    officialPriceNote: 'OpenAI ChatGPT Business: per-user pricing varies by billing interval and region',
    accountType: 'Seat thành viên ChatGPT Business trong workspace; không phải tài khoản ChatGPT riêng.',
    warrantyPolicy: 'Bảo hành quyền truy cập workspace trong 1 tháng kể từ khi bàn giao; hỗ trợ khi seat mất quyền truy cập do workspace của shop.',
    replacementPolicy: 'Đổi seat khi lời mời hoặc quyền truy cập lỗi do workspace của shop; không áp dụng nếu khách tự rời workspace, đổi email, chia sẻ quyền truy cập hoặc vi phạm chính sách OpenAI.',
    fulfillmentMode: 'seat_email',
    deliveryMode: 'text'
  },
  {
    sku: 'claude-pro-1m',
    category: 'AI Accounts',
    brand: 'Claude',
    packageType: 'Pro 1M',
    name: 'Claude Pro - 1 tháng',
    description: 'Gói Claude Pro 1 tháng, phù hợp viết nội dung, code, research và automation.',
    price: 129000,
    currency: 'VND',
    sortOrder: 30,
    officialPriceNote: 'Anthropic Claude Pro: $20/mo'
  },
  {
    sku: 'claude-business-seat-1x-1m',
    category: 'AI Accounts',
    brand: 'Claude',
    packageType: 'Business Seat 1x 1M',
    name: 'Claude Business Seat 1x 1M',
    description: 'Seat thành viên Claude Business mức sử dụng 1x trong 1 tháng, cấp quyền truy cập qua organization do shop quản lý.',
    price: 400000,
    currency: 'VND',
    sortOrder: 32,
    hot: true,
    officialPriceNote: 'Anthropic business seat pricing and limits vary by plan, billing interval and region',
    accountType: 'Seat thành viên Claude Business 1x trong organization; không phải tài khoản Claude riêng.',
    warrantyPolicy: 'Bảo hành quyền truy cập organization trong 1 tháng kể từ khi bàn giao; hỗ trợ khi seat mất quyền truy cập do organization của shop.',
    replacementPolicy: 'Đổi seat khi lời mời hoặc quyền truy cập lỗi do organization của shop; không áp dụng nếu khách tự rời organization, đổi email, chia sẻ quyền truy cập hoặc vi phạm chính sách Anthropic.',
    fulfillmentMode: 'seat_email',
    deliveryMode: 'text'
  },
  {
    sku: 'claude-business-seat-6-5x-1m',
    category: 'AI Accounts',
    brand: 'Claude',
    packageType: 'Business Seat 6.5x 1M',
    name: 'Claude Business Seat 6.5x 1M',
    description: 'Seat thành viên Claude Business trong 1 tháng với mức phân bổ 6.5x theo tier do shop quy ước.',
    price: 1800000,
    currency: 'VND',
    sortOrder: 34,
    hot: true,
    officialPriceNote: 'Shop tier "6.5x"; not an official Anthropic plan name. Anthropic plan limits and pricing vary by plan and region.',
    accountType: 'Seat thành viên Claude Business tier 6.5x của shop trong organization; không phải tài khoản Claude riêng.',
    warrantyPolicy: 'Bảo hành quyền truy cập organization trong 1 tháng kể từ khi bàn giao; hỗ trợ khi seat mất quyền truy cập do organization của shop.',
    replacementPolicy: 'Đổi seat khi lời mời, quyền truy cập hoặc tier bàn giao lỗi do organization của shop; không áp dụng nếu khách tự rời organization, đổi email, chia sẻ quyền truy cập hoặc vi phạm chính sách Anthropic.',
    fulfillmentMode: 'seat_email',
    deliveryMode: 'text'
  },
  {
    sku: 'gemini-advanced-1m',
    category: 'AI Accounts',
    brand: 'Gemini',
    packageType: 'Advanced 1M',
    name: 'Gemini Advanced - 1 tháng',
    description: 'Gói Gemini Advanced 1 tháng cho nhu cầu AI đa nền tảng Google.',
    price: 119000,
    currency: 'VND',
    sortOrder: 40,
    officialPriceNote: 'Google AI Pro/Gemini Advanced: regional monthly pricing'
  },
  {
    sku: 'perplexity-pro-1m',
    category: 'AI Accounts',
    brand: 'Perplexity',
    packageType: 'Pro 1M',
    name: 'Perplexity Pro - 1 tháng',
    description: 'Gói Perplexity Pro 1 tháng cho research, tìm kiếm và tổng hợp thông tin.',
    price: 99000,
    currency: 'VND',
    sortOrder: 50,
    officialPriceNote: 'Perplexity Pro: monthly subscription pricing varies by region'
  },
  {
    sku: 'cursor-pro-1m',
    category: 'AI Accounts',
    brand: 'Cursor',
    packageType: 'Pro 1M',
    name: 'Cursor Pro - 1 tháng',
    description: 'Gói Cursor Pro 1 tháng cho code AI, agent, autocomplete và workflow dev.',
    price: 199000,
    currency: 'VND',
    sortOrder: 60,
    hot: true,
    officialPriceNote: 'Cursor Pro: $20/mo'
  },
  {
    sku: 'canva-pro-1m',
    category: 'Design Accounts',
    brand: 'Canva',
    packageType: 'Nonprofit Seat 1M',
    name: 'Canva Pro Seat (Nonprofit) - 1 tháng',
    description: 'Seat Canva Pro trong team nonprofit do shop quản lý; khách gửi email để nhận lời mời sau thanh toán.',
    price: 49000,
    currency: 'VND',
    sortOrder: 110,
    officialPriceNote: 'Quyền lợi nonprofit do Canva quyết định; đây là seat trong team do shop quản lý.',
    accountType: 'Seat thành viên Canva Pro trong team nonprofit; không phải tài khoản Canva riêng.',
    warrantyPolicy: 'Bảo hành quyền truy cập team trong 1 tháng kể từ khi bàn giao.',
    replacementPolicy: 'Gửi lại lời mời khi lỗi do team của shop; không áp dụng khi khách tự rời team, đổi email hoặc vi phạm chính sách Canva.',
    fulfillmentMode: 'seat_email',
    deliveryMode: 'text'
  },
  {
    sku: 'canva-pro-6m',
    category: 'Design Accounts',
    brand: 'Canva',
    packageType: 'Nonprofit Seat 6M',
    name: 'Canva Pro Seat (Nonprofit) - 6 tháng',
    description: 'Seat Canva Pro 6 tháng trong team nonprofit do shop quản lý; khách gửi email để nhận lời mời sau thanh toán.',
    price: 249000,
    currency: 'VND',
    sortOrder: 120,
    hot: true,
    officialPriceNote: 'Quyền lợi nonprofit do Canva quyết định; đây là seat trong team do shop quản lý.',
    accountType: 'Seat thành viên Canva Pro trong team nonprofit; không phải tài khoản Canva riêng.',
    warrantyPolicy: 'Bảo hành quyền truy cập team trong 6 tháng kể từ khi bàn giao.',
    replacementPolicy: 'Gửi lại lời mời khi lỗi do team của shop; không áp dụng khi khách tự rời team, đổi email hoặc vi phạm chính sách Canva.',
    fulfillmentMode: 'seat_email',
    deliveryMode: 'text'
  },
  {
    sku: 'capcut-pro-1m',
    category: 'Design Accounts',
    brand: 'CapCut',
    packageType: 'Pro 1M',
    name: 'CapCut Pro - 1 tháng',
    description: 'Gói CapCut Pro 1 tháng cho dựng video ngắn và content ads.',
    price: 69000,
    currency: 'VND',
    sortOrder: 130,
    officialPriceNote: 'CapCut Pro: pricing varies by region'
  },
  {
    sku: 'figma-pro-1m',
    category: 'Design Accounts',
    brand: 'Figma',
    packageType: 'Pro 1M',
    name: 'Figma Professional - 1 tháng',
    description: 'Gói Figma Professional 1 tháng cho thiết kế UI/UX, prototype, FigJam và workflow team.',
    price: 99000,
    currency: 'VND',
    sortOrder: 140,
    officialPriceNote: 'Figma Professional: seat-based monthly/annual pricing varies by region'
  },
  {
    sku: 'gmail-aged-pack-10',
    category: 'Work & Cloud Accounts',
    brand: 'Gmail',
    packageType: 'Gmail Aged Pack 10',
    name: 'Gmail Aged - Pack 10',
    description: 'Pack 10 tài khoản Gmail aged, giao danh sách theo định dạng shop.',
    price: 150000,
    currency: 'VND',
    sortOrder: 210,
    hot: true,
    officialPriceNote: 'Gmail consumer is free; Google Workspace Starter has regional per-user pricing'
  },
  {
    sku: 'google-workspace-slot-1m',
    category: 'Work & Cloud Accounts',
    brand: 'Google',
    packageType: 'Workspace Slot 1M',
    name: 'Google Workspace Slot - 1 tháng',
    description: 'Slot Google Workspace 1 tháng cho email, Drive và công việc nhóm.',
    price: 79000,
    currency: 'VND',
    sortOrder: 220,
    officialPriceNote: 'Google Workspace: per-user monthly plans vary by region'
  },
  {
    sku: 'microsoft-365-1m',
    category: 'Work & Cloud Accounts',
    brand: 'Microsoft',
    packageType: '365 1M',
    name: 'Microsoft 365 - 1 tháng',
    description: 'Gói Microsoft 365 1 tháng cho Office, OneDrive và công việc văn phòng.',
    price: 79000,
    currency: 'VND',
    sortOrder: 230,
    officialPriceNote: 'Microsoft 365: per-user monthly plans vary by region'
  },
  {
    sku: 'notion-plus-1m',
    category: 'Work & Cloud Accounts',
    brand: 'Notion',
    packageType: 'Plus 1M',
    name: 'Notion Plus - 1 tháng',
    description: 'Gói Notion Plus 1 tháng cho workspace cá nhân hoặc team nhỏ.',
    price: 59000,
    currency: 'VND',
    sortOrder: 240,
    officialPriceNote: 'Notion Plus: monthly subscription pricing varies by region'
  },
  {
    sku: 'paypal-business-verified-1',
    category: 'Work & Cloud Accounts',
    brand: 'PayPal',
    packageType: 'Business Verified',
    name: 'PayPal Business Verified - 1 tài khoản',
    description: 'Tài khoản PayPal Business đã chuẩn bị hồ sơ cơ bản cho nhu cầu nhận và xử lý thanh toán quốc tế.',
    price: 250000,
    currency: 'VND',
    sortOrder: 250,
    officialPriceNote: 'PayPal business has transaction fees instead of a fixed account subscription'
  },
  {
    sku: 'telegram-aged-pack-10',
    category: 'Social/MMO Accounts',
    brand: 'Telegram',
    packageType: 'Aged Pack 10',
    name: 'Telegram Aged - Pack 10',
    description: 'Pack 10 tài khoản Telegram aged, phù hợp vận hành cộng đồng và MMO.',
    price: 180000,
    currency: 'VND',
    sortOrder: 310,
    officialPriceNote: 'Telegram account is free; Premium pricing varies by region'
  },
  {
    sku: 'tiktok-aged-pack-5',
    category: 'Social/MMO Accounts',
    brand: 'TikTok',
    packageType: 'Aged Pack 5',
    name: 'TikTok Aged - Pack 5',
    description: 'Pack 5 tài khoản TikTok aged cho nhu cầu content và marketing.',
    price: 220000,
    currency: 'VND',
    sortOrder: 320,
    hot: true,
    officialPriceNote: 'TikTok Business Account is free; verification/features vary by market'
  },
  {
    sku: 'facebook-aged-pack-5',
    category: 'Social/MMO Accounts',
    brand: 'Facebook',
    packageType: 'Aged Pack 5',
    name: 'Facebook Aged - Pack 5',
    description: 'Pack 5 tài khoản Facebook aged cho chạy page, cộng đồng và vận hành social/MMO.',
    price: 180000,
    currency: 'VND',
    sortOrder: 325,
    officialPriceNote: 'Facebook Page is free; ads and verification are optional paid layers'
  },
  {
    sku: 'discord-aged-pack-10',
    category: 'Social/MMO Accounts',
    brand: 'Discord',
    packageType: 'Aged Pack 10',
    name: 'Discord Aged - Pack 10',
    description: 'Pack 10 tài khoản Discord aged cho cộng đồng, whitelist và support.',
    price: 160000,
    currency: 'VND',
    sortOrder: 330,
    officialPriceNote: 'Discord account is free; Nitro pricing varies by region'
  }
].map((product) => normalizeProductInput({
  ...product,
  seatTermMonths: product.seatTermMonths ?? inferSeatTermMonths(product),
  accountType: product.accountType || inferAccountType(product),
  warrantyPolicy: product.warrantyPolicy
    || 'Hỗ trợ kiểm tra lỗi đăng nhập trong thời hạn gói; thời gian xử lý được xác nhận theo từng sản phẩm.',
  replacementPolicy: product.replacementPolicy
    || 'Đổi thông tin khi lỗi thuộc dữ liệu shop giao và được xác minh; không áp dụng khi khách tự thay đổi bảo mật hoặc vi phạm chính sách nền tảng.'
}));

function inferAccountType(product = {}) {
  const packageType = String(product.packageType || '').toLowerCase();
  if (packageType.includes('pack')) return 'Gói nhiều tài khoản, bàn giao theo số lượng ghi trên sản phẩm.';
  if (packageType.includes('slot')) return 'Slot thành viên trong workspace/team.';
  if (packageType.includes('verified')) return 'Tài khoản đã chuẩn bị theo trạng thái mô tả.';
  return 'Tài khoản hoặc quyền truy cập số theo đúng mô tả gói.';
}

function inferSeatTermMonths(product = {}) {
  if (String(product.fulfillmentMode || '').trim().toLowerCase() !== 'seat_email') return null;
  const skuMatch = String(product.sku || '').trim().toLowerCase().match(/(?:^|[-_])(\d{1,3})m(?:$|[-_])/);
  return skuMatch ? Number(skuMatch[1]) : 1;
}

export function normalizeProductInput(input = {}) {
  const fulfillmentMode = normalizeFulfillmentMode(input.fulfillmentMode, { strict: true, sku: input.sku });
  const rawSeatTermMonths = String(input.seatTermMonths ?? '').trim();
  const seatTermMonths = rawSeatTermMonths ? Number(rawSeatTermMonths) : null;
  if (
    fulfillmentMode === 'seat_email'
    && rawSeatTermMonths
    && (!Number.isInteger(seatTermMonths) || seatTermMonths < 1 || seatTermMonths > 120)
  ) {
    throw Object.assign(new Error('Seat term months must be an integer between 1 and 120'), { statusCode: 400 });
  }
  return {
    sku: String(input.sku || '').trim().toLowerCase(),
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim(),
    category: String(input.category || '').trim() || 'Accounts',
    brand: String(input.brand || '').trim() || 'Other',
    packageType: String(input.packageType || '').trim(),
    price: Number(input.price || 0),
    currency: String(input.currency || '').trim() || 'VND',
    sortOrder: Number(input.sortOrder || 1000),
    active: input.active !== false,
    hot: input.hot === true || String(input.hot || '').toLowerCase() === 'true',
    officialPriceNote: String(input.officialPriceNote || '').trim(),
    accountType: String(input.accountType || '').trim(),
    warrantyPolicy: String(input.warrantyPolicy || '').trim(),
    replacementPolicy: String(input.replacementPolicy || input.exchangePolicy || '').trim(),
    fulfillmentMode,
    ...(fulfillmentMode === 'seat_email' ? { seatTermMonths } : {}),
    deliveryMode: normalizeDeliveryMode(input.deliveryMode, { strict: true })
  };
}

export function normalizePublicProduct(product = {}) {
  return {
    ...product,
    category: String(product.category || '').trim() || 'Accounts',
    brand: String(product.brand || '').trim() || 'Other',
    packageType: String(product.packageType || '').trim(),
    sortOrder: Number(product.sortOrder || 1000),
    hot: product.hot === true || String(product.hot || '').toLowerCase() === 'true',
    officialPriceNote: String(product.officialPriceNote || '').trim(),
    accountType: String(product.accountType || '').trim(),
    warrantyPolicy: String(product.warrantyPolicy || '').trim(),
    replacementPolicy: String(product.replacementPolicy || product.exchangePolicy || '').trim(),
    fulfillmentMode: normalizeFulfillmentMode(product.fulfillmentMode, { sku: product.sku }),
    ...(normalizeFulfillmentMode(product.fulfillmentMode, { sku: product.sku }) === 'seat_email'
      ? {
          seatTermMonths: Number.isInteger(Number(product.seatTermMonths))
            ? Number(product.seatTermMonths)
            : null
        }
      : {}),
    deliveryMode: normalizeDeliveryMode(product.deliveryMode)
  };
}

export function brandSortKey(product = {}) {
  const normalized = normalizePublicProduct(product);
  return [
    normalized.category,
    normalized.brand,
    String(normalized.sortOrder).padStart(6, '0')
  ].join('\x00');
}
