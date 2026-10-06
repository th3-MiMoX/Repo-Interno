from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from typing import Optional
from datetime import datetime
import re

class UserProfileResponse(BaseModel):
    uuid: str
    username: Optional[str] = None
    nombre: str
    apellido: str
    es_admin: bool
    activo: bool
    updated_at: Optional[datetime] = None

class UserUpdateRequest(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    old_password: Optional[str] = None
    new_password: Optional[str] = None
    confirm_password: Optional[str] = None

    @field_validator("new_password")
    @classmethod
    def nueva_strength(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if len(v) < 8:
            raise ValueError("La contraseña debe de tener al menos 8 caracteres.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("La contraseña debe de tener al menos una mayúscula.")
        if not re.search(r"[0-9]", v):
            raise ValueError("La contraseña debe de tener al menos un número.")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("La contraseña debe de tener al menos un carácter especial.")

        return v

    @model_validator(mode="after")
    def validar_cambio_password(self) -> "UserUpdateRequest":
        campos = (self.old_password, self.new_password, self.confirm_password)
        if any(c is not None for c in campos) and not all(c is not None for c in campos):
            raise ValueError(
                "Para cambiar tu contraseña debes indicar la contraseña actual, la nueva y su confirmación."
            )
        if self.new_password is not None and self.new_password != self.confirm_password:
            raise ValueError("La nueva contraseña y su confirmación no coinciden.")
        return self

class AdminUsersUpdateRequest(BaseModel):
    username: Optional[str] = Field(default=None, min_length=9, max_length=10)
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    es_admin:  Optional[bool] = None
    activo:  Optional[bool] = None
    new_password: Optional[str] = None

    @field_validator("new_password")
    @classmethod
    def nueva_strength(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if len(v) < 8:
            raise ValueError("La contraseña debe de tener al menos 8 caracteres.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("La contraseña debe de tener al menos una mayúscula.")
        if not re.search(r"[0-9]", v):
            raise ValueError("La contraseña debe de tener al menos un número.")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("La contraseña debe de tener al menos un carácter especial.")

        return v

# By: Th3-MiMoX