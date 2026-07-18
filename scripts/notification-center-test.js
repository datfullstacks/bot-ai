import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const runId = `${process.pid}-${Date.now()}`;
const dataFile = resolve(process.cwd(), 'data', `notification-test-${runId}.json`);

process.env.STORE_DRIVER = 'json';
process.env.DATA_FILE = dataFile;
process.env.TELEGRAM_BOT_TOKEN = '123:notification-test';
process.env.TELEGRAM_POLLING = 'false';
process.env.TELEGRAM_CUSTOM_TEXT_EMOJI = 'false';
process.env.AUTH_SECRET ||= 'notification-test-auth-secret-with-enough-length';
process.env.PAYMENT_WEBHOOK_SECRET ||= 'notification-test-payment-secret';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'admin123';

const calls = [];
global.fetch = async (url, options = {}) => {
  const body = JSON.parse(options.body || '{}');
  calls.push({ url: String(url), body });
  if (String(body.chat_id) === 'notify-blocked') {
    return new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }), {
      status: 403,
      headers: { 'content-type': 'application/json' }
    });
  }
  return new Response(JSON.stringify({ ok: true, result: { message_id: calls.length } }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};

const storage = await import('../src/storage.js');
const shop = await import('../src/shop.js');
const telegram = await import('../src/telegram.js');

try {
  await storage.initStore();
  const actorId = 'notification-test-admin';
  const optedIn = await shop.upsertTelegramUser({ id: 'notify-opted-in', username: 'notify_yes', first_name: 'Yes' });
  const defaultUser = await shop.upsertTelegramUser({ id: 'notify-default', username: 'notify_default', first_name: 'Default' });
  const blockedUser = await shop.upsertTelegramUser({ id: 'notify-blocked', username: 'notify_blocked', first_name: 'Blocked' });

  const initial = await shop.getNotificationCenterForUser(optedIn.id);
  assert.equal(initial.preferences.promotions, false);
  assert.equal(initial.preferences.serviceUpdates, true);
  await shop.updateNotificationPreferences(optedIn.id, { promotions: true });

  const promotion = await shop.createNotificationCampaign(actorId, {
    title: 'Ưu đãi gần gũi',
    message: 'Một thông báo có ích và không làm phiền.',
    category: 'promotion',
    emojiKey: 'boom',
    audienceType: 'subscribers',
    ctaType: 'catalog'
  });
  const promotionResult = await telegram.sendNotificationCampaign(promotion.id, { actorId });
  assert.equal(promotionResult.deliverySummary.targeted, 1, 'Promotion should only target opted-in users.');
  assert.equal(promotionResult.deliverySummary.sent, 1);
  assert.equal(calls.filter((call) => call.body.chat_id === 'notify-opted-in').length, 1);
  assert.equal(calls.some((call) => call.body.chat_id === 'notify-default'), false);

  const service = await shop.createNotificationCampaign(actorId, {
    title: 'Cập nhật dịch vụ',
    message: 'Bot đã hoạt động ổn định trở lại.',
    category: 'service',
    emojiKey: 'bell',
    audienceType: 'subscribers',
    ctaType: 'none'
  });
  const serviceResult = await telegram.sendNotificationCampaign(service.id, { actorId });
  assert.equal(serviceResult.deliverySummary.targeted, 3);
  assert.equal(serviceResult.deliverySummary.sent, 2);
  assert.equal(serviceResult.deliverySummary.blocked, 1);

  const center = await shop.getNotificationCenterForUser(optedIn.id, { markRead: true });
  assert.equal(center.notifications.length, 2);
  assert.equal(center.unread, 0);
  const click = await shop.recordNotificationClick(promotion.id, optedIn.id);
  assert.equal(click.recorded, true);

  const scheduled = await shop.createNotificationCampaign(actorId, {
    title: 'Lịch hàng mới',
    message: 'Gửi sau khi restock.',
    category: 'stock',
    audienceType: 'subscribers',
    ctaType: 'catalog',
    scheduledAt: new Date(Date.now() + 60_000).toISOString()
  });
  assert.equal(scheduled.status, 'scheduled');
  const due = await shop.listDueNotificationCampaigns(new Date(Date.now() + 120_000).toISOString());
  assert.ok(due.some((campaign) => campaign.id === scheduled.id));

  const overview = await shop.getNotificationAdminOverview();
  assert.equal(overview.metrics.campaigns, 3);
  assert.equal(overview.metrics.blocked, 1);
  assert.equal(overview.metrics.clicked, 1);
  assert.equal(overview.audience.knownUsers, 3);

  const blockedCenter = await shop.getNotificationCenterForUser(blockedUser.id);
  assert.equal(blockedCenter.preferences.serviceUpdates, true);
  const defaultCenter = await shop.getNotificationCenterForUser(defaultUser.id);
  assert.equal(defaultCenter.notifications.length, 1);

  console.log(JSON.stringify({
    ok: true,
    checked: 'notification preferences, segmentation, scheduling, delivery, blocked users and CTA tracking'
  }, null, 2));
} finally {
  await rm(dataFile, { force: true });
}
