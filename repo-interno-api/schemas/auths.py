import re
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class RegisterRequest(BaseModel):

    username: str = Field(..., max_length=10, min_length=9)
    nombre: str
    apellido: str
    password: str
    es_admin: bool = False
    activo: bool = True

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe de tener al menos 8 caracteres.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("La contraseña debe de tener al menos una mayúscula.")
        if not re.search(r"[0-9]", v):
            raise ValueError("La contraseña debe de tener al menos un número.")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("La contraseña debe de tener al menos un carácter especial.")

        return v

class RegisterResponse(BaseModel):
    uuid: str
    username: str
    nombre: str
    apellido: str
    es_admin: bool
    activo: bool
    created_at: datetime
    mensaje: str = "Usuario registrado exitosamente"

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RefresRequest(BaseModel):
    refresh_token: str

class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# By: Th3-MiMoX