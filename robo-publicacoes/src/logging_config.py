"""Configuracao de logging estruturado para o robo.

Usa o modulo logging padrao da biblioteca com um formato consistente que
inclui timestamp, nivel, nome do modulo e mensagem — suficiente para leitura
nos logs do Railway sem depender de bibliotecas externas.
"""

from __future__ import annotations

import logging
import os
import sys

_CONFIGURED = False

_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(level: str | None = None) -> None:
    """Configura o logging raiz uma unica vez por processo.

    Chamadas subsequentes sao no-op, exceto para permitir reconfigurar o
    nivel se explicitamente solicitado.
    """
    global _CONFIGURED

    level_name = (level or os.getenv("LOG_LEVEL", "INFO")).upper()
    numeric_level = getattr(logging, level_name, logging.INFO)

    if _CONFIGURED:
        logging.getLogger().setLevel(numeric_level)
        return

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATE_FORMAT))

    root = logging.getLogger()
    root.setLevel(numeric_level)
    root.addHandler(handler)

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    setup_logging()
    return logging.getLogger(name)
