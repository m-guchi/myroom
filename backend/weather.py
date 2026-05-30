import requests
import datetime
from typing import Optional, Dict, Any, List, Tuple
from urllib.parse import quote

from . import outdoor_config


def get_coords() -> Tuple[float, float]:
    loc = outdoor_config.get_location()
    return loc["latitude"], loc["longitude"]

def get_outdoor_weather() -> Optional[Dict[str, Any]]:
    """
    Open-Meteo APIから設定地点の現在の気温、湿度、気圧を取得する。
    """
    lat, lon = get_coords()
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,surface_pressure&timezone=Asia%2FTokyo"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            current = data.get("current", {})
            return {
                "temperature": current.get("temperature_2m"),
                "humidity": current.get("relative_humidity_2m"),
                "pressure": current.get("surface_pressure")
            }
    except Exception as e:
        print(f"Error fetching outdoor weather: {e}")
    return None

def get_outdoor_history(start_date: str, end_date: str) -> Optional[Dict[str, List[Any]]]:
    """
    指定された期間の外気履歴を取得する (ISO 8601 format: YYYY-MM-DD)
    1年以上前のデータにも対応するため、期間に応じて Forecast API と Archive API を使い分ける。
    """
    try:
        lat, lon = get_coords()
        # 取得開始日が今日から何日前かを計算
        start_dt = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        days_ago = (datetime.datetime.now() - start_dt).days
        
        # Forecast APIは過去92日まで。それ以上は Archive API を使用する。
        # Archive API は直近2日間のデータがない場合があるが、1年単位の推移には適している。
        base_url = "api.open-meteo.com/v1/forecast"
        if days_ago > 90:
            base_url = "archive-api.open-meteo.com/v1/archive"
            
        url = f"https://{base_url}?latitude={lat}&longitude={lon}&hourly=temperature_2m,relative_humidity_2m,surface_pressure&start_date={start_date}&end_date={end_date}&timezone=Asia%2FTokyo"
        
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            hourly = data.get("hourly", {})
            return {
                "time": hourly.get("time"),
                "temperature": hourly.get("temperature_2m"),
                "humidity": hourly.get("relative_humidity_2m"),
                "pressure": hourly.get("surface_pressure")
            }
        else:
            print(f"Weather API error: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Error fetching outdoor history: {e}")
    return None


def search_locations(query: str, count: int = 8) -> List[Dict[str, Any]]:
    """Open-Meteo Geocoding API で地点を検索する。"""
    q = query.strip()
    if len(q) < 2:
        return []

    try:
        url = (
            "https://geocoding-api.open-meteo.com/v1/search?"
            f"name={quote(q)}&count={count}&language=ja&format=json"
        )
        response = requests.get(url, timeout=8)
        if response.status_code != 200:
            return []

        results = response.json().get("results") or []
        locations: List[Dict[str, Any]] = []
        for item in results:
            name = item.get("name")
            lat = item.get("latitude")
            lon = item.get("longitude")
            if name is None or lat is None or lon is None:
                continue
            admin1 = item.get("admin1")
            country = item.get("country")
            label_parts = [name]
            if admin1:
                label_parts.append(admin1)
            if country:
                label_parts.append(country)
            locations.append(
                {
                    "name": name,
                    "label": ", ".join(label_parts),
                    "latitude": lat,
                    "longitude": lon,
                }
            )
        return locations
    except Exception as e:
        print(f"Error searching locations: {e}")
        return []
