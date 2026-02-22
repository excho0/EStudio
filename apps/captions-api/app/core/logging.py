from __future__ import annotations

import logging


def get_logger(scope: str) -> logging.Logger:
    # Reuse uvicorn logger hierarchy so level/format is controlled by server config.
    return logging.getLogger("uvicorn.error").getChild(scope)

