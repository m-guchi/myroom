from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime
import random
from dotenv import load_dotenv
from . import database, analysis, weather
from pydantic import BaseModel

load_dotenv()

# JST Timezone
JST = datetime.timezone(datetime.timedelta(hours=9))

def get_now_jst():
    return datetime.datetime.now(JST).replace(tzinfo=None) # Use naive JST to match DB


app = FastAPI(title="Insight MyRoom API")

# Allow CORS for Streamlit (Mocking mainly, but good practice)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models ---
class SensorData(BaseModel):
    datetime: str
    temperature: float
    humidity: float
    pressure: float

# --- Endpoints ---

@app.post("/api/sensor")
async def create_sensor_data(
    data: SensorData,
    device: int = 1,
    db: Session = Depends(database.get_db)
):
    """
    Receive sensor data from devices.
    """
    if database.DB_MOCK:
        return {"status": "mock_ok", "received": data}

    try:
        # Parse datetime string "YYYY-MM-DD HH:MM:00"
        try:
            dt = datetime.datetime.strptime(data.datetime, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            # Try ISO format if default fails
            dt = datetime.datetime.fromisoformat(data.datetime)
            
        # Create record
        # Note: Pressure is stored as integer (Pa?) in DB based on get_latest logic (val / 100.0)
        # Assuming input is hPa (e.g. 1013), store as 101300
        record = database.DHTRecord(
            datetime=dt,
            device_id=device,
            temperature=data.temperature,
            humidity=int(data.humidity),
            pressure=int(data.pressure * 100)
        )
        
        db.add(record)
        db.commit()
        return {"status": "ok"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/latest")
def get_latest(device: int = 1, db: Session = Depends(database.get_db)):
    if database.DB_MOCK:
        # Return random mock data
        return {
            "datetime": get_now_jst(),
            "temperature": round(23.5 + random.uniform(-0.5, 0.5), 1),
            "humidity": round(45.0 + random.uniform(-1, 1), 1),
            "pressure": round(101300.0 + random.uniform(-100, 100), 1)
        }
    
    record = db.query(database.DHTRecord).filter(database.DHTRecord.device_id == device).order_by(database.DHTRecord.datetime.desc()).first()
    if not record:
        return {}
    
    # Fetch outdoor weather
    outdoor = weather.get_outdoor_weather()

    # Return as dict to modify pressure
    return {
        "datetime": record.datetime,
        "temperature": record.temperature,
        "humidity": record.humidity,
        "pressure": record.pressure,
        "outdoor_temperature": outdoor["temperature"] if outdoor else None,
        "outdoor_humidity": outdoor["humidity"] if outdoor else None
    }

from sqlalchemy import func

@app.get("/api/daily-stats")
def get_daily_stats(device: int = 1, db: Session = Depends(database.get_db)):
    if database.DB_MOCK:
        return database.generate_mock_daily()
        
    today = datetime.date.today()
    start_date = today - datetime.timedelta(days=7)
    
    import pandas as pd
    
    # Fetch raw data for the last 7 days for specific device
    records = db.query(database.DHTRecord).filter(
        database.DHTRecord.datetime >= start_date,
        database.DHTRecord.device_id == device
    ).all()
    
    if not records:
        return []
        
    data = [{
        "datetime": r.datetime,
        "temperature": r.temperature,
        "humidity": r.humidity,
        "pressure": r.pressure
    } for r in records]
    
    df = pd.DataFrame(data)
    df['date'] = df['datetime'].dt.date
    daily_stats = []
    
    # Check if dataframe is not empty
    if not df.empty:
        for date, group in df.groupby('date'):
            # Get max/min rows
            max_temp_row = group.loc[group['temperature'].idxmax()]
            min_temp_row = group.loc[group['temperature'].idxmin()]
            
            daily_stats.append({
                "date": date,
                "temp_max": float(max_temp_row['temperature']),
                "temp_max_time": max_temp_row['datetime'].strftime("%H:%M"),
                "temp_min": float(min_temp_row['temperature']),
                "temp_min_time": min_temp_row['datetime'].strftime("%H:%M"),
                "humid_max": float(group['humidity'].max()),
                "humid_min": float(group['humidity'].min()),
                "pressure_max": group['pressure'].max() if 'pressure' in group and group['pressure'].notnull().any() else None,
                "pressure_min": group['pressure'].min() if 'pressure' in group and group['pressure'].notnull().any() else None,
            })
    
    # Sort by date
    daily_stats.sort(key=lambda x: x['date'])
    
    return daily_stats

@app.get("/api/history")
def get_history(date: Optional[str] = None, device: int = 1, db: Session = Depends(database.get_db)):
    if database.DB_MOCK:
        # Mock doesn't support date yet, just return default
        return database.generate_mock_history()

    if date:
        try:
            target_date = datetime.datetime.strptime(date, "%Y-%m-%d").date()
            start_time = datetime.datetime.combine(target_date, datetime.time.min)
            end_time = datetime.datetime.combine(target_date, datetime.time.max)
        except ValueError:
            end_time = get_now_jst()
            start_time = end_time - datetime.timedelta(hours=24)
    else:
        end_time = get_now_jst()
        start_time = end_time - datetime.timedelta(hours=24)
    
    records = db.query(database.DHTRecord).filter(
        database.DHTRecord.datetime >= start_time,
        database.DHTRecord.datetime <= end_time,
        database.DHTRecord.device_id == device
    ).order_by(database.DHTRecord.datetime.asc()).all()
    
    # Fetch outdoor history for the same range
    # Open-Meteo needs YYYY-MM-DD
    outdoor_hist = weather.get_outdoor_history(start_time.strftime("%Y-%m-%d"), end_time.strftime("%Y-%m-%d"))
    
    # Simple merge: Map outdoor hourly data for lookups
    outdoor_map = {}
    if outdoor_hist:
        for i, t_str in enumerate(outdoor_hist["time"]):
            # t_str is like '2026-01-24T00:00'
            try:
                dt_key = datetime.datetime.fromisoformat(t_str)
                outdoor_map[dt_key] = {
                    "temp": outdoor_hist["temperature"][i],
                    "humid": outdoor_hist["humidity"][i]
                }
            except Exception:
                pass

    # Convert pressure Pa -> hPa and merge outdoor data
    formatted_records = []
    
    # Helper to find closest outdoor data
    def get_outdoor(dt):
        # Round to nearest hour
        if dt.minute >= 30:
             hour_dt = dt + datetime.timedelta(minutes=60-dt.minute, seconds=-dt.second)
        else:
             hour_dt = dt - datetime.timedelta(minutes=dt.minute, seconds=dt.second)
        hour_dt = hour_dt.replace(microsecond=0)
        return outdoor_map.get(hour_dt, {})

    for r in records:
        out_data = get_outdoor(r.datetime)

        formatted_records.append({
            "datetime": r.datetime,
            "temperature": r.temperature,
            "humidity": r.humidity,
            "pressure": r.pressure,
            "outdoor_temperature": out_data.get("temp"),
            "outdoor_humidity": out_data.get("humid")
        })
        
    return formatted_records

@app.get("/api/analysis")
def get_analysis(date: Optional[str] = None, device: int = 1, db: Session = Depends(database.get_db)):
    if database.DB_MOCK:
        history = database.generate_mock_history()
    else:
        if date:
            try:
                target_date = datetime.datetime.strptime(date, "%Y-%m-%d").date()
                start_time = datetime.datetime.combine(target_date, datetime.time.min)
                end_time = datetime.datetime.combine(target_date, datetime.time.max)
            except ValueError:
                end_time = get_now_jst()
                start_time = end_time - datetime.timedelta(hours=24)
        else:
            end_time = get_now_jst()
            start_time = end_time - datetime.timedelta(hours=24)
        
        records = db.query(database.DHTRecord).filter(
            database.DHTRecord.datetime >= start_time,
            database.DHTRecord.datetime <= end_time,
            database.DHTRecord.device_id == device
        ).order_by(database.DHTRecord.datetime.asc()).all()
        
        outdoor_hist = weather.get_outdoor_history(start_time.strftime("%Y-%m-%d"), end_time.strftime("%Y-%m-%d"))
        outdoor_map = {}
        if outdoor_hist:
            for i, t_str in enumerate(outdoor_hist["time"]):
                try:
                    dt_key = datetime.datetime.fromisoformat(t_str)
                    outdoor_map[dt_key] = outdoor_hist["temperature"][i]
                except Exception:
                    pass

        history = []
        for r in records:
             # Round to nearest hour
            if r.datetime.minute >= 30:
                 hour_dt = r.datetime + datetime.timedelta(minutes=60-r.datetime.minute, seconds=-r.datetime.second)
            else:
                 hour_dt = r.datetime - datetime.timedelta(minutes=r.datetime.minute, seconds=r.datetime.second)
            hour_dt = hour_dt.replace(microsecond=0)
            
            history.append({
                "datetime": r.datetime,
                "temperature": r.temperature,
                "humidity": r.humidity,
                "pressure": r.pressure,
                "outdoor_temperature": outdoor_map.get(hour_dt)
            })
    
    return analysis.analyze_room_data(history)

# Serve React App
frontend_dist = os.path.join(os.path.dirname(__file__), "../frontend-react/dist")

if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # Allow API calls to pass through
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
             raise HTTPException(status_code=404, detail="Not Found") # Let FastAPI handle routes
             
        # Serve index.html for any other path (SPA)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
