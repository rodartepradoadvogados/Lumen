"""Descoberta automatica de processos a partir das publicacoes do DJEN.

Toda vez que uma publicacao referencia um numero de processo ainda nao
presente em ProcessoMonitorado, ele e inserido automaticamente com
origem="descoberto_via_djen", passando a ser consultado tambem no Datajud.
"""

from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import ProcessoMonitorado
from .logging_config import get_logger

logger = get_logger(__name__)

ORIGEM_DJEN = "descoberto_via_djen"
ORIGEM_MANUAL = "cadastrado_manualmente"


def registrar_processo_se_novo(
    session: Session,
    numero_processo: str,
    origem: str,
    oab_relacionada: Optional[str] = None,
) -> bool:
    """Insere o processo em ProcessoMonitorado se ainda nao existir.

    Retorna True se um novo registro foi criado, False se ja existia.
    Idempotente: pode ser chamado repetidamente para o mesmo processo.
    """
    existente = session.get(ProcessoMonitorado, numero_processo)
    if existente is not None:
        return False

    novo = ProcessoMonitorado(
        numero_processo=numero_processo,
        origem=origem,
        oab_relacionada=oab_relacionada,
    )
    session.add(novo)
    session.flush()
    logger.info("Novo processo monitorado: %s (origem=%s)", numero_processo, origem)
    return True


def descobrir_processos_de_publicacoes(
    session: Session,
    numeros_processo: Iterable[str],
    oab_relacionada: Optional[str] = None,
) -> int:
    """Registra como monitorados todos os numeros de processo ainda desconhecidos.

    Retorna a quantidade de processos novos descobertos.
    """
    novos = 0
    vistos = set()
    for numero in numeros_processo:
        if not numero or numero in vistos:
            continue
        vistos.add(numero)
        if registrar_processo_se_novo(
            session, numero, origem=ORIGEM_DJEN, oab_relacionada=oab_relacionada
        ):
            novos += 1
    return novos


def listar_processos_monitorados(session: Session) -> list[ProcessoMonitorado]:
    return list(session.scalars(select(ProcessoMonitorado)))
