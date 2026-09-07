import json
import threading

from backend import atomic_json


def test_write_then_read_roundtrip(tmp_path):
    path = tmp_path / "state.json"
    atomic_json.write_json(path, {"a": 1})
    assert atomic_json.read_json(path, None) == {"a": 1}


def test_read_missing_file_returns_default(tmp_path):
    path = tmp_path / "missing.json"
    assert atomic_json.read_json(path, []) == []


def test_read_corrupted_file_returns_default(tmp_path):
    path = tmp_path / "broken.json"
    path.write_text("{not valid json", encoding="utf-8")
    assert atomic_json.read_json(path, []) == []


def test_write_leaves_no_temp_file_behind(tmp_path):
    path = tmp_path / "state.json"
    atomic_json.write_json(path, {"a": 1})
    leftovers = [
        p for p in tmp_path.iterdir() if p.name not in (path.name, f"{path.name}.lock")
    ]
    assert leftovers == []


def test_update_json_is_atomic_under_concurrent_writers(tmp_path):
    path = tmp_path / "counter.json"
    atomic_json.write_json(path, {"count": 0})

    def _increment() -> None:
        for _ in range(50):
            atomic_json.update_json(path, {"count": 0}, lambda data: {"count": data["count"] + 1})

    threads = [threading.Thread(target=_increment) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert json.loads(path.read_text(encoding="utf-8"))["count"] == 400
