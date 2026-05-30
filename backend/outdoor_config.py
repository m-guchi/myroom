import json
import os
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv

load_dotenv()

DEFAULT_LAT = float(os.getenv("OUTDOOR_LAT", "34.82"))
DEFAULT_LON = float(os.getenv("OUTDOOR_LON", "135.56"))
DEFAULT_NAME = os.getenv("OUTDOOR_LOCATION_NAME", "茨木市")

CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "outdoor_location.json"


def _default_location() -> Dict[str, Any]:
    return {
        "latitude": DEFAULT_LAT,
        "longitude": DEFAULT_LON,
        "name": DEFAULT_NAME,
    }


def get_location() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        try:
            with CONFIG_PATH.open(encoding="utf-8") as f:
                data = json.load(f)
            lat = float(data["latitude"])
            lon = float(data["longitude"])
            name = str(data.get("name") or DEFAULT_NAME)
            return {"latitude": lat, "longitude": lon, "name": name}
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            pass
    return _default_location()


def save_location(latitude: float, longitude: float, name: str) -> Dict[str, Any]:
    if not (-90 <= latitude <= 90):
        raise ValueError("latitude must be between -90 and 90")
    if not (-180 <= longitude <= 180):
        raise ValueError("longitude must be between -180 and 180")
    if not name.strip():
        raise ValueError("name is required")

    data = {
        "latitude": round(latitude, 4),
        "longitude": round(longitude, 4),
        "name": name.strip(),
    }
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return data
