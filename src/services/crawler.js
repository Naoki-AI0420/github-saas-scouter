const { Octokit } = require('octokit');
const Anthropic = require('@anthropic-ai/sdk');
const Repository = require('../models/repository');
const { getDb } = require('../models/database');
const { scoreRepository, detectReadmeLanguage } = require('./scorer');

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
  // ===== 追加カテゴリ（英語） =====
  analytics: { query: 'analytics dashboard open source self-hosted', label: 'アナリティクス' },
  helpdesk: { query: 'helpdesk ticketing support system', label: 'ヘルプデスク' },
  wiki: { query: 'wiki knowledge base documentation', label: 'Wiki/ナレッジ' },
  cms: { query: 'cms content management headless', label: 'CMS' },
  ecommerce: { query: 'ecommerce store shop open source', label: 'ECサイト' },
  erp: { query: 'erp enterprise resource planning', label: 'ERP' },
  scraper: { query: 'web scraper data extraction automation', label: 'スクレイパー' },
  monitoring: { query: 'server monitoring uptime status page', label: '監視/ステータス' },
  nocode: { query: 'no-code low-code app builder', label: 'ノーコード' },
  ai_tool: { query: 'ai tool llm chatbot business', label: 'AIツール' },
  password: { query: 'password manager vault self-hosted', label: 'パスワード管理' },
  calendar: { query: 'calendar scheduling appointment booking', label: 'カレンダー/予約' },
  file_sharing: { query: 'file sharing storage self-hosted', label: 'ファイル共有' },
  social: { query: 'social media management scheduler', label: 'SNS管理' },
  video: { query: 'video conferencing streaming platform', label: 'ビデオ/配信' },
  automation: { query: 'workflow automation zapier alternative', label: '自動化' },
  notification: { query: 'notification push email sms platform', label: '通知/プッシュ' },
  landing: { query: 'landing page builder website', label: 'LP/サイト構築' },
  recruitment: { query: 'recruitment ats applicant tracking', label: '採用管理' },
  real_estate: { query: 'real estate property management', label: '不動産管理' },
  restaurant: { query: 'restaurant ordering food delivery', label: '飲食店管理' },
  gym: { query: 'gym fitness membership management', label: 'ジム/フィットネス' },
  clinic: { query: 'clinic hospital patient management', label: 'クリニック/病院' },
  school: { query: 'school management student information', label: '学校管理' },
  church: { query: 'church management donation member', label: '教会/団体管理' },
  saas_boilerplate: { query: 'saas boilerplate starter template', label: 'SaaSテンプレート' },
  affiliate: { query: 'affiliate marketing tracking', label: 'アフィリエイト' },
  seo_tool2: { query: 'seo audit crawler backlink', label: 'SEO監査' },
  email_verify: { query: 'email verification validator', label: 'メール検証' },
  url_shortener: { query: 'url shortener link management', label: 'URL短縮' },
  // ===== 追加カテゴリ（中国語） =====
  cn_medical: { query: '医院管理 开源', label: '病院管理(CN)' },
  cn_school: { query: '学校管理 开源 教育', label: '学校管理(CN)' },
  cn_warehouse: { query: '仓库管理 开源', label: '倉庫管理(CN)' },
  cn_restaurant: { query: '餐饮管理 点餐 开源', label: '飲食店(CN)' },
  cn_hotel: { query: '酒店管理 开源', label: 'ホテル管理(CN)' },
  cn_oa: { query: 'OA办公 开源', label: 'OA(CN)' },
  cn_erp: { query: 'ERP 开源 企业', label: 'ERP(CN)' },
  cn_lowcode: { query: '低代码 开源 平台', label: 'ローコード(CN)' },
  cn_ai: { query: 'AI 工具 开源 大模型', label: 'AIツール(CN)' },
  cn_cms: { query: '内容管理 开源 CMS', label: 'CMS(CN)' },
  cn_monitor: { query: '监控系统 开源 运维', label: '監視(CN)' },
  cn_logistics: { query: '物流管理 开源', label: '物流(CN)' },
  cn_invoice: { query: '发票管理 开源 财税', label: '請求/税務(CN)' },
  // ===== 韓国語 =====
  kr_admin: { query: '관리시스템 오픈소스', label: '管理システム(KR)' },
  kr_ecommerce: { query: '쇼핑몰 오픈소스', label: 'ECサイト(KR)' },
  kr_crm: { query: 'CRM 고객관리 오픈소스', label: 'CRM(KR)' },
  kr_erp: { query: 'ERP 오픈소스 기업', label: 'ERP(KR)' },
  // ===== スペイン語 =====
  es_gestion: { query: 'sistema gestion empresarial código abierto', label: '企業管理(ES)' },
  es_facturacion: { query: 'facturación electrónica código abierto', label: '電子請求(ES)' },
  es_pos: { query: 'punto de venta código abierto', label: 'POS(ES)' },
  es_crm: { query: 'CRM código abierto gestión clientes', label: 'CRM(ES)' },
  // ===== ポルトガル語 =====
  pt_gestao: { query: 'sistema gestão empresarial código aberto', label: '企業管理(PT)' },
  pt_pdv: { query: 'PDV ponto de venda código aberto', label: 'POS(PT)' },
  pt_erp: { query: 'ERP código aberto brasileiro', label: 'ERP(PT)' },
  // ===== ドイツ語 =====
  de_verwaltung: { query: 'Verwaltungssystem Open Source', label: '管理システム(DE)' },
  de_buchhaltung: { query: 'Buchhaltung Rechnungen Open Source', label: '会計(DE)' },
  // ===== トルコ語 =====
  tr_yonetim: { query: 'yönetim sistemi açık kaynak', label: '管理システム(TR)' },
  // ===== ベトナム語 =====
  vn_quanly: { query: 'hệ thống quản lý mã nguồn mở', label: '管理システム(VN)' },
  // ===== インドネシア語 =====
  id_manajemen: { query: 'sistem manajemen open source', label: '管理システム(ID)' },
  // ===== タイ語 =====
  th_system: { query: 'ระบบจัดการ open source', label: '管理システム(TH)' },
};

const SIX_MONTHS_AGO = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

/**
 * Claude API で日本語解説を生成
 * README冒頭 + description を読み取り、構造化された日本語解説を返す
 */
async function generateJapaneseSummaryWithAI(repoData, anthropicClient) {
  const prompt = `以下のGitHubリポジトリについて、日本語で簡潔に解説してください。

リポジトリ名: ${repoData.full_name}
説明: ${repoData.description || 'なし'}
言語: ${repoData.language || '不明'}
カテゴリ: ${repoData.category || '不明'}
Star数: ${repoData.stars}
README冒頭:
${(repoData.readme_excerpt || '').substring(0, 400)}

以下の形式で回答してください（余計な前置きなし）:
【概要】（何のシステムか1行で）
【主な機能】
・機能1
・機能2
・機能3
【ビジネス活用】（どんなビジネスに使えるか1行で）`;

  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text.trim();
  } catch (e) {
    console.error(`[Crawler] AI summary failed for ${repoData.full_name}: ${e.message}`);
    return null;
  }
}

/**
 * description からルールベースで日本語要約を生成（フォールバック用）
 * 「何をするものか」「なぜ売れそうか」を簡潔に返す
 */
function generateJapaneseSummaryRuleBased(repoData) {
  const desc = (repoData.description || '').toLowerCase();
  const parts = [];

  const categoryDesc = {
    'CRM': '顧客管理システム', 'メルマガ': 'メール配信・マーケティングツール',
    'SEO': 'SEO対策・検索最適化ツール', 'POS': 'POSレジ・販売管理システム',
    '在庫管理': '在庫・倉庫管理システム', 'フォームビルダー': 'フォーム作成ツール',
    '予約システム': '予約・スケジュール管理システム', 'チャットボット': 'チャットボット・CSツール',
    '請求書': '請求書・課金管理システム', 'プロジェクト管理': 'プロジェクト・タスク管理ツール',
    'アンケート': 'アンケート・フィードバック収集ツール', 'HR/勤怠': '人事・勤怠管理システム',
    '会計': '会計・経理管理システム', 'LMS': '学習管理システム(LMS)',
    'アナリティクス': '分析ダッシュボードツール', 'ヘルプデスク': 'ヘルプデスク・チケット管理',
    'Wiki/ナレッジ': 'Wiki・ナレッジベース', 'CMS': 'コンテンツ管理システム',
    'ECサイト': 'ECサイト・オンラインストア', 'ERP': '統合業務管理(ERP)',
    'スクレイパー': 'Webスクレイピングツール', '監視/ステータス': 'サーバー監視・ステータスページ',
    'ノーコード': 'ノーコード・ローコード開発', 'AIツール': 'AI・LLMツール',
    'パスワード管理': 'パスワード管理ツール', 'カレンダー/予約': 'カレンダー・予約管理',
    'ファイル共有': 'ファイル共有・ストレージ', 'SNS管理': 'SNS管理ツール',
    'ビデオ/配信': 'ビデオ会議・配信プラットフォーム', '自動化': 'ワークフロー自動化ツール',
    '通知/プッシュ': '通知・プッシュ配信', 'LP/サイト構築': 'LP・Webサイト構築ツール',
    '採用管理': '採用管理(ATS)', '不動産管理': '不動産管理システム',
    '飲食店管理': '飲食店・注文管理', 'ジム/フィットネス': 'ジム・会員管理',
    'クリニック/病院': 'クリニック・患者管理', '学校管理': '学校管理システム',
    '教会/団体管理': '団体・会員管理', 'SaaSテンプレート': 'SaaSスターターキット',
    'アフィリエイト': 'アフィリエイト管理', 'SEO監査': 'SEO監査・分析ツール',
    'メール検証': 'メールアドレス検証', 'URL短縮': 'URL短縮・リンク管理',
  };

  // カテゴリから基本説明
  let baseDesc = categoryDesc[repoData.category];
  if (!baseDesc) {
    for (const [key, val] of Object.entries(categoryDesc)) {
      if ((repoData.category || '').includes(key)) { baseDesc = val; break; }
    }
  }
  parts.push(baseDesc || 'オープンソースの業務ツール');

  // 特徴キーワードから補足
  if (/self[- ]?host|on[- ]?premise/.test(desc)) parts.push('セルフホスト対応');
  if (/api|rest|graphql/.test(desc)) parts.push('API連携可能');
  if (/ai|machine learning|ml|gpt|llm/.test(desc)) parts.push('AI機能搭載');
  if (/analytics|reporting|report/.test(desc)) parts.push('分析・レポート機能付き');
  if (/automation|automate|workflow/.test(desc)) parts.push('ワークフロー自動化');
  if (/mobile|responsive|pwa/.test(desc)) parts.push('モバイル対応');
  if (/plugin|extension|marketplace/.test(desc)) parts.push('プラグイン拡張可能');

  // なぜ売れそうか
  const reasons = [];
  if (repoData.stars >= 5000) reasons.push('高Star数で品質実証済み');
  else if (repoData.stars >= 1000) reasons.push('一定の利用実績あり');
  if (repoData.has_ui) reasons.push('UI付きですぐSaaS化可能');
  if (repoData.has_docker) reasons.push('Docker対応で導入容易');
  if (repoData.readme_lang !== 'Japanese') reasons.push('日本語版未提供で参入余地あり');
  if (repoData.readme_lang === 'Chinese' || repoData.readme_lang === 'Russian') {
    reasons.push('日本企業が発見しづらく競合少');
  }

  let summary = parts.join('。');
  if (reasons.length) summary += '【売れる理由】' + reasons.join('、');
  return summary;
}

async function crawlCategory(octokit, categoryKey, anthropicClient) {
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

        // Detect README language
        repoData.readme_lang = detectReadmeLanguage(repoData);

        // Calculate scores
        const scores = scoreRepository(repoData);
        repoData.score_business = scores.business;
        repoData.score_packaging = scores.packaging;
        repoData.score_japan_gap = scores.japanGap;
        repoData.score_maintenance = scores.maintenance;
        repoData.score_total = scores.total;

        // 日本語要約を生成（Claude API優先、なければルールベース）
        if (anthropicClient) {
          const aiSummary = await generateJapaneseSummaryWithAI(repoData, anthropicClient);
          repoData.japanese_summary = aiSummary || generateJapaneseSummaryRuleBased(repoData);
        } else {
          repoData.japanese_summary = generateJapaneseSummaryRuleBased(repoData);
        }

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

  // Anthropic client（APIキーがあれば初期化）
  let anthropicClient = null;
  if (process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log('[Crawler] Anthropic API enabled for Japanese summaries');
  } else {
    console.log('[Crawler] No ANTHROPIC_API_KEY - using rule-based Japanese summaries');
  }

  const results = [];

  for (const key of Object.keys(CATEGORIES)) {
    try {
      console.log(`[Crawler] Crawling category: ${CATEGORIES[key].label}`);
      const result = await crawlCategory(octokit, key, anthropicClient);
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
