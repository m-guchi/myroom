import datetime
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

load_dotenv()

ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
TOKEN_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "168"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)


def get_secret_key() -> str:
    secret = os.getenv("JWT_SECRET_KEY")
    if secret:
        return secret
    app_password = os.getenv("APP_PASSWORD", "admin")
    return f"myroom-jwt-{app_password}"


def create_access_token(expires_hours: Optional[int] = None) -> str:
    hours = expires_hours if expires_hours is not None else TOKEN_EXPIRE_HOURS
    payload = {
        "sub": "myroom-user",
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=hours),
    }
    return jwt.encode(payload, get_secret_key(), algorithm=ALGORITHM)


def verify_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, get_secret_key(), algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return verify_token(token)
