from fastapi import (
    APIRouter,
    Depends,
    Query,
    HTTPException,
    status
)
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session
from database.models import Documento, CategoriaDocumento
from database.connect_db import get_db
from utils.utils import format_bytes_uuid
from schemas.dashboard import CategoriaResponse, PaginatedDocumentsResponse
from dashboard.router import document_to_response
import os

router = APIRouter(prefix="/index", tags=["Index"])

@router.get("/categorias", response_model=list[CategoriaResponse])
async def list_categorias(
    db: Session = Depends(get_db)
):
    categorias = db.query(CategoriaDocumento).order_by(CategoriaDocumento.nombre).all()
    return [CategoriaResponse(
        uuid=c.uuid.hex(),
        nombre=c.nombre
    ) for c in categorias]


@router.get("/documentos", response_model=PaginatedDocumentsResponse)
async def list_document(
    categoria_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=9, ge=1, le=50),
    db: Session = Depends(get_db),
):
    query = db.query(Documento).filter(Documento.activo == True)

    if categoria_id:
        query = query.filter(Documento.categoria_id == format_bytes_uuid(categoria_id))

    if search:
        patron = f"%{search}%"
        query = query.filter(
            or_(Documento.file_name.ilike(patron), Documento.descripcion.ilike(patron))
        )

    total = query.count()
    documentos = (
        query.order_by(Documento.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return PaginatedDocumentsResponse(
        items=[document_to_response(d) for d in documentos],
        total=total,
    )

@router.get("/document/{doc_uuid}/download")
async def download_doc(
    doc_uuid: str,
    db: Session = Depends(get_db)
):
    doc_id = format_bytes_uuid(doc_uuid)
    doc = db.query(Documento).filter(Documento.uuid == doc_id).filter(Documento.activo == True).first()

    if not doc or not os.path.exists(str(doc.storage_path)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Archivo no encontrado"
        )

    return FileResponse(
        path=doc.storage_path,
        filename=doc.file_name,
        media_type=doc.content_type,
        content_disposition_type="inline",
    )

# By: Th3-MiMoX