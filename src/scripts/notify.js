#!/usr/bin/env node
require('dotenv').config();
const { sendDailyTop10, sendDailyTrend } = require('../services/notifier');
const { closeDb } = require('../models/database');

async function main() {
  if (!process.env.DISCORD_WEBHOOK_URL) {
    console.error('DISCORD_WEBHOOK_URL is required. Set it in .env file.');
    process.exit(1);
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const mode = process.argv[2] || 'all'; // 'top10', 'trend', or 'all'

  if (mode === 'top10' || mode === 'all') {
    console.log('[NotifyScript] Sending daily top 10...');
    await sendDailyTop10(webhookUrl);
    console.log('[NotifyScript] Daily top 10 sent.');
  }

  if (mode === 'trend' || mode === 'all') {
    console.log('[NotifyScript] Sending daily trend...');
    await sendDailyTrend(webhookUrl);
    console.log('[NotifyScript] Daily trend sent.');
  }

  closeDb();
  console.log('[NotifyScript] Done.');
}

main().catch(err => {
  console.error('[NotifyScript] Fatal error:', err);
  closeDb();
  process.exit(1);
});
