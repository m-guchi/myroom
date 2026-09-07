"""data/*.json への読み書きをアトミック・排他にする共通ヘルパー。

`data/*.json` は複数の経路から読み→加工→書き戻しで更新される
（同一プロセス内の複数リクエスト、別プロセスの定期実行スクリプトなど）。
`open(path, "w")` してから書くだけの実装は、書き込み中にプロセスが落ちる
（`pm2 restart` 等）と壊れたJSONを残し、2経路の書き込みが競合すると
片方の更新を消し飛ばす（#382）。

このモジュールは次の2つで守る。

- **アトミック**: 同ディレクトリへ一時ファイルを書き、`os.replace()` で
  差し替える。途中で落ちても既存ファイルはそのまま残る
- **排他**: 対象パスごとに `threading.Lock`（同一プロセス内の並行リクエスト用）と
  専用の `.lock` ファイルへの `fcntl.flock`（別プロセスとの排他用）の両方で
  読み→加工→書き戻しの一連の操作を囲む。ロック対象は対象ファイル自体ではなく
  専用の `.lock` ファイル（`os.replace()` で差し替わらない、inode が変わらない
  ファイル）にすること
"""

from __future__ import annotations

import fcntl
import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Any, Callable, Dict

_thread_locks: Dict[str, threading.Lock] = {}
_thread_locks_guard = threading.Lock()


def _thread_lock(key: str) -> threading.Lock:
    with _thread_locks_guard:
        lock = _thread_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _thread_locks[key] = lock
        return lock


def _with_lock(path: Path, fn: Callable[[], Any]) -> Any:
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = path.parent / f"{path.name}.lock"
    with _thread_lock(str(path)):
        with lock_path.open("a+") as lock_handle:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
            try:
                return fn()
            finally:
                fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)


def _read_unlocked(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return default


def _write_unlocked(path: Path, data: Any) -> None:
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.chmod(tmp_name, 0o644)
        except OSError:
            pass
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def read_json(path: Path, default: Any) -> Any:
    """`path` の内容を排他したうえで読み込む。無ければ／壊れていれば `default`。"""
    return _with_lock(path, lambda: _read_unlocked(path, default))


def write_json(path: Path, data: Any) -> None:
    """`data` を排他したうえでアトミックに書き込む（一時ファイル + `os.replace()`）。"""
    _with_lock(path, lambda: _write_unlocked(path, data))


def update_json(path: Path, default: Any, mutate: Callable[[Any], Any]) -> Any:
    """読み込み・`mutate` での加工・書き戻しを1つのロックで囲む（read-modify-write）。

    `mutate` は現在の内容（無ければ `default`）を受け取り、書き戻す内容を返す。
    その返り値をそのまま返す。
    """

    def _run() -> Any:
        current = _read_unlocked(path, default)
        result = mutate(current)
        _write_unlocked(path, result)
        return result

    return _with_lock(path, _run)
