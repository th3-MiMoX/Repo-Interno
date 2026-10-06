from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from auth.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    check_needs_rehash,
    decode_refresh_token,
)
from schemas.auths import (
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    RefresRequest,
    RefreshResponse,
)
from database.models import Usuario, RevokedRefreshToken
from auth.dependencies import get_current_user, get_current_active_admin
from database.connect_db import get_db
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from utils.utils import format_bytes_uuid

router = APIRouter(prefix="/auth", tags=["Autenticacion"])

def _is_refresh_token_revoked(db: Session, jti: str | None) -> bool:
    # Tokens sin jti fueron emitidos antes de que existiera este claim;
    # no hay forma de revocarlos por este mecanismo, así que se dejan pasar
    # (expiran de forma natural por su propio exp).
    if not jti:
        return False

    try:
        jti_bytes = format_bytes_uuid(jti)
    except HTTPException:
        return False

    return db.query(RevokedRefreshToken).filter(RevokedRefreshToken.jti == jti_bytes).first() is not None

def _generate_tokens(user: Usuario) -> dict:
    user_uuid = user.uuid.hex()

    access_token = create_access_token(
        user_uuid=user_uuid,
        es_admin=user.es_admin,
    )

    refresh_token = create_refresh_token(user_uuid)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }

@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    current_user: Usuario = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):

    existing_username = db.query(Usuario).filter(Usuario.username == request.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario registrado con ese username"
        )

    hashed_password = hash_password(request.password)

    new_user = Usuario(
        username = request.username,
        nombre = request.nombre,
        apellido = request.apellido,
        password = hashed_password,
        es_admin = request.es_admin,
        activo = request.activo,
    )

    db.add(new_user)
    db.commit()

    return RegisterResponse(
        uuid= new_user.uuid.hex(),
        username= new_user.username,
        nombre= new_user.nombre,
        apellido= new_user.apellido,
        es_admin= new_user.es_admin,
        activo= new_user.activo,
        created_at= new_user.created_at,
    )

@router.post("/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):

    user = db.query(Usuario).filter(Usuario.username == form_data.username).first()
    if not user or not verify_password(user.password, form_data.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado. Contacta al administrador.",
        )
    
    if check_needs_rehash(user.password):
        user.password = hash_password(form_data.password)
        db.commit()

    return _generate_tokens(user)

@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(request: RefresRequest, db: Session = Depends(get_db)):
    try:
        payload = decode_refresh_token(request.refresh_token)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado. Inicia sesíon nuevamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token proporcionado no es un refresh token",
        )

    if _is_refresh_token_revoked(db, payload.get("jti")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revocado. Inicia sesión nuevamente.",
        )

    user_uuid = payload.get("sub")
    if not user_uuid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalido",
        )
    
    try:
        user_id_bytes = format_bytes_uuid(user_uuid)
        user = db.query(Usuario).filter(Usuario.uuid == user_id_bytes).first()
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido",
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado."
        )

    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado.",
        )

    access_token = create_access_token(
        user_uuid=user_uuid,
        es_admin=user.es_admin,
    )

    return RefreshResponse(access_token=access_token)

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: RefresRequest, db: Session = Depends(get_db)):
    # Idempotente a propósito: un refresh token ya inválido, expirado o
    # desconocido no es un error para quien está cerrando sesión — el
    # resultado que le importa (quedar deslogueado) ya se cumple.
    try:
        payload = decode_refresh_token(request.refresh_token)
    except (ExpiredSignatureError, InvalidTokenError):
        return

    jti = payload.get("jti")
    if not jti:
        return

    try:
        jti_bytes = format_bytes_uuid(jti)
    except HTTPException:
        return

    already_revoked = db.query(RevokedRefreshToken).filter(RevokedRefreshToken.jti == jti_bytes).first()
    if not already_revoked:
        db.add(RevokedRefreshToken(jti=jti_bytes))
        db.commit()

# By: Th3-MiMoX