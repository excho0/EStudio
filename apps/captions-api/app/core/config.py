from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8010
    log_level: str = "info"

    captions_backend: str = "whisperx"

    whisperx_device: str = "cuda"
    whisperx_compute_type: str = "float16"
    whisperx_model: str = "large-v3"
    whisperx_batch_size: int = 16
    whisperx_language: str | None = None
    hf_token: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
