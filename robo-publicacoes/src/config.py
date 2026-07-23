"""Configuracao central do robo, lida a partir de variaveis de ambiente.

Nenhum valor sensivel (OAB, e-mail, credenciais) deve ficar hardcoded no
codigo alem dos defaults documentados aqui, que existem apenas para
facilitar o uso local e podem ser sobrescritos via variaveis de ambiente.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import List, Optional

from dotenv import load_dotenv

from .logging_config import get_logger

# Carrega variaveis de um arquivo .env local, se existir. Em producao
# (Railway), as variaveis ja vem do ambiente e load_dotenv() e um no-op
# silencioso caso o arquivo nao exista.
load_dotenv()

logger = get_logger(__name__)


# Defaults documentados do escritorio Rodarte Prado Advogados (Goiania/GO).
# Usados apenas quando a variavel de ambiente OABS_JSON nao esta definida E
# a descoberta via banco (ver carregar_oabs_do_banco) nao estiver disponivel
# ou retornar vazia (ex.: rodando local sem DATABASE_URL).
_DEFAULT_OABS = [
    {"nome": "Jairo Alexandre Rodarte e Silva", "numero": "78295", "uf": "GO"},
    {"nome": "Rodrigo Araujo do Prado", "numero": "32943", "uf": "GO"},
]

# Mesma lista de UFs validas usada em lib/djenSync.ts (parseOab) do site Next.js — evita
# confundir letras aleatorias do texto livre da OAB com uma UF de verdade.
_UFS = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
    "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO",
]
_UF_RE = re.compile(r"\b(" + "|".join(_UFS) + r")\b")
_NUMERO_RE = re.compile(r"\d[\d.]{3,}")


@dataclass(frozen=True)
class Oab:
    nome: str
    numero: str
    uf: str


def _parse_oab_texto(raw: str) -> Optional[tuple[str, str]]:
    """Extrai numero e UF de um texto livre de OAB (ex.: "OAB/GO 78.295" ou
    "78295-GO") — mesma logica de lib/djenSync.ts:parseOab no site, pra manter
    os dois lados (robo Python e site Next.js) de acordo sobre o mesmo dado.
    """
    uf_match = _UF_RE.search(raw.upper())
    numero_match = _NUMERO_RE.search(raw)
    if not uf_match or not numero_match:
        return None
    numero = re.sub(r"\D", "", numero_match.group(0))
    return numero, uf_match.group(1)


def carregar_oabs_do_banco(database_url: str) -> List[Oab]:
    """Descobre a lista de OABs a monitorar consultando a tabela User do site
    (Next.js/Prisma) — em vez de depender de uma lista estatica (OABS_JSON)
    que so cobria o Rodarte Prado. Le todos os usuarios ativos, de escritorios
    ativos, com OAB cadastrada, de TODOS os escritorios (Office).

    O robo de captura em si nao precisa saber A QUAL escritorio cada OAB
    pertence — so precisa saber QUAIS OABs buscar no DJEN/Datajud. A
    atribuicao de cada publicacao capturada ao escritorio certo acontece
    depois, na ponte (lib/roboBridge.ts), que casa por numero de processo
    dentro de cada Office.

    Retorna lista vazia (nunca lanca) se a consulta falhar por qualquer
    motivo — quem chama decide o fallback (ver load_settings).
    """
    from sqlalchemy import create_engine, text

    engine = create_engine(database_url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    'SELECT u."name", u."oab" '
                    'FROM "User" u '
                    'JOIN "Office" o ON o."id" = u."officeId" '
                    'WHERE u."active" = true AND u."oab" IS NOT NULL AND o."status" = \'ATIVA\''
                )
            ).fetchall()
    except Exception:
        logger.exception("Falha ao consultar OABs no banco (tabela User/Office).")
        return []
    finally:
        engine.dispose()

    oabs: List[Oab] = []
    vistos: set[tuple[str, str]] = set()
    for nome, oab_raw in rows:
        parsed = _parse_oab_texto(oab_raw) if oab_raw else None
        if not parsed:
            continue
        numero, uf = parsed
        chave = (numero, uf)
        if chave in vistos:
            continue
        vistos.add(chave)
        oabs.append(Oab(nome=str(nome), numero=numero, uf=uf))
    return oabs


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

    djen_proxy_url: Optional[str]

    log_level: str


def _resolver_oabs(database_url: Optional[str]) -> List[Oab]:
    """OABs a monitorar: prioriza a descoberta dinamica via banco (todos os
    escritorios), com OABS_JSON/_DEFAULT_OABS como fallback pra rodar local
    sem banco ou se a consulta falhar por qualquer motivo — nunca deixa o
    robo sem nenhuma OAB pra monitorar por causa de um problema transitorio
    de conexao.
    """
    if database_url:
        oabs_do_banco = carregar_oabs_do_banco(database_url)
        if oabs_do_banco:
            logger.info("%d OAB(s) carregada(s) do banco (todos os escritorios ativos).", len(oabs_do_banco))
            return oabs_do_banco
        logger.warning("Consulta ao banco não retornou nenhuma OAB; usando OABS_JSON/lista padrão como fallback.")
    return _parse_oabs(os.getenv("OABS_JSON"))


def load_settings() -> Settings:
    """Le e valida as variaveis de ambiente, retornando um objeto Settings.

    Chamado a cada execucao (nao e cacheado em modulo) para facilitar testes
    que alteram variaveis de ambiente entre casos.
    """
    database_url = os.getenv("DATABASE_URL") or None
    return Settings(
        database_url=database_url,
        oabs=_resolver_oabs(database_url),
        janela_dias=_env_int("JANELA_DIAS", 5),
        intervalo_horas=_env_int("INTERVALO_HORAS", 2),
        smtp_host=os.getenv("SMTP_HOST", "smtp.gmail.com"),
        smtp_port=_env_int("SMTP_PORT", 465),
        smtp_user=os.getenv("SMTP_USER") or None,
        smtp_password=os.getenv("SMTP_PASSWORD") or None,
        email_to=_parse_email_list(os.getenv("EMAIL_TO")),
        datajud_api_key=os.getenv("DATAJUD_API_KEY") or None,
        gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
        djen_proxy_url=os.getenv("DJEN_PROXY_URL") or None,
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )
