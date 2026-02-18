# Insight MyRoom

部屋の環境データ（温度、湿度、気圧など）を可視化するアプリケーションです。
バックエンドに FastAPI (Python)、フロントエンドに React を使用しています。

## 開発環境の起動方法

### 前提条件

以下のツールがインストールされていることを確認してください。

- Python 3.x
- Node.js (および npm)

### 1. バックエンド (Python / FastAPI)

データベースへの接続やAPIサーバーとして機能します。

#### セットアップと起動

ルートディレクトリで以下のコマンドを実行してください。

```bash
# 1. 仮想環境の作成（推奨）と有効化
python -m venv venv

# Windows (PowerShell) の場合
.\venv\Scripts\activate
# Mac / Linux の場合
source venv/bin/activate

# 2. 依存パッケージのインストール
pip install -r requirements.txt

# 3. サーバーの起動 (開発モード)
uvicorn backend.main:app --reload
```

- サーバーは `http://localhost:8000` で起動します。
- APIドキュメント (Swagger UI) は `http://localhost:8000/docs` で確認できます。

### 2. フロントエンド (React)

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
