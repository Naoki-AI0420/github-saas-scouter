/**
 * SaaS候補スコアリングエンジン
 * 0-100点でリポジトリを評価
 */

// カテゴリ別の市場規模重み（日本市場ベース）
const MARKET_SIZE = {
  'CRM': 28,
  'メルマガ': 22,
  'SEO': 24,
  'POS': 26,
  '在庫管理': 25,
  'フォームビルダー': 20,
  '予約システム': 27,
  'チャットボット': 23,
  '請求書': 26,
  'プロジェクト管理': 25,
  'アンケート': 18,
  'HR/勤怠': 27,
  '会計': 28,
  'LMS': 22,
  '管理系統(CN)': 26,
  '商城(CN)': 24,
  'SaaS(CN)': 25,
  'HR(CN)': 27,
  '財務(CN)': 28,
  'CRM(CN)': 28,
  'ビジネス管理(RU)': 24,
  '管理システム(RU)': 25,
  'CRM(RU)': 28,
};

// 日本市場で特に需要が高いカテゴリ
const JAPAN_HIGH_DEMAND = ['予約システム', 'HR/勤怠', '会計', '請求書', 'POS', '在庫管理'];

function scoreRepository(repo) {
  const business = scoreBusiness(repo);
  const packaging = scorePackaging(repo);
  const japanGap = scoreJapanGap(repo);
  const maintenance = scoreMaintenance(repo);

  return {
    business,
    packaging,
    japanGap,
    maintenance,
    total: Math.min(100, business + packaging + japanGap + maintenance),
  };
}

/**
 * ビジネス価値スコア (0-30)
 * 市場規模、Star数、Fork数で評価
 */
function scoreBusiness(repo) {
  let score = 0;

  // 市場規模ベース (0-15)
  score += Math.min(15, (MARKET_SIZE[repo.category] || 15) / 2);

  // Star数による人気度 (0-8)
  if (repo.stars >= 10000) score += 8;
  else if (repo.stars >= 5000) score += 6;
  else if (repo.stars >= 2000) score += 4;
  else if (repo.stars >= 500) score += 2;
  else score += 1;

  // Fork数（実用性指標）(0-7)
  const forkRatio = repo.forks / Math.max(repo.stars, 1);
  if (forkRatio > 0.3) score += 7;
  else if (forkRatio > 0.2) score += 5;
  else if (forkRatio > 0.1) score += 3;
  else score += 1;

  return Math.min(30, score);
}

/**
 * パッケージング容易性 (0-25)
 * UI有無、Docker、ドキュメント、言語
 */
function scorePackaging(repo) {
  let score = 0;

  // UI有無 (0-8)
  if (repo.has_ui) score += 8;

  // Docker対応 (0-7)
  if (repo.has_docker) score += 7;

  // ドキュメント (0-5)
  if (repo.has_docs) score += 5;

  // SaaS向き言語 (0-5)
  const saasLanguages = ['JavaScript', 'TypeScript', 'Python', 'Go', 'Ruby', 'PHP', 'Java'];
  if (saasLanguages.includes(repo.language)) score += 5;
  else score += 2;

  return Math.min(25, score);
}

/**
 * 日本市場ギャップ (0-25)
 * 日本語非対応 × 日本で需要あり
 */
function scoreJapanGap(repo) {
  let score = 0;

  const text = `${repo.description || ''} ${repo.readme_excerpt || ''}`.toLowerCase();
  const topics = typeof repo.topics === 'string' ? repo.topics : JSON.stringify(repo.topics || []);

  // 日本語対応チェック（対応してなければ高スコア = ギャップが大きい）
  const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(text) ||
    /\b(japanese|japan|i18n|internationalization|ja_jp|ja-jp)\b/i.test(text + topics);

  if (!hasJapanese) {
    score += 12; // 日本語非対応 = ローカライズ価値大
  } else {
    score += 3; // すでに対応していてもまだ改善余地はある
  }

  // 日本市場での需要 (0-13)
  if (JAPAN_HIGH_DEMAND.includes(repo.category)) {
    score += 10;
  } else {
    score += 5;
  }

  // 英語圏のみのプロジェクトは競合が少ない（日本市場での）
  if (!hasJapanese && repo.stars >= 1000) {
    score += 3;
  }

  // 言語ボーナス: README/説明が中国語 or ロシア語 → 日本企業が見つけにくい = 参入障壁
  const readmeLang = detectReadmeLanguage(repo);
  if (readmeLang === 'Chinese' || readmeLang === 'Russian') {
    score += 15;
  }

  return Math.min(40, score);
}

/**
 * READMEの主要言語を検出
 */
function detectReadmeLanguage(repo) {
  const text = `${repo.description || ''} ${repo.readme_excerpt || ''}`;

  // 中国語: 簡体字・繁体字の頻出文字
  const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
  // 日本語のひらがな・カタカナがあれば日本語扱い
  const japaneseKana = text.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || [];
  // 中国語文字が多く、ひらがな・カタカナがなければ中国語
  if (chineseChars.length > 10 && japaneseKana.length === 0) {
    return 'Chinese';
  }

  // ロシア語: キリル文字
  const cyrillicChars = text.match(/[\u0400-\u04ff]/g) || [];
  if (cyrillicChars.length > 10) {
    return 'Russian';
  }

  if (japaneseKana.length > 0) {
    return 'Japanese';
  }

  return 'English';
}

/**
 * メンテナンス状態 (0-20)
 * 最終更新、issue対応率
 */
function scoreMaintenance(repo) {
  let score = 0;

  // 最終更新日 (0-10)
  if (repo.last_updated) {
    const daysSinceUpdate = (Date.now() - new Date(repo.last_updated).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 7) score += 10;
    else if (daysSinceUpdate < 30) score += 8;
    else if (daysSinceUpdate < 90) score += 5;
    else if (daysSinceUpdate < 180) score += 3;
    else score += 1;
  }

  // Issue対応率 (0-10)
  const totalIssues = repo.open_issues + (repo.closed_issues || 0);
  if (totalIssues > 0) {
    const closeRate = (repo.closed_issues || 0) / totalIssues;
    score += Math.round(closeRate * 7);
  } else {
    score += 3; // issueがない場合は中間値
  }

  // アクティブなコミュニティ（forkが多い = 貢献者が多い）
  if (repo.forks > 100) score += 3;
  else if (repo.forks > 30) score += 2;
  else score += 1;

  return Math.min(20, score);
}

module.exports = { scoreRepository, scoreBusiness, scorePackaging, scoreJapanGap, scoreMaintenance, detectReadmeLanguage, MARKET_SIZE, JAPAN_HIGH_DEMAND };
