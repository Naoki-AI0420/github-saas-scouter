#!/usr/bin/env node
require('dotenv').config();
const { crawlAll } = require('../services/crawler');
const { crawlTrending } = require('../services/trending');
const { crawlHackerNews } = require('../services/hackernews');
const { sendNewHighScoreAlerts } = require('../services/notifier');
const { recordAllStars } = require('../services/trend');
const { closeDb } = require('../models/database');

async function main() {
  if (!process.env.GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN is required. Set it in .env file.');
    process.exit(1);
  }

  const token = process.env.GITHUB_TOKEN;

  // 1. 既存のカテゴリクロール
  console.log('[CrawlScript] Starting full crawl...');
  const results = await crawlAll(token);
  console.log('[CrawlScript] Category crawl results:', JSON.stringify(results, null, 2));

  // 2. GitHub Trending
  try {
    console.log('[CrawlScript] Crawling GitHub Trending...');
    const trendResult = await crawlTrending(token, 'daily');
    console.log('[CrawlScript] Trending result:', JSON.stringify(trendResult));
  } catch (err) {
    console.error('[CrawlScript] Trending crawl failed:', err.message);
  }

  // 3. Hacker News
  try {
    console.log('[CrawlScript] Crawling Hacker News...');
    const hnResult = await crawlHackerNews(token);
    console.log('[CrawlScript] HN result:', JSON.stringify(hnResult));
  } catch (err) {
    console.error('[CrawlScript] HN crawl failed:', err.message);
  }

  // 4. スター履歴を記録（全リポジトリ）
  const recorded = recordAllStars();
  console.log(`[CrawlScript] Recorded star history for ${recorded} repos`);

  // 5. 高スコアアラート送信
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
