from backend import database
from backend.database import SessionLocal, SensorRecord
import datetime

def debug_latest():
    db = SessionLocal()
    print("Querying latest record...")
    try:
        record = db.query(SensorRecord).order_by(SensorRecord.datetime.desc()).first()
        if not record:
            print("No record found.")
            return

        data = {
            "datetime": record.datetime,
            "temperature": record.temperature,
            "humidity": record.humidity,
            "pressure": getattr(record, "pressure", None) # Check if pressure exists
        }
        print("Raw Data:", data)
        
        # Simulation of response logic
        response = {
            "datetime": record.datetime,
            "temperature": record.temperature,
            "humidity": record.humidity,
            "pressure": float(record.pressure) / 100.0 if record.pressure else None
        }
        print("Response Data:", response)

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_latest()
