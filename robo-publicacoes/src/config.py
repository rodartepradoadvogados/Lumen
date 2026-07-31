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


def carregar_termos_vigilancia_do_banco(database_url: str) -> List[tuple[str, str]]:
    """Descobre os termos de vigilancia ATIVOS de TODOS os escritorios, consultando a
    tabela TermoVigilancia do site (Next.js/Prisma) — mesmo padrao de
    carregar_oabs_do_banco() acima, aplicado a mais uma tabela do lado Next.js.

    Usado pelo coletor do DOU/INLABS (src/inlabs.py), que — ao contrario dos coletores
    de DJEN/Datajud/PNCP — precisa saber DENTRO do proprio Python quais termos existem e
    de qual escritorio sao, porque o casamento com o termo acontece no momento da captura
    (nao depois, numa ponte TypeScript): o DOU publica milhares de artigos por dia, entao
    so vale a pena persistir o que ja bateu com um termo vigiado de algum escritorio.

    Retorna lista de tuplas (termo, office_id) — o texto do termo, NAO normalizado (quem
    chama decide como normalizar/comparar; ver _normalizar_texto em src/inlabs.py). Lista
    vazia (nunca lanca) se a consulta falhar por qualquer motivo, assim como
    carregar_oabs_do_banco — quem chama decide o fallback (aqui, o fallback e
    simplesmente nao ter nenhum termo pra casar, e portanto nao persistir nenhum artigo).
    """
    from sqlalchemy import create_engine, text

    engine = create_engine(database_url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text('SELECT "termo", "officeId" FROM "TermoVigilancia" WHERE "ativo" = true')
            ).fetchall()
    except Exception:
        logger.exception("Falha ao consultar termos de vigilancia no banco (tabela TermoVigilancia).")
        return []
    finally:
        engine.dispose()

    termos: List[tuple[str, str]] = []
    for termo, office_id in rows:
        if not termo or not office_id:
            continue
        termos.append((str(termo), str(office_id)))
    return termos


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


# UFs padrao para a coleta de licitacoes no PNCP (Setor de Processos Administrativos, Fase 1):
# GO e DF cobrem a base atual de clientes do escritorio original (Rodarte Prado). Sobrescrevivel
# por PNCP_UFS (lista separada por virgula, ex.: "GO,DF,SP") caso outro escritorio-cliente da
# plataforma precise monitorar licitacoes de outro estado — ver README.md.
_DEFAULT_PNCP_UFS = ["GO", "DF"]


def _parse_pncp_ufs(raw: Optional[str]) -> List[str]:
    if not raw:
        return list(_DEFAULT_PNCP_UFS)
    ufs = [uf.strip().upper() for uf in raw.split(",") if uf.strip()]
    return ufs or list(_DEFAULT_PNCP_UFS)


# Secoes padrao do DOU monitoradas pelo coletor INLABS (src/inlabs.py), Fase 2 do Setor de
# Processos Administrativos. DO1 (atos normativos gerais) e DO3 (contratos/licitacoes/editais)
# cobrem a maior parte do que interessa a um escritorio de advocacia; DO2 (pessoal, atos de
# servidores) fica de fora por padrao pra nao inflar o volume de artigos avaliados a toa.
# Sobrescrevivel por INLABS_SECOES (lista separada por virgula, ex.: "DO1,DO2,DO3") — ver README.
_DEFAULT_INLABS_SECOES = ["DO1", "DO3"]


def _parse_inlabs_secoes(raw: Optional[str]) -> List[str]:
    if not raw:
        return list(_DEFAULT_INLABS_SECOES)
    secoes = [s.strip().upper() for s in raw.split(",") if s.strip()]
    return secoes or list(_DEFAULT_INLABS_SECOES)


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

    pncp_ufs: List[str]

    # Credenciais do INLABS (Imprensa Nacional) — SEMPRE variaveis de ambiente do RAILWAY
    # (nunca da Vercel: o site Next.js nao chama o INLABS diretamente, so le o que este robo
    # ja gravou no Postgres). Sem default proposital: sao credenciais de login de verdade, nao
    # ha um valor generico razoavel. Se ausentes, o coletor (src/inlabs.py) loga um aviso claro
    # e pula a coleta inteira neste ciclo, sem derrubar o robo (ver pipeline.py).
    inlabs_username: Optional[str]
    inlabs_password: Optional[str]
    inlabs_secoes: List[str]

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
        pncp_ufs=_parse_pncp_ufs(os.getenv("PNCP_UFS")),
        inlabs_username=os.getenv("INLABS_USERNAME") or None,
        inlabs_password=os.getenv("INLABS_PASSWORD") or None,
        inlabs_secoes=_parse_inlabs_secoes(os.getenv("INLABS_SECOES")),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )
