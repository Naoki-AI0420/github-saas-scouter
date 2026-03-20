/**
 * 自然言語検索サービス
 * 日本語の入力を英語・中国語・ロシア語に変換してGitHub検索し、スコアリングして返す
 */
const { Octokit } = require('octokit');
const Anthropic = require('@anthropic-ai/sdk');
const { scoreRepository, detectReadmeLanguage } = require('./scorer');

// 簡易キーワード辞書（Claude APIがない場合のフォールバック）
const KEYWORD_MAP = {
  'メルマガ': { en: 'email newsletter marketing', cn: '邮件营销 邮件群发', ru: 'рассылка email маркетинг' },
  'メール配信': { en: 'email newsletter delivery', cn: '邮件营销 邮件群发', ru: 'рассылка email' },
  '顧客管理': { en: 'crm customer relationship management', cn: '客户管理 CRM', ru: 'CRM управление клиентами' },
  'CRM': { en: 'crm customer relationship management', cn: '客户管理 CRM', ru: 'CRM управление клиентами' },
  '請求書': { en: 'invoice billing payment', cn: '发票管理 账单', ru: 'счёт оплата' },
  '会計': { en: 'accounting bookkeeping finance', cn: '财务管理 会计', ru: 'бухгалтерия учёт' },
  '在庫管理': { en: 'inventory management stock', cn: '仓库管理 库存', ru: 'управление складом инвентарь' },
  '予約': { en: 'booking reservation scheduling', cn: '预约 预订', ru: 'бронирование запись' },
  'POS': { en: 'pos point of sale', cn: '收银 POS 销售', ru: 'POS касса' },
  '勤怠': { en: 'hr attendance payroll', cn: '考勤 人事管理', ru: 'учёт рабочего времени HR' },
  'チャットボット': { en: 'chatbot customer support', cn: '聊天机器人 客服', ru: 'чат-бот поддержка' },
  'ECサイト': { en: 'ecommerce store shop', cn: '商城 电商 网店', ru: 'интернет магазин' },
  'プロジェクト管理': { en: 'project management kanban task', cn: '项目管理 任务', ru: 'управление проектами задачи' },
  'フォーム': { en: 'form builder drag drop', cn: '表单 拖拽', ru: 'конструктор форм' },
  '自動化': { en: 'workflow automation', cn: '工作流 自动化', ru: 'автоматизация' },
  'アンケート': { en: 'survey questionnaire feedback', cn: '问卷 调查', ru: 'опрос анкета' },
  'LMS': { en: 'lms learning management course', cn: '学习管理 在线教育', ru: 'обучение LMS' },
  'SEO': { en: 'seo search engine optimization', cn: 'SEO 搜索引擎优化', ru: 'SEO оптимизация' },
  '分析': { en: 'analytics dashboard reporting', cn: '分析 数据看板', ru: 'аналитика дашборд' },
  '監視': { en: 'monitoring uptime status', cn: '监控 运维', ru: 'мониторинг' },
  'ノーコード': { en: 'no-code low-code app builder', cn: '低代码 无代码', ru: 'no-code low-code' },
  'AI': { en: 'ai tool llm chatbot', cn: 'AI 工具 大模型', ru: 'AI инструмент' },
  '不動産': { en: 'real estate property management', cn: '房产管理 不动产', ru: 'недвижимость управление' },
  '飲食店': { en: 'restaurant ordering food', cn: '餐饮管理 点餐', ru: 'ресторан заказы' },
  '病院': { en: 'clinic hospital patient', cn: '医院管理 患者', ru: 'клиника больница' },
  '学校': { en: 'school management student', cn: '学校管理 教育', ru: 'школа управление' },
};

/**
 * Claude APIで日本語クエリを多言語検索キーワードに変換
 */
async function translateQueryWithAI(query, anthropicClient) {
  const prompt = `あなたはGitHub検索クエリの翻訳エキスパートです。
以下の日本語のビジネスニーズを、GitHubでオープンソースプロジェクトを検索するための検索キーワードに変換してください。

入力: "${query}"

以下のJSON形式で返してください（JSONのみ、他のテキスト不要）:
{
  "en": "英語の検索キーワード（3-5語）",
  "cn": "中国語の検索キーワード（簡体字、2-4語）",
  "ru": "ロシア語の検索キーワード（2-4語）"
}`;

  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error(`[Search] AI translation failed: ${e.message}`);
  }
  return null;
}

/**
 * ルールベースで日本語クエリをキーワードに変換（フォールバック）
 */
function translateQueryRuleBased(query) {
  const enSet = new Set(), cnSet = new Set(), ruSet = new Set();

  for (const [jpKey, translations] of Object.entries(KEYWORD_MAP)) {
    if (query.includes(jpKey)) {
      translations.en.split(' ').forEach(w => enSet.add(w));
      translations.cn.split(' ').forEach(w => cnSet.add(w));
      translations.ru.split(' ').forEach(w => ruSet.add(w));
    }
  }

  const en = [...enSet].join(' ');
  const cn = [...cnSet].join(' ');
  const ru = [...ruSet].join(' ');

  // マッチしなかった場合、そのままクエリを英語として使用
  if (!en) {
    return { en: query, cn: query, ru: query };
  }

  return { en, cn, ru };
}

/**
 * GitHub検索を実行
 */
async function searchGitHub(octokit, keywords, perLang = 30) {
  const SIX_MONTHS_AGO = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  // GitHub Search API doesn't support OR for license qualifiers well.
  // Search without license filter, then filter permissive licenses post-hoc.
  const baseFilter = `stars:>50 pushed:>${SIX_MONTHS_AGO}`;
  const PERMISSIVE_LICENSES = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'ISC', 'Unlicense', 'WTFPL']);

  const searches = [
    { lang: 'en', query: `${keywords.en} ${baseFilter}` },
    { lang: 'cn', query: `${keywords.cn} ${baseFilter}` },
    { lang: 'ru', query: `${keywords.ru} ${baseFilter}` },
  ];

  const allItems = new Map(); // github_id -> item (dedup)

  for (const search of searches) {
    try {
      const response = await octokit.rest.search.repos({
        q: search.query,
        sort: 'stars',
        order: 'desc',
        per_page: perLang,
      });

      for (const item of response.data.items) {
        if (!allItems.has(item.id)) {
          // Post-hoc permissive license filter (keep unknown/NOASSERTION, filter out copyleft)
          const spdx = item.license?.spdx_id || '';
          const COPYLEFT = new Set(['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EUPL-1.1', 'EUPL-1.2', 'SSPL-1.0', 'CPAL-1.0']);
          if (spdx && COPYLEFT.has(spdx)) continue;
          allItems.set(item.id, { ...item, _searchLang: search.lang });
        }
      }
    } catch (e) {
      console.error(`[Search] GitHub search failed (${search.lang}): ${e.message}`);
    }
    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  return Array.from(allItems.values());
}

/**
 * 検索結果をスコアリング
 */
function scoreSearchResults(items) {
  return items.map(item => {
    const readmeExcerpt = ''; // 検索では README を取得しない（速度優先）
    const combinedText = `${item.description || ''} ${(item.topics || []).join(' ')}`.toLowerCase();
    const hasUi = /\b(dashboard|ui|frontend|web app|gui|interface|react|vue|angular|nextjs|nuxt)\b/.test(combinedText) ? 1 : 0;
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
      has_docker: 0, // 検索時は未チェック
      has_ui: hasUi,
      has_docs: hasDocs,
      open_issues: item.open_issues_count,
      closed_issues: 0,
      category: 'Search',
    };

    repoData.readme_lang = detectReadmeLanguage(repoData);
    const scores = scoreRepository(repoData);

    return {
      ...repoData,
      score_business: scores.business,
      score_packaging: scores.packaging,
      score_japan_gap: scores.japanGap,
      score_maintenance: scores.maintenance,
      score_total: scores.total,
      _searchLang: item._searchLang,
    };
  });
}

/**
 * 検索結果に日本語解説を付与
 */
async function addJapaneseSummaries(results, anthropicClient) {
  if (!anthropicClient) return results;

  // 上位10件のみAI解説を生成（コスト節約）
  const top10 = results.slice(0, 10);
  for (const repo of top10) {
    try {
      const prompt = `GitHubリポジトリ「${repo.full_name}」（${repo.description || '説明なし'}、${repo.language}、Star:${repo.stars}）を1-2行で日本語解説してください。何のツールか、どんなビジネスに使えるかを簡潔に。`;
      const response = await anthropicClient.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });
      repo.japanese_summary = response.content[0].text.trim();
    } catch (e) {
      // skip
    }
  }
  return results;
}

/**
 * メイン検索関数
 */
async function search(query, options = {}) {
  const { token, topN = 10 } = options;
  if (!token) throw new Error('GITHUB_TOKEN is required');

  const octokit = new Octokit({ auth: token });

  // Anthropic client
  let anthropicClient = null;
  if (process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // Step 1: クエリを多言語に変換
  console.log(`[Search] Query: "${query}"`);
  let keywords;
  if (anthropicClient) {
    keywords = await translateQueryWithAI(query, anthropicClient);
  }
  if (!keywords) {
    keywords = translateQueryRuleBased(query);
  }
  console.log(`[Search] Keywords: EN="${keywords.en}" CN="${keywords.cn}" RU="${keywords.ru}"`);

  // Step 2: GitHub検索（英語・中国語・ロシア語 並列）
  const items = await searchGitHub(octokit, keywords);
  console.log(`[Search] Found ${items.length} unique repos`);

  // Step 3: スコアリング
  let results = scoreSearchResults(items);
  results.sort((a, b) => b.score_total - a.score_total);
  results = results.slice(0, topN);

  // Step 4: 日本語解説付与
  results = await addJapaneseSummaries(results, anthropicClient);

  return { query, keywords, results };
}

module.exports = { search, translateQueryWithAI, translateQueryRuleBased, searchGitHub, scoreSearchResults };
