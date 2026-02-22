from pydantic import field_validator
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
    whisperx_vad_method: str = "none"
    whisperx_diarization_model: str = "pyannote/speaker-diarization-community-1"
    whisperx_cache_dir: str | None = None
    whisperx_tf32: bool = False
    captions_use_vocal_separation: bool = False
    captions_vocal_separation_required: bool = False
    captions_demucs_model: str = "htdemucs"
    music_whisper_model: str = "large-v3"
    music_whisper_device: str = "cuda"
    music_whisper_compute_type: str = "float16"
    music_whisper_beam_size: int = 7
    music_whisper_best_of: int = 7
    music_whisper_language: str | None = None
    music_whisper_timing_offset_ms: int = -60
    transcription_max_upload_mb: int = 100
    CAPTION_REMOTE_TOKEN: str | None = None
    hf_token: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator(
        "whisperx_language",
        "music_whisper_language",
        "whisperx_cache_dir",
        "CAPTION_REMOTE_TOKEN",
        "hf_token",
        mode="before",
    )
    @classmethod
    def empty_string_to_none(cls, value: object) -> object:
        if isinstance(value, str) and value.strip() == "":
            return None
        return value


settings = Settings()
