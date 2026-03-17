#!/usr/bin/env node
/**
 * 自然言語検索 CLI
 * 使い方: node src/scripts/search.js "メルマガ配信を自動化したい"
 */
require('dotenv').config();
const { search } = require('../services/searcher');

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Usage: node src/scripts/search.js "<検索クエリ>"');
    console.error('Example: node src/scripts/search.js "メルマガ配信を自動化したい"');
    process.exit(1);
  }

  if (!process.env.GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN is required. Set it in .env');
    process.exit(1);
  }

  try {
    const result = await search(query, {
      token: process.env.GITHUB_TOKEN,
      topN: 10,
    });

    console.log('\n' + '='.repeat(80));
    console.log(`検索結果: "${result.query}"`);
    console.log(`検索キーワード: EN="${result.keywords.en}" CN="${result.keywords.cn}" RU="${result.keywords.ru}"`);
    console.log('='.repeat(80));

    if (!result.results.length) {
      console.log('\n該当するリポジトリが見つかりませんでした。');
      return;
    }

    result.results.forEach((repo, i) => {
      console.log(`\n--- #${i + 1} [Score: ${repo.score_total}/100] ---`);
      console.log(`  ${repo.full_name}`);
      console.log(`  ${repo.description || '(no description)'}`);
      console.log(`  Stars: ${repo.stars} | Language: ${repo.language} | License: ${repo.license}`);
      console.log(`  Score: BIZ:${repo.score_business} PKG:${repo.score_packaging} JP:${repo.score_japan_gap} MNT:${repo.score_maintenance}`);
      if (repo.japanese_summary) {
        console.log(`  【日本語解説】${repo.japanese_summary}`);
      }
      console.log(`  https://github.com/${repo.full_name}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log(`合計 ${result.results.length} 件`);
  } catch (err) {
    console.error('Search error:', err.message);
    process.exit(1);
  }
}

main();
