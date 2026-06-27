from backend.database import engine, Base, SensorRecord

def init_db():
    if engine is None:
        print("Error: Database engine is None. Check DB_MOCK setting.")
        return

    print("Creating tables...")
    try:
        Base.metadata.create_all(bind=engine)
        print("Tables created successfully!")
    except Exception as e:
        print(f"Error creating tables: {e}")

if __name__ == "__main__":
    init_db()
