from __future__ import annotations

import logging


class SuppressHealthcheckAccessFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        return " /health " not in message


def suppress_healthcheck_access_logs() -> None:
    access_logger = logging.getLogger("uvicorn.access")
    if any(isinstance(existing, SuppressHealthcheckAccessFilter) for existing in access_logger.filters):
        return
    access_logger.addFilter(SuppressHealthcheckAccessFilter())


def get_logger(scope: str) -> logging.Logger:
    # Reuse uvicorn logger hierarchy so level/format is controlled by server config.
    return logging.getLogger("uvicorn.error").getChild(scope)
