from datetime import datetime, timezone
from sqlalchemy import BINARY, Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import DeclarativeBase, relationship
import uuid

class Base(DeclarativeBase):
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

class Usuario(Base):
    __tablename__ = "usuario"

    uuid = Column(BINARY(16), primary_key=True, default=lambda: uuid.uuid4().bytes)
    username = Column(String(10), nullable=False, unique=True)
    nombre = Column(String(150), nullable=False)
    apellido = Column(String(150), nullable=False)
    password = Column(String(250), nullable=False)
    es_admin = Column(Boolean, default=False, nullable=False, index=True)
    activo = Column(Boolean, nullable=True, default=True)
    
    documentos = relationship('Documento', back_populates='usuario')


class CategoriaDocumento(Base):
    __tablename__ = "categoria"

    uuid = Column(BINARY(16), primary_key=True, default=lambda: uuid.uuid4().bytes)
    nombre = Column(String(150), unique=True, nullable=False)

    documentos = relationship('Documento', back_populates='categoria')


class RevokedRefreshToken(Base):
    """Refresh tokens invalidados por logout explícito (blocklist mínima).

    Solo se registra el `jti` del refresh token al momento de cerrar sesión;
    /auth/refresh rechaza cualquier token cuyo jti aparezca aquí. Los tokens
    emitidos antes de que existiera el claim `jti` no tienen forma de
    revocarse por este mecanismo y simplemente expiran de forma natural.
    """
    __tablename__ = "revoked_refresh_token"

    jti = Column(BINARY(16), primary_key=True)


class Documento(Base):
    __tablename__ = "documento"

    uuid = Column(BINARY(16), primary_key=True, default=lambda: uuid.uuid4().bytes)
    usuario_id = Column(BINARY(16), ForeignKey("usuario.uuid"))
    categoria_id = Column(BINARY(16), ForeignKey("categoria.uuid"))
    descripcion = Column(String(250), nullable=False)
    file_name = Column(String(250), nullable=False)
    content_type = Column(String(100), nullable=False)
    storage_path = Column(String(500), nullable=True)
    activo = Column(Boolean, default=False, nullable=False)

    usuario = relationship('Usuario', back_populates='documentos')
    categoria = relationship('CategoriaDocumento', back_populates='documentos')

# By: Th3-MiMoX