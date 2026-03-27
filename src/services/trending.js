const { Octokit } = require('octokit');
const Repository = require('../models/repository');
const { scoreRepository, detectReadmeLanguage } = require('./scorer');

/**
 * GitHub Trending ページをスクレイピングしてリポジトリ情報を取得
 * daily / weekly のトレンドを取得し、既存DBに統合
 */

const TRENDING_URL = 'https://github.com/trending';

/**
 * GitHub Trending HTMLをパースしてリポジトリ情報を抽出
 */
function parseTrendingHtml(html) {
  const repos = [];
  // 各リポジトリ行を抽出（<article class="Box-row">）
  const articleRegex = /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let match;

  while ((match = articleRegex.exec(html)) !== null) {
    const block = match[1];

    // リポジトリ名（owner/name）
    const nameMatch = block.match(/href="\/([^"]+?)"\s/);
    if (!nameMatch) continue;
    const fullName = nameMatch[1].trim();

    // 説明
    const descMatch = block.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // 言語
    const langMatch = block.match(/itemprop="programmingLanguage"[^>]*>([^<]+)/);
    const language = langMatch ? langMatch[1].trim() : 'Unknown';

    // Star数
    const starsMatch = block.match(/href="\/[^"]+\/stargazers"[^>]*>\s*([\d,]+)\s*<\/a>/);
    const stars = starsMatch ? parseInt(starsMatch[1].replace(/,/g, ''), 10) : 0;

    // 今日/今週のスター増加
    const diffMatch = block.match(/([\d,]+)\s+stars?\s+(?:today|this week)/i);
    const starDiff = diffMatch ? parseInt(diffMatch[1].replace(/,/g, ''), 10) : 0;

    repos.push({ fullName, description, language, stars, starDiff });
  }

  return repos;
}

/**
 * GitHub Trending をフェッチ + パース
 * @param {'daily'|'weekly'} since
 */
async function fetchTrending(since = 'daily') {
  const url = `${TRENDING_URL}?since=${since}`;
  console.log(`[Trending] Fetching ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SaaS-Scouter/1.0)',
      'Accept': 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch trending: ${response.status}`);
  }

  const html = await response.text();
  return parseTrendingHtml(html);
}

/**
 * トレンドリポジトリをGitHub APIで詳細取得 → スコアリング → DB格納
 */
async function crawlTrending(token, since = 'daily') {
  const trendingRepos = await fetchTrending(since);
  console.log(`[Trending] Found ${trendingRepos.length} trending repos (${since})`);

  if (!trendingRepos.length) return { source: 'trending', found: 0, new: 0, updated: 0 };

  const octokit = new Octokit({ auth: token });
  let reposNew = 0;
  let reposUpdated = 0;

  for (const tr of trendingRepos) {
    try {
      const [owner, repo] = tr.fullName.split('/');
      if (!owner || !repo) continue;

      // GitHub API で詳細取得
      const { data: item } = await octokit.rest.repos.get({ owner, repo });

      // ライセンスフィルタ（copyleft除外）
      const license = item.license?.spdx_id || 'Unknown';
      const copyleft = ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0'];
      if (copyleft.includes(license)) continue;

      const existing = Repository.findByGithubId(item.id);

      // README取得
      let readmeExcerpt = '';
      try {
        const readme = await octokit.rest.repos.getReadme({
          owner, repo, mediaType: { format: 'raw' },
        });
        readmeExcerpt = (typeof readme.data === 'string' ? readme.data : '').substring(0, 500);
      } catch (e) { /* no README */ }

      // Docker検出
      let hasDocker = 0;
      try {
        await octokit.rest.repos.getContent({ owner, repo, path: 'Dockerfile' });
        hasDocker = 1;
      } catch (e) {
        try {
          await octokit.rest.repos.getContent({ owner, repo, path: 'docker-compose.yml' });
          hasDocker = 1;
        } catch (e2) { /* no docker */ }
      }

      const combinedText = `${item.description || ''} ${(item.topics || []).join(' ')} ${readmeExcerpt}`.toLowerCase();
      const hasUi = /\b(dashboard|ui|frontend|web app|gui|interface|react|vue|angular|nextjs|nuxt)\b/.test(combinedText) ? 1 : 0;
      const hasDocs = /\b(documentation|docs|wiki|guide|tutorial)\b/.test(combinedText) ? 1 : 0;

      const repoData = {
        github_id: item.id,
        full_name: item.full_name,
        name: item.name,
        description: item.description || '',
        stars: item.stargazers_count,
        forks: item.forks_count,
        license,
        language: item.language || 'Unknown',
        last_updated: item.pushed_at,
        topics: JSON.stringify(item.topics || []),
        readme_excerpt: readmeExcerpt,
        has_docker: hasDocker,
        has_ui: hasUi,
        has_docs: hasDocs,
        open_issues: item.open_issues_count,
        closed_issues: 0,
        category: 'trending',
      };

      repoData.readme_lang = detectReadmeLanguage(repoData);
      const scores = scoreRepository(repoData);
      repoData.score_business = scores.business;
      repoData.score_packaging = scores.packaging;
      repoData.score_japan_gap = scores.japanGap;
      repoData.score_maintenance = scores.maintenance;
      repoData.score_total = scores.total;
      repoData.score_spicy = scores.spicy?.score || 0;
      repoData.spicy_level = scores.spicy?.level || '';
      repoData.spicy_flags = JSON.stringify(scores.spicy?.flags || []);
      repoData.japanese_summary = null; // AI summaries applied later in crawl pipeline

      Repository.upsert(repoData);

      if (existing) reposUpdated++;
      else reposNew++;

      // Rate limit
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
      console.error(`[Trending] Error processing ${tr.fullName}: ${error.message}`);
    }
  }

  console.log(`[Trending] Done: new=${reposNew} updated=${reposUpdated}`);
  return { source: 'trending', found: trendingRepos.length, new: reposNew, updated: reposUpdated };
}

module.exports = { fetchTrending, parseTrendingHtml, crawlTrending };
