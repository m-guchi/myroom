import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from dotenv import load_dotenv

load_dotenv()

CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "devices.json"
DEFAULT_DEVICE_1_NAME = os.getenv("DEVICE_1_NAME", "リビング")
DEFAULT_DEVICE_2_NAME = os.getenv("DEVICE_2_NAME", "寝室")


def _default_devices() -> List[Dict[str, Any]]:
    return [
        {"id": 1, "name": DEFAULT_DEVICE_1_NAME},
        {"id": 2, "name": DEFAULT_DEVICE_2_NAME},
    ]


def _normalize_devices(raw: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw, list):
        return _default_devices()

    devices: List[Dict[str, Any]] = []
    seen: set[int] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            device_id = int(item["id"])
        except (KeyError, TypeError, ValueError):
            continue
        if device_id in seen:
            continue
        name = str(item.get("name") or f"デバイス {device_id}").strip()
        if not name:
            name = f"デバイス {device_id}"
        devices.append({"id": device_id, "name": name})
        seen.add(device_id)

    return sorted(devices, key=lambda d: d["id"]) if devices else _default_devices()


def _load_config() -> List[Dict[str, Any]]:
    if CONFIG_PATH.exists():
        try:
            with CONFIG_PATH.open(encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "devices" in data:
                return _normalize_devices(data["devices"])
            if isinstance(data, list):
                return _normalize_devices(data)
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    return _default_devices()


def _write_config(devices: List[Dict[str, Any]]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump({"devices": devices}, f, ensure_ascii=False, indent=2)


def list_devices(discovered_ids: Optional[Iterable[int]] = None) -> List[Dict[str, Any]]:
    devices = _load_config()
    by_id = {device["id"]: device for device in devices}

    for device_id in discovered_ids or ():
        if device_id not in by_id:
            by_id[device_id] = {"id": device_id, "name": f"デバイス {device_id}"}

    return sorted(by_id.values(), key=lambda d: d["id"])


def get_device(device_id: int) -> Optional[Dict[str, Any]]:
    for device in list_devices():
        if device["id"] == device_id:
            return device
    return None


def save_device_name(device_id: int, name: str) -> Dict[str, Any]:
    if device_id < 1:
        raise ValueError("device id must be >= 1")
    if not name.strip():
        raise ValueError("name is required")

    devices = _load_config()
    updated = False
    for device in devices:
        if device["id"] == device_id:
            device["name"] = name.strip()
            updated = True
            break
    if not updated:
        devices.append({"id": device_id, "name": name.strip()})

    devices = _normalize_devices(devices)
    _write_config(devices)
    saved = get_device(device_id)
    if saved is None:
        raise ValueError("failed to save device")
    return saved
