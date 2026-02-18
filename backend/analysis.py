import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any

def analyze_room_data(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    温湿度データからエアコン稼働状況を分析する。
    """
    if not records:
        return {"ac_status": "OFF", "history": []}

    df = pd.DataFrame(records)
    df['datetime'] = pd.to_datetime(df['datetime'])
    df = df.sort_values('datetime')

    # 1. エアコン（温度勾配と屋外相関）の分析
    # 30分間（3レコード分）の温度変化
    df['temp_diff'] = df['temperature'].diff(periods=3)
    
    HEATING_THRESHOLD = 0.8
    COOLING_THRESHOLD = -0.8

    df['ac_mode'] = "OFF"
    
    # 暖房判定: 室温上昇かつ、(外気温データがない、あるいは外気温より室温が十分に高い/外気が寒い)
    # 冷房判定: 室温低下かつ、(外気温データがない、あるいは外気温より室温が十分に低い/外気が暑い)
    
    for i in range(len(df)):
        temp_diff = df.iloc[i]['temp_diff']
        room_temp = df.iloc[i]['temperature']
        out_temp = df.iloc[i].get('outdoor_temperature')

        if temp_diff > HEATING_THRESHOLD:
            # 外気が室温より低い（またはデータなし）なら暖房の可能性大
            if out_temp is None or out_temp < room_temp:
                df.at[df.index[i], 'ac_mode'] = "HEATING"
        elif temp_diff < COOLING_THRESHOLD:
            # 外気が室温より高い（またはデータなし）なら冷房の可能性大
            if out_temp is None or out_temp > room_temp:
                df.at[df.index[i], 'ac_mode'] = "COOLING"

    # 結果の整形
    history_analysis = []
    for _, row in df.iterrows():
        history_analysis.append({
            "datetime": row['datetime'],
            "ac_mode": row['ac_mode']
        })

    latest = df.iloc[-1]
    
    return {
        "current": {
            "ac_mode": latest['ac_mode']
        },
        "history": history_analysis
    }
