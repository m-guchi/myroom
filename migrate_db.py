from dotenv import load_dotenv
import os
from sqlalchemy import create_engine, text

load_dotenv()

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "3307")
DB_NAME = os.getenv("DB_NAME", "insight_myroom")

DATABASE_URL = f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

def migrate():
    print(f"Connecting to database at {DB_HOST}:{DB_PORT}...")
    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as conn:
            # Try to add column
            try:
                print("Checking if 'device_id' column exists...")
                result = conn.execute(text("SHOW COLUMNS FROM dht LIKE 'device_id'"))
                if result.fetchone():
                    print("Column 'device_id' already exists.")
                else:
                    print("Adding column 'device_id'...")
                    conn.execute(text("ALTER TABLE dht ADD COLUMN device_id INT NOT NULL DEFAULT 1"))
                    
                    # Update Primary Key
                    print("Updating Primary Key to (datetime, device_id)...")
                    # Note: This might fail if duplicates exist or if PK name is different.
                    # Assuming default PK which is usually just PRIMARY
                    try:
                        conn.execute(text("ALTER TABLE dht DROP PRIMARY KEY"))
                        conn.execute(text("ALTER TABLE dht ADD PRIMARY KEY (datetime, device_id)"))
                        print("Primary Key updated successfully.")
                    except Exception as pk_e:
                        print(f"Failed to update Primary Key (might be complex to automate): {pk_e}")
                        
                print("Migration step 1 completed.")
            except Exception as e:
                print(f"Error during migration: {e}")

    except Exception as e:
        print(f"Database connection failed: {e}")

if __name__ == "__main__":
    migrate()
