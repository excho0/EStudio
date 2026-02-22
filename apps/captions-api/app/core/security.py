from __future__ import annotations

import secrets

from fastapi import Header, HTTPException

from app.core.config import settings


def require_api_token(authorization: str | None = Header(default=None)) -> None:
    configured = settings.CAPTION_REMOTE_TOKEN
    # Open mode when token is not configured.
    if not configured:
        return

    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header.")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization header format.")

    if not secrets.compare_digest(token, configured):
        raise HTTPException(status_code=401, detail="Invalid API token.")
