import psycopg2
from fastapi import APIRouter

from services.core.settings import settings

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    try:
        conn = psycopg2.connect(settings.DATABASE_URL)
        conn.cursor().execute("SELECT 1")
        conn.close()
        db = "ok"
    except Exception as e:
        db = str(e)
    return {"status": "ok", "db": db}
