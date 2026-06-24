"""センサーデータの鮮度を監視し、未到達時に Discord / Web Push で通知する。"""

from __future__ import annotations

import datetime
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, TypedDict

from dotenv import load_dotenv
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import database, device_config, discord_notify, push_notify

load_dotenv()

logger = logging.getLogger(__name__)

JST = datetime.timezone(datetime.timedelta(hours=9))
STATE_PATH = Path(__file__).resolve().parent.parent / "data" / "sensor_alert_state.json"

STALE_THRESHOLD_MINUTES = int(os.getenv("SENSOR_STALE_MINUTES", "15"))
REMINDER_INTERVAL_MINUTES = int(os.getenv("SENSOR_ALERT_REMINDER_MINUTES", "60"))
NOTIFY_ON_RECOVERY = os.getenv("SENSOR_NOTIFY_ON_RECOVERY", "true").lower() == "true"


class SensorStatus(TypedDict):
    device_id: int
    name: str
    last_seen: Optional[str]
    age_minutes: Optional[float]
    stale: bool
    has_data: bool


def get_now_jst() -> datetime.datetime:
    return datetime.datetime.now(JST).replace(tzinfo=None)


def stale_threshold_minutes() -> int:
    return STALE_THRESHOLD_MINUTES


def _discover_device_ids(db: Session) -> List[int]:
    rows = db.query(database.DHTRecord.device_id).distinct().all()
    return sorted({row[0] for row in rows if row[0] is not None})


def _latest_by_device(db: Session) -> Dict[int, datetime.datetime]:
    rows = (
        db.query(database.DHTRecord.device_id, func.max(database.DHTRecord.datetime))
        .group_by(database.DHTRecord.device_id)
        .all()
    )
    return {device_id: latest for device_id, latest in rows if latest is not None}


def collect_sensor_statuses(db: Optional[Session] = None) -> List[SensorStatus]:
    """各センサーの最終受信時刻と鮮度を返す。"""
    if database.DB_MOCK or db is None:
        now = get_now_jst()
        devices = device_config.list_devices()
        return [
            {
                "device_id": device["id"],
                "name": device["name"],
                "last_seen": now.strftime("%Y-%m-%d %H:%M:%S"),
                "age_minutes": 0.0,
                "stale": False,
                "has_data": True,
            }
            for device in devices
        ]

    discovered = _discover_device_ids(db)
    devices = device_config.list_devices(discovered)
    latest_map = _latest_by_device(db)
    now = get_now_jst()
    threshold = stale_threshold_minutes()
    statuses: List[SensorStatus] = []

    for device in devices:
        device_id = device["id"]
        last_seen_dt = latest_map.get(device_id)
        if last_seen_dt is None:
            statuses.append(
                {
                    "device_id": device_id,
                    "name": device["name"],
                    "last_seen": None,
                    "age_minutes": None,
                    "stale": True,
                    "has_data": False,
                }
            )
            continue

        age_minutes = (now - last_seen_dt).total_seconds() / 60.0
        statuses.append(
            {
                "device_id": device_id,
                "name": device["name"],
                "last_seen": last_seen_dt.strftime("%Y-%m-%d %H:%M:%S"),
                "age_minutes": round(age_minutes, 1),
                "stale": age_minutes > threshold,
                "has_data": True,
            }
        )

    return statuses


def _load_state() -> Dict[str, Any]:
    if not STATE_PATH.exists():
        return {"devices": {}}
    try:
        with STATE_PATH.open(encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict) and isinstance(data.get("devices"), dict):
            return data
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        logger.warning("Failed to read sensor alert state; resetting")
    return {"devices": {}}


def _write_state(state: Dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with STATE_PATH.open("w", encoding="utf-8") as handle:
        json.dump(state, handle, ensure_ascii=False, indent=2)


def _device_state_entry(state: Dict[str, Any], device_id: int) -> Dict[str, Any]:
    devices = state.setdefault("devices", {})
    key = str(device_id)
    entry = devices.get(key)
    if not isinstance(entry, dict):
        entry = {"status": "ok", "notified_at": None}
        devices[key] = entry
    return entry


def _should_send_reminder(notified_at: Optional[str], now: datetime.datetime) -> bool:
    if not notified_at:
        return True
    try:
        previous = datetime.datetime.strptime(notified_at, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return True
    elapsed = (now - previous).total_seconds() / 60.0
    return elapsed >= REMINDER_INTERVAL_MINUTES


def run_monitor(db: Optional[Session] = None, notify: bool = True) -> List[SensorStatus]:
    """鮮度を評価し、状態遷移時に通知する。CLI / systemd timer から呼ぶ。"""
    statuses = collect_sensor_statuses(db)
    if not notify or database.DB_MOCK:
        return statuses

    state = _load_state()
    now = get_now_jst()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    changed = False

    for status in statuses:
        device_id = status["device_id"]
        entry = _device_state_entry(state, device_id)
        previous = entry.get("status", "ok")
        is_stale = status["stale"]

        if is_stale:
            should_notify = previous != "alerting" or _should_send_reminder(
                entry.get("notified_at"), now
            )
            if should_notify:
                discord_notify.send_sensor_stale_notification(
                    device_name=status["name"],
                    device_id=device_id,
                    last_seen=status["last_seen"],
                    age_minutes=status["age_minutes"],
                    threshold_minutes=stale_threshold_minutes(),
                )
                push_notify.send_sensor_stale_push(
                    device_name=status["name"],
                    device_id=device_id,
                    last_seen=status["last_seen"],
                    age_minutes=status["age_minutes"],
                    threshold_minutes=stale_threshold_minutes(),
                )
                entry["status"] = "alerting"
                entry["notified_at"] = now_str
                changed = True
        elif previous == "alerting":
            if NOTIFY_ON_RECOVERY:
                discord_notify.send_sensor_recovered_notification(
                    device_name=status["name"],
                    device_id=device_id,
                    last_seen=status["last_seen"],
                )
                push_notify.send_sensor_recovered_push(
                    device_name=status["name"],
                    device_id=device_id,
                    last_seen=status["last_seen"],
                )
            entry["status"] = "ok"
            entry["notified_at"] = None
            changed = True
        else:
            entry["status"] = "ok"

    if changed:
        _write_state(state)

    return statuses


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if database.DB_MOCK:
        logger.info("DB_MOCK=true; skipping sensor monitor")
        return 0

    db = database.SessionLocal()
    try:
        statuses = run_monitor(db, notify=True)
        stale_count = sum(1 for item in statuses if item["stale"])
        logger.info(
            "Sensor monitor finished: %d device(s), %d stale",
            len(statuses),
            stale_count,
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
