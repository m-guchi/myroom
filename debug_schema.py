from backend.database import engine
from sqlalchemy import text

def inspect_schema():
    if engine is None:
        print("Error: Engine is None")
        return

    with engine.connect() as conn:
        try:
            result = conn.execute(text("DESCRIBE dht"))
            print("Table 'dht' columns:")
            for row in result:
                print(row)
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    inspect_schema()
