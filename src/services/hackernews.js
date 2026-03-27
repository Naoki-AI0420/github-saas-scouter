const { Octokit } = require('octokit');
const Repository = require('../models/repository');
const { scoreRepository, detectReadmeLanguage } = require('./scorer');

const HN_TOP_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM_URL = 'https://hacker-news.firebaseio.com/v0/item';

/**
 * HN Top Stories からGitHubリポジトリURLを含む記事を抽出
 */
async function fetchHNGitHubLinks(maxStories = 100) {
  console.log('[HackerNews] Fetching top stories...');

  const response = await fetch(HN_TOP_URL);
  if (!response.ok) throw new Error(`HN API failed: ${response.status}`);

  const storyIds = await response.json();
  const topIds = storyIds.slice(0, maxStories);

  const githubRepos = [];

  // バッチでストーリーを取得
  const batchSize = 20;
  for (let i = 0; i < topIds.length; i += batchSize) {
    const batch = topIds.slice(i, i + batchSize);
    const stories = await Promise.all(
      batch.map(async (id) => {
        try {
          const res = await fetch(`${HN_ITEM_URL}/${id}.json`);
          return res.ok ? res.json() : null;
        } catch (e) {
          return null;
        }
      })
    );

    for (const story of stories) {
      if (!story || !story.url) continue;

      // GitHub リポジトリURLを抽出
      const ghMatch = story.url.match(/github\.com\/([^/]+\/[^/]+)\/?$/);
      if (!ghMatch) continue;

      const fullName = ghMatch[1].replace(/\.git$/, '');
      // .github.io サイトなどを除外
      if (fullName.includes('.github.io')) continue;

      githubRepos.push({
        fullName,
        hnTitle: story.title,
        hnScore: story.score || 0,
        hnUrl: `https://news.ycombinator.com/item?id=${story.id}`,
      });
    }
  }

  console.log(`[HackerNews] Found ${githubRepos.length} GitHub repos in top ${maxStories} stories`);
  return githubRepos;
}

/**
 * HNで見つかったリポジトリをGitHub APIで詳細取得 → スコアリング → DB格納
 */
async function crawlHackerNews(token) {
  const hnRepos = await fetchHNGitHubLinks(100);
  if (!hnRepos.length) return { source: 'hackernews', found: 0, new: 0, updated: 0 };

  const octokit = new Octokit({ auth: token });
  let reposNew = 0;
  let reposUpdated = 0;

  for (const hn of hnRepos) {
    try {
      const [owner, repo] = hn.fullName.split('/');
      if (!owner || !repo) continue;

      const { data: item } = await octokit.rest.repos.get({ owner, repo });

      // ライセンスフィルタ
      const license = item.license?.spdx_id || 'Unknown';
      const copyleft = ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0'];
      if (copyleft.includes(license)) continue;

      // Star数の最低ライン
      if (item.stargazers_count < 50) continue;

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
        category: 'hackernews',
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
      repoData.japanese_summary = null;

      Repository.upsert(repoData);

      if (existing) reposUpdated++;
      else reposNew++;

      // Rate limit
      await new Promise(r => setTimeout(r, 1000));
    } catch (error) {
      console.error(`[HackerNews] Error processing ${hn.fullName}: ${error.message}`);
    }
  }

  console.log(`[HackerNews] Done: new=${reposNew} updated=${reposUpdated}`);
  return { source: 'hackernews', found: hnRepos.length, new: reposNew, updated: reposUpdated };
}

module.exports = { fetchHNGitHubLinks, crawlHackerNews };
