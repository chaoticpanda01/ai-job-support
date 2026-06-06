# Japan Job Support プラットフォーム

日本での就職を目指すインドネシア人プロフェッショナル向けの、AIを活用したキャリア支援プラットフォームです。  
AI生成ドキュメント・リアルタイム翻訳・面接シミュレーション・ビザ案内を通じて、言語・文化・手続きの壁を取り除きます。

---

## 技術スタック

| レイヤー | 技術 |
|--------|------|
| フロントエンド | Next.js 15, TypeScript (strict), Tailwind CSS |
| バックエンド | FastAPI, Python 3.12 |
| AI エンジン | Google Gemini API (gemini-2.0-flash-lite) |
| データベース | PostgreSQL 16 |
| キャッシュ / キュー | Redis 7 + Celery |
| 認証 | Clerk |
| ファイルストレージ | AWS S3 / Cloudflare R2 |
| 決済 | Stripe |
| メール | Resend |
| 可観測性 | Sentry |

---

## プロジェクト構成

```
ai-job-support/
├── frontend/          # Next.js 15 アプリケーション
├── backend/           # FastAPI アプリケーション + Celery ワーカー
├── database/          # schema.sql — DBスキーマの唯一の情報源
├── docs/              # 技術仕様書
└── .github/workflows/ # CI パイプライン
```

---

## 必要環境

- Node.js >= 20
- Python >= 3.12
- PostgreSQL 14+（ローカルインストールまたは Docker）
- Redis 7（ローカルインストールまたは Docker — 開発時は任意、Celery ワーカーには必須）
- Docker + Docker Compose（任意 — フルスタックモード用）

---

## ローカル開発セットアップ（Docker なし）

### 1. クローンと環境変数の設定

```bash
git clone <repo-url>
cd ai-job-support
```

`backend/.env` を作成:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/ai_job_support
REDIS_URL=redis://localhost:6379/0

# Clerk — clerk.com ダッシュボードから取得
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
CLERK_JWKS_URL=https://<your-clerk-domain>/.well-known/jwks.json

# Google Gemini — aistudio.google.com で無料キーを取得
GEMINI_API_KEY=AIza...
GEMINI_DEFAULT_MODEL=gemini-2.0-flash-lite

# 任意 — ローカル開発では空白のままでOK
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
RESEND_API_KEY=
SENTRY_DSN=
```

`frontend/.env.local` を作成:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 2. PostgreSQL のセットアップ

```bash
# macOS (Homebrew)
brew install postgresql@16
brew services start postgresql@16

# ロールとデータベースを作成
psql -c "CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';"
psql -c "CREATE DATABASE ai_job_support OWNER postgres;"
```

### 3. データベースマイグレーションの実行

```bash
cd backend
pip install -r requirements.txt

alembic upgrade head

# 任意: カルチャーコンテンツのシード投入
python -m scripts.seed_culture
```

### 4. バックエンド API の起動

```bash
# /backend ディレクトリから
uvicorn app.main:app --reload --port 8000
```

### 5. フロントエンドの起動

```bash
# /frontend ディレクトリから
npm install
npm run dev
```

フロントエンド: **http://localhost:3000**  
バックエンド API: **http://localhost:8000**  
API ドキュメント (Swagger): **http://localhost:8000/docs**

> **注意:** Celery ワーカー（非同期ドキュメント生成用）は Redis が必要です。Redis なしでローカルテストを行う場合、API 経由でトリガーされた AI 機能はワーカーが起動するまでジョブがキューに溜まります。メインページとチャットボットは Celery なしでも動作します。

---

## Docker Compose での起動（フルスタック）

```bash
# コアサービスのみ起動 (postgres + redis + backend + celery)
docker compose up

# フロントエンドを含めてすべて起動
docker compose --profile full up

# Flower タスク監視 UI を含める (http://localhost:5555)
docker compose --profile monitoring up
```

---

## データベース

スキーマは [`database/schema.sql`](database/schema.sql) で定義されています — これが **唯一の情報源** です。  
DDL はここ以外に記述しないでください。

```bash
# マイグレーションの適用
alembic upgrade head

# モデル変更後に新しいマイグレーションを生成
alembic revision --autogenerate -m "変更内容の説明"

# モデルとスキーマの差異チェック
alembic check

# 直前のマイグレーションをロールバック
alembic downgrade -1
```

---

## テストの実行

```bash
cd backend

# カバレッジ付きで全テスト実行
pytest

# ユニットテストのみ
pytest tests/unit/

# インテグレーションテストのみ
pytest tests/integration/

# 単一ファイル
pytest tests/unit/test_ai_client.py -v
```

---

## コード品質

### バックエンド

```bash
cd backend

# リント
ruff check .

# フォーマット
ruff format .

# 型チェック
mypy app/
```

### フロントエンド

```bash
cd frontend

# 型チェック
npm run type-check

# リント
npm run lint

# フォーマット
npm run format
```

---

## CI/CD

GitHub Actions が `main` および `develop` への全プッシュ・プルリクエスト時に実行されます:

| ジョブ | チェック内容 |
|--------|------------|
| フロントエンド CI | 型チェック、リント、フォーマット、ビルド |
| バックエンド CI | Ruff リント + フォーマット、mypy、alembic check、pytest（実 DB 使用） |
| Docker ビルド | 両イメージのビルド、バックエンドイメージの日本語フォント確認 |

詳細: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

---

## 機能一覧

| 機能 | 説明 |
|------|------|
| ランディングページ | `/` — 機能紹介とCTAを掲載したマーケティングページ |
| 職務経歴分析 | 日本市場向けAIギャップ分析 |
| 履歴書生成 | アップロードした職歴書からJIS規格の日本語履歴書を生成 |
| 職務経歴書生成 | 実績重視のキャリア記述書を生成 |
| 求人票翻訳 | 日本語求人票をインドネシア語に翻訳 + マッチスコア |
| 応募管理トラッカー | カンバン形式のパイプライン（検討中 → 応募済 → 面接中 → 内定） |
| 面接練習 | SSEストリーミングによるリアルタイム模擬面接 + 回答評価 |
| ビザ案内 | 個人に合わせたビザチェックリストとロードマップ |
| カルチャーコンテンツ | インドネシア人向け職場文化トピックと用語集 |
| AI チャットボット | フローティングチャットウィジェット（ログイン不要） — 日本就職に関する質問に回答 |
| 言語切り替え | 全ページで EN / ID / JP の切り替えが可能 |
| 管理パネル | `/admin` — ユーザー・カルチャートピック・用語集の管理（role=admin 必須） |

---

## サブスクリプションプラン

| 機能 | 無料 | ベーシック (¥1,980/月) | プロ (¥4,980/月) |
|------|------|----------------------|-----------------|
| 職歴書アップロード/月 | 1 | 5 | 無制限 |
| 職歴書分析/月 | 1 | 10 | 無制限 |
| 履歴書生成/月 | 1 | 5 | 無制限 |
| 職務経歴書生成/月 | 0 | 3 | 無制限 |
| 求人票翻訳/月 | 3 | 30 | 無制限 |
| 面接セッション/月 | 1 | 5 | 無制限 |
| PDF出力 | ✗ | ✓ | ✓ |
| カルチャーコンテンツ | 一部 | フル | フル |

---

## アーキテクチャ

詳細なアーキテクチャドキュメント: [`docs/japan-job-platform-techspec.md`](docs/japan-job-platform-techspec.md)

主要な設計判断:
- **SSE** を面接ストリーミングに使用（WebSocket 不使用）— 通常の HTTP で動作し、Vercel + Railway に対応
- **Stripe webhook のみ** が `subscriptions` テーブルに書き込む — サブスクライブエンドポイントからの直接書き込みなし
- `job_postings` の **ソフトデリート** (`deleted_at` 使用) — `resume_analyses` の外部キー参照を保持
- **XML デリミタ** で AI プロンプト内のユーザーコンテンツをラップ — プロンプトインジェクション対策
- **クエリ内での所有者確認** — `WHERE user_id = current_user.id` を全 DB クエリ内に記述（取得後のチェックなし）

---

## 環境変数

| 変数名 | 設定場所 | 必須 | 説明 |
|--------|---------|------|------|
| `DATABASE_URL` | バックエンド | 必須 | PostgreSQL 非同期 URL (`postgresql+asyncpg://...`) |
| `GEMINI_API_KEY` | バックエンド | 必須 | Google Gemini API キー（aistudio.google.com で無料取得可） |
| `GEMINI_DEFAULT_MODEL` | バックエンド | 任意 | デフォルト: `gemini-2.0-flash-lite` |
| `CLERK_PUBLISHABLE_KEY` | 両方 | 必須 | Clerk 公開鍵 |
| `CLERK_SECRET_KEY` | 両方 | 必須 | Clerk シークレットキー |
| `CLERK_WEBHOOK_SECRET` | バックエンド | 必須 | Svix Webhook 署名シークレット |
| `CLERK_JWKS_URL` | バックエンド | 必須 | JWT 検証用 Clerk JWKS エンドポイント |
| `NEXT_PUBLIC_API_URL` | フロントエンド | 必須 | バックエンド URL（ローカルでは `http://localhost:8000`） |
| `STRIPE_SECRET_KEY` | バックエンド | 任意 | Stripe シークレット（決済機能） |
| `RESEND_API_KEY` | バックエンド | 任意 | Resend キー（トランザクションメール） |
| `AWS_ACCESS_KEY_ID` | バックエンド | 任意 | S3 ファイルストレージ |
| `SENTRY_DSN` | バックエンド | 任意 | エラー監視 |

`.env` および `.env.local` ファイルは絶対にコミットしないでください。

---

## ロードマップ

詳細: [開発ロードマップ](docs/japan-job-platform-techspec.md#7-mvp-roadmap)（技術仕様書内）

現在のステータス: **フェーズ 1〜7 完了** — ランディングページ・ダッシュボード・AIチャットボット・管理パネル・言語切り替えを含む全コア機能を実装済み。
