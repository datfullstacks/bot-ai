import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SLOGAN_MOTION_EMOJIS,
  SLOGAN_TEXT_MOTION_EMOJIS,
  buildSloganMotionFfmpegArgs,
  generateSloganMotionAssets,
  inferSloganTheme,
  resolveSloganMotionEntries
} from './telegram-slogan-motion-assets.js';

const tempDir = await mkdtemp(join(tmpdir(), 'kaito-slogan-motion-'));
const manifestPath = join(tempDir, 'manifest.json');

try {
  assert.deepEqual(
    SLOGAN_MOTION_EMOJIS.map((item) => item.key),
    ['welcome', 'catalog', 'checkout', 'payment', 'delivery', 'support', 'soldout']
  );
  assert.deepEqual(
    SLOGAN_TEXT_MOTION_EMOJIS.map((item) => item.key),
    ['text-shopping-flow']
  );

  assert.equal(inferSloganTheme('Thanh toán chuẩn, giao tự động'), 'payment');
  assert.equal(inferSloganTheme('Nhận hàng ngay sau khi chuyển khoản'), 'delivery');
  assert.equal(inferSloganTheme('Admin hỗ trợ nhanh'), 'support');
  assert.equal(inferSloganTheme('Giữ slot giá tốt'), 'premium');

  const entries = resolveSloganMotionEntries({
    slogans: {
      welcome: 'Chọn nhanh, nhận ngay',
      checkout: 'Giữ slot giá tốt'
    }
  });
  assert.equal(entries.find((item) => item.key === 'welcome').slogan, 'Chọn nhanh, nhận ngay');
  assert.equal(entries.find((item) => item.key === 'checkout').slogan, 'Giữ slot giá tốt');
  assert.equal(entries.find((item) => item.key === 'checkout').theme, 'premium');

  const args = buildSloganMotionFfmpegArgs({
    entry: entries.find((item) => item.key === 'checkout'),
    outputPath: join(tempDir, 'checkout.webm')
  });
  const filter = args[args.indexOf('-vf') + 1];
  assert.ok(args.includes('libvpx-vp9'), 'Slogan custom emoji videos should use VP9.');
  assert.ok(args.includes('-auto-alt-ref'), 'Slogan custom emoji videos need VP9 alt-ref disabled for alpha.');
  assert.equal(filter.includes('drawtext'), false, 'Slogan emoji should not render tiny unreadable slogan text.');
  assert.match(filter, /0xA855F7/, 'Premium slogan emoji should use a soft violet base.');
  assert.match(filter, /rotate='0\.025\*/, 'Slogan emoji should have a warmer animated tilt than static symbols.');
  assert.equal(args.at(-1).endsWith('checkout.webm'), true);

  const textArgs = buildSloganMotionFfmpegArgs({
    entry: resolveSloganMotionEntries().find((item) => item.key === 'text-shopping-flow'),
    outputPath: join(tempDir, 'text-shopping-flow.webm')
  });
  const textFilter = textArgs[textArgs.indexOf('-vf') + 1];
  assert.ok(textFilter.includes('drawtext'), 'Text slogan emoji should render the slogan words into the custom emoji.');
  assert.equal((textFilter.match(/drawtext/g) || []).length, 1, 'Text slogan emoji should keep the words on one moving line.');
  assert.equal(textFilter.includes('drawbox'), false, 'Text slogan emoji should be text only without a frame.');
  assert.equal(textFilter.includes('shadowcolor=0x000000'), false, 'Text slogan emoji should not paint a black shadow/background.');
  assert.match(textFilter, /x=w-\(w\+text_w\)\*mod\(t\\,2\.8\)\/2\.8/, 'Text slogan emoji should loop from right to left.');
  assert.match(textFilter, /fontsize=24/, 'Text slogan emoji should be large enough to read as it scrolls.');
  assert.match(textFilter, /CHỌN/, 'Text slogan emoji should include the visible slogan word.');
  assert.match(textFilter, /NHANH/, 'Text slogan emoji should include the visible slogan word.');
  assert.match(textFilter, /THANH TOÁN/, 'Text slogan emoji should include the full flow in one segment.');
  assert.match(textFilter, /NHẬN HÀNG LIỀN/, 'Text slogan emoji should include the full flow in one segment.');

  const commands = [];
  const result = await generateSloganMotionAssets({
    outputDir: tempDir,
    imageDir: join(tempDir, 'images'),
    manifestPath,
    ffmpegPath: 'ffmpeg-test',
    slogans: {
      payment: 'Thanh toán chuẩn, giao tự động'
    },
    runCommand: async (command, commandArgs) => {
      commands.push({ command, commandArgs });
    }
  });

  const expectedEntries = [...SLOGAN_MOTION_EMOJIS, ...SLOGAN_TEXT_MOTION_EMOJIS];
  assert.equal(result.generated, expectedEntries.length);
  assert.deepEqual(result.files.map((file) => file.fileName), expectedEntries.map((item) => `${item.key}.webm`));
  assert.deepEqual(result.files.map((file) => file.imageName), expectedEntries.map((item) => `${item.key}.png`));
  assert.equal(commands.length, expectedEntries.length * 2);
  assert.ok(commands[0].commandArgs.some((arg) => arg.endsWith('welcome.webm')));
  assert.ok(commands[1].commandArgs.some((arg) => arg.endsWith('welcome.png')));

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.outputDir, tempDir);
  assert.equal(manifest.imageDir.endsWith('images'), true);
  assert.equal(manifest.files.find((item) => item.key === 'payment').slogan, 'Thanh toán chuẩn, giao tự động');
  assert.equal(manifest.files.find((item) => item.key === 'payment').emoji, '💳');
  assert.equal(manifest.files.find((item) => item.key === 'payment').imageName, 'payment.png');
  assert.equal(manifest.files.find((item) => item.key === 'payment').imagePath.endsWith('payment.png'), true);
  assert.deepEqual(manifest.files.find((item) => item.key === 'text-shopping-flow').textLines, ['CHỌN NHANH - THANH TOÁN GỌN - NHẬN HÀNG LIỀN']);

  console.log(JSON.stringify({ ok: true, checked: 'telegram slogan motion emoji asset generation' }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
