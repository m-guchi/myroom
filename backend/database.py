import os
from sqlalchemy import create_engine, Column, Integer, Float, DateTime, Date, String
from sqlalchemy.orm import declarative_base, sessionmaker
import datetime
import random
from dotenv import load_dotenv

load_dotenv()

# Environment variables
DB_USER = os.getenv("DB_USER", "user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "myroom")
DB_MOCK = os.getenv("DB_MOCK", "true").lower() == "true"

Base = declarative_base()

class DHTRecord(Base):
    __tablename__ = "dht"
    
    # Existing schema has composite PK or just datetime/pressure as PK. 
    # Setting datetime as PK for SQLAlchemy mapping.
    datetime = Column(DateTime, primary_key=True)
    device_id = Column(Integer, primary_key=True, default=1)
    
    temperature = Column(Float, nullable=True)
    humidity = Column(Integer, nullable=True)
    pressure = Column(Integer, nullable=True)
    co2 = Column(Integer, nullable=True)


class AirconRecord(Base):
    __tablename__ = "aircon"

    datetime = Column(DateTime, primary_key=True)
    ac_id = Column(Integer, primary_key=True, default=1)

    name = Column(String(100), nullable=True)
    room_temperature = Column(Float, nullable=True)
    target_temperature = Column(Float, nullable=True)
    humidity = Column(Integer, nullable=True)
    mode = Column(String(20), nullable=True)
    power = Column(String(10), nullable=True)
    fan_speed = Column(String(10), nullable=True)
    fan_swing = Column(String(20), nullable=True)
    online = Column(Integer, nullable=True)
    model = Column(String(100), nullable=True)

# DHTDaily model removed as we aggregate from dht table directly

# Mock Data Generator
def generate_mock_history_for_range(
    start_time: datetime.datetime,
    end_time: datetime.datetime,
    device_id: int = 1,
) -> list:
    """指定期間のモック履歴のみ生成（全件フィルタより高速）。"""
    data = []
    start_naive = start_time.replace(tzinfo=None) if start_time.tzinfo else start_time
    end_naive = end_time.replace(tzinfo=None) if end_time.tzinfo else end_time
    t = end_naive
    interval = datetime.timedelta(minutes=10)
    temp_offset = 0 if device_id == 1 else -2.5
    humid_offset = 0 if device_id == 1 else 5
    co2_offset = 0 if device_id == 1 else 80

    while t >= start_naive:
        temp = 20 + temp_offset + 5 * (1 + math.sin(t.hour / 24 * 2 * math.pi)) + random.uniform(-1, 1)
        humid = 50 + humid_offset + 10 * (1 + math.cos(t.hour / 24 * 2 * math.pi)) + random.uniform(-2, 2)
        co2 = 450 + co2_offset + 150 * (1 + math.sin(t.hour / 24 * 2 * math.pi)) + random.uniform(-30, 30)
        entry = {
            "datetime": t,
            "temperature": round(temp, 1),
            "humidity": round(humid, 1),
            "co2": round(co2),
        }
        if device_id == 1:
            entry["pressure"] = round(1013 + random.uniform(-5, 5), 1)
        data.append(entry)
        t -= interval

    data.reverse()
    return data


def generate_mock_history():
    """直近2年分（後方互換）。"""
    end = datetime.datetime.now()
    start = end - datetime.timedelta(days=730)
    return generate_mock_history_for_range(start, end)

def generate_mock_aircon_latest() -> dict:
    return {
        "ac_id": 1,
        "datetime": datetime.datetime.now(),
        "name": "リビングエアコン",
        "source_name": "リビングエアコン",
        "room_temperature": round(24.5 + random.uniform(-0.3, 0.3), 1),
        "target_temperature": 26.0,
        "humidity": 50,
        "mode": "COOLING",
        "power": "ON",
        "fan_speed": "AUTO",
        "fan_swing": "AUTO",
        "online": True,
        "model": "RAS-KW4025D",
    }


def generate_mock_aircon_history_for_range(
    start_time: datetime.datetime,
    end_time: datetime.datetime,
    ac_id: int = 1,
) -> list:
    """指定期間のエアコンモック履歴を生成。"""
    data = []
    start_naive = start_time.replace(tzinfo=None) if start_time.tzinfo else start_time
    end_naive = end_time.replace(tzinfo=None) if end_time.tzinfo else end_time
    t = end_naive
    interval = datetime.timedelta(minutes=10)
    target = 26.0

    while t >= start_naive:
        if t.hour in (8, 9, 18, 19):
            target = 24.0 if t.hour < 12 else 27.0
        room = (
            22
            + 5 * (1 + math.sin(t.hour / 24 * 2 * math.pi))
            + random.uniform(-0.8, 0.8)
        )
        data.append(
            {
                "datetime": t,
                "ac_id": ac_id,
                "room_temperature": round(room, 1),
                "target_temperature": target,
            }
        )
        t -= interval

    data.reverse()
    return data


def generate_mock_daily():
    data = []
    today = datetime.date.today()
    for i in range(30):
        d = today - datetime.timedelta(days=i)
        data.append({
            "date": d,
            "temp_max": round(25 + random.uniform(0, 5), 1),
            "temp_min": round(15 + random.uniform(0, 5), 1),
            "humid_max": round(60 + random.uniform(0, 10), 1),
            "humid_min": round(40 + random.uniform(0, 10), 1)
        })
    return data

import math

# Database Connection
if not DB_MOCK:
    DATABASE_URL = f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
else:
    engine = None
    SessionLocal = None

def get_db():
    if DB_MOCK:
        yield None
    else:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()
