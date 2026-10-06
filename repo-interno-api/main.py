from contextlib import asynccontextmanager
import logging
from dotenv import load_dotenv
import uvicorn
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database.connect_db import engine, get_db, check_database_connection, get_settings
from database.create_db import create_database
from auth.router import router as auth_router
from index.router import router as index_router
from user.router import router as user_router
from dashboard.router import router as dashboard_router

settings = get_settings()

def initialize_database() -> None:
    logging.info("📊 Verificando base de datos...")

    if not check_database_connection():
        logging.info("📊 Base de datos no disponible. Intentando crearla...")

        if not create_database():
            raise RuntimeError(
                "❌ No se pudo crear la base de datos. "
                "Verifica que MySQL esté corriendo y que las credenciales en .env sean correctas."
            )

        # logging.info("✅ Base de datos creada. Ejecuta 'uv run alembic upgrade head' para crear las tablas.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Ciclo de vida de la aplicación (reemplaza @app.on_event).

    Todo lo que está ANTES del 'yield' se ejecuta al iniciar.
    Todo lo que está DESPUÉS del 'yield' se ejecuta al cerrar.

    Si initialize_database() lanza RuntimeError, FastAPI NO arranca
    y muestra el error en consola. Esto es intencional: mejor fallar
    de forma clara que arrancar sin BD y dar errores 500 en cada request.
    """
    # ── Startup ──
    logging.info("🚀 Iniciando aplicación...")
    initialize_database()
    logging.info("🚀 Aplicación lista")

    yield  # La app corre aquí

    # ── Shutdown ──
    logging.warning("🔒 Cerrando aplicación...")
    engine.dispose()  # Cierra todas las conexiones del pool
    logging.warning("🔒 Conexiones cerradas")

app = FastAPI(
    title="API para Documentacion interna",
    version="1.0",
    lifespan=lifespan,
)

# ==================== CORS ====================
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== ROUTERS ====================
app.include_router(auth_router)
app.include_router(index_router)
app.include_router(user_router)
app.include_router(dashboard_router)

if __name__ == "__main__":

    logging.info("🚀 Iniciando servidor FastAPI...")
    
    uvicorn.run(
        "main:app", 
        host="localhost", 
        port=8000, 
        reload=True,  # Recarga automática en desarrollo
        log_level="info"
    )

# By: Th3-MiMoX