import uuid
from datetime import datetime, timedelta, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
import jwt
from database.config_db import get_settings

settings = get_settings()

JWT_SECRET_KEY: str = settings.JWT_SECRET_KEY
JWT_REFRESH_SECRET_KEY: str = settings.JWT_REFRESH_SECRET_KEY
ACCESS_TOKEN_EXPIRE_MINUTES: int = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_MINUTES: int = settings.REFRESH_TOKEN_EXPIRE_MINUTES
ALGORITHM: str = "HS256"

ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16
)

def hash_password(password:str) -> str:
    return ph.hash(password)

def verify_password(hash:str, password:str) -> bool:
    try:
        return ph.verify(hash,password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    
def check_needs_rehash(password_hash:str) -> bool:
    return ph.check_needs_rehash(password_hash)

def create_access_token(user_uuid:str, es_admin:bool, expires_delta:timedelta | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))

    payload = {
        "sub": user_uuid,
        "es_admin": es_admin,
        "type": "access",
        "iat": now,
        "exp": expire
    }

    return jwt.encode(payload, JWT_SECRET_KEY, ALGORITHM)

def create_refresh_token(user_uuid:str, expires_delta:timedelta | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=REFRESH_TOKEN_EXPIRE_MINUTES))

    payload = {
        "sub": user_uuid,
        "type": "refresh",
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": expire
    }

    return jwt.encode(payload, JWT_REFRESH_SECRET_KEY, ALGORITHM)

def decode_access_token(token:str) -> dict:
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])

def decode_refresh_token(token:str) -> dict:
    return jwt.decode(token, JWT_REFRESH_SECRET_KEY, algorithms=[ALGORITHM])

# By: Th3-MiMoX