#!/usr/bin/env node
require('dotenv').config();
const { getDailyTrend } = require('../services/trend');
const { closeDb } = require('../models/database');

function main() {
  console.log('[TrendScript] Calculating daily trends...\n');

  const trends = getDailyTrend(10);

  if (!trends.length) {
    console.log('No trend data available. Run crawl at least 2 days to collect star history.');
    closeDb();
    return;
  }

  const today = new Date().toLocaleDateString('ja-JP');
  console.log(`🔥 デイリートレンド（${today}）\n`);

  trends.forEach((repo, i) => {
    const rank = i + 1;
    const newTag = repo.is_new ? ' 🆕' : '';
    const diff = repo.star_diff >= 0 ? `+${repo.star_diff.toLocaleString()}` : repo.star_diff.toLocaleString();

    console.log(`【急上昇 #${rank}】⭐ ${diff}（昨日比）| 累計 ${repo.current_stars.toLocaleString()}${newTag}`);
    console.log(`📦 ${repo.full_name}`);
    if (repo.japanese_summary) {
      const summary = repo.japanese_summary.substring(0, 80);
      console.log(`💡 ${summary}`);
    }
    console.log(`🏷️ ${repo.license || 'Unknown'} | 📊 Score: ${repo.score_total}/100`);
    console.log('');
  });

  closeDb();
  console.log('[TrendScript] Done.');
}

main();
