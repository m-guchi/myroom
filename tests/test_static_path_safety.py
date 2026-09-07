from backend.main import _resolve_within_directory


def test_resolve_within_directory_allows_normal_path(tmp_path):
    (tmp_path / "index.html").write_text("ok")

    resolved = _resolve_within_directory(str(tmp_path), "index.html")

    assert resolved == str(tmp_path / "index.html")


def test_resolve_within_directory_rejects_leading_slash(tmp_path):
    # os.path.join は第2引数が "/" 始まりだと第1引数を捨てるため、
    # ルーティング側の `/{full_path:path}` が食う先頭1文字だけ残った
    # "/home/.../.env" のような値がそのまま渡ってくるケースを再現する（#376）。
    secret = tmp_path.parent / "secret.env"
    secret.write_text("DB_PASSWORD=leaked")

    resolved = _resolve_within_directory(str(tmp_path), str(secret))

    assert resolved is None


def test_resolve_within_directory_rejects_dot_dot_traversal(tmp_path):
    secret = tmp_path.parent / "secret.env"
    secret.write_text("DB_PASSWORD=leaked")

    resolved = _resolve_within_directory(str(tmp_path), "../secret.env")

    assert resolved is None


def test_resolve_within_directory_allows_nested_path(tmp_path):
    nested = tmp_path / "auth"
    nested.mkdir()
    (nested / "callback.html").write_text("ok")

    resolved = _resolve_within_directory(str(tmp_path), "auth/callback.html")

    assert resolved == str(nested / "callback.html")
