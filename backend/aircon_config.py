import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from dotenv import load_dotenv
from sqlalchemy.orm import Session

from . import database
from . import entity_names
from .entity_names import ENTITY_TYPE_AIRCON

load_dotenv()

CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "aircon.json"
DEFAULT_AIRCON_NAME = os.getenv("AIRCON_NAME", "エアコン")


def _default_units() -> List[Dict[str, Any]]:
    return [{"ac_id": 1, "name": DEFAULT_AIRCON_NAME}]


def _normalize_units(raw: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw, list):
        return _default_units()

    units: List[Dict[str, Any]] = []
    seen: set[int] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            ac_id = int(item["ac_id"])
        except (KeyError, TypeError, ValueError):
            continue
        if ac_id in seen:
            continue
        name = str(item.get("name") or f"エアコン {ac_id}").strip()
        if not name:
            name = f"エアコン {ac_id}"
        units.append({"ac_id": ac_id, "name": name})
        seen.add(ac_id)

    return sorted(units, key=lambda unit: unit["ac_id"]) if units else _default_units()


def _load_config() -> List[Dict[str, Any]]:
    if CONFIG_PATH.exists():
        try:
            with CONFIG_PATH.open(encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "units" in data:
                return _normalize_units(data["units"])
            if isinstance(data, list):
                return _normalize_units(data)
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    return _default_units()


def _write_config(units: List[Dict[str, Any]]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump({"units": units}, f, ensure_ascii=False, indent=2)


def _use_db(db: Optional[Session]) -> bool:
    return not database.DB_MOCK and db is not None


def _merge_discovered(
    units: List[Dict[str, Any]],
    discovered_ac_ids: Optional[Iterable[int]],
) -> List[Dict[str, Any]]:
    by_id = {unit["ac_id"]: unit for unit in units}
    for ac_id in discovered_ac_ids or ():
        if ac_id not in by_id:
            by_id[ac_id] = {"ac_id": ac_id, "name": f"エアコン {ac_id}"}

    if not by_id:
        by_id[1] = {"ac_id": 1, "name": DEFAULT_AIRCON_NAME}

    return sorted(by_id.values(), key=lambda unit: unit["ac_id"])


def _migrate_json_to_db(db: Session) -> None:
    entity_names.migrate_legacy_tables(db)
    for unit in _load_config():
        existing = entity_names.get_entity(db, ENTITY_TYPE_AIRCON, unit["ac_id"])
        if existing is None:
            entity_names.upsert_entity(db, ENTITY_TYPE_AIRCON, unit["ac_id"], unit["name"])


def _list_units_db(db: Session, discovered_ac_ids: Optional[Iterable[int]]) -> List[Dict[str, Any]]:
    entity_names.migrate_legacy_tables(db)
    rows = entity_names.list_entities(db, ENTITY_TYPE_AIRCON)
    if not rows:
        _migrate_json_to_db(db)
        rows = entity_names.list_entities(db, ENTITY_TYPE_AIRCON)

    units = [{"ac_id": row.entity_id, "name": row.name} for row in rows]
    if not units:
        units = _default_units()
    return _merge_discovered(units, discovered_ac_ids)


def _save_unit_name_db(db: Session, ac_id: int, name: str) -> Dict[str, Any]:
    row = entity_names.upsert_entity(db, ENTITY_TYPE_AIRCON, ac_id, name)
    return {"ac_id": ac_id, "name": row.name}


def list_units(
    discovered_ac_ids: Optional[Iterable[int]] = None,
    db: Optional[Session] = None,
) -> List[Dict[str, Any]]:
    if _use_db(db):
        return _list_units_db(db, discovered_ac_ids)

    units = _load_config()
    return _merge_discovered(units, discovered_ac_ids)


def get_unit(ac_id: int, db: Optional[Session] = None) -> Optional[Dict[str, Any]]:
    for unit in list_units(db=db):
        if unit["ac_id"] == ac_id:
            return unit
    return None


def get_display_name(
    ac_id: int,
    fallback: Optional[str] = None,
    db: Optional[Session] = None,
) -> str:
    unit = get_unit(ac_id, db=db)
    if unit:
        return unit["name"]
    if fallback and fallback.strip():
        return fallback.strip()
    return f"エアコン {ac_id}"


def save_unit_name(
    ac_id: int,
    name: str,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    if ac_id < 1:
        raise ValueError("ac id must be >= 1")
    if not name.strip():
        raise ValueError("name is required")

    if _use_db(db):
        return _save_unit_name_db(db, ac_id, name)

    units = _load_config()
    updated = False
    for unit in units:
        if unit["ac_id"] == ac_id:
            unit["name"] = name.strip()
            updated = True
            break
    if not updated:
        units.append({"ac_id": ac_id, "name": name.strip()})

    units = _normalize_units(units)
    _write_config(units)
    saved = get_unit(ac_id, db=db)
    if saved is None:
        raise ValueError("failed to save aircon unit")
    return saved
