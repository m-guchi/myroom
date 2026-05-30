# MyRoom

部屋の環境データ（温度、湿度、気圧など）を可視化するアプリケーションです。
バックエンドに FastAPI (Python)、フロントエンドに Next.js (React + TypeScript + Tailwind CSS + shadcn/ui) を使用しています。

## 開発環境の起動方法

### 前提条件

以下のツールがインストールされていることを確認してください。

- Python 3.x
- Node.js (および npm)

初回のみ Python 依存関係をインストールします（**Streamlit は含みません**。Next.js + FastAPI の開発に必要なものだけです）。

```bash
cd /home/guchi/apps/myroom
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

旧 Streamlit UI (`frontend/app.py`) を使う場合のみ: `pip install -r requirements-streamlit.txt`（`cmake` 等が必要になることがあります）。

初回のみ、ルートに `.env` を用意してください（DB接続情報・パスワードなど）。  
起動スクリプトは **環境変数 `DB_MOCK` でモードを上書き**するため、`.env` の `DB_MOCK` 値を毎回書き換える必要はありません。

### まとめて起動（推奨）

プロジェクトルートで、どちらか **1コマンド** を実行します。バックエンド・フロントエンドを同時に起動し、Ctrl+C でまとめて停止できます。

| モード | コマンド | データ |
|--------|----------|--------|
| **開発データ（モック）** | `./scripts/start.sh mock` | ダミーデータ（DB・SSH不要） |
| **本番データ** | `./scripts/start.sh prod` | 本番MySQL（SSHトンネル自動起動） |

停止のみ行う場合:

```bash
./scripts/stop.sh
```

起動後はブラウザで **http://localhost:5173** を開いてください（API: http://localhost:8000/docs）。

#### 開発データ（モック）で起動

```bash
chmod +x scripts/*.sh scripts/lib/*.sh   # 初回のみ
./scripts/start.sh mock
```

- `DB_MOCK=true`（DB接続なし）
- UIの動作確認向け

同等: `./scripts/start-mock.sh`

#### 本番データで起動

```bash
./scripts/start.sh prod
```

- `DB_MOCK=false`
- SSHトンネル（ローカル 3307 → 本番 3306）を自動起動
- `check_db.py` で接続確認後にバックエンド・フロントエンドを起動
- `.env` の `DB_HOST` / `DB_PORT`（例: `127.0.0.1:3307`）がトンネル先と一致していること

同等: `./scripts/start-prod-db.sh`

SSHトンネルだけ別ターミナルで維持したい場合:

```bash
./scripts/start_tunnel.sh
```

### 手動で起動する場合

#### 1. 環境設定 (.env)

- **モックモード**: `DB_MOCK=true` — ダミーデータ
- **本番データモード**: `DB_MOCK=false` — 本番DB（要SSHトンネル）

本番データ利用時は別ターミナルで `./scripts/start_tunnel.sh` を実行し、接続確認:

```bash
source venv/bin/activate
python3 check_db.py
```

#### 2. バックエンド (Python / FastAPI)

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

#### 3. フロントエンド (Next.js)

**バックエンド起動後**に:

```bash
cd frontend
npm install
npm run dev
```

- UI: http://localhost:5173
- 開発時は `/api` が FastAPI (`localhost:8000`) にプロキシされます

## システム仕様

### 単位と表示
- **気圧**: システム全体で `hPa` 単位で統一。UIでは紫色 (`#9b59b6`) の整数値で表示。
- **温度**: `°C` 単位。UIでは小数点第1位まで表示。色は青色 (`#3498db`)。
- **湿度**: `%` 単位。UIでは整数値として表示。色は緑色 (`#2ecc71`)。

### 主要機能
- **履歴グラフ**:
    - **1D / 1W / 1M / 1Y**: それぞれ最適な時間軸目盛りを表示（例: 1Mは1/11/21日、1Yは四半期ごと）。
    - **全期間（カスタムレンジ）**: カレンダーから開始日・終了日を自由に指定して表示可能。
    - **長期データ表示**: 1M/1Y/全期間では日次の最高・最低値を強調表示し、トレンドを把握しやすく最適化。
- **モバイルアプリ対応 (PWA)**:
    - ホーム画面に追加することで、ネイティブアプリのように全画面で起動可能。
    - プレミアムなハウスシルエットの専用アプリアイコンを設定済み。
- **死活監視用API**: `/api/health` エンドポイントが `GET` および `HEAD` リクエストに対して `200 OK` を返します。
- **ログイン管理**:
    - デフォルトパスワード: `admin`
    - デプロイ時の変更: GitHub Secrets に `VITE_APP_PASSWORD` を設定することで反映されます（ビルド時に `NEXT_PUBLIC_APP_PASSWORD` として埋め込まれます）。

### データの整合性
過去に `Pa` 単位（101300等）で保存されていたデータがある場合は、以下のスクリプトで `hPa > 5000` の条件に基づき、安全に一括変換が可能です。
```bash
python3 migrate_pressure_to_hpa.py
```

## 本番環境へのデプロイ

### 1. GitHub Secrets の設定
以下の変数をリポジトリの Secrets に設定してください。
- `VITE_APP_PASSWORD`: 画面ログイン用のパスワード
- `SSH_PRIVATE_KEY`: サーバー接続用秘密鍵
- `HOST` / `USERNAME` / `SSH_PORT` / `TARGET_DIR`: サーバー接続情報

### 2. デプロイフロー
`main` ブランチにプッシュすると GitHub Actions が起動し、以下の処理を自動で行います。
1. フロントエンドのビルド（パスワードの埋め込みを含む）
2. ファイルの転送 (`rsync`)
3. バックエンドの依存関係更新とプロセス再起動 (`PM2`)
