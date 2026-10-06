from dotenv import load_dotenv
import os
from database.connect_db import get_settings
import pymysql
import logging

settings = get_settings()

def create_database():
    try:
        connection = pymysql.connect(
            host = settings.DB_HOST,
            port = settings.DB_PORT,
            user = settings.DB_USER,
            passwd = settings.DB_PASSWORD,
            charset = 'utf8mb4'
        )

        with connection.cursor() as cursor:
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS {settings.DB_NAME} "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )

        connection.close()
        logging.info(f"✅ Base de datos '{settings.DB_NAME}' creada o ya existe")
        return True

    except Exception as e:
        logging.warning(f"❌ Error al crear la base de datos: {e}")
        return False
    
if __name__ == '__main__':
    create_database()

# By: Th3-MiMoX