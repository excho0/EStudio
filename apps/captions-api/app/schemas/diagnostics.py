from pydantic import BaseModel


class ProbeStatus(BaseModel):
    ok: bool
    error: str | None = None


class RuntimeDiagnosticsResponse(BaseModel):
    service: str
    env: str
    configuredBackend: str
    selectedBackendClass: str | None = None
    pythonVersion: str
    torchVersion: str | None = None
    whisperxVersion: str | None = None
    cudaAvailable: bool = False
    cudaDeviceCount: int = 0
    cudaDeviceName: str | None = None
    checks: dict[str, ProbeStatus]


class TranscriptionSmokeResponse(BaseModel):
    service: str
    backend: str
    ok: bool
    elapsedMs: int
    generatedAudioMs: int
    captionsCount: int
    language: str | None = None
    error: str | None = None
