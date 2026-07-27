"""
FastAPI dependency helpers shared across API route modules.
"""
from fastapi import HTTPException
from jose import jwt

from services.core.settings import settings


_AUD = "probonoai-api"


def get_user_from_header(authorization: str | None) -> str:
    """Returns user_id UUID or 'anon'. Never raises — used for anonymous-friendly routes."""
    if not authorization or not authorization.startswith("Bearer "):
        return "anon"
    try:
        claims = jwt.decode(
            authorization[7:], settings.JWT_SECRET,
            algorithms=[settings.JWT_ALG], audience=_AUD,
        )
        return claims.get("sub", "anon")
    except Exception:
        return "anon"


def require_auth(authorization: str | None) -> str:
    """Returns user_id UUID or raises 401. Used for routes that require authentication."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        claims = jwt.decode(
            authorization[7:], settings.JWT_SECRET,
            algorithms=[settings.JWT_ALG], audience=_AUD,
        )
        user_id = claims.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
