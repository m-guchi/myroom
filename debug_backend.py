from backend import database
from backend.database import SessionLocal, DHTRecord
import datetime
import pandas as pd

def debug_daily_stats():
    db = SessionLocal()
    start_date = datetime.date.today() - datetime.timedelta(days=7)
    
    print(f"Querying from {start_date}")
    records = db.query(DHTRecord).filter(DHTRecord.datetime >= start_date).all()
    print(f"Found {len(records)} records")

    if not records:
        print("No records found")
        return

    data = [{
        "datetime": r.datetime,
        "temperature": r.temperature,
        "humidity": r.humidity
    } for r in records]
    
    df = pd.DataFrame(data)
    print("DataFrame created")
    print(df.head())
    
    df['date'] = df['datetime'].dt.date
    print("Date column added")
    
    daily_stats = []
    for date, group in df.groupby('date'):
        print(f"Processing {date}")
        max_temp_row = group.loc[group['temperature'].idxmax()]
        min_temp_row = group.loc[group['temperature'].idxmin()]
        
        stat = {
            "date": date,
            "temp_max": max_temp_row['temperature'],
            "temp_max_time": max_temp_row['datetime'].strftime("%H:%M"),
            "temp_min": min_temp_row['temperature'],
            "temp_min_time": min_temp_row['datetime'].strftime("%H:%M"),
        }
        print(stat)
        daily_stats.append(stat)

if __name__ == "__main__":
    debug_daily_stats()
