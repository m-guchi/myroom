# Implementation Plan: 本番環境のアプリアイコン表示修正

## 原因の特定
本番環境で `favicon.png` や `apple-touch-icon.png` などのアプリアイコンが表示されない原因は、バックエンド（FastAPI）の静的ファイルの配信設定（ルーティング）にあります。
現在 `backend/main.py` では `/assets` フォルダ以下のファイルは正常に配信されますが、それ以外のルート直下へのファイルアクセル（例: `GET /favicon.png`）に対しては、すべてSPA（Single Page Application)のフォールバック処理として `index.html` を返すようになっています。
その結果、ブラウザは画像データの代わりにHTMLのテキストを受け取り、アイコンを描画できない状態です。

## 解決策
バックエンドのルーティング設定（`serve_react_app` メソッド）を修正し、リクエストされたパスに一致するファイルが存在するかどうかを先に確認します。
該当ファイルが存在する場合はそのファイルをそのまま返し、存在しない場合のみSPA用のフォールバックとして `index.html` を返すように変更します。

## Task List
- [ ] `backend/main.py` を開き、Reactアプリを配信する `serve_react_app` メソッドを改修する。
- [ ] リクエストパスに基づいて `frontend-react/dist/` に対応するファイルが存在するか判定する処理（`os.path.exists` と `os.path.isfile`）を追加する。
- [ ] ファイルがあれば直接 `FileResponse` で返し、なければ既存通り `index.html` を返すようにする。
