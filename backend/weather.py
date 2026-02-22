import requests
import datetime
from typing import Optional, Dict, Any, List

# 大阪府茨木市の座標
LAT = 34.82
LON = 135.56

def get_outdoor_weather() -> Optional[Dict[str, Any]]:
    """
    Open-Meteo APIから Ibaraki-shi の現在の気温、湿度、気圧を取得する。
    """
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={LAT}&longitude={LON}&current=temperature_2m,relative_humidity_2m,surface_pressure&timezone=Asia%2FTokyo"
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
        # 取得開始日が今日から何日前かを計算
        start_dt = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        days_ago = (datetime.datetime.now() - start_dt).days
        
        # Forecast APIは過去92日まで。それ以上は Archive API を使用する。
        # Archive API は直近2日間のデータがない場合があるが、1年単位の推移には適している。
        base_url = "api.open-meteo.com/v1/forecast"
        if days_ago > 90:
            base_url = "archive-api.open-meteo.com/v1/archive"
            
        url = f"https://{base_url}?latitude={LAT}&longitude={LON}&hourly=temperature_2m,relative_humidity_2m,surface_pressure&start_date={start_date}&end_date={end_date}&timezone=Asia%2FTokyo"
        
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
