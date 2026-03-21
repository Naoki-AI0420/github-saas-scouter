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

  const prompt = `以下のGitHubリポジトリについて、SaaS商品化の観点から簡潔に解説してください。

リポジトリ: ${repo.full_name}
説明: ${repo.description || 'なし'}
言語: ${repo.language || '不明'}
Star数: ${repo.stars}
ライセンス: ${repo.license || '不明'}
カテゴリ: ${repo.category || '不明'}

以下の形式で回答（各項目1行、余計な前置きなし）:
💡 （何のツールか1行で）
🇯🇵 日本語対応: （あり/なし → 商品化チャンスの有無）
💰 想定価格帯: ¥X,XXX〜¥XX,XXX/月
⏱️ 商品化目安: X〜X日
🏢 競合: （日本の競合サービスがあれば）`;

  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
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

  // 概要
  const summary = repo.japanese_summary
    ? repo.japanese_summary.substring(0, 60)
    : (repo.description || 'オープンソースツール').substring(0, 60);
  lines.push(`💡 ${summary}`);

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
