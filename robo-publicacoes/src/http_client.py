"""Cliente HTTP compartilhado com retry/backoff e tratamento de bloqueios.

As APIs publicas do CNJ (Comunica/DJEN e Datajud) sao conhecidas por:
  - retornar 429/5xx sob alta carga (mitigado aqui com retry + backoff
    exponencial);
  - eventualmente retornar 403 para requisicoes vindas de IPs de datacenter
    /nuvem (ex.: provedores como Railway, AWS, GCP), possivelmente por
    bloqueio de WAF/anti-bot do lado do CNJ. Esse caso e tratado de forma
    explicita: logamos um aviso claro e NAO derrubamos o processo, pois um
    403 pode ser transitorio ou especifico de uma janela de tempo/IP.

Este modulo nao tenta contornar bloqueios (sem proxies, sem rotacao de IP)
— apenas lida com o erro de forma robusta e informativa.
"""

from __future__ import annotations

from typing import Any, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .logging_config import get_logger

logger = get_logger(__name__)

# User-Agent de navegador comum, para reduzir a chance de bloqueio simples
# por ausencia/uso de User-Agent de biblioteca (ex.: "python-requests/...").
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

DEFAULT_TIMEOUT = 30  # segundos
RETRY_STATUS_FORCELIST = (429, 500, 502, 503, 504)
MAX_RETRIES = 5
BACKOFF_FACTOR = 2.0  # 2s, 4s, 8s, 16s, 32s (aprox.)


class RequestBlocked(Exception):
    """Levantado quando o servidor responde 403 (possivel bloqueio de IP)."""


def build_session() -> requests.Session:
    """Cria uma requests.Session configurada com retry/backoff exponencial."""
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "application/json",
        }
    )

    retry = Retry(
        total=MAX_RETRIES,
        backoff_factor=BACKOFF_FACTOR,
        status_forcelist=RETRY_STATUS_FORCELIST,
        allowed_methods=("GET", "POST"),
        raise_on_status=False,
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


# Sessao compartilhada (lazy, criada na primeira chamada de get_session()).
_SESSION: Optional[requests.Session] = None


def get_session() -> requests.Session:
    global _SESSION
    if _SESSION is None:
        _SESSION = build_session()
    return _SESSION


def request_json(
    method: str,
    url: str,
    *,
    params: Optional[dict] = None,
    json_body: Optional[dict] = None,
    headers: Optional[dict] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> Optional[Any]:
    """Executa uma requisicao HTTP e retorna o corpo JSON decodificado.

    Retorna None (sem levantar excecao) quando o servidor responde 403,
    apos logar um aviso claro sobre possivel bloqueio de IP de datacenter.
    Isso permite que o pipeline continue para outras fontes/OABs em vez de
    interromper toda a execucao.

    Outras excecoes de rede (timeout, conexao recusada, JSON invalido) sao
    logadas como erro e tambem retornam None, mantendo o chamador
    responsavel por decidir o que fazer (ex.: registrar falha no
    ExecucaoLog).
    """
    session = get_session()
    try:
        response = session.request(
            method,
            url,
            params=params,
            json=json_body,
            headers=headers,
            timeout=timeout,
        )
    except requests.exceptions.RequestException as exc:
        logger.error("Falha de rede ao chamar %s: %s", url, exc)
        return None

    if response.status_code == 403:
        logger.warning(
            "Recebido HTTP 403 de %s. Isso e um sintoma conhecido de bloqueio "
            "do CNJ para requisicoes originadas de IPs de datacenter/nuvem "
            "(ex.: Railway, AWS, GCP). O processo NAO sera interrompido, mas "
            "esta captura falhara nesta execucao. Veja a secao 'LIMITACOES E "
            "RISCOS' do README para planos B (proxy residencial, IP "
            "alternativo, ou avaliacao de API paga como camada adicional).",
            url,
        )
        return None

    if response.status_code >= 400:
        logger.error(
            "Resposta HTTP %s ao chamar %s: %s",
            response.status_code,
            url,
            response.text[:500],
        )
        return None

    try:
        return response.json()
    except ValueError:
        logger.error("Resposta de %s nao e JSON valido: %s", url, response.text[:500])
        return None
