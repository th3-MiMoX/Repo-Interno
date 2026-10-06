from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from schemas.users import (
    UserProfileResponse,
    UserUpdateRequest,
    AdminUsersUpdateRequest
)
from auth.dependencies import get_current_user, get_current_active_admin
from auth.security import (
    verify_password,
    hash_password
)
from database.models import (
    Usuario
)
from database.connect_db import get_db
from utils.utils import format_bytes_uuid

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/me", response_model=UserProfileResponse)
async def get_user_profile(current_user: Usuario = Depends(get_current_user)):

    return UserProfileResponse(
        uuid=current_user.uuid.hex(),
        username=current_user.username,
        nombre=current_user.nombre,
        apellido=current_user.apellido,
        es_admin=current_user.es_admin,
        activo=current_user.activo,
        updated_at=current_user.updated_at,
    )

@router.patch("/me/{user_uuid}", response_model=UserProfileResponse, status_code=status.HTTP_200_OK)
async def edit_user_profile(
    user_uuid: str,
    payload: UserUpdateRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    if format_bytes_uuid(user_uuid) != current_user.uuid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para editar este usuario."
        )

    update_user = payload.model_dump(exclude_unset=True)

    old_password = update_user.pop("old_password", None)
    new_password = update_user.pop("new_password", None)
    update_user.pop("confirm_password", None)

    # El schema ya garantiza que si se envía una contraseña nueva, también
    # vienen la actual y su confirmación (y que ambas coinciden).
    if new_password is not None:
        if not verify_password(current_user.password, old_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="La contraseña actual no es correcta.",
            )
        if verify_password(current_user.password, new_password):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="La nueva contraseña no puede ser igual a la contraseña actual.",
            )
        current_user.password = hash_password(new_password)

    for field, value in update_user.items():
        if value is not None:
            setattr(current_user, field, value)

    db.commit()
    db.refresh(current_user)

    return UserProfileResponse(
        uuid=current_user.uuid.hex(),
        username=current_user.username,
        nombre=current_user.nombre,
        apellido=current_user.apellido,
        es_admin=current_user.es_admin,
        activo=current_user.activo,
        updated_at=current_user.updated_at,
    )

@router.patch("/edit-user/{user_uuid}", response_model=UserProfileResponse, status_code=status.HTTP_200_OK)
async def admin_edit_users(
    user_uuid: str,
    payload: AdminUsersUpdateRequest,
    current_user: Usuario = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
):
    user = db.query(Usuario).filter(Usuario.uuid == format_bytes_uuid(user_uuid)).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    update_user = payload.model_dump(exclude_unset=True)

    new_password = update_user.pop("new_password", None)

    if "username" in update_user and update_user["username"] != user.username:
        existing = db.query(Usuario).filter(Usuario.username == update_user["username"]).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El username ya se encuentra registrado."
            )

    if new_password is not None:
        if verify_password(user.password, new_password):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="La nueva contraseña no puede ser igual a la contraseña actual.",
            )
        user.password = hash_password(new_password)

    for field, value in update_user.items():
        if value is not None:
            setattr(user, field, value)

    db.commit()
    db.refresh(user)

    return UserProfileResponse(
        uuid=user.uuid.hex(),
        username=user.username,
        nombre=user.nombre,
        apellido=user.apellido,
        es_admin=user.es_admin,
        activo=user.activo,
        updated_at=user.updated_at,
    )

# By: Th3-MiMoX