const { getDb } = require('../models/database');
const Repository = require('../models/repository');
const { StarHistory } = require('../models/repository');

/**
 * デイリートレンドTOP10を計算して返す
 * star_history テーブルの前日比でスター増加数をランキング
 */
function getDailyTrend(limit = 10) {
  const db = getDb();

  // 前日比のスター増加ランキング
  const trending = db.prepare(`
    SELECT
      t.github_id,
      t.full_name,
      t.stars AS current_stars,
      COALESCE(y.stars, 0) AS yesterday_stars,
      (t.stars - COALESCE(y.stars, 0)) AS star_diff
    FROM star_history t
    LEFT JOIN star_history y
      ON t.github_id = y.github_id
      AND date(y.recorded_at) = date(t.recorded_at, '-1 day')
    WHERE date(t.recorded_at) = date('now')
    ORDER BY star_diff DESC
    LIMIT ?
  `).all(limit);

  // リポジトリ詳細情報を結合
  const results = trending.map((item) => {
    const repo = Repository.findByGithubId(item.github_id);
    if (!repo) return null;

    // first_seen が24時間以内なら NEW タグ
    const firstSeen = new Date(repo.first_seen);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const isNew = firstSeen >= oneDayAgo;

    return {
      ...repo,
      star_diff: item.star_diff,
      current_stars: item.current_stars,
      yesterday_stars: item.yesterday_stars,
      is_new: isNew,
    };
  }).filter(Boolean);

  return results;
}

/**
 * 全リポジトリのスター数を star_history に記録
 */
function recordAllStars() {
  const db = getDb();
  const repos = db.prepare('SELECT github_id, full_name, stars FROM repositories').all();
  if (repos.length > 0) {
    StarHistory.recordBatch(repos);
  }
  return repos.length;
}

module.exports = { getDailyTrend, recordAllStars };
