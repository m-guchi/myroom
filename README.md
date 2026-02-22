# Insight MyRoom

部屋の環境データ（温度、湿度、気圧など）を可視化するアプリケーションです。
バックエンドに FastAPI (Python)、フロントエンドに React を使用しています。

## 開発環境の起動方法

### 前提条件

以下のツールがインストールされていることを確認してください。

- Python 3.x
- Node.js (および npm)

### 1. 環境設定 (.env)

開発環境の動作モードは、プロジェクトルートにある `.env` ファイルの `DB_MOCK` で切り替えます。

- **モックモード**: `DB_MOCK=true`
  データベース接続なしでダミーデータを表示します。手軽なUI確認に適しています。
- **本番データモード**: `DB_MOCK=false`
  本番環境のデータベース（MySQL）に接続して実データを表示します。

### (オプション) 本番データの利用方法

`DB_MOCK=false` で本番データを利用する場合は、SSHトンネルを起動する必要があります。

#### 1. SSHトンネルの起動
別のターミナルで以下のコマンドを実行し、接続を維持（開きっぱなしに）してください。
```bash
./scripts/start_tunnel.sh
```
※ 本番サーバー（162.43.74.7）の 3306 ポートを、ローカルの 3307 ポートに転送します。

#### 2. 接続確認
別のターミナルで以下のコマンドを実行し、`Successfully connected to the database!` と表示されるか確認できます。
```bash
python3 check_db.py
```

### 2. バックエンド (Python / FastAPI)

データベースへの接続やAPIサーバーとして機能します。

#### セットアップと起動

新しいターミナルを開き、ルートディレクトリで以下のコマンドを実行してください。

```bash
# 1. 仮想環境の作成（推奨）と有効化
python3 -m venv venv

# Windows (PowerShell) の場合
.\venv\Scripts\activate
# Mac / Linux の場合
source venv/bin/activate

# 2. 依存パッケージのインストール
pip install -r requirements.txt

# 3. サーバーの起動 (開発モード)
# --host 0.0.0.0 --port 8000 を指定して起動します
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

- サーバーは `http://localhost:8000` で起動します。
- 正常に起動すると `Application startup complete.` と表示されます。
- APIドキュメント (Swagger UI) は `http://localhost:8000/docs` で確認できます。

### 3. フロントエンド (React)

ユーザーインターフェースを提供します。Vite を使用して構築されています。
**注意: バックエンドサーバーが起動していないとAPIエラーになります。**

#### セットアップと起動

**別のターミナル**を開き、`frontend-react` ディレクトリに移動して実行してください。

ユーザーインターフェースを提供します。Vite を使用して構築されています。

#### セットアップと起動

別のターミナルを開き、`frontend-react` ディレクトリに移動して実行してください。

```bash
cd frontend-react

# 1. 依存パッケージのインストール
npm install

# 2. 開発サーバーの起動
npm run dev
```

- ブラウザで `http://localhost:5173` (またはコンソールに表示されるURL) にアクセスしてください。

## 本番環境向けのビルド (参考)

React アプリケーションをビルドし、FastAPI から静的ファイルとして配信する構成になっています。

1. フロントエンドをビルドします:
   ```bash
   cd frontend-react
   npm run build
   ```
   これにより `frontend-react/dist` ディレクトリが生成されます。

2. バックエンドを起動します:
   `uvicorn backend.main:app` などでバックエンドを起動すると、`dist` ディレクトリ内のファイルが静的コンテンツとして配信されます。
