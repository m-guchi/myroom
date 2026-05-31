import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from dotenv import load_dotenv

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


def list_units(discovered_ac_ids: Optional[Iterable[int]] = None) -> List[Dict[str, Any]]:
    units = _load_config()
    by_id = {unit["ac_id"]: unit for unit in units}

    for ac_id in discovered_ac_ids or ():
        if ac_id not in by_id:
            by_id[ac_id] = {"ac_id": ac_id, "name": f"エアコン {ac_id}"}

    if not by_id:
        by_id[1] = {"ac_id": 1, "name": DEFAULT_AIRCON_NAME}

    return sorted(by_id.values(), key=lambda unit: unit["ac_id"])


def get_unit(ac_id: int) -> Optional[Dict[str, Any]]:
    for unit in list_units():
        if unit["ac_id"] == ac_id:
            return unit
    return None


def get_display_name(ac_id: int, fallback: Optional[str] = None) -> str:
    unit = get_unit(ac_id)
    if unit:
        return unit["name"]
    if fallback and fallback.strip():
        return fallback.strip()
    return f"エアコン {ac_id}"


def save_unit_name(ac_id: int, name: str) -> Dict[str, Any]:
    if ac_id < 1:
        raise ValueError("ac id must be >= 1")
    if not name.strip():
        raise ValueError("name is required")

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
    saved = get_unit(ac_id)
    if saved is None:
        raise ValueError("failed to save aircon unit")
    return saved
