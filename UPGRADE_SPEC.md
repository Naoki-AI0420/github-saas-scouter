# GitHub SaaS Scouter — アップグレード仕様書

## 概要
3つの機能を追加して、スカウターを「静的トップ10リスト」から「リアルタイムトレンド情報収集ツール」に進化させる。

## 機能①: デイリートレンド通知（前日比スター増加ランキング）

### DB変更
```sql
CREATE TABLE IF NOT EXISTS star_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  stars INTEGER NOT NULL,
  recorded_at TEXT DEFAULT (datetime('now')),
  UNIQUE(github_id, recorded_at)
);
CREATE INDEX IF NOT EXISTS idx_star_history_date ON star_history(recorded_at);
```

### 新規ファイル
- `src/services/trend.js` — スター増減を計算、デイリートレンドTOP10を返す
- `src/scripts/trend.js` — CLI: `node src/scripts/trend.js`

### ロジック
1. 毎日クロール時に全リポジトリの現在のスター数を `star_history` に記録
2. `trend.js` で前日との差分を計算 → 増加数でソート → TOP10
3. 新規発見リポジトリ（first_seen が24h以内）も「NEW」タグ付きで含める

### Discord通知フォーマット（機能③と連動）
```
🔥 デイリートレンド（2026/3/22）

【急上昇 #1】⭐ +1,200（昨日比）| 累計 15,273
📦 spree/spree
💡 API-first ECプラットフォーム。ヘッドレスEC構築に最適
🇯🇵 日本語対応: なし → 商品化チャンス
💰 想定価格帯: ¥9,800〜¥29,800/月
🏷️ BSD-3 License ✅
⏱️ 商品化目安: 10〜14日

【急上昇 #2】⭐ +500 | 累計 4,483
📦 mayswind/ezbookkeeping
...
```

## 機能②: クロール対象の拡大

### 新規データソース
1. **GitHub Trending** — `https://github.com/trending` をスクレイピング（daily/weekly）
   - 新規ファイル: `src/services/trending.js`
   - パース: HTML から repo名・言語・スター増・説明を抽出
   - 既存の scorer.js でスコアリング → DBに格納

2. **Hacker News** — `https://hacker-news.firebaseio.com/v0/topstories.json`
   - 新規ファイル: `src/services/hackernews.js`
   - HN API でトップ記事 → GitHub URLを含むものを抽出
   - リポジトリ情報取得 → スコアリング → DB格納

3. **Product Hunt** — 公式API or スクレイピング
   - 新規ファイル: `src/services/producthunt.js`
   - 「Developer Tools」カテゴリの新着を監視
   - GitHub リンクを持つプロダクトのみ抽出

### クロールスケジュール
- GitHub Trending: 毎日 03:00 JST（既存クロールと同時）
- Hacker News: 6時間ごと（トレンドの回転が速い）
- Product Hunt: 毎日 09:00 JST

### DBへの統合
- 既存の `repositories` テーブルに統合（github_id で重複排除）
- `category` フィールドに取得元を追加（"trending", "hackernews", "producthunt"）

## 機能③: 通知フォーマット改善

### Discord通知の新フォーマット
既存の `notifier.js` を拡張。

### AI日本語解説の自動生成
- Claude Haiku（`@anthropic-ai/sdk`）で以下を自動生成:
  - 1-2行の日本語解説（何のツールか）
  - 想定ターゲット（どんな企業/個人に売れるか）
  - 想定月額レンジ
  - 商品化までの日数見積もり
  - 日本の競合サービス（あれば）

### 環境変数
- `ANTHROPIC_API_KEY` — Claude Haiku 用（.env に追加）

## 実装順序
1. ①デイリートレンド + ③通知フォーマット改善（同時に実装、密結合のため）
2. ②クロール対象拡大（独立して追加可能）

## 必須ルール
1. 作業ディレクトリ: /Users/naoki_t/.openclaw/workspace/github-saas-scouter
2. 既存のcrawl.js, notify.js, search.jsは壊さない（後方互換）
3. git add → commit → push origin main
4. ANTHROPIC_API_KEY は .env から読む（ハードコード禁止）
