import { config } from '../src/config.js';
import {
  buildTelegramEmojiHealthReport,
  writeTelegramEmojiHealthReport
} from '../src/telegramEmojiHealth.js';

const args = parseArgs(process.argv.slice(2));

try {
  const report = await buildTelegramEmojiHealthReport({
    token: args.token || config.telegram.token,
    chatId: args.chatId
  });
  if (args.writeReport) {
    await writeTelegramEmojiHealthReport(args.output || config.telegram.emojiHealthReportFile, report);
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok && args.strict) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    chatId: process.env.TELEGRAM_PROBE_CHAT_ID || process.env.TELEGRAM_TEST_CHAT_ID || '',
    output: config.telegram.emojiHealthReportFile,
    token: '',
    writeReport: false,
    strict: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--chat-id') args.chatId = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--token') args.token = argv[++index];
    else if (arg === '--write-report') args.writeReport = true;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.help) {
    console.log([
      'Usage:',
      '  npm.cmd run telegram:emoji-health -- --chat-id <id> --write-report',
      '',
      'Options:',
      '  --chat-id <id>      Stored in the report for live acceptance tracking',
      '  --output <path>     Defaults to TELEGRAM_EMOJI_HEALTH_REPORT_FILE',
      '  --token <token>     Overrides TELEGRAM_BOT_TOKEN',
      '  --write-report      Writes the JSON report',
      '  --strict            Exit non-zero when health is not ok'
    ].join('\n'));
    process.exit(0);
  }
  return args;
}
