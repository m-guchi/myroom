"""Web Push 購読情報の永続化。

以前に一度実装し（#63対応で）削除した実装をベースにしている。購読はユーザーが操作した
端末のブラウザが払い出すもので、画面から編集する設定ではなく「端末が登録した状態」に近いため、
`app_settings`（DBの設定テーブル）ではなく `data/sensor_alert_state.json` などと同じ
gitignore 済みのJSONファイルに保存する（DDL不要・DB_MOCKでも動く）。
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import atomic_json

JST = timezone(timedelta(hours=9))
SUBSCRIPTIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "push_subscriptions.json"


def _now_iso() -> str:
    return datetime.now(JST).strftime("%Y-%m-%d %H:%M:%S")


def _normalize_subscription(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    endpoint = raw.get("endpoint")
    keys = raw.get("keys")
    if not isinstance(endpoint, str) or not endpoint:
        return None
    if not isinstance(keys, dict):
        return None
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")
    if not isinstance(p256dh, str) or not isinstance(auth, str):
        return None
    return {"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}}


def _sanitize_items(data: Any) -> List[Dict[str, Any]]:
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def _load_all() -> List[Dict[str, Any]]:
    return _sanitize_items(atomic_json.read_json(SUBSCRIPTIONS_PATH, []))


def list_subscriptions() -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for item in _load_all():
        normalized = _normalize_subscription(item)
        if normalized:
            result.append(normalized)
    return result


def upsert_subscription(subscription: Dict[str, Any], *, user_agent: str = "") -> Dict[str, Any]:
    normalized = _normalize_subscription(subscription)
    if normalized is None:
        raise ValueError("invalid push subscription")

    endpoint = normalized["endpoint"]

    def _mutate(data: Any) -> List[Dict[str, Any]]:
        items = _sanitize_items(data)
        updated = False
        for item in items:
            if item.get("endpoint") == endpoint:
                item["keys"] = normalized["keys"]
                item["updated_at"] = _now_iso()
                if user_agent:
                    item["user_agent"] = user_agent[:200]
                updated = True
                break

        if not updated:
            entry: Dict[str, Any] = {
                **normalized,
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            }
            if user_agent:
                entry["user_agent"] = user_agent[:200]
            items.append(entry)
        return items

    atomic_json.update_json(SUBSCRIPTIONS_PATH, [], _mutate)
    return normalized


def remove_subscription(endpoint: str) -> bool:
    removed = False

    def _mutate(data: Any) -> List[Dict[str, Any]]:
        nonlocal removed
        items = _sanitize_items(data)
        next_items = [item for item in items if item.get("endpoint") != endpoint]
        removed = len(next_items) != len(items)
        return next_items

    atomic_json.update_json(SUBSCRIPTIONS_PATH, [], _mutate)
    return removed


def remove_subscriptions(endpoints: List[str]) -> None:
    if not endpoints:
        return
    endpoint_set = set(endpoints)

    def _mutate(data: Any) -> List[Dict[str, Any]]:
        items = _sanitize_items(data)
        return [item for item in items if item.get("endpoint") not in endpoint_set]

    atomic_json.update_json(SUBSCRIPTIONS_PATH, [], _mutate)
