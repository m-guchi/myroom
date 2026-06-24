import logging
import os
from typing import Optional

import requests

logger = logging.getLogger(__name__)


def send_login_notification(timestamp: str, client_ip: str, user_agent: str) -> None:
    content = (
        "🔐 MyRoom にログインしました\n"
        f"**日時**: {timestamp} (JST)\n"
        f"**IP**: {client_ip}\n"
        f"**User-Agent**: {user_agent}"
    )
    _post_discord(content)


def _post_discord(content: str) -> None:
    webhook_url = os.getenv("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        logger.debug("DISCORD_WEBHOOK_URL not set; skipping Discord notification")
        return

    try:
        response = requests.post(
            webhook_url,
            json={"content": content},
            timeout=5,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to send Discord notification: %s", exc)


def send_sensor_stale_notification(
    *,
    device_name: str,
    device_id: int,
    last_seen: Optional[str],
    age_minutes: Optional[float],
    threshold_minutes: int,
) -> None:
    if last_seen:
        detail = (
            f"**最終受信**: {last_seen}（約 {int(age_minutes or 0)} 分前）\n"
            f"**閾値**: {threshold_minutes} 分"
        )
    else:
        detail = "**最終受信**: なし（一度も届いていません）"

    content = (
        "⚠️ センサーデータが届いていません\n"
        f"**センサー**: {device_name}（device={device_id}）\n"
        f"{detail}"
    )
    _post_discord(content)


def send_sensor_recovered_notification(
    *,
    device_name: str,
    device_id: int,
    last_seen: Optional[str],
) -> None:
    detail = f"**最終受信**: {last_seen}" if last_seen else ""
    content = (
        "✅ センサーデータが復旧しました\n"
        f"**センサー**: {device_name}（device={device_id}）"
    )
    if detail:
        content += f"\n{detail}"
    _post_discord(content)
