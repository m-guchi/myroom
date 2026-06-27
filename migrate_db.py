from dotenv import load_dotenv
import os
import sys
from sqlalchemy import create_engine, text

load_dotenv()

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "3307")
DB_NAME = os.getenv("DB_NAME", "myroom")

# DDL (ALTER TABLE) requires a privileged user. Set these for migrations only.
DB_ADMIN_USER = os.getenv("DB_ADMIN_USER")
DB_ADMIN_PASSWORD = os.getenv("DB_ADMIN_PASSWORD")

SENSOR_TABLE = "sensor_readings"
LEGACY_SENSOR_TABLE = "dht"

MANUAL_MIGRATION_SQL = """
-- Run as a MySQL user with ALTER privilege (e.g. root):
USE `{db_name}`;

-- Rename legacy table (skip if already renamed)
RENAME TABLE dht TO sensor_readings;

-- Add CO2 column (skip if already exists)
ALTER TABLE sensor_readings ADD COLUMN co2 INT NULL;

-- Add illuminance column (skip if already exists)
ALTER TABLE sensor_readings ADD COLUMN illuminance FLOAT NULL;

-- Add temperature_dht11 column (skip if already exists)
ALTER TABLE sensor_readings ADD COLUMN temperature_dht11 FLOAT NULL;
""".strip()


def _database_url(user: str, password: str) -> str:
    return f"mysql+mysqlconnector://{user}:{password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(text(f"SHOW TABLES LIKE '{table_name}'"))
    return result.fetchone() is not None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(text(f"SHOW COLUMNS FROM `{table_name}` LIKE '{column_name}'"))
    return result.fetchone() is not None


def _print_manual_migration_hint() -> None:
    print("\nThe application DB user does not have ALTER privilege.")
    print("Run the following SQL as an admin user (e.g. root), then re-run this script to verify:\n")
    print(MANUAL_MIGRATION_SQL.format(db_name=DB_NAME))
    print("\nAlternatively, set DB_ADMIN_USER and DB_ADMIN_PASSWORD in .env for migrations.")


def _ensure_sensor_table(conn) -> str:
    if _table_exists(conn, SENSOR_TABLE):
        print(f"Table '{SENSOR_TABLE}' already exists.")
        return SENSOR_TABLE

    if _table_exists(conn, LEGACY_SENSOR_TABLE):
        print(f"Renaming table '{LEGACY_SENSOR_TABLE}' to '{SENSOR_TABLE}'...")
        conn.execute(
            text(f"RENAME TABLE `{LEGACY_SENSOR_TABLE}` TO `{SENSOR_TABLE}`")
        )
        print("Table renamed successfully.")
        return SENSOR_TABLE

    print(f"Creating table '{SENSOR_TABLE}'...")
    conn.execute(
        text(
            f"""
            CREATE TABLE `{SENSOR_TABLE}` (
                datetime DATETIME NOT NULL,
                device_id INT NOT NULL DEFAULT 1,
                temperature FLOAT NULL,
                temperature_dht11 FLOAT NULL,
                humidity INT NULL,
                pressure INT NULL,
                co2 INT NULL,
                illuminance FLOAT NULL,
                PRIMARY KEY (datetime, device_id)
            )
            """
        )
    )
    print(f"Table '{SENSOR_TABLE}' created.")
    return SENSOR_TABLE


def migrate():
    migrate_user = DB_ADMIN_USER or DB_USER
    migrate_password = DB_ADMIN_PASSWORD if DB_ADMIN_USER else DB_PASSWORD

    if not migrate_user or not migrate_password:
        print("Error: DB credentials are not configured.")
        sys.exit(1)

    using_admin = bool(DB_ADMIN_USER)
    print(f"Connecting to database at {DB_HOST}:{DB_PORT} as {migrate_user}...")
    if not using_admin:
        print("Note: Using app DB user. Set DB_ADMIN_USER/DB_ADMIN_PASSWORD if ALTER is denied.")

    try:
        engine = create_engine(_database_url(migrate_user, migrate_password))
        with engine.begin() as conn:
            sensor_table = _ensure_sensor_table(conn)

            print("Checking if 'device_id' column exists...")
            if _column_exists(conn, sensor_table, "device_id"):
                print("Column 'device_id' already exists.")
            else:
                print("Adding column 'device_id'...")
                conn.execute(
                    text(
                        f"ALTER TABLE `{sensor_table}` "
                        "ADD COLUMN device_id INT NOT NULL DEFAULT 1"
                    )
                )

                print("Updating Primary Key to (datetime, device_id)...")
                try:
                    conn.execute(text(f"ALTER TABLE `{sensor_table}` DROP PRIMARY KEY"))
                    conn.execute(
                        text(
                            f"ALTER TABLE `{sensor_table}` "
                            "ADD PRIMARY KEY (datetime, device_id)"
                        )
                    )
                    print("Primary Key updated successfully.")
                except Exception as pk_e:
                    print(f"Failed to update Primary Key (might be complex to automate): {pk_e}")

            print("Checking if 'co2' column exists...")
            if _column_exists(conn, sensor_table, "co2"):
                print("Column 'co2' already exists.")
            else:
                print("Adding column 'co2'...")
                conn.execute(text(f"ALTER TABLE `{sensor_table}` ADD COLUMN co2 INT NULL"))
                print("Column 'co2' added.")

            print("Checking if 'illuminance' column exists...")
            if _column_exists(conn, sensor_table, "illuminance"):
                print("Column 'illuminance' already exists.")
            else:
                print("Adding column 'illuminance'...")
                conn.execute(
                    text(f"ALTER TABLE `{sensor_table}` ADD COLUMN illuminance FLOAT NULL")
                )
                print("Column 'illuminance' added.")

            print("Checking if 'temperature_dht11' column exists...")
            if _column_exists(conn, sensor_table, "temperature_dht11"):
                print("Column 'temperature_dht11' already exists.")
            else:
                print("Adding column 'temperature_dht11'...")
                conn.execute(
                    text(
                        f"ALTER TABLE `{sensor_table}` "
                        "ADD COLUMN temperature_dht11 FLOAT NULL"
                    )
                )
                print("Column 'temperature_dht11' added.")

            print("Checking if 'aircon' table exists...")
            result = conn.execute(text("SHOW TABLES LIKE 'aircon'"))
            if result.fetchone():
                print("Table 'aircon' already exists.")
            else:
                print("Creating table 'aircon'...")
                conn.execute(text("""
                    CREATE TABLE aircon (
                        datetime DATETIME NOT NULL,
                        ac_id INT NOT NULL DEFAULT 1,
                        name VARCHAR(100) NULL,
                        room_temperature FLOAT NULL,
                        target_temperature FLOAT NULL,
                        humidity INT NULL,
                        mode VARCHAR(20) NULL,
                        power VARCHAR(10) NULL,
                        fan_speed VARCHAR(10) NULL,
                        fan_swing VARCHAR(20) NULL,
                        online TINYINT NULL,
                        model VARCHAR(100) NULL,
                        PRIMARY KEY (datetime, ac_id)
                    )
                """))
                print("Table 'aircon' created.")

        print("Migration completed.")

    except Exception as e:
        err = str(e)
        if "1142" in err or "ALTER command denied" in err:
            _print_manual_migration_hint()
            sys.exit(1)
        print(f"Database connection failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate()
