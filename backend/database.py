import os
from sqlalchemy import create_engine, Column, Integer, Float, DateTime, Date, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime
import random
from dotenv import load_dotenv

load_dotenv()

# Environment variables
DB_USER = os.getenv("DB_USER", "user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "insight_myroom")
DB_MOCK = os.getenv("DB_MOCK", "true").lower() == "true"

Base = declarative_base()

class DHTRecord(Base):
    __tablename__ = "dht"
    
    # Existing schema has composite PK or just datetime/pressure as PK. 
    # Setting datetime as PK for SQLAlchemy mapping.
    datetime = Column(DateTime, primary_key=True)
    device_id = Column(Integer, primary_key=True, default=1)
    
    temperature = Column(Float)
    humidity = Column(Integer)
    pressure = Column(Integer)

# DHTDaily model removed as we aggregate from dht table directly

# Mock Data Generator
def generate_mock_history():
    data = []
    now = datetime.datetime.now()
    for i in range(24 * 6):  # 24 hours, 10 min interval
        t = now - datetime.timedelta(minutes=10 * i)
        # Generate somewhat realistic sine wave data
        temp = 20 + 5 * (1 + math.sin(t.hour / 24 * 2 * math.pi)) + random.uniform(-1, 1)
        humid = 50 + 10 * (1 + math.cos(t.hour / 24 * 2 * math.pi)) + random.uniform(-2, 2)
        pressure = 1013 + random.uniform(-5, 5)
        data.append({
            "datetime": t,
            "temperature": round(temp, 1),
            "humidity": round(humid, 1),
            "pressure": round(pressure, 1)
        })
    return data

def generate_mock_daily():
    data = []
    today = datetime.date.today()
    for i in range(7):
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
