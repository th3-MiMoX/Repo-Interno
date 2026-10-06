from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from database.config_db import get_settings
import logging

settings = get_settings()

engine = create_engine(
    settings.db_url,
    pool_pre_ping = True,
    pool_recycle = 3600,
    echo = False
)

SessionLocaL = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocaL()
    try:
        yield db
    finally:
        db.close()

def check_database_connection():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        logging.info("✅ Conexión a MySQL exitosa")
        return True
    except Exception as e:
        logging.warning(f"❌ Error al conectar con MySQL: {e}")
        return False

# By: Th3-MiMoX