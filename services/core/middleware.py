import time
from datetime import datetime, timezone

from jose import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from services.core.settings import settings


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        ms = round((time.time() - start) * 1000)
        ip = (
            request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or request.headers.get("x-real-ip", "")
            or (request.client.host if request.client else "-")
        )
        user = "-"
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer ") and settings.JWT_SECRET:
            try:
                payload = jwt.decode(auth[7:], settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
                user = payload.get("sub", "-")
            except Exception:
                pass
        print(
            f'ACCESS {datetime.now(timezone.utc).isoformat()} '
            f'ip={ip} method={request.method} path={request.url.path} '
            f'status={response.status_code} ms={ms} user={user}',
            flush=True,
        )
        return response
