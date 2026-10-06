import os
import uuid as uuid_lib
from fastapi import (
    APIRouter,
    Depends,
    UploadFile,
    File,
    Form,
    HTTPException,
    Query,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from auth.dependencies import get_current_user, get_current_active_admin
from auth.security import hash_password, verify_password
from schemas.dashboard import DocumentsResponse, CategoriaResponse, CategoriaRequest, UserDocumentResponse, DocumentUpdateRequest
from schemas.users import UserProfileResponse, UserUpdateRequest
from database.models import Usuario, Documento, CategoriaDocumento
from database.connect_db import get_db
from database.config_db import get_settings
from utils.utils import format_bytes_uuid

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

settings = get_settings()
STORAGE_DIR = os.path.abspath(settings.UPLOAD_DIR)
os.makedirs(STORAGE_DIR, exist_ok=True)

# Content-Type declarado por el cliente -> extensión esperada. Se valida
# contra AMBOS (content-type y extensión real del archivo) porque el
# Content-Type de un multipart lo fija el cliente y es trivialmente falsificable.
ALLOWED_CONTENT_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
}
MAX_FILE_SIZE = 20 * 1024 * 1024


def document_to_response(doc: Documento) -> DocumentsResponse:
    return DocumentsResponse(
        uuid=doc.uuid.hex(),
        usuario_id=doc.usuario_id.hex(),
        file_name=doc.file_name,
        categoria_id=doc.categoria_id.hex(),
        descripcion=doc.descripcion,
        activo=doc.activo,
        created_at=doc.created_at,
    )


def _document_to_user_response(doc: Documento) -> UserDocumentResponse:
    return UserDocumentResponse(
        uuid=doc.uuid.hex(),
        file_name=doc.file_name,
        categoria=(
            CategoriaResponse(uuid=doc.categoria.uuid.hex(), nombre=doc.categoria.nombre)
            if doc.categoria else None
        ),
        descripcion=doc.descripcion,
        activo=doc.activo,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


def _get_own_document_or_404(db: Session, current_user: Usuario, document_uuid: str) -> Documento:
    """Busca un documento por uuid, restringido al dueño (evita que un usuario
    opere sobre documentos de otra persona con solo adivinar/probar un uuid)."""
    doc_id = format_bytes_uuid(document_uuid)
    doc = (
        db.query(Documento)
        .options(joinedload(Documento.categoria))
        .filter(Documento.uuid == doc_id, Documento.usuario_id == current_user.uuid)
        .first()
    )
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento no encontrado",
        )
    return doc


@router.get("/categories", response_model=list[CategoriaResponse])
async def list_categories(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    categorias = db.query(CategoriaDocumento).order_by(CategoriaDocumento.nombre).all()
    return [CategoriaResponse(uuid=c.uuid.hex(), nombre=c.nombre) for c in categorias]


@router.post("/categories", response_model=CategoriaResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoriaRequest,
    current_user: Usuario = Depends(get_current_active_admin),
    db: Session = Depends(get_db),
):
    existente = db.query(CategoriaDocumento).filter(CategoriaDocumento.nombre == payload.nombre).first()
    if existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una categoría con ese nombre.",
        )

    categoria = CategoriaDocumento(nombre=payload.nombre)
    db.add(categoria)
    db.commit()

    return CategoriaResponse(uuid=categoria.uuid.hex(), nombre=categoria.nombre)

@router.patch("/categoria/{uuid_cat}", response_model=CategoriaResponse, status_code=status.HTTP_200_OK)
async def update_category(
    uuid_cat: str,
    payload: CategoriaRequest,
    current_user: Usuario = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    cat = db.query(CategoriaDocumento).filter(CategoriaDocumento.uuid == format_bytes_uuid(uuid_cat)).first()

    if not cat:
        raise HTTPException(
            status_code = status.HTTP_404_NOT_FOUND,
            detail = "Categoria no encontrada"
        )
    
    if payload.nombre and payload.nombre != cat.nombre:
        existing = db.query(CategoriaDocumento).filter(CategoriaDocumento.nombre == payload.nombre).first()
        if existing:
            raise HTTPException(
                status_code = status.HTTP_409_CONFLICT,
                detail = "El nombre de la categoria ya esta en uso"
            )
        
    cat.nombre = payload.nombre
    db.commit()
    db.refresh(cat)

    return CategoriaResponse(
        uuid = cat.uuid,
        nombre = cat.nombre
    )

@router.delete("/delete-cat/{uuid_cat}", status_code=status.HTTP_200_OK)
async def delete_category(
    uuid_cat: str,
    current_user: Usuario = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    cat = db.query(CategoriaDocumento).filter(CategoriaDocumento.uuid == format_bytes_uuid(uuid_cat)).first()
    
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Categoria no encontrada"
        )
    
    db.delete(cat)
    db.commit()


@router.get("/documents", response_model=list[DocumentsResponse])
async def list_documents(
    categoria_id: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Documento)

    if categoria_id:
        query = query.filter(Documento.categoria_id == format_bytes_uuid(categoria_id))

    documentos = (
        query.order_by(Documento.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [document_to_response(doc) for doc in documentos]


@router.post("/documents", response_model=DocumentsResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    categoria_id: str = Form(...),
    descripcion: str = Form(..., min_length=1, max_length=250),
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de archivo no permitido: {file.content_type}",
        )

    original_name = file.filename or "documento"
    extension = os.path.splitext(original_name)[1].lower()
    if extension != ALLOWED_CONTENT_TYPES[file.content_type]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La extensión del archivo no coincide con su tipo de contenido.",
        )

    categoria_uuid = format_bytes_uuid(categoria_id)
    categoria = (
        db.query(CategoriaDocumento)
        .filter(CategoriaDocumento.uuid == categoria_uuid)
        .first()
    )
    if not categoria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La categoría indicada no existe.",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo supera el tamaño máximo permitido (15 MB).",
        )

    # Nombre generado en disco: nunca el nombre que manda el cliente
    # (evita path traversal y colisiones entre archivos con el mismo nombre).
    stored_name = f"{uuid_lib.uuid4().hex}{extension}"
    file_path = os.path.join(STORAGE_DIR, stored_name)

    with open(file_path, "wb") as destino:
        destino.write(contents)

    doc = Documento(
        usuario_id=current_user.uuid,
        categoria_id=categoria_uuid,
        descripcion=descripcion,
        file_name=file.filename,
        content_type=file.content_type,
        storage_path=file_path,
        activo=True,
    )

    try:
        db.add(doc)
        db.commit()
    except Exception:
        db.rollback()
        os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo registrar el documento.",
        )

    return document_to_response(doc)

@router.get("/documents/me", response_model=list[UserDocumentResponse])
async def get_user_documents(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    documents = (
        db.query(Documento)
        .options(joinedload(Documento.categoria))
        .filter(Documento.usuario_id == current_user.uuid)
        .order_by(Documento.created_at.desc())
        .all()
    )

    return [_document_to_user_response(document) for document in documents]


@router.patch("/documents/{document_uuid}", response_model=UserDocumentResponse)
async def update_document(
    document_uuid: str,
    payload: DocumentUpdateRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = _get_own_document_or_404(db, current_user, document_uuid)

    if payload.categoria_id is not None:
        categoria_uuid = format_bytes_uuid(payload.categoria_id)
        categoria = (
            db.query(CategoriaDocumento)
            .filter(CategoriaDocumento.uuid == categoria_uuid)
            .first()
        )
        if not categoria:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="La categoría indicada no existe.",
            )
        doc.categoria_id = categoria_uuid

    if payload.file_name is not None:
        doc.file_name = payload.file_name

    if payload.descripcion is not None:
        doc.descripcion = payload.descripcion

    if payload.activo is not None:
        doc.activo = payload.activo

    db.commit()
    db.refresh(doc)

    return _document_to_user_response(doc)

@router.get("/documents/{document_uuid}/download")
async def download_own_document(
    document_uuid: str,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # A diferencia de /index/document/{uuid}/download (público, solo
    # documentos activo=True), aquí el dueño debe poder ver/descargar sus
    # propios documentos archivados también.
    doc = _get_own_document_or_404(db, current_user, document_uuid)

    if not os.path.exists(str(doc.storage_path)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo no encontrado",
        )

    return FileResponse(
        path=doc.storage_path,
        filename=doc.file_name,
        media_type=doc.content_type,
        content_disposition_type="inline",
    )


@router.delete("/documents/{document_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_document(
    document_uuid: str,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = _get_own_document_or_404(db, current_user, document_uuid)

    try:
        if doc.storage_path and os.path.exists(doc.storage_path):
            os.remove(doc.storage_path)
    except OSError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al eliminar el documento: {e}",
        )

    db.delete(doc)
    db.commit()

@router.get("/users", response_model=list[UserProfileResponse], status_code=status.HTTP_200_OK)
async def list_users(
    current_user: Usuario = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    usuarios = db.query(Usuario).order_by(Usuario.nombre).all()
    return [
        UserProfileResponse(
            uuid=u.uuid.hex(),
            username=u.username,
            nombre=u.nombre,
            apellido=u.apellido,
            es_admin=u.es_admin,
            activo=u.activo,
            updated_at=u.updated_at,
        )
        for u in usuarios
    ]
        
# By: Th3-MiMoX