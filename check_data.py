from backend.database import SessionLocal, DHTRecord
from sqlalchemy import func

def check_data():
    if SessionLocal is None:
        print("Error: SessionLocal is None. Check DB_MOCK setting.")
        return

    db = SessionLocal()
    try:
        count = db.query(func.count(DHTRecord.datetime)).scalar()
        print(f"Total records in 'dht': {count}")
        
        latest = db.query(DHTRecord).order_by(DHTRecord.datetime.desc()).first()
        if latest:
            print(f"Latest record: {latest.datetime}, Temp: {latest.temperature}, Humid: {latest.humidity}")
        else:
            print("No records found.")
            
    except Exception as e:
        print(f"Error querying data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_data()
