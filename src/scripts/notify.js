#!/usr/bin/env node
require('dotenv').config();
const { sendDailyTop10 } = require('../services/notifier');
const { closeDb } = require('../models/database');

async function main() {
  if (!process.env.DISCORD_WEBHOOK_URL) {
    console.error('DISCORD_WEBHOOK_URL is required. Set it in .env file.');
    process.exit(1);
  }

  console.log('[NotifyScript] Sending daily top 10...');
  await sendDailyTop10(process.env.DISCORD_WEBHOOK_URL);
  console.log('[NotifyScript] Done.');
  closeDb();
}

main().catch(err => {
  console.error('[NotifyScript] Fatal error:', err);
  closeDb();
  process.exit(1);
});
