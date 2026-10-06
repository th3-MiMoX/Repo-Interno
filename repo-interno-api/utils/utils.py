from fastapi import HTTPException, status
from argon2 import PasswordHasher
import uuid

def format_bytes_uuid(uuid_hex: str) -> bytes:
    try:
        uuid_bytes = uuid.UUID(hex=uuid_hex).bytes
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Formato UUID invalido"
        )

    return uuid_bytes

def createPassword(password: str):
    ph = PasswordHasher(
        time_cost=3,
        memory_cost=65536,
        parallelism=4,
        hash_len=32,
        salt_len=16
    )

    return ph.hash(password)

# By: Th3-MiMoX