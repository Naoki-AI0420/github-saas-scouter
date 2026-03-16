#!/usr/bin/env node
require('dotenv').config();
const { crawlAll } = require('../services/crawler');
const { sendNewHighScoreAlerts } = require('../services/notifier');
const { closeDb } = require('../models/database');

async function main() {
  if (!process.env.GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN is required. Set it in .env file.');
    process.exit(1);
  }

  console.log('[CrawlScript] Starting full crawl...');
  const results = await crawlAll(process.env.GITHUB_TOKEN);
  console.log('[CrawlScript] Results:', JSON.stringify(results, null, 2));

  if (process.env.DISCORD_WEBHOOK_URL) {
    const alertCount = await sendNewHighScoreAlerts(process.env.DISCORD_WEBHOOK_URL);
    console.log(`[CrawlScript] Sent ${alertCount} high-score alerts`);
  }

  closeDb();
  console.log('[CrawlScript] Done.');
}

main().catch(err => {
  console.error('[CrawlScript] Fatal error:', err);
  closeDb();
  process.exit(1);
});
