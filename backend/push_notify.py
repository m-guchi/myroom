"""Web Push 通知の送信。"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from pywebpush import WebPushException, webpush

from . import push_subscriptions

load_dotenv()

logger = logging.getLogger(__name__)


def _vapid_private_key() -> Optional[str]:
    return os.getenv("VAPID_PRIVATE_KEY")


def _vapid_subject() -> str:
    return os.getenv("VAPID_SUBJECT", "mailto:myroom@local")


def get_vapid_public_key() -> Optional[str]:
    return os.getenv("VAPID_PUBLIC_KEY")


def is_configured() -> bool:
    return bool(_vapid_private_key() and get_vapid_public_key())


def _send_to_subscription(
    subscription: Dict[str, Any],
    payload: Dict[str, Any],
) -> Optional[int]:
    private_key = _vapid_private_key()
    if not private_key:
        return None

    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=private_key,
            vapid_claims={"sub": _vapid_subject()},
        )
        return None
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        logger.warning(
            "Web push failed (status=%s endpoint=%s): %s",
            status,
            subscription.get("endpoint"),
            exc,
        )
        return status


def broadcast(payload: Dict[str, Any]) -> int:
    """全購読者へ通知。成功件数を返す。"""
    if not is_configured():
        logger.debug("VAPID keys not configured; skipping web push")
        return 0

    subscriptions = push_subscriptions.list_subscriptions()
    if not subscriptions:
        logger.debug("No push subscriptions registered")
        return 0

    expired: List[str] = []
    sent = 0
    for subscription in subscriptions:
        status = _send_to_subscription(subscription, payload)
        if status in (404, 410):
            endpoint = subscription.get("endpoint")
            if isinstance(endpoint, str):
                expired.append(endpoint)
            continue
        if status is None:
            sent += 1

    if expired:
        push_subscriptions.remove_subscriptions(expired)

    return sent


def send_sensor_stale_push(
    *,
    device_name: str,
    device_id: int,
    last_seen: Optional[str],
    age_minutes: Optional[float],
    threshold_minutes: int,
) -> int:
    if last_seen:
        body = (
            f"{device_name}（device={device_id}）の最終受信: {last_seen}"
            f"（約{int(age_minutes or 0)}分前）"
        )
    else:
        body = f"{device_name}（device={device_id}）のデータがまだ届いていません"

    return broadcast(
        {
            "title": "⚠️ センサーデータ未到達",
            "body": body,
            "tag": f"sensor-stale-{device_id}",
            "url": "/",
        }
    )


def send_sensor_recovered_push(
    *,
    device_name: str,
    device_id: int,
    last_seen: Optional[str],
) -> int:
    body = f"{device_name}（device={device_id}）"
    if last_seen:
        body += f" — 最終受信: {last_seen}"

    return broadcast(
        {
            "title": "✅ センサーデータ復旧",
            "body": body,
            "tag": f"sensor-recovered-{device_id}",
            "url": "/",
        }
    )
