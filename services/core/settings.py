from pydantic_settings import BaseSettings, SettingsConfigDict


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
