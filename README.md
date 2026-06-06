# MyRoom

部屋の環境データ（温度、湿度、気圧、CO2 など）を可視化するアプリケーションです。

- **バックエンド**: FastAPI (Python)
- **フロントエンド**: Next.js (React + TypeScript + Tailwind CSS + shadcn/ui)
- **本番配信**: Next.js を静的エクスポート (`frontend/out`) し、FastAPI が API と静的ファイルの両方を配信

## プロジェクト構成

```
myroom/
├── backend/           # FastAPI API
├── frontend/          # Next.js UI（開発: port 5173）
├── raspberry-pi/      # SwitchBot CO2 センサー → MyRoom 連携
├── data/              # 実行時設定（gitignore 対象）
│   ├── devices.json           # デバイス表示名
│   └── outdoor_location.json  # 屋外地点
├── scripts/           # 開発用起動スクリプト
└── migrate_db.py      # DB スキーマ更新
```

## 開発環境の起動方法

### 前提条件

以下のツールがインストールされていることを確認してください。

- Python 3.x
- Node.js **20.9 以上** (および npm)

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

## 自動テスト

GitHub への push / PR 前に、次のコマンドで CI と同等のチェックを実行できます。

```bash
chmod +x scripts/test.sh   # 初回のみ
./scripts/test.sh
```

個別に実行する場合:

```bash
# バックエンド（pytest、DB_MOCK=true・外部APIなし）
source venv/bin/activate
pip install -r requirements-dev.txt
pytest tests/ -q

# フロントエンド
cd frontend
npm run typecheck
npm run test          # Vitest（chart-utils 等）
npm run build
```

### テスト内容

| 対象 | 内容 |
|------|------|
| `tests/test_api.py` | API エンドポイント（health、latest、history、sensor、devices、屋外地点） |
| `tests/test_config.py` | デバイス名・屋外地点の設定ファイル読み書き |
| `frontend/lib/chart-utils.test.ts` | グラフ計算・快適度・履歴マージのユニットテスト |

`main` / `develop` への push と PR では [`.github/workflows/ci.yml`](.github/workflows/ci.yml) が自動実行されます。`main` への push 時は、CI 通過後にデプロイ（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)）が続きます。

### ブランチとデプロイ

| ブランチ | 役割 | デプロイ先 |
|----------|------|------------|
| `develop` | 開発 | なし（ローカル） |
| `main` | 本番 | https://myroom.gucchii.com/ |

**マージの流れ**: `develop` → `main`

## システム仕様

### 画面構成

SwitchBot 風のスマートホーム UI をベースに、モバイル向け（最大幅 480px）のライトテーマで構成しています。

1. **履歴グラフ** — 画面上部。横スクロールで過去データを読み込み
2. **センサーカード（2列）** — 屋内デバイス / 屋外地点
3. **最近の記録** — 日ごとの最高・最低値をバー表示

フォントは **Noto Sans JP**、背景 `#F5F5F5`、カードは白背景・角丸 18〜20px です。

### 単位と表示

| 項目 | 単位 | 表示 |
|------|------|------|
| 温度 | °C | 小数点第1位、青色 (`#3498db`) |
| 湿度 | % | 整数、緑色 (`#2ecc71`) |
| 気圧 | hPa | 整数、紫色 (`#9b59b6`) |
| CO2 | ppm | 整数、グレー (`#95a5a6`) |

### 履歴グラフ

- **表示幅**: 日 / 週 / 月 / 年 を切り替え。横スクロールで表示範囲外のデータを段階的に取得
- **指標切替**: 温度・湿度・気圧タブ
- **屋内 / 屋外**: 屋内は実線＋塗り、屋外（Open-Meteo）はグレーの点線
- **Y軸**: 現在表示中の時間帯のデータに合わせて自動調整
- **年表示**: 日次集計（最高・最低を含む）。日・週・月は生データ（10分間隔等）
- **更新**: 30秒ごとの自動更新、手動更新ボタンあり

### デバイス管理

- **複数デバイス対応**: API の `device` クエリで `device_id` を指定（例: `?device=2`）
- **表示名の変更**: 屋内センサーカードをタップ → UI から名称を変更可能
- **保存先**: `data/devices.json`（gitignore 対象）。初回デフォルト名は `.env` の `DEVICE_1_NAME`（未設定時: `リビング`）

### 屋外データ

屋内センサーとは別に、[Open-Meteo](https://open-meteo.com/) から外気温・湿度・気圧を取得します。

- **最新値**: Forecast API（`/api/latest` 呼び出し時）
- **履歴**: 直近90日は Forecast API、それ以前は Archive API（1時間ごと）
- **地点の変更**: 屋外カードをタップ → 地名検索または緯度・経度を入力
- **保存先**: `data/outdoor_location.json`（gitignore 対象）
- **初期値**: `.env` の `OUTDOOR_LAT` / `OUTDOOR_LON` / `OUTDOOR_LOCATION_NAME`（未設定時: 茨木市付近）

### CO2 センサー（SwitchBot + Raspberry Pi）

SwitchBot Meter Pro (CO2) 等から **Raspberry Pi Zero W** 経由でデータを送信できます。

**本番 URL**

| 用途 | URL |
|------|-----|
| アプリ | https://myroom.gucchii.com/ |
| API（センサー POST） | https://myroom.gucchii.com/api/sensor |
| 死活監視 | https://myroom.gucchii.com/api/health |

```bash
# POST 例（温度・湿度・CO2 のみ。気圧は CO2 センサーでは省略可）
curl -X POST "https://myroom.gucchii.com/api/sensor?device=2" \
  -H "Content-Type: application/json" \
  -d '{"datetime":"2026-05-30 12:00:00","co2":600,"temperature":30.8,"humidity":31}'
```

- `temperature` / `humidity` / `pressure` / `co2` の **いずれか1つ以上** が必須
- 複数デバイスは `device` クエリで区別（例: DHT=`1`、SwitchBot CO2=`2`）
- **SwitchBot 複数台**: Raspberry Pi の `sensors.json` に MAC と `device_id` を列挙（1回の BLE スキャンでまとめて POST）。新しい `device_id` は初回 POST で自動登録され、ダッシュボードにも自動表示
- CO2 値は UI のセンサーカードに ppm として表示

**Raspberry Pi のセットアップ**（WinSCP、SSH、BLE/`btmon`、systemd、トラブルシューティング）は  
**[`raspberry-pi/README.md`](raspberry-pi/README.md)** に手順をまとめています。

### エアコン（白くまくんアプリ / AirCloud Home + Raspberry Pi）

日立ルームエアコン（白くまくんアプリ対応機）の状態を **AirCloud Home クラウド API** 経由で取得し、MyRoom に送信できます。

**前提**

- 白くまくんアプリでアカウント登録・エアコン登録済み
- エアコンが Wi-Fi に接続済み
- Raspberry Pi（または cron 実行可能な Linux マシン）から HTTPS で MyRoom API に到達できること

**本番 URL**

| 用途 | URL |
|------|-----|
| API（エアコン POST） | https://myroom.gucchii.com/api/aircon |
| API（最新状態 GET） | https://myroom.gucchii.com/api/aircon/latest |

```bash
# 5分ごとに取得・送信（Pi 上）
python3 aircon_to_myroom.py

# 登録済みユニット一覧
python3 aircon_to_myroom.py --list-units

# 自動実行（systemd タイマー・5分間隔）
sudo ./raspberry-pi/install.sh
sudo systemctl start aircon-myroom.timer
```

詳細は [raspberry-pi/README.md](raspberry-pi/README.md) を参照。

取得できる主な項目: 室温、設定温度、運転モード、電源 ON/OFF、風量・風向、オンライン状態など（詳細は下記参照）。

**DB マイグレーション**（本番 DB 利用時）:

```bash
python3 migrate_db.py   # aircon テーブルを作成
```

### その他

- **最近の記録**: 直近7日分から表示し、「もっと見る」で追加読み込み
- **モバイルアプリ対応 (PWA)**: ホーム画面に追加して全画面起動可能。専用アプリアイコン設定済み
- **死活監視用 API**: `/api/health` が `GET` / `HEAD` で `200 OK` を返す
- **ログイン管理**:
  - デフォルトパスワード: `admin`（ローカル開発時）
  - 本番: 1Password の `app-password` を `APP_PASSWORD` としてサーバー `.env` に同期
  - ログイン成功時: Discord Webhook（1Password の `discord-webhook-url`）へ通知

## API 概要

| メソッド | パス | 説明 |
|----------|------|------|
| GET/HEAD | `/api/health` | 死活監視 |
| POST | `/api/login` | ログイン（成功時に Discord 通知） |
| GET | `/api/latest?device=1` | 最新の屋内＋屋外データ |
| GET | `/api/history?range=day&device=1` | 履歴（`range`: day/week/month/year、または `start`/`end`） |
| GET | `/api/daily-stats?device=1` | 日次統計（最近の記録） |
| POST | `/api/sensor?device=1` | センサーデータ受信 |
| POST | `/api/aircon` | エアコン状態受信（AirCloud Home 連携） |
| GET | `/api/aircon/latest?ac_id=1` | エアコン最新状態 |
| GET | `/api/devices` | デバイス一覧（表示名） |
| PUT | `/api/devices/{id}` | デバイス表示名の更新 |
| GET | `/api/outdoor-location` | 屋外地点の取得 |
| PUT | `/api/outdoor-location` | 屋外地点の更新 |
| GET | `/api/outdoor-location/search?q=大阪` | 地名検索（Open-Meteo Geocoding） |

## 設定ファイル

| ファイル | 用途 | 備考 |
|----------|------|------|
| `.env` | DB接続、モックモード、初期デフォルト値 | gitignore |
| `data/devices.json` | デバイス表示名 | gitignore、UI から自動生成 |
| `data/outdoor_location.json` | 屋外地点 | gitignore、UI から自動生成 |

## データベース

### スキーマ更新

`device_id`（複合主キー）と `co2` カラムの追加:

```bash
source venv/bin/activate
python3 migrate_db.py
```

ALTER 権限がない場合は、スクリプトが表示する SQL を管理者ユーザーで実行してください。  
`DB_ADMIN_USER` / `DB_ADMIN_PASSWORD` を `.env` に設定すると、管理者権限でのマイグレーションが可能です。

デプロイ時（GitHub Actions）も `migrate_db.py` が自動実行されます。

### 気圧単位の変換

過去に `Pa` 単位（101300 等）で保存されていたデータがある場合:

```bash
python3 migrate_pressure_to_hpa.py
```

`hPa > 5000` の条件に基づき、安全に一括変換します。

## 本番環境へのデプロイ

### 1. 1Password の設定

デプロイ用の秘密情報は 1Password で管理し、GitHub Actions から `1password/load-secrets-action` で読み込みます。

#### 1-1. 1Password にデプロイ用アイテムを作成

保管庫名 `apps` に、次のアイテムを作成してください。

**アイテム `MyRoom`**（セキュアノート等）

| フィールド名 | 内容 |
|-------------|------|
| `app-password` | 画面ログイン用パスワード（`APP_PASSWORD` としてサーバー `.env` に同期） |
| `discord-webhook-url` | ログイン通知用 Discord Webhook URL（`DISCORD_WEBHOOK_URL` として同期） |
| `db-name` | 接続先データベース名（`DB_NAME` として同期） |
| `host` | サーバーのホスト名または IP |
| `username` | SSH ユーザー名 |
| `ssh-port` | SSH ポート番号 |
| `target-dir` | デプロイ先ディレクトリ（例: `/home/guchi/myroom`） |

**アイテム `DB`**（セキュアノート等）

| フィールド名 | 内容 |
|-------------|------|
| `db-user` | MySQL ユーザー名（`DB_USER` として同期） |
| `db-password` | MySQL パスワード（`DB_PASSWORD` として同期） |
| `db-host` | MySQL ホスト（`DB_HOST` として同期） |
| `db-port` | MySQL ポート（`DB_PORT` として同期） |

**アイテム `githubaction-sshkey`**（「SSH 鍵」アイテム型）

| フィールド ID | 内容 |
|-------------|------|
| `private_key` | サーバー接続用 SSH 秘密鍵（UI 表示は「秘密鍵」だが参照は ID を使う） |

Vault 名やアイテム名を変える場合は、`.github/deploy.env.tpl` の `op://...` 参照も合わせて更新してください。日本語ラベル（`秘密鍵`）は secret reference に使えません。

正しい参照の確認:

```bash
op item get githubaction-sshkey --vault apps --format json | jq '.fields[] | {id, label, reference}'
op read "op://apps/githubaction-sshkey/private_key?ssh-format=openssh"
```

#### 1-2. Service Account を作成

1. 1Password で Service Account を作成し、`apps` 保管庫への読み取り権限を付与
2. 発行されたトークンを GitHub リポジトリの Secret に登録

| GitHub Secret | 内容 |
|---------------|------|
| `OP_SERVICE_ACCOUNT_TOKEN` | 1Password Service Account のトークン（これだけ GitHub に残す） |

以前 GitHub Secrets に登録していた `VITE_APP_PASSWORD` / `SSH_PRIVATE_KEY` / `HOST` などは、1Password へ移行後に削除できます。

#### 1-3. 本番サーバーの `.env`

rsync では `.env` を転送しません。サーバー上の `.env` には、1Password から同期しない設定も残します。

| 環境変数 | 管理方法 |
|----------|----------|
| `DB_MOCK` | サーバー `.env` に手動設定（本番は `false`） |
| `DB_ADMIN_USER` / `DB_ADMIN_PASSWORD` | 必要な場合のみサーバー `.env` に手動設定 |

デプロイ時に 1Password から次の値が自動で `.env` に書き込まれます（既存の同名キーは上書き）。

| 環境変数 | 1Password アイテム | フィールド |
|----------|-------------------|-----------|
| `APP_PASSWORD` | MyRoom | `app-password` |
| `DISCORD_WEBHOOK_URL` | MyRoom | `discord-webhook-url` |
| `DB_NAME` | MyRoom | `db-name` |
| `DB_USER` | DB | `db-user` |
| `DB_PASSWORD` | DB | `db-password` |
| `DB_HOST` | DB | `db-host` |
| `DB_PORT` | DB | `db-port` |

### 2. デプロイフロー

`main` ブランチにプッシュすると GitHub Actions が起動し、以下を自動実行します。

1. フロントエンドのビルド（`npm run build` → `frontend/out` に静的出力）
2. ファイルの転送 (`rsync`)
3. 1Password から `APP_PASSWORD` / `DISCORD_WEBHOOK_URL` / DB 接続情報をサーバー `.env` に同期
4. DB マイグレーション (`migrate_db.py`)
5. バックエンドの依存関係更新と PM2 による再起動

本番では FastAPI が `frontend/out` を配信し、API と UI を同一オリジンで提供します。
