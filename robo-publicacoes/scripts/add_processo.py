#!/usr/bin/env python
"""CLI para adicionar manualmente um processo ao monitoramento.

Uso:
    python scripts/add_processo.py 0000832-35.2018.4.01.3202 [--oab 78295]

O processo e inserido em ProcessoMonitorado com origem="cadastrado_manualmente"
e passara a ser consultado no Datajud a partir do proximo ciclo do robo.
Operacao idempotente: rodar novamente para o mesmo numero nao duplica nem
falha, apenas informa que o processo ja estava cadastrado.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Permite rodar tanto como "python scripts/add_processo.py" quanto via
# "python -m scripts.add_processo" a partir da raiz do projeto.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import load_settings  # noqa: E402
from src.db import build_engine, build_session_factory, init_db  # noqa: E402
from src.discovery import ORIGEM_MANUAL, registrar_processo_se_novo  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("numero_processo", help="Numero CNJ do processo, ex.: 0000832-35.2018.4.01.3202")
    parser.add_argument(
        "--oab", dest="oab_relacionada", default=None, help="Numero da OAB relacionada (opcional)"
    )
    args = parser.parse_args(argv)

    settings = load_settings()
    engine = build_engine(settings.database_url)
    init_db(engine)
    session_factory = build_session_factory(engine)

    session = session_factory()
    try:
        criado = registrar_processo_se_novo(
            session,
            args.numero_processo,
            origem=ORIGEM_MANUAL,
            oab_relacionada=args.oab_relacionada,
        )
        session.commit()
    finally:
        session.close()

    if criado:
        print(f"Processo {args.numero_processo} adicionado ao monitoramento.")
    else:
        print(f"Processo {args.numero_processo} ja estava cadastrado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
