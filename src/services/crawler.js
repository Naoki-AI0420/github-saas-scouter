const { Octokit } = require('octokit');
const Repository = require('../models/repository');
const { getDb } = require('../models/database');
const { scoreRepository } = require('./scorer');

const CATEGORIES = {
  crm: { query: 'crm customer relationship management', label: 'CRM' },
  newsletter: { query: 'newsletter email marketing', label: 'メルマガ' },
  seo: { query: 'seo search engine optimization tool', label: 'SEO' },
  pos: { query: 'pos point of sale', label: 'POS' },
  inventory: { query: 'inventory management stock', label: '在庫管理' },
  formbuilder: { query: 'form builder drag drop', label: 'フォームビルダー' },
  booking: { query: 'booking reservation scheduling system', label: '予約システム' },
  chatbot: { query: 'chatbot customer support', label: 'チャットボット' },
  invoice: { query: 'invoice billing payment', label: '請求書' },
  projectmgmt: { query: 'project management kanban task', label: 'プロジェクト管理' },
  survey: { query: 'survey questionnaire feedback form', label: 'アンケート' },
  hr: { query: 'hr human resources attendance payroll', label: 'HR/勤怠' },
  accounting: { query: 'accounting bookkeeping finance', label: '会計' },
  lms: { query: 'lms learning management system course', label: 'LMS' },
  // Chinese keywords
  cn_admin: { query: '管理系统 开源', label: '管理系统(CN)' },
  cn_ecommerce: { query: '商城 小程序 开源', label: '商城(CN)' },
  cn_saas: { query: '开源 saas 后台管理', label: 'SaaS(CN)' },
  cn_hr: { query: '人事管理 开源', label: 'HR(CN)' },
  cn_finance: { query: '财务管理 开源', label: '財務(CN)' },
  cn_crm: { query: '客户管理 开源', label: 'CRM(CN)' },
  // Russian keywords
  ru_business: { query: 'управление бизнес открытый код', label: 'ビジネス管理(RU)' },
  ru_management: { query: 'система управления открытый код', label: '管理システム(RU)' },
  ru_crm: { query: 'CRM открытый код', label: 'CRM(RU)' },
};

const SIX_MONTHS_AGO = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

async function crawlCategory(octokit, categoryKey) {
  const cat = CATEGORIES[categoryKey];
  if (!cat) throw new Error(`Unknown category: ${categoryKey}`);

  const query = `${cat.query} stars:100..20000 license:mit license:apache-2.0 license:bsd-2-clause license:bsd-3-clause pushed:>${SIX_MONTHS_AGO}`;

  const db = getDb();
  const log = db.prepare(`
    INSERT INTO crawl_logs (category, status) VALUES (?, 'running')
  `).run(cat.label);
  const logId = log.lastInsertRowid;

  let reposFound = 0;
  let reposNew = 0;
  let reposUpdated = 0;

  try {
    // Fetch up to 3 pages (30 per page = 90 repos max per category)
    for (let page = 1; page <= 3; page++) {
      const response = await octokit.rest.search.repos({
        q: query,
        sort: 'stars',
        order: 'desc',
        per_page: 30,
        page,
      });

      if (!response.data.items.length) break;

      for (const item of response.data.items) {
        reposFound++;

        // Check if already exists
        const existing = Repository.findByGithubId(item.id);

        // Fetch README
        let readmeExcerpt = '';
        try {
          const readme = await octokit.rest.repos.getReadme({
            owner: item.owner.login,
            repo: item.name,
            mediaType: { format: 'raw' },
          });
          readmeExcerpt = (typeof readme.data === 'string' ? readme.data : '').substring(0, 500);
        } catch (e) {
          // README not found
        }

        // Check for Docker
        let hasDocker = 0;
        try {
          await octokit.rest.repos.getContent({
            owner: item.owner.login,
            repo: item.name,
            path: 'Dockerfile',
          });
          hasDocker = 1;
        } catch (e) {
          try {
            await octokit.rest.repos.getContent({
              owner: item.owner.login,
              repo: item.name,
              path: 'docker-compose.yml',
            });
            hasDocker = 1;
          } catch (e2) { /* no docker */ }
        }

        // Detect UI presence from topics/description/readme
        const combinedText = `${item.description || ''} ${(item.topics || []).join(' ')} ${readmeExcerpt}`.toLowerCase();
        const hasUi = /\b(dashboard|ui|frontend|web app|gui|interface|react|vue|angular|nextjs|nuxt)\b/.test(combinedText) ? 1 : 0;

        // Check docs
        const hasDocs = /\b(documentation|docs|wiki|guide|tutorial)\b/.test(combinedText) ? 1 : 0;

        const repoData = {
          github_id: item.id,
          full_name: item.full_name,
          name: item.name,
          description: item.description || '',
          stars: item.stargazers_count,
          forks: item.forks_count,
          license: item.license?.spdx_id || 'Unknown',
          language: item.language || 'Unknown',
          last_updated: item.pushed_at,
          topics: JSON.stringify(item.topics || []),
          readme_excerpt: readmeExcerpt,
          has_docker: hasDocker,
          has_ui: hasUi,
          has_docs: hasDocs,
          open_issues: item.open_issues_count,
          closed_issues: 0,
          category: cat.label,
        };

        // Calculate scores
        const scores = scoreRepository(repoData);
        repoData.score_business = scores.business;
        repoData.score_packaging = scores.packaging;
        repoData.score_japan_gap = scores.japanGap;
        repoData.score_maintenance = scores.maintenance;
        repoData.score_total = scores.total;

        Repository.upsert(repoData);

        if (existing) {
          reposUpdated++;
        } else {
          reposNew++;
        }
      }

      // Rate limit: wait between pages
      await sleep(2000);
    }

    db.prepare(`
      UPDATE crawl_logs SET repos_found = ?, repos_new = ?, repos_updated = ?, finished_at = datetime('now'), status = 'done'
      WHERE id = ?
    `).run(reposFound, reposNew, reposUpdated, logId);

    return { category: cat.label, reposFound, reposNew, reposUpdated };
  } catch (error) {
    db.prepare(`
      UPDATE crawl_logs SET finished_at = datetime('now'), status = 'error', error = ?
      WHERE id = ?
    `).run(error.message, logId);
    throw error;
  }
}

async function crawlAll(token) {
  const octokit = new Octokit({ auth: token });
  const results = [];

  for (const key of Object.keys(CATEGORIES)) {
    try {
      console.log(`[Crawler] Crawling category: ${CATEGORIES[key].label}`);
      const result = await crawlCategory(octokit, key);
      results.push(result);
      console.log(`[Crawler] ${result.category}: found=${result.reposFound} new=${result.reposNew} updated=${result.reposUpdated}`);
    } catch (error) {
      console.error(`[Crawler] Error crawling ${key}: ${error.message}`);
      results.push({ category: CATEGORIES[key].label, error: error.message });
    }
    // Wait between categories to respect rate limits
    await sleep(5000);
  }

  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { crawlAll, crawlCategory, CATEGORIES };
