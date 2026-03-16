require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { getDb } = require('./models/database');
const apiRoutes = require('./routes/api');
const { crawlAll } = require('./services/crawler');
const { sendDailyTop10, sendNewHighScoreAlerts } = require('./services/notifier');

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

// Initialize DB
getDb();

// Cron: crawl at 3:00 AM JST (18:00 UTC)
const crawlSchedule = process.env.CRAWL_CRON || '0 18 * * *';
cron.schedule(crawlSchedule, async () => {
  console.log('[Cron] Starting daily crawl...');
  try {
    const results = await crawlAll(process.env.GITHUB_TOKEN);
    console.log('[Cron] Crawl complete:', results);

    // Send high score alerts
    if (process.env.DISCORD_WEBHOOK_URL) {
      const alertCount = await sendNewHighScoreAlerts(process.env.DISCORD_WEBHOOK_URL);
      console.log(`[Cron] Sent ${alertCount} high-score alerts`);
    }
  } catch (err) {
    console.error('[Cron] Crawl failed:', err);
  }
});

// Cron: daily notification at 9:00 AM JST (00:00 UTC)
const notifySchedule = process.env.NOTIFY_CRON || '0 0 * * *';
cron.schedule(notifySchedule, async () => {
  console.log('[Cron] Sending daily notification...');
  try {
    if (process.env.DISCORD_WEBHOOK_URL) {
      await sendDailyTop10(process.env.DISCORD_WEBHOOK_URL);
      console.log('[Cron] Daily notification sent');
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
