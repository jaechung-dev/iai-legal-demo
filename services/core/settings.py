import json
import logging
import os

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


def _load_secrets() -> None:
    """Fetch Secrets Manager secret and populate os.environ before Pydantic reads it.

    Runs once at cold start when SECRET_ARN is set. No-op in local dev (SECRET_ARN unset).
    Secrets Manager is authoritative when SECRET_ARN is present — values overwrite env.
    """
    arn = os.environ.get("SECRET_ARN")
    if not arn:
        return
    try:
        import boto3
        region = os.environ.get("AWS_REGION_NAME", "ap-southeast-2")
        client = boto3.client("secretsmanager", region_name=region)
        resp = client.get_secret_value(SecretId=arn)
        for key, value in json.loads(resp["SecretString"]).items():
            os.environ[key] = value
    except Exception as exc:
        # Log and continue — Settings validation will raise a clear error
        # if any required var is still missing.
        logger.error("Secrets Manager fetch failed (%s): %s", arn, exc)


_load_secrets()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = ""
    JWT_SECRET: str = ""
    JWT_ALG: str = "HS256"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    FRONTEND_URL: str = "http://localhost:20001"
    BACKEND_URL: str = "http://localhost:20000"

    APP_NAME: str = "ProBono AI"
    FROM_EMAIL: str = "noreply@probonoai.com.au"
    DEMO_PASSWORD: str = ""
    ADMIN_PASSWORD: str = ""

    EMBED_MODEL: str = "text-embedding-3-small"
    CHAT_MODEL: str = "gpt-4o-mini"

    UPLOADS_BUCKET: str = ""
    AWS_REGION_NAME: str = "ap-southeast-2"

    REDIS_URL: str = ""


settings = Settings()
