import os
import sys
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.getenv("DB_USER", "user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "myroom")

try:
    from sqlalchemy import create_engine, text
    url = f"mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    engine = create_engine(url, connect_args={"connection_timeout": 5})
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print(f"Database connection OK ({DB_HOST}:{DB_PORT}/{DB_NAME})")
    sys.exit(0)
except Exception as e:
    print(f"Database connection failed: {e}", file=sys.stderr)
    sys.exit(1)
