from __future__ import annotations

import logging


class SuppressHealthcheckAccessFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        return " /health " not in message


class SuppressAceStepRopeWarningFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        return "Unrecognized keys in `rope_scaling`" not in message


def suppress_healthcheck_access_logs() -> None:
    access_logger = logging.getLogger("uvicorn.access")
    if any(isinstance(existing, SuppressHealthcheckAccessFilter) for existing in access_logger.filters):
        return
    access_logger.addFilter(SuppressHealthcheckAccessFilter())


def suppress_known_transformers_model_warnings() -> None:
    transformers_logger = logging.getLogger("transformers.modeling_rope_utils")
    if any(
        isinstance(existing, SuppressAceStepRopeWarningFilter)
        for existing in transformers_logger.filters
    ):
        return
    transformers_logger.addFilter(SuppressAceStepRopeWarningFilter())


def get_logger(scope: str) -> logging.Logger:
    # Reuse uvicorn logger hierarchy so level/format is controlled by server config.
    return logging.getLogger("uvicorn.error").getChild(scope)
