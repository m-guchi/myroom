import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from backend import database

load_dotenv()

def migrate():
    # 接続確認
    db_gen = database.get_db()
    db = next(db_gen)
    
    try:
        print("Checking for records with pressure in Pa (value > 5000)...")
        
        # 件数確認
        count_query = text("SELECT COUNT(*) FROM dht WHERE pressure > 5000")
        count = db.execute(count_query).scalar()
        
        if count == 0:
            print("No records found that need migration.")
            return

        print(f"Found {count} records to convert.")
        
        # 変換実行 (Pa -> hPa)
        update_query = text("UPDATE dht SET pressure = pressure / 100 WHERE pressure > 5000")
        db.execute(update_query)
        db.commit()
        
        print("Successfully converted all records to hPa.")
        
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
