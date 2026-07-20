"""Captura de andamentos processuais via API Publica Datajud (CNJ).

A API Datajud e um cluster Elasticsearch somente-leitura. Endpoint:

    POST https://api-publica.datajud.cnj.jus.br/api_publica_{alias}/_search
    Header: Authorization: APIKey {DATAJUD_API_KEY}

O "alias" do indice depende do tribunal, que por sua vez e derivado dos
digitos J (segmento de justica) e TR (tribunal) da mascara CNJ do numero de
processo:

    NNNNNNN-DD.AAAA.J.TR.OOOO

O mapeamento de aliases abaixo foi validado em 2026-07-20 contra a lista
oficial completa de endpoints publicada pelo CNJ (todos os TJs, TRFs, TRTs,
TREs, tribunais superiores e TJMs). Dois erros de formatacao foram corrigidos
nessa validacao: TRE usa hifen (ex.: "tre-sp", nao "tresp") e o Distrito
Federal usa o sufixo "dft" tanto em TJ quanto em TRE (ex.: "tjdft", nao
"tjdf"). A ORDEM dos codigos TR por UF (estadual/eleitoral) nao foi
re-validada nessa passada (a lista oficial fornecida trazia so os nomes,
sem os digitos TR) — se um TJ/TRE especifico falhar persistentemente,
confira o codigo TR esperado na documentacao oficial do Datajud.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .http_client import request_json
from .logging_config import get_logger

logger = get_logger(__name__)

BASE_URL = "https://api-publica.datajud.cnj.jus.br"

# Ordem oficial (Resolucao CNJ de numeracao unica) dos codigos de TR (2
# digitos) para tribunais de justica estaduais (segmento J=8) e, por
# construcao analoga, tribunais eleitorais (segmento J=6). O indice da
# lista (0-based) + 1 == codigo TR.
_UFS_POR_CODIGO_TR = [
    "AC",  # 01
    "AL",  # 02
    "AP",  # 03
    "AM",  # 04
    "BA",  # 05
    "CE",  # 06
    "DF",  # 07
    "ES",  # 08
    "GO",  # 09
    "MA",  # 10
    "MT",  # 11
    "MS",  # 12
    "MG",  # 13
    "PA",  # 14
    "PB",  # 15
    "PR",  # 16
    "PE",  # 17
    "PI",  # 18
    "RJ",  # 19
    "RN",  # 20
    "RS",  # 21
    "RO",  # 22
    "RR",  # 23
    "SC",  # 24
    "SE",  # 25
    "SP",  # 26
    "TO",  # 27
]

# Segmentos de justica militar estadual (J=9) existem apenas em MG, RS e SP.
# Mapeamento explicito pelos mesmos codigos de TR usados no segmento
# estadual (09=MG nao, na verdade o codigo TR de MG e 13; ver lista acima).
_ALIASES_MILITAR_ESTADUAL = {
    "13": "tjmmg",  # TJM-MG
    "21": "tjmrs",  # TJM-RS
    "26": "tjmsp",  # TJM-SP
}

def _apenas_digitos(numero_processo: str) -> str:
    return re.sub(r"\D", "", numero_processo)


def alias_do_tribunal(numero_cnj: str) -> Optional[str]:
    """Deriva o alias do indice Datajud a partir do numero CNJ do processo.

    Aceita o numero com ou sem mascara (ex.: "0000832-35.2018.4.01.3202" ou
    "00008323520184013202"). Retorna None quando nao e possivel determinar
    o alias com confianca (numero invalido ou segmento/tribunal fora do
    mapeamento conhecido) — o chamador deve tratar isso como "nao
    consultavel" em vez de deixar o processo travar.
    """
    digitos = _apenas_digitos(numero_cnj)
    if len(digitos) != 20:
        logger.warning(
            "Numero de processo '%s' nao tem 20 digitos apos remover mascara; "
            "nao foi possivel derivar o alias do tribunal.",
            numero_cnj,
        )
        return None

    # NNNNNNN DD AAAA J TR OOOO
    j = digitos[13]
    tr = digitos[14:16]

    if j == "8":  # Justica Estadual
        try:
            uf = _UFS_POR_CODIGO_TR[int(tr) - 1]
        except (ValueError, IndexError):
            logger.warning("Codigo TR '%s' invalido para segmento estadual (J=8).", tr)
            return None
        return "tjdft" if uf == "DF" else f"tj{uf.lower()}"

    if j == "4":  # Justica Federal
        return f"trf{int(tr)}"

    if j == "5":  # Justica do Trabalho
        if tr == "90":
            return "tst"
        return f"trt{int(tr)}"

    if j == "6":  # Justica Eleitoral
        try:
            uf = _UFS_POR_CODIGO_TR[int(tr) - 1]
        except (ValueError, IndexError):
            logger.warning("Codigo TR '%s' invalido para segmento eleitoral (J=6).", tr)
            return None
        return "tre-dft" if uf == "DF" else f"tre-{uf.lower()}"

    if j == "7":  # Justica Militar da Uniao
        return "stm"

    if j == "9":  # Justica Militar Estadual
        alias = _ALIASES_MILITAR_ESTADUAL.get(tr)
        if alias is None:
            logger.warning(
                "Segmento militar estadual (J=9) com TR='%s' nao mapeado "
                "(apenas MG, RS e SP possuem TJM).",
                tr,
            )
        return alias

    if j == "3":  # STJ
        return "stj"

    if j == "1":  # STF
        return "stf"

    if j == "2":  # CNJ
        return "cnj"

    logger.warning("Segmento de justica J='%s' desconhecido para o processo %s.", j, numero_cnj)
    return None


@dataclass
class AndamentoNormalizado:
    numero_processo: str
    tribunal: Optional[str]
    data_movimentacao: str
    codigo_movimento: str
    descricao_movimento: Optional[str]


def _extrair_movimentos(source: Dict[str, Any]) -> List[Dict[str, Any]]:
    movimentos = source.get("movimentos")
    if isinstance(movimentos, list):
        return movimentos
    return []


def buscar_andamentos(
    numero_processo: str, api_key: Optional[str]
) -> List[AndamentoNormalizado]:
    """Consulta o Datajud pelos andamentos de um processo.

    Retorna lista vazia (nunca levanta excecao) quando: a chave de API nao
    esta configurada, o alias do tribunal nao pode ser determinado, ou a
    requisicao falha (rede, 403, etc — ja tratado/logado por http_client).
    """
    if not api_key:
        logger.warning(
            "DATAJUD_API_KEY nao configurada; pulando consulta de andamentos "
            "para o processo %s.",
            numero_processo,
        )
        return []

    alias = alias_do_tribunal(numero_processo)
    if alias is None:
        return []

    url = f"{BASE_URL}/api_publica_{alias}/_search"
    numero_sem_mascara = _apenas_digitos(numero_processo)
    body = {"query": {"match": {"numeroProcesso": numero_sem_mascara}}}
    headers = {
        "Authorization": f"APIKey {api_key}",
        "Content-Type": "application/json",
    }

    payload = request_json("POST", url, json_body=body, headers=headers)
    if payload is None:
        return []

    hits = payload.get("hits", {}).get("hits", []) if isinstance(payload, dict) else []
    resultados: List[AndamentoNormalizado] = []

    for hit in hits:
        if not isinstance(hit, dict):
            continue
        source = hit.get("_source", {})
        if not isinstance(source, dict):
            continue

        tribunal = source.get("tribunal") or alias.upper()
        for mov in _extrair_movimentos(source):
            if not isinstance(mov, dict):
                continue
            codigo = mov.get("codigo")
            data_hora = mov.get("dataHora")
            if codigo is None or data_hora is None:
                continue
            resultados.append(
                AndamentoNormalizado(
                    numero_processo=numero_processo,
                    tribunal=str(tribunal),
                    data_movimentacao=str(data_hora),
                    codigo_movimento=str(codigo),
                    descricao_movimento=str(mov.get("nome")) if mov.get("nome") else None,
                )
            )

    logger.info(
        "Datajud: %d andamento(s) capturado(s) para o processo %s (alias=%s).",
        len(resultados),
        numero_processo,
        alias,
    )
    return resultados
