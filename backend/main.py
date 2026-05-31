from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime
import random
from dotenv import load_dotenv
from . import database, weather, outdoor_config, device_config, aircon_config
from pydantic import BaseModel, model_validator

load_dotenv()

# JST Timezone
JST = datetime.timezone(datetime.timedelta(hours=9))

def get_now_jst():
    return datetime.datetime.now(JST).replace(tzinfo=None) # Use naive JST to match DB


app = FastAPI(title="MyRoom API")

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
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    co2: Optional[int] = None

    @model_validator(mode="after")
    def at_least_one_measurement(self):
        if all(
            v is None
            for v in (self.temperature, self.humidity, self.pressure, self.co2)
        ):
            raise ValueError(
                "At least one of temperature, humidity, pressure, or co2 is required"
            )
        return self

class OutdoorLocation(BaseModel):
    latitude: float
    longitude: float
    name: str

class DeviceNameUpdate(BaseModel):
    name: str

class AirconNameUpdate(BaseModel):
    name: str

class AirconData(BaseModel):
    datetime: str
    ac_id: Optional[int] = 1
    name: Optional[str] = None
    room_temperature: Optional[float] = None
    target_temperature: Optional[float] = None
    humidity: Optional[int] = None
    mode: Optional[str] = None
    power: Optional[str] = None
    fan_speed: Optional[str] = None
    fan_swing: Optional[str] = None
    online: Optional[bool] = None
    model: Optional[str] = None

def _fetch_latest_aircon_record(
    db: Session, ac_id: Optional[int] = None
) -> Optional[database.AirconRecord]:
    if ac_id is not None:
        record = (
            db.query(database.AirconRecord)
            .filter(database.AirconRecord.ac_id == ac_id)
            .order_by(database.AirconRecord.datetime.desc())
            .first()
        )
        if record:
            return record

    return (
        db.query(database.AirconRecord)
        .order_by(database.AirconRecord.datetime.desc())
        .first()
    )


def _build_aircon_payload(record: Optional[database.AirconRecord]) -> dict:
    if record is None:
        return {}

    return {
        "ac_id": record.ac_id,
        "datetime": record.datetime,
        "name": aircon_config.get_display_name(record.ac_id, record.name),
        "source_name": record.name,
        "room_temperature": record.room_temperature,
        "target_temperature": record.target_temperature,
        "humidity": record.humidity,
        "mode": record.mode,
        "power": record.power,
        "fan_speed": record.fan_speed,
        "fan_swing": record.fan_swing,
        "online": bool(record.online) if record.online is not None else None,
        "model": record.model,
    }

def _discover_device_ids(db: Optional[Session]) -> List[int]:
    if database.DB_MOCK or db is None:
        return []
    rows = db.query(database.DHTRecord.device_id).distinct().all()
    return sorted({row[0] for row in rows if row[0] is not None})


def _discover_ac_ids(db: Optional[Session]) -> List[int]:
    if database.DB_MOCK or db is None:
        return []
    rows = db.query(database.AirconRecord.ac_id).distinct().all()
    return sorted({row[0] for row in rows if row[0] is not None})


def _build_latest_payload(device: int, db: Optional[Session]) -> dict:
    if database.DB_MOCK:
        outdoor = weather.get_outdoor_weather()
        offset = (device - 1) * 0.4
        payload = {
            "device_id": device,
            "datetime": get_now_jst(),
            "temperature": round(23.5 + offset + random.uniform(-0.5, 0.5), 1),
            "humidity": round(45.0 - offset + random.uniform(-1, 1), 1),
            "outdoor_temperature": outdoor["temperature"] if outdoor else None,
            "outdoor_humidity": outdoor["humidity"] if outdoor else None,
            "outdoor_pressure": outdoor["pressure"] if outdoor else None,
        }
        if device == 1:
            payload["pressure"] = round(1013.0 + random.uniform(-1, 1), 1)
        else:
            payload["co2"] = round(530 + random.uniform(-20, 20))
        return payload

    record = (
        db.query(database.DHTRecord)
        .filter(database.DHTRecord.device_id == device)
        .order_by(database.DHTRecord.datetime.desc())
        .first()
    )
    if not record:
        return {"device_id": device}

    outdoor = weather.get_outdoor_weather()
    return {
        "device_id": device,
        "datetime": record.datetime,
        "temperature": record.temperature,
        "humidity": record.humidity,
        "pressure": record.pressure if record.pressure else None,
        "co2": record.co2,
        "outdoor_temperature": outdoor["temperature"] if outdoor else None,
        "outdoor_humidity": outdoor["humidity"] if outdoor else None,
        "outdoor_pressure": outdoor["pressure"] if outdoor else None,
    }

# --- Endpoints ---

@app.get("/api/health")
@app.head("/api/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/outdoor-location")
def get_outdoor_location():
    return outdoor_config.get_location()


@app.put("/api/outdoor-location")
def update_outdoor_location(location: OutdoorLocation):
    try:
        return outdoor_config.save_location(
            location.latitude,
            location.longitude,
            location.name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/api/outdoor-location/search")
def search_outdoor_locations(q: str = "", limit: int = 8):
    if limit < 1 or limit > 20:
        limit = 8
    return {"results": weather.search_locations(q, count=limit)}


@app.get("/api/devices")
def get_devices(db: Session = Depends(database.get_db)):
    return {"devices": device_config.list_devices(_discover_device_ids(db))}


@app.put("/api/devices/{device_id}")
def update_device_name(device_id: int, body: DeviceNameUpdate, db: Session = Depends(database.get_db)):
    if device_id < 1:
        raise HTTPException(status_code=400, detail="device id must be >= 1")
    try:
        device = device_config.save_device_name(device_id, body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return device


@app.get("/api/aircon/units")
def get_aircon_units(db: Session = Depends(database.get_db)):
    return {"units": aircon_config.list_units(_discover_ac_ids(db))}


@app.put("/api/aircon/units/{ac_id}")
def update_aircon_unit_name(
    ac_id: int,
    body: AirconNameUpdate,
    db: Session = Depends(database.get_db),
):
    if ac_id < 1:
        raise HTTPException(status_code=400, detail="ac id must be >= 1")
    try:
        unit = aircon_config.save_unit_name(ac_id, body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return unit

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
            humidity=int(data.humidity) if data.humidity is not None else None,
            pressure=int(data.pressure) if data.pressure is not None else None,
            co2=data.co2,
        )
        
        db.add(record)
        db.commit()
        return {"status": "ok"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/latest")
def get_latest(device: int = 1, db: Session = Depends(database.get_db)):
    if device < 1:
        raise HTTPException(status_code=400, detail="device id must be >= 1")
    return _build_latest_payload(device, db)

from sqlalchemy import func

@app.get("/api/daily-stats")
def get_daily_stats(device: int = 1, db: Session = Depends(database.get_db)):
    if database.DB_MOCK:
        return database.generate_mock_daily()
        
    today = datetime.date.today()
    start_date = today - datetime.timedelta(days=30)
    
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
        "pressure": r.pressure if r.pressure else None,
        "co2": r.co2,
    } for r in records]
    
    df = pd.DataFrame(data)
    df['date'] = df['datetime'].dt.date
    daily_stats = []
    
    # Check if dataframe is not empty
    if not df.empty:
        for date, group in df.groupby('date'):
            daily_stat = {"date": date}

            if group['temperature'].notna().any():
                max_temp_row = group.loc[group['temperature'].idxmax()]
                min_temp_row = group.loc[group['temperature'].idxmin()]
                daily_stat.update({
                    "temp_max": float(max_temp_row['temperature']),
                    "temp_max_time": max_temp_row['datetime'].strftime("%H:%M"),
                    "temp_min": float(min_temp_row['temperature']),
                    "temp_min_time": min_temp_row['datetime'].strftime("%H:%M"),
                })

            if group['humidity'].notna().any():
                daily_stat.update({
                    "humid_max": float(group['humidity'].max()),
                    "humid_min": float(group['humidity'].min()),
                })

            if group['pressure'].notna().any():
                daily_stat.update({
                    "pressure_max": float(group['pressure'].max()),
                    "pressure_min": float(group['pressure'].min()),
                })

            if 'co2' in group.columns and group['co2'].notna().any():
                daily_stat.update({
                    "co2_max": float(group['co2'].max()),
                    "co2_min": float(group['co2'].min()),
                })

            daily_stats.append(daily_stat)
    
    # Sort by date
    daily_stats.sort(key=lambda x: x['date'])
    
    return daily_stats


@app.get("/api/aircon/daily-stats")
def get_aircon_daily_stats(ac_id: int = 1, db: Session = Depends(database.get_db)):
    if ac_id < 1:
        raise HTTPException(status_code=400, detail="ac_id must be >= 1")
    if database.DB_MOCK:
        return database.generate_mock_aircon_daily(ac_id)

    today = datetime.date.today()
    start_date = today - datetime.timedelta(days=30)

    import pandas as pd

    records = (
        db.query(database.AirconRecord)
        .filter(
            database.AirconRecord.datetime >= start_date,
            database.AirconRecord.ac_id == ac_id,
            database.AirconRecord.room_temperature.isnot(None),
        )
        .all()
    )

    if not records:
        return []

    data = [
        {
            "datetime": record.datetime,
            "room_temperature": record.room_temperature,
        }
        for record in records
    ]

    df = pd.DataFrame(data)
    df["date"] = df["datetime"].dt.date
    daily_stats = []

    for date, group in df.groupby("date"):
        max_row = group.loc[group["room_temperature"].idxmax()]
        min_row = group.loc[group["room_temperature"].idxmin()]
        daily_stats.append(
            {
                "date": date,
                "temp_max": float(max_row["room_temperature"]),
                "temp_max_time": max_row["datetime"].strftime("%H:%M"),
                "temp_min": float(min_row["room_temperature"]),
                "temp_min_time": min_row["datetime"].strftime("%H:%M"),
            }
        )

    daily_stats.sort(key=lambda x: x["date"])
    return daily_stats

@app.post("/api/aircon")
async def create_aircon_data(
    data: AirconData,
    db: Session = Depends(database.get_db),
):
    """Receive air conditioner status from AirCloud Home collector."""
    if database.DB_MOCK:
        return {"status": "mock_ok", "received": data}

    try:
        try:
            dt = datetime.datetime.strptime(data.datetime, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            dt = datetime.datetime.fromisoformat(data.datetime)

        record = database.AirconRecord(
            datetime=dt,
            ac_id=data.ac_id or 1,
            name=data.name,
            room_temperature=data.room_temperature,
            target_temperature=data.target_temperature,
            humidity=data.humidity,
            mode=data.mode,
            power=data.power,
            fan_speed=data.fan_speed,
            fan_swing=data.fan_swing,
            online=1 if data.online else 0 if data.online is not None else None,
            model=data.model,
        )

        db.add(record)
        db.commit()
        return {"status": "ok"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/aircon/latest")
def get_aircon_latest(ac_id: Optional[int] = None, db: Session = Depends(database.get_db)):
    if database.DB_MOCK:
        payload = database.generate_mock_aircon_latest()
        payload["name"] = aircon_config.get_display_name(
            payload["ac_id"], payload.get("source_name")
        )
        return payload

    record = _fetch_latest_aircon_record(db, ac_id)
    return _build_aircon_payload(record)


def _resolve_history_window(
    date: Optional[str] = None,
    range: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    end_time = get_now_jst()
    start_time = end_time - datetime.timedelta(hours=24)
    effective_range = range

    if start and end:
        try:
            start_time = datetime.datetime.fromisoformat(start)
            end_time = datetime.datetime.fromisoformat(end)
            if not range:
                delta = end_time - start_time
                if delta.days > 7:
                    effective_range = "month"
        except ValueError:
            pass
    elif range:
        if range == "day":
            start_time = end_time - datetime.timedelta(days=1)
        elif range == "week":
            start_time = end_time - datetime.timedelta(days=7)
        elif range == "month":
            start_time = end_time - datetime.timedelta(days=30)
        elif range == "year":
            start_time = end_time - datetime.timedelta(days=365)
    elif date:
        try:
            target_date = datetime.datetime.strptime(date, "%Y-%m-%d").date()
            start_time = datetime.datetime.combine(target_date, datetime.time.min)
            end_time = datetime.datetime.combine(target_date, datetime.time.max)
        except ValueError:
            pass

    return start_time, end_time, effective_range


def _normalize_pressure_hpa(pressure: Optional[int]) -> Optional[float]:
    if pressure is None:
        return None
    if pressure > 5000:
        return round(pressure / 100.0, 1)
    return float(pressure)


def _format_record_row(record: database.DHTRecord) -> dict:
    return {
        "datetime": record.datetime.strftime("%Y-%m-%d %H:%M:%S"),
        "device_id": record.device_id,
        "temperature": record.temperature,
        "humidity": record.humidity,
        "pressure": _normalize_pressure_hpa(record.pressure),
        "co2": record.co2,
    }


def _parse_record_datetime(value: str) -> datetime.datetime:
    try:
        return datetime.datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return datetime.datetime.fromisoformat(value)


@app.get("/api/records")
def get_sensor_records(
    device: int = 1,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(database.get_db),
):
    if device < 1:
        raise HTTPException(status_code=400, detail="device id must be >= 1")
    if limit < 1 or limit > 500:
        limit = 100
    if offset < 0:
        offset = 0

    end_time = get_now_jst()
    start_time = end_time - datetime.timedelta(days=7)
    if start and end:
        try:
            start_time = _parse_record_datetime(start)
            end_time = _parse_record_datetime(end)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="invalid start or end datetime") from exc

    if database.DB_MOCK:
        rows = database.generate_mock_history_for_range(start_time, end_time, device)
        rows.sort(key=lambda item: item["datetime"], reverse=True)
        total = len(rows)
        page = rows[offset : offset + limit]
        records = [
            {
                "datetime": row["datetime"].strftime("%Y-%m-%d %H:%M:%S"),
                "device_id": device,
                "temperature": row.get("temperature"),
                "humidity": row.get("humidity"),
                "pressure": row.get("pressure"),
                "co2": row.get("co2"),
            }
            for row in page
        ]
        return {"records": records, "total": total, "limit": limit, "offset": offset}

    total = (
        db.query(database.DHTRecord)
        .filter(
            database.DHTRecord.device_id == device,
            database.DHTRecord.datetime >= start_time,
            database.DHTRecord.datetime <= end_time,
        )
        .count()
    )
    rows = (
        db.query(database.DHTRecord)
        .filter(
            database.DHTRecord.device_id == device,
            database.DHTRecord.datetime >= start_time,
            database.DHTRecord.datetime <= end_time,
        )
        .order_by(database.DHTRecord.datetime.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "records": [_format_record_row(row) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.delete("/api/records")
def delete_sensor_record(
    device: int,
    datetime_value: str = Query(..., alias="datetime"),
    db: Session = Depends(database.get_db),
):
    if device < 1:
        raise HTTPException(status_code=400, detail="device id must be >= 1")
    try:
        dt = _parse_record_datetime(datetime_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid datetime") from exc

    if database.DB_MOCK:
        return {"status": "mock_ok", "deleted": True}

    deleted = (
        db.query(database.DHTRecord)
        .filter(
            database.DHTRecord.device_id == device,
            database.DHTRecord.datetime == dt,
        )
        .delete(synchronize_session=False)
    )
    if deleted == 0:
        raise HTTPException(status_code=404, detail="record not found")
    db.commit()
    return {"status": "ok", "deleted": True}


@app.get("/api/history")
def get_history(date: Optional[str] = None, range: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None, device: int = 1, db: Session = Depends(database.get_db)):
    start_time, end_time, effective_range = _resolve_history_window(date, range, start, end)

    if database.DB_MOCK:
        records_raw = database.generate_mock_history_for_range(start_time, end_time, device)
    else:
        records_raw_unformatted = db.query(database.DHTRecord).filter(
            database.DHTRecord.datetime >= start_time,
            database.DHTRecord.datetime <= end_time,
            database.DHTRecord.device_id == device
        ).order_by(database.DHTRecord.datetime.asc()).all()
        # Convert SQLAlchemy objects to dicts
        records_raw = []
        for r in records_raw_unformatted:
            records_raw.append({
                "datetime": r.datetime,
                "temperature": r.temperature,
                "humidity": r.humidity,
                "pressure": r.pressure,
                "co2": r.co2,
            })
    
    # Fetch outdoor history
    outdoor_hist = weather.get_outdoor_history(start_time.strftime("%Y-%m-%d"), end_time.strftime("%Y-%m-%d"))
    outdoor_map = {}
    if outdoor_hist:
        for i, t_str in enumerate(outdoor_hist["time"]):
            try:
                dt_key = datetime.datetime.fromisoformat(t_str)
                outdoor_map[dt_key.replace(tzinfo=None)] = {
                    "temp": outdoor_hist["temperature"][i],
                    "humid": outdoor_hist["humidity"][i],
                    "press": outdoor_hist["pressure"][i]
                }
            except Exception:
                pass

    # 日次集計は年表示のみ。月以下は生データ（10分間隔等）を返す
    if effective_range == 'year':
        daily_map = {}
        for d in records_raw:
            date_str = d['datetime'].strftime('%Y-%m-%d')
            if date_str not in daily_map:
                daily_map[date_str] = {'temps': [], 'humids': [], 'pressures': [], 'co2s': []}
            if d['temperature'] is not None: daily_map[date_str]['temps'].append(d['temperature'])
            if d['humidity'] is not None: daily_map[date_str]['humids'].append(d['humidity'])
            if d.get('pressure') is not None: daily_map[date_str]['pressures'].append(d['pressure'])
            if d.get('co2') is not None: daily_map[date_str]['co2s'].append(d['co2'])
        
        aggregated = []
        for date_str, values in daily_map.items():
            if not any([values['temps'], values['humids'], values['pressures'], values['co2s']]):
                continue
            # 日次ポイントは正午を代表時刻とする（0:00固定だとグラフ上すべて深夜に見える）
            dt = datetime.datetime.strptime(date_str, '%Y-%m-%d').replace(hour=12)
            
            out_target = dt
            out_data = outdoor_map.get(out_target, {})

            entry = {
                "datetime": dt,
                "outdoor_temperature": out_data.get("temp"),
                "outdoor_humidity": out_data.get("humid"),
                "outdoor_pressure": out_data.get("press"),
            }

            if values['temps']:
                entry.update({
                    "temperature": round(sum(values['temps']) / len(values['temps']), 1),
                    "temperature_min": min(values['temps']),
                    "temperature_max": max(values['temps']),
                })
            if values['humids']:
                entry.update({
                    "humidity": round(sum(values['humids']) / len(values['humids']), 1),
                    "humidity_min": min(values['humids']),
                    "humidity_max": max(values['humids']),
                })
            if values['pressures']:
                entry.update({
                    "pressure": round(sum(values['pressures']) / len(values['pressures']), 1),
                    "pressure_min": min(values['pressures']),
                    "pressure_max": max(values['pressures']),
                })
            if values['co2s']:
                entry.update({
                    "co2": round(sum(values['co2s']) / len(values['co2s'])),
                    "co2_min": min(values['co2s']),
                    "co2_max": max(values['co2s']),
                })

            aggregated.append(entry)
        aggregated.sort(key=lambda x: x['datetime'])
        return aggregated

    # For day/week, return all records with merged outdoor data
    formatted_records = []
    
    def get_outdoor(dt):
        dt_naive = dt.replace(tzinfo=None)
        if dt_naive.minute >= 30:
             hour_dt = dt_naive + datetime.timedelta(minutes=60-dt_naive.minute, seconds=-dt_naive.second)
        else:
             hour_dt = dt_naive - datetime.timedelta(minutes=dt_naive.minute, seconds=dt_naive.second)
        hour_dt = hour_dt.replace(microsecond=0)
        return outdoor_map.get(hour_dt, {})

    for r in records_raw:
        out_data = get_outdoor(r['datetime'])
        formatted_records.append({
            "datetime": r['datetime'],
            "temperature": r.get('temperature'),
            "humidity": r.get('humidity'),
            "pressure": r.get('pressure'),
            "co2": r.get('co2'),
            "outdoor_temperature": out_data.get("temp"),
            "outdoor_humidity": out_data.get("humid"),
            "outdoor_pressure": out_data.get("press")
        })
        
    formatted_records.sort(key=lambda x: x['datetime'])
    return formatted_records


@app.get("/api/aircon/history")
def get_aircon_history(
    date: Optional[str] = None,
    range: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    ac_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
):
    start_time, end_time, effective_range = _resolve_history_window(date, range, start, end)

    if database.DB_MOCK:
        records_raw = database.generate_mock_aircon_history_for_range(
            start_time, end_time, ac_id or 1
        )
    else:
        query = db.query(database.AirconRecord).filter(
            database.AirconRecord.datetime >= start_time,
            database.AirconRecord.datetime <= end_time,
        )
        if ac_id is not None:
            query = query.filter(database.AirconRecord.ac_id == ac_id)
        records_raw = []
        for record in query.order_by(database.AirconRecord.datetime.asc()).all():
            records_raw.append(
                {
                    "datetime": record.datetime,
                    "ac_id": record.ac_id,
                    "room_temperature": record.room_temperature,
                    "target_temperature": record.target_temperature,
                    "power": record.power,
                }
            )

    if effective_range == "year":
        daily_map = {}
        for row in records_raw:
            date_str = row["datetime"].strftime("%Y-%m-%d")
            if date_str not in daily_map:
                daily_map[date_str] = {"room_temps": [], "target_temps": []}
            if row.get("room_temperature") is not None:
                daily_map[date_str]["room_temps"].append(row["room_temperature"])
            if (
                row.get("target_temperature") is not None
                and row.get("power") is not None
                and str(row.get("power")).upper() != "OFF"
            ):
                daily_map[date_str]["target_temps"].append(row["target_temperature"])

        aggregated = []
        for date_str, values in daily_map.items():
            if not values["room_temps"] and not values["target_temps"]:
                continue
            dt = datetime.datetime.strptime(date_str, "%Y-%m-%d").replace(hour=12)
            entry = {"datetime": dt}
            if values["room_temps"]:
                entry.update(
                    {
                        "temperature": round(
                            sum(values["room_temps"]) / len(values["room_temps"]), 1
                        ),
                        "temperature_min": min(values["room_temps"]),
                        "temperature_max": max(values["room_temps"]),
                    }
                )
            if values["target_temps"]:
                entry["target_temperature"] = round(
                    sum(values["target_temps"]) / len(values["target_temps"]), 1
                )
            aggregated.append(entry)
        aggregated.sort(key=lambda x: x["datetime"])
        return aggregated

    formatted_records = []
    for row in records_raw:
        power = row.get("power")
        formatted_records.append(
            {
                "datetime": row["datetime"],
                "temperature": row.get("room_temperature"),
                "target_temperature": (
                    row.get("target_temperature")
                    if row.get("power") is None
                    or str(row.get("power")).upper() != "OFF"
                    else None
                ),
                "power": power,
            }
        )

    formatted_records.sort(key=lambda x: x["datetime"])
    return formatted_records

# Serve Next.js static export (frontend/out)
frontend_dist = os.path.join(os.path.dirname(__file__), "../frontend/out")

if os.path.exists(frontend_dist):
    next_static = os.path.join(frontend_dist, "_next")
    if os.path.isdir(next_static):
        app.mount("/_next", StaticFiles(directory=next_static), name="next_static")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            raise HTTPException(status_code=404, detail="Not Found")

        requested_file = os.path.join(frontend_dist, full_path)
        if os.path.isfile(requested_file):
            return FileResponse(requested_file)

        return FileResponse(os.path.join(frontend_dist, "index.html"))
