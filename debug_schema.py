from backend.database import engine, SENSOR_READINGS_TABLE, LEGACY_SENSOR_READINGS_TABLE
from sqlalchemy import text

def inspect_schema():
    if engine is None:
        print("Error: Engine is None")
        return

    with engine.connect() as conn:
        for table_name in (SENSOR_READINGS_TABLE, LEGACY_SENSOR_READINGS_TABLE):
            try:
                result = conn.execute(text(f"DESCRIBE `{table_name}`"))
                print(f"Table '{table_name}' columns:")
                for row in result:
                    print(row)
                return
            except Exception:
                continue
        print("Neither sensor_readings nor legacy dht table found.")

if __name__ == "__main__":
    inspect_schema()
