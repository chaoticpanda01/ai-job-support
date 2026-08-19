# Japan Job Support プラットフォーム

日本での就職を目指すインドネシア人プロフェッショナル向けの、AIを活用したキャリア支援プラットフォームです。  
AI生成ドキュメント・リアルタイム翻訳・面接シミュレーション・ビザ案内を通じて、言語・文化・手続きの壁を取り除きます。

**完全無料 — 課金なし、サブスクリプション制限なし。**

**本番環境:** https://ai-job-support.vercel.app

---

## 技術スタック

| レイヤー | 技術 |
|--------|------|
| フロントエンド | Next.js 15, TypeScript (strict), Tailwind CSS |
| バックエンド | FastAPI, Python 3.12 |
| AI エンジン | Google Gemini API (gemini-2.5-flash) |
| データベース | PostgreSQL 16 (Neon) |
| キャッシュ | Redis 7 (Upstash) — レート制限のみ |
| バックグラウンドタスク | FastAPI BackgroundTasks |
| 認証 | Clerk |
| ファイルストレージ | Backblaze B2 (S3互換API) |
| メール | Resend |

---

## プロジェクト構成

```
ai-job-support/
├── frontend/          # Next.js 15 アプリケーション
├── backend/           # FastAPI アプリケーション
├── database/          # schema.sql — DBスキーマの唯一の情報源
├── docs/              # 技術仕様書
└── .github/workflows/ # CI パイプライン
```

---

## 必要環境

- Node.js >= 20
- Python >= 3.12
- PostgreSQL 16（ローカルインストールまたは Docker）
- Redis 7（任意 — レート制限のみ。なくてもすべての機能が動作します）

---

## ローカル開発セットアップ

### 1. クローンと環境変数の設定

```bash
git clone <repo-url>
cd ai-job-support
```

`backend/.env` を作成:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/ai_job_support
DATABASE_SYNC_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/ai_job_support
REDIS_URL=redis://localhost:6379/0

# Clerk — clerk.com ダッシュボードから取得
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
CLERK_JWKS_URL=https://<your-clerk-instance>.clerk.accounts.dev/.well-known/jwks.json

# Google Gemini — aistudio.google.com で無料キーを取得
GEMINI_API_KEY=AIza...
GEMINI_DEFAULT_MODEL=gemini-2.5-flash

# Backblaze B2 (S3互換) — backblaze.com でバケットを作成
AWS_ACCESS_KEY_ID=<b2-key-id>
AWS_SECRET_ACCESS_KEY=<b2-app-key>
AWS_REGION=<b2-region>           # 例: ca-east-006
S3_BUCKET_NAME=<bucket-name>
CLOUDFLARE_R2_ENDPOINT_URL=https://s3.<region>.backblazeb2.com   # 必須

# 任意 — ローカル開発では空白のままでOK
RESEND_API_KEY=
SECRET_KEY=local-dev-secret
APP_ENV=development
DEBUG=true
ALLOWED_ORIGINS=http://localhost:3000
```

> **重要:** `CLOUDFLARE_R2_ENDPOINT_URL` はすべての `boto3.client("s3", ...)` 呼び出しで使用され、Backblaze B2 エンドポイントを指定します。設定しないと、boto3 が AWS S3（誤ったエンドポイント）に接続し、すべてのファイル操作が失敗します。

> **Clerk セッショントークン設定:** Clerk ダッシュボード → Configure → Sessions → Customize session token で `{"email": "{{user.primary_email_address}}"}` を追加してください。users テーブルのメールアドレス形式制約のために必要です。

`frontend/.env.local` を作成:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard/resumes
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
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
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

alembic upgrade head

# 任意: カルチャーコンテンツのシード投入
python -m scripts.seed_culture
```

### 4. バックエンド API の起動

```bash
# /backend ディレクトリから（venv 有効化済み）
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

> **Celery ワーカーは不要です。** 履歴書分析・書類生成は FastAPI BackgroundTasks として実行されます。別ワーカープロセスは必要ありません。

---

## Docker Compose での起動

```bash
# コアサービスのみ起動 (postgres + redis)
docker compose up postgres redis -d

# フルスタック
docker compose up
```

---

## 初回管理者設定

サインアップ後、以下のコマンドでアカウントを管理者に昇格させます:

```bash
cd backend
source .venv/bin/activate
python -m scripts.promote_admin --email your@email.com
```

その後、管理パネルには **http://localhost:3000/admin** からアクセスできます。
それ以降のロール変更（他アカウントの昇格・降格）は管理パネルの Users タブから行えます
— このスクリプトが必要なのは環境ごとに最初の一度だけです。

> **本番環境の場合:** `ai-job-support-api` サービスの Render Shell タブから同じ
> コマンドを実行してください。本番用の `DATABASE_URL` が既に読み込まれているはずなので、
> 認証情報を Render のダッシュボード外に持ち出す必要はありません。

> **注意:** 権限昇格を防ぐ設計上、管理者昇格には直接的な DB/シェルアクセスが必要です
> — API エンドポイントは提供していません。

---

## データベース

スキーマは [`database/schema.sql`](database/schema.sql) で定義されています — これが **唯一の情報源** です。

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

pytest                        # カバレッジ付きで全テスト実行
pytest tests/unit/ -v         # ユニットテストのみ
pytest -k "test_resume" -v    # 名前でフィルタ
```

---

## コード品質

```bash
# バックエンド
cd backend
ruff check .
ruff format .
mypy app/

# フロントエンド
cd frontend
npm run type-check
npm run lint
npm run format
```

---

## 機能一覧

| 機能 | 説明 |
|------|------|
| ランディングページ | `/` — 言語切り替え付きマーケティングページ (EN / ID / JP) |
| 職務経歴分析 | 日本市場向けAIギャップ分析 |
| 履歴書生成 | アップロードした職歴書からJIS規格の日本語履歴書を生成（PDF） |
| 職務経歴書生成 | 実績重視のキャリア記述書を生成（PDF） |
| 求人票翻訳 | 日本語求人票をインドネシア語に翻訳 + マッチスコア |
| 応募管理トラッカー | カンバン形式のパイプライン（検討中 → 応募済 → 面接中 → 内定） |
| 面接練習 | SSEストリーミングによるリアルタイム模擬面接 + 回答評価 |
| ビザ案内 | 個人に合わせたビザチェックリストとロードマップ |
| カルチャーコンテンツ | インドネシア人向け職場文化トピックと用語集 |
| AI チャットボット | フローティングチャットウィジェット（要ログイン） |
| 言語切り替え | 全ページで EN / ID / JP の切り替えが可能 |
| 管理パネル | `/admin` — ユーザー・カルチャートピック・用語集の管理（role=admin 必須） |
| アカウント削除 | GDPR/PDPA準拠の完全なアカウント削除（設定画面から） |

---

## アーキテクチャ

詳細なアーキテクチャドキュメント: [`docs/japan-job-platform-techspec.md`](docs/japan-job-platform-techspec.md)

主要な設計判断:
- **Next.js プロキシ** — すべての `/api/*` リクエストは `app/api/[...path]/route.ts` を経由。Clerk JWT を注入し、ブラウザが FastAPI を直接呼び出すことはない
- **JIT ユーザー作成** — Clerk webhook が未発火の場合（ローカル開発時）、初回の有効な JWT で middleware がユーザー行を作成
- **SSE** による面接ストリーミング — 通常の HTTP で動作。Vercel で WebSocket サポートなしに使用可能
- **FastAPI BackgroundTasks** — 履歴書分析・書類生成はプロセス内で実行。Celery や外部キューは不要
- `job_postings` の **ソフトデリート** (`deleted_at` 使用)
- **クエリ内での所有者確認** — `WHERE user_id = current_user.id` を全 DB クエリ内に記述
- **課金は無効化** — `backend/app/api/v1/billing.py` と `frontend/app/dashboard/billing/` に実装済みだが意図的に無効化。全機能が無料
- **i18n** — `useLang()` フック + `t(section, key, lang)` を全ページに適用。翻訳は `frontend/lib/i18n.ts` に集約

---

## 環境変数

| 変数名 | 設定場所 | 必須 | 説明 |
|--------|---------|------|------|
| `DATABASE_URL` | バックエンド | 必須 | PostgreSQL 非同期 URL (`postgresql+asyncpg://...`) |
| `DATABASE_SYNC_URL` | バックエンド | 必須 | Alembic 用 PostgreSQL 同期 URL |
| `GEMINI_API_KEY` | バックエンド | 必須 | Google Gemini API キー |
| `GEMINI_DEFAULT_MODEL` | バックエンド | 必須 | モデル名 (例: `gemini-2.5-flash`) |
| `CLERK_SECRET_KEY` | 両方 | 必須 | Clerk シークレットキー |
| `CLERK_JWKS_URL` | バックエンド | 必須 | JWT 検証用 Clerk JWKS エンドポイント |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | フロントエンド | 必須 | Clerk 公開鍵 |
| `NEXT_PUBLIC_API_URL` | フロントエンド | 必須 | バックエンド URL（ローカルでは `http://localhost:8000`） |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | バックエンド | 必須 | Backblaze B2 認証情報 (S3互換) |
| `S3_BUCKET_NAME` | バックエンド | 必須 | 履歴書・生成PDFを格納するB2バケット |
| `CLOUDFLARE_R2_ENDPOINT_URL` | バックエンド | 必須 | B2のS3互換エンドポイント (例: `https://s3.ca-east-006.backblazeb2.com`) |
| `REDIS_URL` | バックエンド | 任意 | レート制限に使用。なくてもアプリは動作する |
| `RESEND_API_KEY` | バックエンド | 任意 | トランザクションメール |
| `STRIPE_SECRET_KEY` | バックエンド | 任意 | 課金（無効化済み — バックアップ用） |

`.env` および `.env.local` ファイルは絶対にコミットしないでください。

---

## CI/CD

| ジョブ | チェック内容 |
|--------|------------|
| フロントエンド CI | 型チェック、リント、フォーマット、ビルド |
| バックエンド CI | Ruff リント + フォーマット、mypy、alembic check、pytest |

**デプロイ:**
- バックエンド → Render（`git push main` で自動デプロイ）
- フロントエンド → Vercel（`git push main` で自動デプロイ — GitHub 連携済み）

---

## 既知の問題

- Render 無料プランは15分アイドル後にスリープ → 初回リクエストに約50秒かかる。`/health` への定期ping（10分毎）で軽減可能。
- GitHub Actions CI は現在失敗中（CI設定の環境変数不足）— 非ブロッキング、git push でのRenderデプロイは正常動作。

現在のステータス: **本番環境にデプロイ済み。全AI機能の動作確認済み。**
