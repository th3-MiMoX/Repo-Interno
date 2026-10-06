from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class CategoriaResponse(BaseModel):
    uuid: str
    nombre: str


class CategoriaRequest(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)

class DocumentsResponse(BaseModel):
    uuid: str
    usuario_id: str
    categoria_id: str
    file_name: str
    descripcion: str
    activo: bool
    created_at: datetime

class UserDocumentResponse(BaseModel):
    uuid: str
    file_name: str
    categoria: Optional[CategoriaResponse] = None
    descripcion: str
    activo: bool
    created_at: datetime
    updated_at: datetime

class DocumentUpdateRequest(BaseModel):
    """
    Actualización parcial de un documento propio. Solo se permite editar
    metadatos (descripción/categoría) — reemplazar el archivo en sí requiere
    subir un documento nuevo, no un PATCH sobre este.
    """
    file_name: Optional[str] = Field(default=None, min_length=1, max_length=250)
    descripcion: Optional[str] = Field(default=None, min_length=1, max_length=250)
    categoria_id: Optional[str] = None
    activo: Optional[bool] = None


class PaginatedDocumentsResponse(BaseModel):
    items: list[DocumentsResponse]
    total: int


# By: Th3-MiMoX