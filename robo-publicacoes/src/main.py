"""Entrypoint do robo-publicacoes.

Uso padrao (recomendado para Cron Job do Railway): roda um unico ciclo e
sai.

    python -m src.main

Uso alternativo (para deploy como servico continuo, sem cron externo):
usa APScheduler para rodar o ciclo a cada INTERVALO_HORAS horas.

    python -m src.main --loop
"""

from __future__ import annotations

import argparse
import sys
import time

from .config import load_settings
from .db import build_engine, build_session_factory, init_db
from .logging_config import get_logger, setup_logging
from .pipeline import executar_ciclo

logger = get_logger(__name__)


def _rodar_um_ciclo() -> int:
    settings = load_settings()
    engine = build_engine(settings.database_url)
    init_db(engine)
    session_factory = build_session_factory(engine)

    logger.info(
        "Iniciando ciclo: %d OAB(s) monitorada(s), janela de %d dia(s).",
        len(settings.oabs),
        settings.janela_dias,
    )

    resultado = executar_ciclo(settings, session_factory)

    logger.info(
        "Ciclo concluido: %d publicacao(oes) nova(s), %d andamento(s) novo(s), "
        "%d processo(s) descoberto(s), e-mail enviado=%s, alertas=%d.",
        resultado.novas_publicacoes,
        resultado.novos_andamentos,
        resultado.novos_processos_descobertos,
        resultado.email_enviado,
        len(resultado.alertas),
    )
    return 0


def _rodar_loop(intervalo_horas: int) -> int:
    from apscheduler.schedulers.blocking import BlockingScheduler

    scheduler = BlockingScheduler()
    scheduler.add_job(
        _rodar_um_ciclo,
        "interval",
        hours=intervalo_horas,
    )

    logger.info(
        "Modo --loop ativo: executando um ciclo agora e depois a cada %d hora(s).",
        intervalo_horas,
    )
    _rodar_um_ciclo()

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Encerrando robo-publicacoes (modo --loop).")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="robo-publicacoes (DJEN + Datajud)")
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Roda continuamente via APScheduler, repetindo a cada INTERVALO_HORAS.",
    )
    args = parser.parse_args(argv)

    setup_logging()

    settings = load_settings()

    if args.loop:
        return _rodar_loop(settings.intervalo_horas)
    return _rodar_um_ciclo()


if __name__ == "__main__":
    sys.exit(main())
