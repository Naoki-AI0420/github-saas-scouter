require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { getDb } = require('./models/database');
const apiRoutes = require('./routes/api');
const { crawlAll } = require('./services/crawler');
const { crawlTrending } = require('./services/trending');
const { crawlHackerNews } = require('./services/hackernews');
const { recordAllStars } = require('./services/trend');
const { sendDailyTop10, sendDailyTrend, sendNewHighScoreAlerts } = require('./services/notifier');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', apiRoutes);

// Dashboard HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/dashboard.html'));
});

app.get('/repo/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/detail.html'));
});

// 検索ページ（/search?q=... → ダッシュボードにリダイレクト）
app.get('/search', (req, res) => {
  const q = req.query.q || '';
  res.redirect(`/?q=${encodeURIComponent(q)}`);
});

// Initialize DB
getDb();

// Cron: crawl at 3:00 AM JST (18:00 UTC)
const crawlSchedule = process.env.CRAWL_CRON || '0 18 * * *';
cron.schedule(crawlSchedule, async () => {
  console.log('[Cron] Starting daily crawl...');
  try {
    const token = process.env.GITHUB_TOKEN;
    const results = await crawlAll(token);
    console.log('[Cron] Category crawl complete:', results);

    // GitHub Trending
    try {
      const trendResult = await crawlTrending(token, 'daily');
      console.log('[Cron] Trending crawl complete:', trendResult);
    } catch (err) {
      console.error('[Cron] Trending crawl failed:', err.message);
    }

    // Hacker News
    try {
      const hnResult = await crawlHackerNews(token);
      console.log('[Cron] HN crawl complete:', hnResult);
    } catch (err) {
      console.error('[Cron] HN crawl failed:', err.message);
    }

    // Record star history
    const recorded = recordAllStars();
    console.log(`[Cron] Recorded star history for ${recorded} repos`);

    // Send high score alerts
    if (process.env.DISCORD_WEBHOOK_URL) {
      const alertCount = await sendNewHighScoreAlerts(process.env.DISCORD_WEBHOOK_URL);
      console.log(`[Cron] Sent ${alertCount} high-score alerts`);
    }
  } catch (err) {
    console.error('[Cron] Crawl failed:', err);
  }
});

// Cron: Hacker News every 6 hours (trend rotates fast)
const hnSchedule = process.env.HN_CRON || '0 */6 * * *';
cron.schedule(hnSchedule, async () => {
  console.log('[Cron] HN periodic crawl...');
  try {
    const hnResult = await crawlHackerNews(process.env.GITHUB_TOKEN);
    console.log('[Cron] HN periodic crawl done:', hnResult);
  } catch (err) {
    console.error('[Cron] HN periodic crawl failed:', err.message);
  }
});

// Cron: daily notification at 9:00 AM JST (00:00 UTC)
const notifySchedule = process.env.NOTIFY_CRON || '0 0 * * *';
cron.schedule(notifySchedule, async () => {
  console.log('[Cron] Sending daily notifications...');
  try {
    if (process.env.DISCORD_WEBHOOK_URL) {
      await sendDailyTop10(process.env.DISCORD_WEBHOOK_URL);
      console.log('[Cron] Daily top 10 sent');

      await sendDailyTrend(process.env.DISCORD_WEBHOOK_URL);
      console.log('[Cron] Daily trend sent');
    }
  } catch (err) {
    console.error('[Cron] Notification failed:', err);
  }
});

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`GitHub SaaS Scouter running at http://localhost:${PORT}`);
  });
}

module.exports = app;
