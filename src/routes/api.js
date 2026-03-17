const express = require('express');
const Repository = require('../models/repository');
const { search } = require('../services/searcher');

const router = express.Router();

// リポジトリ一覧
router.get('/repositories', (req, res) => {
  const { category, language, readmeLang, minStars, minScore, limit, offset, sort, order } = req.query;
  const repos = Repository.findAll({
    category,
    language,
    readmeLang,
    minStars: minStars ? parseInt(minStars) : undefined,
    minScore: minScore ? parseInt(minScore) : undefined,
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0,
    sort,
    order,
  });
  const total = Repository.count({
    category,
    language,
    readmeLang,
    minStars: minStars ? parseInt(minStars) : undefined,
    minScore: minScore ? parseInt(minScore) : undefined,
  });
  res.json({ data: repos, total, limit: parseInt(limit) || 50, offset: parseInt(offset) || 0 });
});

// 統計
router.get('/stats', (req, res) => {
  res.json(Repository.getStats());
});

// 今日の新着
router.get('/repositories/new-today', (req, res) => {
  res.json(Repository.getNewToday());
});

// カテゴリ一覧
router.get('/categories', (req, res) => {
  res.json(Repository.getCategories());
});

// 言語一覧
router.get('/languages', (req, res) => {
  res.json(Repository.getLanguages());
});

// リポジトリ詳細
router.get('/repositories/:id', (req, res) => {
  const repo = Repository.findById(parseInt(req.params.id));
  if (!repo) return res.status(404).json({ error: 'Not found' });
  res.json(repo);
});

// ステータス更新
router.patch('/repositories/:id/status', (req, res) => {
  const { status } = req.body;
  try {
    Repository.updateStatus(parseInt(req.params.id), status);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 自然言語検索
router.post('/search', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }
  if (!process.env.GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GITHUB_TOKEN is not configured' });
  }
  try {
    const result = await search(query.trim(), {
      token: process.env.GITHUB_TOKEN,
      topN: 10,
    });
    res.json(result);
  } catch (err) {
    console.error('[API] Search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET版（ダッシュボード用）
router.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'q parameter is required' });
  }
  if (!process.env.GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GITHUB_TOKEN is not configured' });
  }
  try {
    const result = await search(query.trim(), {
      token: process.env.GITHUB_TOKEN,
      topN: 10,
    });
    res.json(result);
  } catch (err) {
    console.error('[API] Search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// CSVエクスポート
router.get('/export/csv', (req, res) => {
  const repos = Repository.exportCsv();
  const headers = ['id', 'full_name', 'description', 'stars', 'forks', 'license', 'language', 'category', 'score_total', 'score_business', 'score_packaging', 'score_japan_gap', 'score_maintenance', 'status', 'last_updated'];

  const csvRows = [headers.join(',')];
  for (const repo of repos) {
    const row = headers.map(h => {
      const val = repo[h];
      if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val ?? '';
    });
    csvRows.push(row.join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=saas-scouter-export-${new Date().toISOString().split('T')[0]}.csv`);
  res.send('\uFEFF' + csvRows.join('\n'));
});

module.exports = router;
