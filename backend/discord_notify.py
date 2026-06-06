import logging
import os

import requests

logger = logging.getLogger(__name__)


def send_login_notification(timestamp: str, client_ip: str, user_agent: str) -> None:
    webhook_url = os.getenv("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        logger.debug("DISCORD_WEBHOOK_URL not set; skipping login notification")
        return

    content = (
        "🔐 MyRoom にログインしました\n"
        f"**日時**: {timestamp} (JST)\n"
        f"**IP**: {client_ip}\n"
        f"**User-Agent**: {user_agent}"
    )
    try:
        response = requests.post(
            webhook_url,
            json={"content": content},
            timeout=5,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to send Discord login notification: %s", exc)
