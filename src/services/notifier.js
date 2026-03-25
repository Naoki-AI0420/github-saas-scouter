const Anthropic = require('@anthropic-ai/sdk');
const Repository = require('../models/repository');
const { getDailyTrend } = require('./trend');

async function sendDiscordNotification(webhookUrl, content) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
  }
  return true;
}

function formatRepoEmbed(repo, rank) {
  const fields = [
    { name: 'Score', value: `**${repo.score_total}**/100`, inline: true },
    { name: 'Stars', value: `⭐ ${repo.stars}`, inline: true },
    { name: 'Category', value: repo.category, inline: true },
    { name: 'Language', value: repo.language || 'N/A', inline: true },
    { name: 'License', value: repo.license || 'N/A', inline: true },
    { name: 'Score Breakdown', value: `BIZ:${repo.score_business} PKG:${repo.score_packaging} JP:${repo.score_japan_gap} MNT:${repo.score_maintenance}`, inline: false },
  ];
  if (repo.japanese_summary) {
    fields.push({ name: '日本語解説', value: repo.japanese_summary.substring(0, 1024), inline: false });
  }
  return {
    title: `${rank ? `#${rank} ` : ''}${repo.full_name}`,
    url: `https://github.com/${repo.full_name}`,
    description: repo.description ? repo.description.substring(0, 200) : 'No description',
    color: repo.score_total >= 80 ? 0xff0000 : repo.score_total >= 60 ? 0xff8800 : 0x00aa00,
    fields,
  };
}

/**
 * AI解説付きトレンドフォーマット生成
 * Claude Haikuで商品化観点の解説を自動生成
 */
async function generateTrendCommentary(repo, anthropicClient) {
  if (!anthropicClient) return null;

  const readmeExcerpt = repo.readme_excerpt ? repo.readme_excerpt.substring(0, 800) : '';

  const prompt = `以下のGitHubリポジトリについて、SaaS商品化の観点から簡潔に解説してください。

リポジトリ: ${repo.full_name}
説明: ${repo.description || 'なし'}
言語: ${repo.language || '不明'}
Star数: ${repo.stars}
ライセンス: ${repo.license || '不明'}
カテゴリ: ${repo.category || '不明'}
README抜粋: ${readmeExcerpt || 'なし'}

以下の形式で回答（各項目1行、余計な前置きなし）:
💡 （何のツールか1行で）
📋 主な機能:
  ・（機能1）
  ・（機能2）
  ・（機能3）
👤 ターゲット: （誰が使うか — 例: 中小企業の経理担当、個人開発者、EC事業者 等）
🇯🇵 日本語対応: （あり/なし → 商品化チャンスの有無）
💰 想定価格帯: ¥X,XXX〜¥XX,XXX/月
⏱️ 商品化目安: X〜X日
🏢 競合: （日本の競合サービスがあれば）`;

  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text.trim();
  } catch (e) {
    console.error(`[Notifier] AI commentary failed for ${repo.full_name}: ${e.message}`);
    return null;
  }
}

/**
 * ルールベースのトレンドコメンタリー（AIフォールバック）
 */
function generateTrendCommentaryRuleBased(repo) {
  const lines = [];

  // 概要（日本語解説があればそれを使う、なければ英語descriptionをそのまま出す）
  if (repo.japanese_summary) {
    lines.push(`💡 ${repo.japanese_summary.substring(0, 100)}`);
  } else if (repo.description) {
    lines.push(`💡 ${repo.description.substring(0, 100)}`);
  } else {
    lines.push(`💡 オープンソースの${repo.category || '開発'}ツール`);
  }

  // 主な機能（カテゴリから推定）
  const featureMap = {
    'CRM': ['顧客管理・連絡先DB', 'パイプライン/案件追跡', 'メール連携'],
    'POS': ['レジ・決済処理', '在庫管理', '売上レポート'],
    'HR/勤怠': ['勤怠打刻・集計', '従業員管理', '給与計算'],
    '会計': ['仕訳入力・帳簿管理', '決算書出力', '請求書発行'],
    '請求書': ['請求書作成・送付', '入金管理', 'PDF出力'],
    'LMS': ['コース作成・管理', '受講進捗トラッキング', 'クイズ・テスト'],
    'ERP': ['統合業務管理', '在庫・購買管理', '財務・人事モジュール'],
    'ECサイト': ['商品カタログ管理', 'カート・決済', '注文管理'],
    'プロジェクト管理': ['タスク/カンバンボード', 'チーム管理', 'タイムトラッキング'],
    'チャットボット': ['自動応答フロー', 'FAQ管理', 'マルチチャネル対応'],
    'アナリティクス': ['データ可視化', 'ダッシュボード', 'レポート生成'],
    'ヘルプデスク': ['チケット管理', '問い合わせ対応', 'ナレッジベース'],
    'CMS': ['コンテンツ管理', 'テンプレート/テーマ', 'メディア管理'],
    'ノーコード': ['ドラッグ&ドロップUI構築', 'データベース管理', 'API連携'],
    'AIツール': ['LLM連携', 'チャットUI', 'プロンプト管理'],
    '自動化': ['ワークフロー自動化', 'トリガー/アクション設定', '外部サービス連携'],
  };
  const features = featureMap[repo.category];
  if (features) {
    lines.push(`📋 主な機能:`);
    features.forEach(f => lines.push(`  ・${f}`));
  } else if (repo.topics) {
    // カテゴリ未分類でもtopicsからキーワードを拾う
    try {
      const topics = typeof repo.topics === 'string' ? JSON.parse(repo.topics) : (repo.topics || []);
      if (topics.length > 0) {
        lines.push(`📋 タグ: ${topics.slice(0, 5).join(', ')}`);
      }
    } catch (e) { /* ignore parse errors */ }
  }

  // ターゲットユーザー（カテゴリから推定）
  const targetMap = {
    'CRM': '営業チーム・中小企業の営業部門',
    'POS': '小売店・飲食店オーナー',
    'HR/勤怠': '中小企業の人事・総務担当',
    '会計': '中小企業の経理担当・個人事業主',
    '請求書': 'フリーランス・中小企業の経理',
    'LMS': '研修担当・教育機関・スクール運営者',
    'ERP': '中堅〜大企業の経営管理部門',
    'ECサイト': 'EC事業者・D2Cブランド',
    'プロジェクト管理': '開発チーム・プロジェクトマネージャー',
    'チャットボット': 'カスタマーサポート部門',
    'アナリティクス': 'マーケティング担当・データ分析者',
    'ヘルプデスク': 'カスタマーサポート・IT部門',
    'CMS': 'Web担当・コンテンツマーケター',
    'ノーコード': '非エンジニアの業務改善担当',
    'AIツール': '開発者・企業のDX推進担当',
    '自動化': '業務効率化担当・IT管理者',
  };
  const target = targetMap[repo.category] || '中小企業・個人開発者';
  lines.push(`👤 ターゲット: ${target}`);

  // 日本語対応
  const hasJP = repo.readme_lang === 'Japanese';
  lines.push(`🇯🇵 日本語対応: ${hasJP ? 'あり' : 'なし → 商品化チャンス'}`);

  // 価格帯推定
  const priceMap = {
    'CRM': '¥9,800〜¥29,800/月', 'POS': '¥4,980〜¥19,800/月', 'HR/勤怠': '¥4,980〜¥14,800/月',
    '会計': '¥2,980〜¥19,800/月', '請求書': '¥980〜¥9,800/月', 'LMS': '¥9,800〜¥49,800/月',
    'ERP': '¥19,800〜¥98,000/月', 'ECサイト': '¥9,800〜¥49,800/月',
  };
  const price = priceMap[repo.category] || '¥4,980〜¥19,800/月';
  lines.push(`💰 想定価格帯: ${price}`);

  // 商品化目安
  const days = repo.has_docker && repo.has_ui ? '7〜10日' : repo.has_ui ? '10〜14日' : '14〜21日';
  lines.push(`⏱️ 商品化目安: ${days}`);

  // ライセンス
  lines.push(`🏷️ ${repo.license || 'Unknown'} License`);

  return lines.join('\n');
}

/**
 * デイリートレンド通知（前日比スター増加ランキング）
 */
async function sendDailyTrend(webhookUrl) {
  const trends = getDailyTrend(10);
  if (!trends.length) return;

  // Anthropic client（APIキーがあれば）
  let anthropicClient = null;
  if (process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  const today = new Date().toLocaleDateString('ja-JP');
  let message = `🔥 **デイリートレンド（${today}）**\n\n`;

  for (let i = 0; i < trends.length; i++) {
    const repo = trends[i];
    const rank = i + 1;
    const newTag = repo.is_new ? ' 🆕' : '';
    const diff = repo.star_diff >= 0 ? `+${repo.star_diff.toLocaleString()}` : repo.star_diff.toLocaleString();

    message += `**【急上昇 #${rank}】**⭐ ${diff}（昨日比）| 累計 ${repo.current_stars.toLocaleString()}${newTag}\n`;
    message += `📦 [${repo.full_name}](https://github.com/${repo.full_name})\n`;

    // AI解説を生成（最大3件のみAPI呼び出し、残りはルールベース）
    let commentary;
    if (anthropicClient && i < 3) {
      commentary = await generateTrendCommentary(repo, anthropicClient);
    }
    if (!commentary) {
      commentary = generateTrendCommentaryRuleBased(repo);
    }
    message += commentary + '\n\n';
  }

  // Discord は2000文字制限なので分割送信
  const chunks = splitMessage(message, 1900);
  for (const chunk of chunks) {
    await sendDiscordNotification(webhookUrl, { content: chunk });
  }
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > maxLen) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendDailyTop10(webhookUrl) {
  const top10 = Repository.getTopN(10);
  if (!top10.length) return;

  const embeds = top10.map((repo, i) => formatRepoEmbed(repo, i + 1));

  // Discord allows max 10 embeds per message
  await sendDiscordNotification(webhookUrl, {
    content: `📊 **GitHub SaaS候補スカウター - 本日のトップ10** (${new Date().toLocaleDateString('ja-JP')})`,
    embeds: embeds.slice(0, 10),
  });
}

async function sendHighScoreAlert(webhookUrl, repo) {
  await sendDiscordNotification(webhookUrl, {
    content: `🚨 **高スコア新着リポジトリ検出！** (スコア: ${repo.score_total}/100)`,
    embeds: [formatRepoEmbed(repo)],
  });
}

async function sendNewHighScoreAlerts(webhookUrl) {
  const newToday = Repository.getNewToday();
  const highScore = newToday.filter(r => r.score_total >= 70);

  for (const repo of highScore) {
    await sendHighScoreAlert(webhookUrl, repo);
  }
  return highScore.length;
}

module.exports = {
  sendDailyTop10,
  sendDailyTrend,
  sendHighScoreAlert,
  sendNewHighScoreAlerts,
  sendDiscordNotification,
  formatRepoEmbed,
  generateTrendCommentary,
  generateTrendCommentaryRuleBased,
};
