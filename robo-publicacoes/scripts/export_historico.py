#!/usr/bin/env python
"""CLI para exportar o historico de publicacoes e andamentos para CSV ou JSON.

Uso tipico (para alimentar o NotebookLM ou qualquer ferramenta externa):

    python scripts/export_historico.py --formato json --saida historico.json
    python scripts/export_historico.py --formato csv --saida publicacoes.csv --andamentos-saida andamentos.csv

Por padrao exporta em JSON para stdout.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from src.config import load_settings  # noqa: E402
from src.db import Andamento, Publicacao, build_engine, build_session_factory, init_db  # noqa: E402


def _publicacao_para_dict(pub: Publicacao) -> Dict[str, Any]:
    return {
        "id_comunicacao": pub.id_comunicacao,
        "oab": pub.oab,
        "uf": pub.uf,
        "nome_advogado": pub.nome_advogado,
        "numero_processo": pub.numero_processo,
        "tribunal": pub.tribunal,
        "data_disponibilizacao": pub.data_disponibilizacao,
        "tipo_comunicacao": pub.tipo_comunicacao,
        "teor": pub.teor,
        "data_captura": pub.data_captura.isoformat() if pub.data_captura else None,
        "status_lido": pub.status_lido,
    }


def _andamento_para_dict(mov: Andamento) -> Dict[str, Any]:
    return {
        "id": mov.id,
        "numero_processo": mov.numero_processo,
        "tribunal": mov.tribunal,
        "data_movimentacao": mov.data_movimentacao,
        "codigo_movimento": mov.codigo_movimento,
        "descricao_movimento": mov.descricao_movimento,
        "data_captura": mov.data_captura.isoformat() if mov.data_captura else None,
        "status_lido": mov.status_lido,
    }


def _escrever_csv(caminho: str, linhas: List[Dict[str, Any]]) -> None:
    if not linhas:
        Path(caminho).write_text("", encoding="utf-8")
        return
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
        writer.writeheader()
        writer.writerows(linhas)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--formato", choices=["csv", "json"], default="json")
    parser.add_argument(
        "--saida",
        default=None,
        help="Arquivo de saida para publicacoes (json: historico completo; csv: apenas publicacoes). "
        "Se omitido, imprime JSON no stdout.",
    )
    parser.add_argument(
        "--andamentos-saida",
        default=None,
        help="Arquivo CSV de saida para andamentos (somente usado com --formato csv).",
    )
    args = parser.parse_args(argv)

    settings = load_settings()
    engine = build_engine(settings.database_url)
    init_db(engine)
    session_factory = build_session_factory(engine)

    session = session_factory()
    try:
        publicacoes = [
            _publicacao_para_dict(p) for p in session.scalars(select(Publicacao)).all()
        ]
        andamentos = [
            _andamento_para_dict(a) for a in session.scalars(select(Andamento)).all()
        ]
    finally:
        session.close()

    if args.formato == "json":
        payload = {
            "exportado_em": datetime.utcnow().isoformat() + "Z",
            "publicacoes": publicacoes,
            "andamentos": andamentos,
        }
        texto = json.dumps(payload, ensure_ascii=False, indent=2)
        if args.saida:
            Path(args.saida).write_text(texto, encoding="utf-8")
            print(f"Exportado {len(publicacoes)} publicacao(oes) e {len(andamentos)} andamento(s) para {args.saida}.")
        else:
            print(texto)
        return 0

    # CSV: dois arquivos separados (publicacoes e andamentos).
    saida_publicacoes = args.saida or "publicacoes.csv"
    saida_andamentos = args.andamentos_saida or "andamentos.csv"
    _escrever_csv(saida_publicacoes, publicacoes)
    _escrever_csv(saida_andamentos, andamentos)
    print(
        f"Exportado {len(publicacoes)} publicacao(oes) para {saida_publicacoes} e "
        f"{len(andamentos)} andamento(s) para {saida_andamentos}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
