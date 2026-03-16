const { getDb } = require('./database');

const Repository = {
  upsert(repo) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO repositories (
        github_id, full_name, name, description, stars, forks,
        license, language, last_updated, topics, readme_excerpt,
        has_docker, has_ui, has_docs, open_issues, closed_issues,
        category, score_business, score_packaging, score_japan_gap,
        score_maintenance, score_total, last_crawled
      ) VALUES (
        @github_id, @full_name, @name, @description, @stars, @forks,
        @license, @language, @last_updated, @topics, @readme_excerpt,
        @has_docker, @has_ui, @has_docs, @open_issues, @closed_issues,
        @category, @score_business, @score_packaging, @score_japan_gap,
        @score_maintenance, @score_total, datetime('now')
      )
      ON CONFLICT(github_id) DO UPDATE SET
        description = excluded.description,
        stars = excluded.stars,
        forks = excluded.forks,
        license = excluded.license,
        language = excluded.language,
        last_updated = excluded.last_updated,
        topics = excluded.topics,
        readme_excerpt = excluded.readme_excerpt,
        has_docker = excluded.has_docker,
        has_ui = excluded.has_ui,
        has_docs = excluded.has_docs,
        open_issues = excluded.open_issues,
        closed_issues = excluded.closed_issues,
        category = excluded.category,
        score_business = excluded.score_business,
        score_packaging = excluded.score_packaging,
        score_japan_gap = excluded.score_japan_gap,
        score_maintenance = excluded.score_maintenance,
        score_total = excluded.score_total,
        last_crawled = datetime('now')
    `);
    return stmt.run(repo);
  },

  findAll({ category, language, minStars, minScore, limit = 50, offset = 0, sort = 'score_total', order = 'DESC' } = {}) {
    const db = getDb();
    const conditions = [];
    const params = {};

    if (category) { conditions.push('category = @category'); params.category = category; }
    if (language) { conditions.push('language = @language'); params.language = language; }
    if (minStars) { conditions.push('stars >= @minStars'); params.minStars = minStars; }
    if (minScore) { conditions.push('score_total >= @minScore'); params.minScore = minScore; }

    const allowedSorts = ['score_total', 'stars', 'forks', 'last_updated', 'first_seen'];
    const safeSort = allowedSorts.includes(sort) ? sort : 'score_total';
    const safeOrder = order === 'ASC' ? 'ASC' : 'DESC';

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const sql = `SELECT * FROM repositories ${where} ORDER BY ${safeSort} ${safeOrder} LIMIT @limit OFFSET @offset`;
    params.limit = limit;
    params.offset = offset;

    return db.prepare(sql).all(params);
  },

  count({ category, language, minStars, minScore } = {}) {
    const db = getDb();
    const conditions = [];
    const params = {};

    if (category) { conditions.push('category = @category'); params.category = category; }
    if (language) { conditions.push('language = @language'); params.language = language; }
    if (minStars) { conditions.push('stars >= @minStars'); params.minStars = minStars; }
    if (minScore) { conditions.push('score_total >= @minScore'); params.minScore = minScore; }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    return db.prepare(`SELECT COUNT(*) as count FROM repositories ${where}`).get(params).count;
  },

  findById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM repositories WHERE id = ?').get(id);
  },

  findByGithubId(githubId) {
    const db = getDb();
    return db.prepare('SELECT * FROM repositories WHERE github_id = ?').get(githubId);
  },

  updateStatus(id, status) {
    const db = getDb();
    const allowed = ['new', 'reviewing', 'in_progress', 'done', 'selling'];
    if (!allowed.includes(status)) throw new Error('Invalid status');
    return db.prepare('UPDATE repositories SET status = ? WHERE id = ?').run(status, id);
  },

  getNewToday() {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM repositories
      WHERE date(first_seen) = date('now')
      ORDER BY score_total DESC
    `).all();
  },

  getTopN(n = 10) {
    const db = getDb();
    return db.prepare('SELECT * FROM repositories ORDER BY score_total DESC LIMIT ?').all(n);
  },

  getStats() {
    const db = getDb();
    return {
      total: db.prepare('SELECT COUNT(*) as c FROM repositories').get().c,
      newToday: db.prepare("SELECT COUNT(*) as c FROM repositories WHERE date(first_seen) = date('now')").get().c,
      avgScore: db.prepare('SELECT ROUND(AVG(score_total), 1) as avg FROM repositories').get().avg || 0,
      highScore: db.prepare('SELECT COUNT(*) as c FROM repositories WHERE score_total >= 80').get().c,
      byCategory: db.prepare('SELECT category, COUNT(*) as count, ROUND(AVG(score_total),1) as avg_score FROM repositories GROUP BY category ORDER BY avg_score DESC').all(),
      byLanguage: db.prepare('SELECT language, COUNT(*) as count FROM repositories GROUP BY language ORDER BY count DESC LIMIT 10').all(),
    };
  },

  getCategories() {
    const db = getDb();
    return db.prepare('SELECT DISTINCT category FROM repositories ORDER BY category').all().map(r => r.category);
  },

  getLanguages() {
    const db = getDb();
    return db.prepare('SELECT DISTINCT language FROM repositories WHERE language IS NOT NULL ORDER BY language').all().map(r => r.language);
  },

  exportCsv() {
    const db = getDb();
    return db.prepare('SELECT * FROM repositories ORDER BY score_total DESC').all();
  }
};

module.exports = Repository;
