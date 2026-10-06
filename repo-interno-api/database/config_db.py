from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):

    # BD
    DB_HOST: str
    DB_PORT: int
    DB_USER: str
    DB_PASSWORD: str
    DB_NAME: str

    # JWT
    JWT_SECRET_KEY: str
    JWT_REFRESH_SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:4321"

    # Almacenamiento de documentos — ruta relativa al directorio desde donde se
    # ejecuta la app (o absoluta, recomendado en producción). Nunca hardcodear
    UPLOAD_DIR: str = "../uploaded_files"

    # pydantic-settings v2: model_config reemplaza a la inner class Config
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",  # Ignorar variables del .env que no estén declaradas aquí
    )

    @property
    def db_url(self) -> str:
        return (
            f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )
    
    @property
    def allowed_origins_list(self) -> list[str]:
        """Convierte el string de orígenes separados por comas en lista para CORS."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
    
@lru_cache()
def get_settings() -> Settings:
    return Settings()

# By: Th3-MiMoX