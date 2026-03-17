const Repository = require('../models/repository');

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

module.exports = { sendDailyTop10, sendHighScoreAlert, sendNewHighScoreAlerts, sendDiscordNotification, formatRepoEmbed };
