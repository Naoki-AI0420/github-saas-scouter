# GitHub SaaS候補スカウター

GitHub APIをクローリングし、「パッケージングしてSaaSとして販売できるリポジトリ」を自動スコアリングして一覧表示するツール。

## 機能

- **自動クローリング**: 14カテゴリ（CRM, メルマガ, SEO, POS, 在庫管理, フォームビルダー, 予約システム等）のGitHubリポジトリを毎日自動収集
- **スコアリング**: ビジネス価値・パッケージング容易性・日本市場ギャップ・メンテナンス状態の4軸で0-100点評価
- **ダッシュボード**: フィルタ・ソート・チャート付きの一覧画面、リポジトリ詳細画面
- **Discord通知**: 毎朝トップ10通知、スコア80以上の即時アラート
- **CSVエクスポート**: 全データのCSVダウンロード

## セットアップ

### 前提条件

- Node.js 20+
- GitHub Personal Access Token

### インストール

```bash
git clone <repo-url>
cd github-saas-scouter
cp .env.example .env
# .env を編集してGITHUB_TOKENを設定
npm install
```

### 起動

```bash
npm start
# http://localhost:3000 でダッシュボードにアクセス
```

### 手動クローリング

```bash
npm run crawl
```

### Docker

```bash
docker-compose up -d
```

### テスト

```bash
npm test
```

## スコアリング基準

| カテゴリ | 配点 | 説明 |
|---------|------|------|
| ビジネス価値 | 0-30 | 市場規模、Star数、Fork率 |
| パッケージング容易性 | 0-25 | UI有無、Docker対応、ドキュメント |
| 日本市場ギャップ | 0-25 | 日本語非対応×日本需要 |
| メンテナンス状態 | 0-20 | 最終更新日、Issue対応率 |

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `GITHUB_TOKEN` | ✅ | GitHub Personal Access Token |
| `DISCORD_WEBHOOK_URL` | | Discord Webhook URL |
| `PORT` | | サーバーポート（デフォルト: 3000） |
| `CRAWL_CRON` | | クローリングスケジュール（デフォルト: 毎日3:00 JST） |
| `NOTIFY_CRON` | | 通知スケジュール（デフォルト: 毎朝9:00 JST） |
