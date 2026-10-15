# AI IDE

VSCode風のオープンソースAI統合IDEです。左半分がコードエディタ（Monaco）、右半分がAIチャット。コードをその場で実行でき、GitHubへのプッシュも可能です。

## 機能

- **Monaco Editor** — VSCodeと同じエディタエンジン。シンタックスハイライト・自動補完
- **AIチャット** — Ollama / LM Studio / llama.cpp など OpenAI互換APIと接続
- **コード実行** — JavaScript, Python, Bash, TypeScript, Ruby, Go, Rust, PHP, HTML
- **GitHubプッシュ** — Personal Access Tokenで既存/新規リポジトリへ直接プッシュ
- **ファイル管理** — 複数ファイルをタブで管理、右クリックでリネーム/削除
- **WebSocketストリーミング** — AIの回答をリアルタイムで表示

## クイックスタート（ローカル）

```bash
# 1. Ollama をインストールしてモデルを取得
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.2

# 2. バックエンドを起動
cd backend
cp .env.example .env
npm install
npm run dev

# 3. フロントエンドを起動（別ターミナル）
cd frontend
npm install
npm run dev

# → http://localhost:5173 を開く
```

## 環境変数

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `AI_PROVIDER` | `ollama` または `openai-compatible` | `ollama` |
| `OLLAMA_URL` | OllamaサーバーのURL | `http://localhost:11434` |
| `OPENAI_COMPATIBLE_URL` | LM Studio等のURL | — |
| `OPENAI_API_KEY` | APIキー（ローカルなら`local`でOK） | `local` |
| `DEFAULT_MODEL` | デフォルトモデル名 | `llama3.2` |
| `PORT` | バックエンドポート | `3001` |

## Railwayへのデプロイ

```bash
# Railway CLIをインストール
npm install -g @railway/cli
railway login

# プロジェクトをデプロイ
cd ai-ide
railway init
railway up

# 環境変数を設定（Railway ダッシュボードまたはCLI）
railway variables set AI_PROVIDER=openai-compatible
railway variables set OPENAI_COMPATIBLE_URL=https://your-llm-api.com/v1
railway variables set OPENAI_API_KEY=your-key
railway variables set DEFAULT_MODEL=your-model
```

**Railway Tips:**
- Railwayはエフェメラルストレージなのでファイルはリロードで消えます。本番ではSupabase/PostgreSQLなどを追加してください
- Railwayのネットワーク内にOllamaを別サービスとして立ち上げると高速です
- LM Studio や Together AI、Groq などOpenAI互換APIならどれでも動きます

## OpenAI互換API対応サービス

| サービス | `OPENAI_COMPATIBLE_URL` |
|---------|------------------------|
| LM Studio | `http://localhost:1234/v1` |
| llama.cpp | `http://localhost:8080/v1` |
| Together AI | `https://api.together.xyz/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |

## ショートカット

- `Ctrl+Enter` — コード実行
- `Enter` — メッセージ送信
- `Shift+Enter` — チャット入力で改行
