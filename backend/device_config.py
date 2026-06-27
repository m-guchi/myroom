import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from dotenv import load_dotenv
from sqlalchemy.orm import Session

from . import database
from . import entity_names
from .entity_names import ENTITY_TYPE_SENSOR

load_dotenv()

CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "devices.json"
DEFAULT_DEVICE_1_NAME = os.getenv("DEVICE_1_NAME", "リビング")
DEFAULT_DEVICE_2_NAME = os.getenv("DEVICE_2_NAME", "寝室")


def _default_devices() -> List[Dict[str, Any]]:
    return [
        {"id": 1, "name": DEFAULT_DEVICE_1_NAME, "inherits_from": None},
        {"id": 2, "name": DEFAULT_DEVICE_2_NAME, "inherits_from": None},
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
        inherits_from = item.get("inherits_from")
        if inherits_from is not None:
            try:
                inherits_from = int(inherits_from)
            except (TypeError, ValueError):
                inherits_from = None
        devices.append({"id": device_id, "name": name, "inherits_from": inherits_from})
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


def _use_db(db: Optional[Session]) -> bool:
    return not database.DB_MOCK and db is not None


def _merge_discovered(
    devices: List[Dict[str, Any]],
    discovered_ids: Optional[Iterable[int]],
) -> List[Dict[str, Any]]:
    by_id = {device["id"]: device for device in devices}
    for device_id in discovered_ids or ():
        if device_id not in by_id:
            by_id[device_id] = {
                "id": device_id,
                "name": f"デバイス {device_id}",
                "inherits_from": None,
            }
    return sorted(by_id.values(), key=lambda d: d["id"])


def _migrate_json_to_db(db: Session) -> None:
    entity_names.migrate_legacy_tables(db)
    for device in _load_config():
        existing = entity_names.get_entity(db, ENTITY_TYPE_SENSOR, device["id"])
        if existing is None:
            entity_names.upsert_entity(
                db,
                ENTITY_TYPE_SENSOR,
                device["id"],
                device["name"],
                device.get("inherits_from"),
                update_inherits_from=True,
            )


def _list_devices_db(db: Session, discovered_ids: Optional[Iterable[int]]) -> List[Dict[str, Any]]:
    entity_names.migrate_legacy_tables(db)
    rows = entity_names.list_entities(db, ENTITY_TYPE_SENSOR)
    if not rows:
        _migrate_json_to_db(db)
        rows = entity_names.list_entities(db, ENTITY_TYPE_SENSOR)

    devices = [
        {"id": row.entity_id, "name": row.name, "inherits_from": row.inherits_from}
        for row in rows
    ]
    if not devices:
        devices = _default_devices()
    return _merge_discovered(devices, discovered_ids)


def _validate_inherits_from(
    device_id: int,
    inherits_from: Optional[int],
    devices: List[Dict[str, Any]],
) -> None:
    if inherits_from is None:
        return
    if inherits_from == device_id:
        raise ValueError("device cannot inherit from itself")
    known_ids = {device["id"] for device in devices}
    if inherits_from not in known_ids:
        raise ValueError("inherits_from device does not exist")

    by_id = {device["id"]: device for device in devices}
    visited = {device_id}
    current = inherits_from
    while current is not None:
        if current in visited:
            raise ValueError("inheritance cycle detected")
        visited.add(current)
        parent = by_id.get(current)
        current = parent.get("inherits_from") if parent else None


def _save_device_name_db(
    db: Session,
    device_id: int,
    name: str,
    inherits_from: Optional[int] = ...,
) -> Dict[str, Any]:
    devices = _list_devices_db(db, None)
    if inherits_from is not ...:
        _validate_inherits_from(device_id, inherits_from, devices)

    row = entity_names.upsert_entity(
        db,
        ENTITY_TYPE_SENSOR,
        device_id,
        name,
        inherits_from if inherits_from is not ... else None,
        update_inherits_from=inherits_from is not ...,
    )
    return {"id": device_id, "name": row.name, "inherits_from": row.inherits_from}


def _ensure_device_db(db: Session, device_id: int, name: Optional[str]) -> Dict[str, Any]:
    row = entity_names.get_entity(db, ENTITY_TYPE_SENSOR, device_id)
    if row is not None:
        return {"id": row.entity_id, "name": row.name, "inherits_from": row.inherits_from}

    label = (name or f"デバイス {device_id}").strip() or f"デバイス {device_id}"
    row = entity_names.ensure_entity(db, ENTITY_TYPE_SENSOR, device_id, label)
    return {"id": device_id, "name": row.name, "inherits_from": row.inherits_from}


def list_devices(
    discovered_ids: Optional[Iterable[int]] = None,
    db: Optional[Session] = None,
) -> List[Dict[str, Any]]:
    if _use_db(db):
        return _list_devices_db(db, discovered_ids)

    devices = _load_config()
    return _merge_discovered(devices, discovered_ids)


def get_device(device_id: int, db: Optional[Session] = None) -> Optional[Dict[str, Any]]:
    for device in list_devices(db=db):
        if device["id"] == device_id:
            return device
    return None


def ensure_device(
    device_id: int,
    name: Optional[str] = None,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    if device_id < 1:
        raise ValueError("device id must be >= 1")

    if _use_db(db):
        return _ensure_device_db(db, device_id, name)

    devices = _load_config()
    for device in devices:
        if device["id"] == device_id:
            return device

    label = (name or f"デバイス {device_id}").strip() or f"デバイス {device_id}"
    devices.append({"id": device_id, "name": label})
    normalized = _normalize_devices(devices)
    _write_config(normalized)
    saved = get_device(device_id, db=db)
    if saved is None:
        raise ValueError("failed to register device")
    return saved


def save_device_name(
    device_id: int,
    name: str,
    db: Optional[Session] = None,
    inherits_from: Optional[int] = ...,
) -> Dict[str, Any]:
    if device_id < 1:
        raise ValueError("device id must be >= 1")
    if not name.strip():
        raise ValueError("name is required")

    if _use_db(db):
        return _save_device_name_db(db, device_id, name, inherits_from)

    devices = _load_config()
    if inherits_from is not ...:
        _validate_inherits_from(device_id, inherits_from, devices)

    updated = False
    for device in devices:
        if device["id"] == device_id:
            device["name"] = name.strip()
            if inherits_from is not ...:
                device["inherits_from"] = inherits_from
            updated = True
            break
    if not updated:
        devices.append(
            {
                "id": device_id,
                "name": name.strip(),
                "inherits_from": inherits_from if inherits_from is not ... else None,
            }
        )

    devices = _normalize_devices(devices)
    _write_config(devices)
    saved = get_device(device_id, db=db)
    if saved is None:
        raise ValueError("failed to save device")
    return saved
