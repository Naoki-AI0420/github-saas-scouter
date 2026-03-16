const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables(db);
  }
  return db;
}

function initTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_id INTEGER UNIQUE,
      full_name TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      license TEXT,
      language TEXT,
      last_updated TEXT,
      topics TEXT,
      readme_excerpt TEXT,
      has_docker INTEGER DEFAULT 0,
      has_ui INTEGER DEFAULT 0,
      has_docs INTEGER DEFAULT 0,
      open_issues INTEGER DEFAULT 0,
      closed_issues INTEGER DEFAULT 0,
      category TEXT,
      score_business INTEGER DEFAULT 0,
      score_packaging INTEGER DEFAULT 0,
      score_japan_gap INTEGER DEFAULT 0,
      score_maintenance INTEGER DEFAULT 0,
      score_total INTEGER DEFAULT 0,
      readme_lang TEXT DEFAULT 'English',
      status TEXT DEFAULT 'new',
      first_seen TEXT DEFAULT (datetime('now')),
      last_crawled TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crawl_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT,
      repos_found INTEGER DEFAULT 0,
      repos_new INTEGER DEFAULT 0,
      repos_updated INTEGER DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT DEFAULT 'running',
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_repos_score ON repositories(score_total DESC);
    CREATE INDEX IF NOT EXISTS idx_repos_category ON repositories(category);
    CREATE INDEX IF NOT EXISTS idx_repos_status ON repositories(status);
    CREATE INDEX IF NOT EXISTS idx_repos_first_seen ON repositories(first_seen);
  `);

  // マイグレーション: japanese_summary カラム追加
  try {
    db.exec(`ALTER TABLE repositories ADD COLUMN japanese_summary TEXT`);
  } catch (e) {
    // カラムが既に存在する場合は無視
  }
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb, initTables };
