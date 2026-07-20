"""Configuracao central do robo, lida a partir de variaveis de ambiente.

Nenhum valor sensivel (OAB, e-mail, credenciais) deve ficar hardcoded no
codigo alem dos defaults documentados aqui, que existem apenas para
facilitar o uso local e podem ser sobrescritos via variaveis de ambiente.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import List, Optional

from dotenv import load_dotenv

# Carrega variaveis de um arquivo .env local, se existir. Em producao
# (Railway), as variaveis ja vem do ambiente e load_dotenv() e um no-op
# silencioso caso o arquivo nao exista.
load_dotenv()


# Defaults documentados do escritorio Rodarte Prado Advogados (Goiania/GO).
# Usados apenas quando a variavel de ambiente OABS_JSON nao esta definida.
_DEFAULT_OABS = [
    {"nome": "Jairo Alexandre Rodarte e Silva", "numero": "78295", "uf": "GO"},
    {"nome": "Rodrigo Araujo do Prado", "numero": "32943", "uf": "GO"},
]


@dataclass(frozen=True)
class Oab:
    nome: str
    numero: str
    uf: str


def _parse_oabs(raw: Optional[str]) -> List[Oab]:
    if not raw:
        data = _DEFAULT_OABS
    else:
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            raise ValueError(
                "OABS_JSON invalido: nao foi possivel decodificar o JSON. "
                "Exemplo esperado: "
                '[{"nome": "Fulano", "numero": "12345", "uf": "GO"}]'
            )
        if not isinstance(data, list) or not data:
            raise ValueError("OABS_JSON deve ser uma lista JSON nao vazia de objetos.")

    oabs = []
    for item in data:
        try:
            oabs.append(
                Oab(
                    nome=str(item["nome"]),
                    numero=str(item["numero"]),
                    uf=str(item["uf"]),
                )
            )
        except (KeyError, TypeError) as exc:
            raise ValueError(
                f"Entrada invalida em OABS_JSON (esperado nome/numero/uf): {item!r}"
            ) from exc
    return oabs


def _parse_email_list(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    return [addr.strip() for addr in raw.split(",") if addr.strip()]


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    database_url: Optional[str]
    oabs: List[Oab]
    janela_dias: int
    intervalo_horas: int

    smtp_host: str
    smtp_port: int
    smtp_user: Optional[str]
    smtp_password: Optional[str]
    email_to: List[str]

    datajud_api_key: Optional[str]
    gemini_api_key: Optional[str]

    log_level: str


def load_settings() -> Settings:
    """Le e valida as variaveis de ambiente, retornando um objeto Settings.

    Chamado a cada execucao (nao e cacheado em modulo) para facilitar testes
    que alteram variaveis de ambiente entre casos.
    """
    return Settings(
        database_url=os.getenv("DATABASE_URL") or None,
        oabs=_parse_oabs(os.getenv("OABS_JSON")),
        janela_dias=_env_int("JANELA_DIAS", 5),
        intervalo_horas=_env_int("INTERVALO_HORAS", 2),
        smtp_host=os.getenv("SMTP_HOST", "smtp.gmail.com"),
        smtp_port=_env_int("SMTP_PORT", 465),
        smtp_user=os.getenv("SMTP_USER") or None,
        smtp_password=os.getenv("SMTP_PASSWORD") or None,
        email_to=_parse_email_list(os.getenv("EMAIL_TO")),
        datajud_api_key=os.getenv("DATAJUD_API_KEY") or None,
        gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )
