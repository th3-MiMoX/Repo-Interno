from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from sqlalchemy.orm import Session
from auth.security import decode_access_token
from database.models import Usuario
from database.connect_db import get_db
from utils.utils import format_bytes_uuid

oauth2_schema = OAuth2PasswordBearer(tokenUrl="auth/login")

async def get_current_user(token: str = Depends(oauth2_schema), db: Session = Depends(get_db)) -> Usuario:
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError:
        raise credentials_exception
    
    if payload.get("type") != "access":
        raise credentials_exception
    
    user_uuid : str | None = payload.get("sub")
    if not user_uuid:
        raise credentials_exception
    
    try:
        uuid_bytes = format_bytes_uuid(user_uuid)
        user = db.query(Usuario).filter(Usuario.uuid == uuid_bytes).first()
    except HTTPException:
        raise credentials_exception
    
    if user is None:
        raise credentials_exception

    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado",
        )
    
    return user

async def get_current_active_admin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if not current_user.es_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere permisos de Administrador"
        )
    
    return current_user

# By: Th3-MiMoX