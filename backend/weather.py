import requests
import datetime
from typing import Optional, Dict, Any, List

# 大阪府茨木市の座標
LAT = 34.82
LON = 135.56

def get_outdoor_weather() -> Optional[Dict[str, Any]]:
    """
    Open-Meteo APIから Ibaraki-shi の現在の気温と湿度を取得する。
    """
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={LAT}&longitude={LON}&current=temperature_2m,relative_humidity_2m&timezone=Asia%2FTokyo"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            current = data.get("current", {})
            return {
                "temperature": current.get("temperature_2m"),
                "humidity": current.get("relative_humidity_2m")
            }
    except Exception as e:
        print(f"Error fetching outdoor weather: {e}")
    return None

def get_outdoor_history(start_date: str, end_date: str) -> Optional[Dict[str, List[Any]]]:
    """
    指定された期間の外気履歴を取得する (ISO 8601 format: YYYY-MM-DD)
    """
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={LAT}&longitude={LON}&hourly=temperature_2m,relative_humidity_2m&start_date={start_date}&end_date={end_date}&timezone=Asia%2FTokyo"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            hourly = data.get("hourly", {})
            return {
                "time": hourly.get("time"), # ISO8601 strings
                "temperature": hourly.get("temperature_2m"),
                "humidity": hourly.get("relative_humidity_2m")
            }
    except Exception as e:
        print(f"Error fetching outdoor history: {e}")
    return None
