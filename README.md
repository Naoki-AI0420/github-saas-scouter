# GitHub SaaS候補スカウター

GitHubからSaaS化可能なオープンソースリポジトリを自動クロール・スコアリングするツール。日本市場でのローカライズ価値やパッケージング容易性を自動評価し、有望なリポジトリを発見します。

## 特徴

- **自動クロール**: 14カテゴリ（CRM, 会計, HR, POS, 予約システム等）+ 中国語/ロシア語キーワード検索
- **4軸スコアリング** (0-100点):
  - ビジネス価値 (0-30): 市場規模、Star数、Fork率
  - パッケージング容易性 (0-25): Docker対応、UI有無、ドキュメント
  - 日本市場ギャップ (0-40): 日本語非対応度、需要、言語ボーナス（中国語/ロシア語+15）
  - メンテナンス状態 (0-20): 更新頻度、Issue対応率
- **多言語クローリング**: 中国語（管理系统, 商城, 小程序等）、ロシア語（управление бизнес等）キーワード対応
- **言語ボーナス**: READMEが中国語/ロシア語のリポジトリは日本市場ギャップスコア+15（言語の壁が参入障壁）
- **ダッシュボード**: チャート、フィルタ（カテゴリ/言語/README言語/スコア）、CSV出力、ステータス管理
- **Discord通知**: 高スコアアラート、デイリーTOP10

## セットアップ

### 必要条件
- Node.js 20+
- GitHub Personal Access Token

### インストール

```bash
git clone https://github.com/Naoki-AI0420/github-saas-scouter.git
cd github-saas-scouter
npm install
cp .env.example .env
# .env を編集して GITHUB_TOKEN を設定
```

### 起動

```bash
# サーバー起動（ダッシュボード + API + Cron）
npm start

# 手動クロール実行
npm run crawl

# Discord通知テスト
npm run notify
```

### Docker

```bash
cp .env.example .env
# .env を編集
docker compose up -d
```

## 環境変数

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `GITHUB_TOKEN` | GitHub Personal Access Token（必須） | - |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL（任意） | - |
| `PORT` | サーバーポート | 3000 |
| `CRAWL_CRON` | クロール実行スケジュール | `0 18 * * *` (JST 3:00) |
| `NOTIFY_CRON` | 通知スケジュール | `0 0 * * *` (JST 9:00) |

## API

| エンドポイント | 説明 |
|---|---|
| `GET /api/repositories` | リポジトリ一覧（フィルタ: category, language, readmeLang, minStars, minScore） |
| `GET /api/repositories/:id` | リポジトリ詳細 |
| `PATCH /api/repositories/:id/status` | ステータス更新 |
| `GET /api/stats` | 統計 |
| `GET /api/categories` | カテゴリ一覧 |
| `GET /api/languages` | 言語一覧 |
| `GET /api/export/csv` | CSVエクスポート |

## テスト

```bash
npm test
```

## ライセンス

MIT
