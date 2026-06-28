import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from sqlalchemy.orm import Session

from . import database

load_dotenv()

DEFAULT_LAT = float(os.getenv("OUTDOOR_LAT", "34.82"))
DEFAULT_LON = float(os.getenv("OUTDOOR_LON", "135.56"))
DEFAULT_NAME = os.getenv("OUTDOOR_LOCATION_NAME", "茨木市")

CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "outdoor_location.json"
SETTING_KEY = "outdoor_location"


def _default_location() -> Dict[str, Any]:
    return {
        "latitude": DEFAULT_LAT,
        "longitude": DEFAULT_LON,
        "name": DEFAULT_NAME,
    }


def _parse_location(data: Any) -> Dict[str, Any]:
    try:
        lat = float(data["latitude"])
        lon = float(data["longitude"])
        name = str(data.get("name") or DEFAULT_NAME)
        return {"latitude": lat, "longitude": lon, "name": name}
    except (KeyError, TypeError, ValueError):
        return _default_location()


def _load_file_location() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        try:
            with CONFIG_PATH.open(encoding="utf-8") as f:
                data = json.load(f)
            return _parse_location(data)
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
    return _default_location()


def _write_file_location(location: Dict[str, Any]) -> Dict[str, Any]:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump(location, f, ensure_ascii=False, indent=2)
    return location


def _load_db_location(db: Session) -> Dict[str, Any]:
    row = (
        db.query(database.AppSetting)
        .filter(database.AppSetting.setting_key == SETTING_KEY)
        .first()
    )
    if row is None:
        location = _load_file_location()
        _save_db_location(db, location)
        return location
    try:
        return _parse_location(json.loads(row.setting_value))
    except (TypeError, ValueError, json.JSONDecodeError):
        return _default_location()


def _save_db_location(db: Session, location: Dict[str, Any]) -> None:
    serialized = json.dumps(location, ensure_ascii=False)
    row = (
        db.query(database.AppSetting)
        .filter(database.AppSetting.setting_key == SETTING_KEY)
        .first()
    )
    if row is None:
        db.add(database.AppSetting(setting_key=SETTING_KEY, setting_value=serialized))
    else:
        row.setting_value = serialized
    db.commit()


def get_location(db: Optional[Session] = None) -> Dict[str, Any]:
    if database.DB_MOCK or db is None:
        return _load_file_location()
    return _load_db_location(db)


def save_location(
    latitude: float,
    longitude: float,
    name: str,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    if not (-90 <= latitude <= 90):
        raise ValueError("latitude must be between -90 and 90")
    if not (-180 <= longitude <= 180):
        raise ValueError("longitude must be between -180 and 180")
    if not name.strip():
        raise ValueError("name is required")

    location = {
        "latitude": round(latitude, 4),
        "longitude": round(longitude, 4),
        "name": name.strip(),
    }

    if database.DB_MOCK or db is None:
        return _write_file_location(location)

    _save_db_location(db, location)
    return location
