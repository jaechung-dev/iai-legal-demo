from contextlib import contextmanager

import psycopg2

from services.core.settings import settings


@contextmanager
def get_db():
    conn = psycopg2.connect(settings.DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
