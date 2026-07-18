const CATEGORY_VALUES = new Set(['promotion', 'stock', 'news', 'service']);
const AUDIENCE_VALUES = new Set(['subscribers', 'customers', 'product', 'username']);
const CTA_VALUES = new Set(['none', 'catalog', 'orders', 'product']);

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  promotions: false,
  stockAlerts: false,
  news: false,
  serviceUpdates: true
});

export const NOTIFICATION_CATEGORY_META = Object.freeze({
  promotion: { label: 'Ưu đãi', preferenceKey: 'promotions', emojiKey: 'boom' },
  stock: { label: 'Hàng mới / restock', preferenceKey: 'stockAlerts', emojiKey: 'shopping-bag' },
  news: { label: 'Tin tức', preferenceKey: 'news', emojiKey: 'megaphone' },
  service: { label: 'Cập nhật dịch vụ', preferenceKey: 'serviceUpdates', emojiKey: 'bell' }
});

function requiredText(value, maxLength, code, label) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength) {
    throw Object.assign(new Error(`${label} is required and must be at most ${maxLength} characters`), {
      code,
      statusCode: 400
    });
  }
  return text;
}

function optionalText(value, maxLength, code, label) {
  const text = String(value || '').trim();
  if (text.length > maxLength) {
    throw Object.assign(new Error(`${label} must be at most ${maxLength} characters`), {
      code,
      statusCode: 400
    });
  }
  return text;
}

export function normalizeNotificationPreferences(value = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).map(([key, fallback]) => [
    key,
    typeof value?.[key] === 'boolean' ? value[key] : fallback
  ]));
}

export function normalizeNotificationPreferencePatch(input = {}) {
  const allowed = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES);
  const patch = {};
  for (const key of allowed) {
    if (input[key] !== undefined) patch[key] = input[key] === true || String(input[key]).toLowerCase() === 'true';
  }
  if (!Object.keys(patch).length) {
    throw Object.assign(new Error('A notification preference is required'), {
      code: 'notification_preference_required',
      statusCode: 400
    });
  }
  return patch;
}

export function notificationCategoryMeta(category) {
  return NOTIFICATION_CATEGORY_META[String(category || '').trim().toLowerCase()]
    || NOTIFICATION_CATEGORY_META.news;
}

export function userAllowsNotification(user = {}, category) {
  const preferences = normalizeNotificationPreferences(user.notificationPreferences);
  return preferences[notificationCategoryMeta(category).preferenceKey] !== false;
}

export function normalizeNotificationCampaignInput(input = {}, { now = Date.now() } = {}) {
  const category = String(input.category || '').trim().toLowerCase();
  if (!CATEGORY_VALUES.has(category)) {
    throw Object.assign(new Error('Notification category is invalid'), {
      code: 'notification_category_invalid',
      statusCode: 400
    });
  }
  const audienceType = String(input.audienceType || input.audience?.type || 'subscribers').trim().toLowerCase();
  if (!AUDIENCE_VALUES.has(audienceType)) {
    throw Object.assign(new Error('Notification audience is invalid'), {
      code: 'notification_audience_invalid',
      statusCode: 400
    });
  }
  const audienceValue = optionalText(input.audienceValue ?? input.audience?.value, 120, 'notification_audience_value_invalid', 'Audience value');
  if (['product', 'username'].includes(audienceType) && !audienceValue) {
    throw Object.assign(new Error('The selected audience requires a value'), {
      code: 'notification_audience_value_required',
      statusCode: 400
    });
  }
  const ctaType = String(input.ctaType || input.cta?.type || 'none').trim().toLowerCase();
  if (!CTA_VALUES.has(ctaType)) {
    throw Object.assign(new Error('Notification CTA is invalid'), {
      code: 'notification_cta_invalid',
      statusCode: 400
    });
  }
  const ctaValue = optionalText(input.ctaValue ?? input.cta?.value, 120, 'notification_cta_value_invalid', 'CTA value');
  if (ctaType === 'product' && !ctaValue) {
    throw Object.assign(new Error('Product CTA requires a SKU'), {
      code: 'notification_cta_value_required',
      statusCode: 400
    });
  }
  const emojiKey = optionalText(input.emojiKey, 40, 'notification_emoji_invalid', 'Emoji key')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  const scheduleText = String(input.scheduledAt || '').trim();
  const scheduleTimestamp = scheduleText ? Date.parse(scheduleText) : NaN;
  if (scheduleText && !Number.isFinite(scheduleTimestamp)) {
    throw Object.assign(new Error('Notification schedule is invalid'), {
      code: 'notification_schedule_invalid',
      statusCode: 400
    });
  }
  const scheduledAt = Number.isFinite(scheduleTimestamp) ? new Date(scheduleTimestamp).toISOString() : null;
  return {
    title: requiredText(input.title, 100, 'notification_title_invalid', 'Title'),
    message: requiredText(input.message, 1200, 'notification_message_invalid', 'Message'),
    category,
    emojiKey: emojiKey || notificationCategoryMeta(category).emojiKey,
    audience: { type: audienceType, value: audienceValue || null },
    cta: {
      type: ctaType,
      value: ctaValue || null,
      label: optionalText(input.ctaLabel, 40, 'notification_cta_label_invalid', 'CTA label') || null
    },
    scheduledAt,
    status: scheduledAt && scheduleTimestamp > now ? 'scheduled' : 'draft'
  };
}

export function publicNotificationCampaign(campaign = {}) {
  return {
    id: campaign.id,
    title: campaign.title,
    message: campaign.message,
    category: campaign.category,
    emojiKey: campaign.emojiKey,
    audience: campaign.audience || { type: 'subscribers', value: null },
    cta: campaign.cta || { type: 'none', value: null, label: null },
    status: campaign.status || 'draft',
    scheduledAt: campaign.scheduledAt || null,
    createdBy: campaign.createdBy || null,
    createdAt: campaign.createdAt || null,
    updatedAt: campaign.updatedAt || null,
    startedAt: campaign.startedAt || null,
    completedAt: campaign.completedAt || null,
    deliverySummary: campaign.deliverySummary || { targeted: 0, sent: 0, failed: 0, blocked: 0, clicked: 0 }
  };
}

export function notificationDeliverySummary(deliveries = []) {
  return {
    targeted: deliveries.length,
    sent: deliveries.filter((item) => item.status === 'sent').length,
    failed: deliveries.filter((item) => item.status === 'failed').length,
    blocked: deliveries.filter((item) => item.status === 'blocked').length,
    clicked: deliveries.filter((item) => item.clickedAt).length
  };
}
