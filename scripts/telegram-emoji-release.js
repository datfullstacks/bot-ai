import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, nowIso } from '../src/config.js';
import { BANNER_EMOJI_ITEMS, generateBannerEmojiAssets } from './telegram-banner-emoji-assets.js';
import {
  buildSloganTileEmojiMap,
  generateSloganTileAssets
} from './telegram-slogan-tile-assets.js';
import { createCustomEmojiPack } from './telegram-custom-emoji-pack.js';

const BANNER_PACK = {
  sourceDir: resolve(process.cwd(), 'public', 'brand', 'banner-emoji'),
  outputPath: config.telegram.bannerEmojiMapFile,
  packBase: 'kaito_ai_shop_banner_motion',
  title: 'KAITO AI SHOP Banner Motion',
  stickerFormat: 'video'
};

const SLOGAN_TILE_PACK = {
  sourceDir: resolve(process.cwd(), 'public', 'brand', 'slogan-tiles'),
  outputPath: config.telegram.sloganTileEmojiMapFile,
  packBase: 'kaito_ai_shop_slogan_tiles',
  title: 'KAITO AI SHOP Slogan Tiles',
  stickerFormat: 'video'
};

export async function releaseTelegramEmojiPacks(options = {}) {
  const packs = parsePackList(options.packs || 'banner');
  const results = [];

  for (const pack of packs) {
    if (pack === 'banner') {
      const assets = await generateBannerEmojiAssets({
        outputDir: options.bannerSourceDir || BANNER_PACK.sourceDir,
        manifestPath: options.bannerAssetManifestPath,
        previewPath: options.bannerPreviewPath,
        pythonPath: options.pythonPath,
        ffmpegPath: options.ffmpegPath
      });
      let upload = { skipped: true, reason: options.yes ? '' : 'missing_yes' };
      if (options.yes) {
        upload = await createCustomEmojiPack({
          token: options.token || config.telegram.token,
          ownerUserId: options.ownerUserId || process.env.TELEGRAM_OWNER_USER_ID,
          botUsername: options.botUsername || process.env.TELEGRAM_BOT_USERNAME,
          sourceDir: options.bannerSourceDir || BANNER_PACK.sourceDir,
          outputPath: options.bannerMapOutputPath || BANNER_PACK.outputPath,
          packBase: options.bannerPackBase || BANNER_PACK.packBase,
          title: options.bannerTitle || BANNER_PACK.title,
          stickerFormat: BANNER_PACK.stickerFormat,
          emojiByBrandKey: Object.fromEntries(BANNER_EMOJI_ITEMS.map((item) => [item.key, item.emoji])),
          dryRun: false,
          fetchImpl: options.fetchImpl
        });
      }
      results.push({ pack, assets, upload });
      continue;
    }

    if (pack === 'slogan-tiles') {
      const assets = await generateSloganTileAssets({
        outputDir: options.sloganTileSourceDir || SLOGAN_TILE_PACK.sourceDir,
        manifestPath: options.sloganTileAssetManifestPath,
        previewPath: options.sloganTilePreviewPath,
        pythonPath: options.pythonPath,
        ffmpegPath: options.ffmpegPath
      });
      let upload = { skipped: true, reason: options.yes ? '' : 'missing_yes' };
      if (options.yes) {
        upload = await createCustomEmojiPack({
          token: options.token || config.telegram.token,
          ownerUserId: options.ownerUserId || process.env.TELEGRAM_OWNER_USER_ID,
          botUsername: options.botUsername || process.env.TELEGRAM_BOT_USERNAME,
          sourceDir: options.sloganTileSourceDir || SLOGAN_TILE_PACK.sourceDir,
          packBase: options.sloganTilePackBase || SLOGAN_TILE_PACK.packBase,
          title: options.sloganTileTitle || SLOGAN_TILE_PACK.title,
          stickerFormat: SLOGAN_TILE_PACK.stickerFormat,
          emojiByBrandKey: Object.fromEntries((assets.files || []).map((file) => [file.key.replace(/[^a-z0-9]+/gi, '').toLowerCase(), file.emoji])),
          dryRun: false,
          fetchImpl: options.fetchImpl
        });
        const map = buildSloganTileEmojiMap({ assetManifest: assets, uploadResult: upload });
        await mkdir(dirname(options.sloganTileMapOutputPath || SLOGAN_TILE_PACK.outputPath), { recursive: true });
        await writeFile(options.sloganTileMapOutputPath || SLOGAN_TILE_PACK.outputPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
        upload = { ...upload, outputPath: options.sloganTileMapOutputPath || SLOGAN_TILE_PACK.outputPath };
      }
      results.push({ pack, assets, upload });
      continue;
    }

    throw new Error(`Unsupported emoji release pack: ${pack}`);
  }

  const report = {
    ok: results.every((result) => result.assets?.ok && (options.yes ? !result.upload?.skipped : true)),
    generatedAt: nowIso(),
    dryRun: !options.yes,
    packs: results
  };
  if (options.reportPath) {
    await mkdir(dirname(options.reportPath), { recursive: true });
    await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return report;
}

function parsePackList(value) {
  return [...new Set(String(value || 'banner').split(',').map((item) => normalizePackName(item)).filter(Boolean))];
}

function normalizePackName(value) {
  const text = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  if (text === 'slogantiles' || text === 'slogan-tile') return 'slogan-tiles';
  return text;
}

function parseArgs(argv) {
  const args = {
    packs: 'banner',
    reportPath: config.telegram.emojiReleaseReportFile,
    yes: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--packs') args.packs = argv[++index];
    else if (arg === '--report') args.reportPath = resolve(argv[++index]);
    else if (arg === '--token') args.token = argv[++index];
    else if (arg === '--owner-user-id') args.ownerUserId = argv[++index];
    else if (arg === '--bot-username') args.botUsername = argv[++index];
    else if (arg === '--banner-pack-base') args.bannerPackBase = argv[++index];
    else if (arg === '--slogan-tile-pack-base') args.sloganTilePackBase = argv[++index];
    else if (arg === '--python') args.pythonPath = argv[++index];
    else if (arg === '--ffmpeg') args.ffmpegPath = argv[++index];
    else if (arg === '--yes') args.yes = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log([
      'Usage:',
      '  npm.cmd run telegram:release-emojis -- --packs banner --yes',
      '',
      'Options:',
      '  --packs <list>       Defaults to banner',
      '  --report <path>      Defaults to TELEGRAM_EMOJI_RELEASE_REPORT_FILE',
      '  --yes                Required to upload via Telegram Bot API',
      '  --token <token>      Overrides TELEGRAM_BOT_TOKEN',
      '  --owner-user-id <id> Overrides TELEGRAM_OWNER_USER_ID',
      '  --bot-username <u>   Overrides TELEGRAM_BOT_USERNAME',
      '  --banner-pack-base <base> Use a new base when a previous banner pack name exists',
      '  --slogan-tile-pack-base <base> Use a new base when a previous slogan tile pack name exists'
    ].join('\n'));
    return;
  }
  const report = await releaseTelegramEmojiPacks(args);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
