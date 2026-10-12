"""Normalizacao da URL do banco para o driver Postgres que esta instalado.

Por que isto existe: o robo ja quebrou ao iniciar com
`ModuleNotFoundError: No module named 'psycopg'`, porque a URL em DATABASE_URL pedia o
driver psycopg (v3) — por exemplo `postgresql+psycopg://...` — e a imagem so tinha
`psycopg2-binary`. O robo ficou 19 dias sem capturar nada e o site mostrava "OK".

A regra agora e nao depender de como a URL foi escrita: qualquer URL Postgres
(`postgres://`, `postgresql://`, `postgresql+psycopg://`, `postgresql+psycopg2://`) e
reescrita para o driver que de fato esta instalado, preferindo psycopg2.
"""

from __future__ import annotations

from importlib.util import find_spec
from typing import Optional

_PREFIXOS_POSTGRES = (
    "postgres://",
    "postgresql://",
    "postgresql+psycopg://",
    "postgresql+psycopg2://",
)


def driver_postgres_instalado() -> Optional[str]:
    """Nome do dialeto SQLAlchemy cujo driver esta instalado, ou None se nenhum."""
    if find_spec("psycopg2") is not None:
        return "psycopg2"
    if find_spec("psycopg") is not None:
        return "psycopg"
    return None


def normalizar_database_url(database_url: str, driver: Optional[str] = None) -> str:
    """Reescreve a URL Postgres para o driver instalado; qualquer outra URL passa intacta.

    `driver` so existe para teste; em producao e descoberto por `driver_postgres_instalado`.
    Sem nenhum driver instalado, devolve com psycopg2 (o que consta em requirements.txt),
    para o erro apontar o driver certo em vez de um driver que nunca foi pedido.
    """
    url = database_url.strip()
    escolhido = driver or driver_postgres_instalado() or "psycopg2"
    for prefixo in _PREFIXOS_POSTGRES:
        if url.startswith(prefixo):
            return f"postgresql+{escolhido}://{url[len(prefixo):]}"
    return url
