import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_env: str
    jwt_secret_key: str
    jwt_algorithm: str
    jwt_access_expire_minutes: int
    cors_origins: str

    def parsed_cors_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "Nexus OS API"),
        app_env=os.getenv("APP_ENV", "dev"),
        jwt_secret_key=os.getenv("JWT_SECRET_KEY", "change_me_in_env"),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        jwt_access_expire_minutes=int(os.getenv("JWT_ACCESS_EXPIRE_MINUTES", "480")),
        cors_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000"),
    )
