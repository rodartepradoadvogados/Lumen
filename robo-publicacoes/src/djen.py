"""Captura de publicacoes/intimacoes via API publica Comunica/DJEN do CNJ.

Endpoint: GET https://comunicaapi.pje.jus.br/api/v1/comunicacao

O parsing e propositalmente DEFENSIVO: a API do DJEN nao tem um contrato
formalmente estavel e documentado publicamente, e ja se observou variacao de
nomenclatura de campos entre respostas/versoes. Por isso tentamos multiplas
variacoes de nome (camelCase, snake_case, abreviacoes) para cada campo antes
de desistir e usar None/"".
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .http_client import request_json
from .logging_config import get_logger

logger = get_logger(__name__)

BASE_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao"

DEFAULT_ITENS_POR_PAGINA = 40
MAX_PAGINAS = 200  # trava de seguranca para nunca entrar em loop infinito


@dataclass
class PublicacaoNormalizada:
    id_comunicacao: str
    numero_processo: str
    tribunal: Optional[str]
    data_disponibilizacao: Optional[str]
    tipo_comunicacao: Optional[str]
    teor: Optional[str]
    destinatario_advogados: Optional[str]


def _first_present(item: Dict[str, Any], keys: List[str]) -> Optional[Any]:
    """Retorna o primeiro valor nao-nulo entre as variacoes de chave dadas."""
    for key in keys:
        if key in item and item[key] is not None:
            return item[key]
    return None


def _normalizar_item(item: Dict[str, Any]) -> Optional[PublicacaoNormalizada]:
    id_comunicacao = _first_present(
        item, ["id", "hash", "idComunicacao", "id_comunicacao", "codigo"]
    )
    if id_comunicacao is None:
        logger.warning(
            "Item de publicacao sem identificador reconhecivel, ignorado: %s",
            {k: item.get(k) for k in list(item)[:8]},
        )
        return None

    numero_processo = _first_present(
        item,
        [
            "numeroprocesso",
            "numero_processo",
            "numeroProcesso",
            "numeroprocessocommascara",
            "numeroProcessoComMascara",
        ],
    )
    if numero_processo is None:
        logger.warning(
            "Publicacao %s sem numero de processo reconhecivel, ignorada.",
            id_comunicacao,
        )
        return None

    tribunal = _first_present(
        item, ["siglaTribunal", "sigla_tribunal", "tribunal", "siglatribunal"]
    )
    data_disponibilizacao = _first_present(
        item,
        [
            "data_disponibilizacao",
            "dataDisponibilizacao",
            "datadisponibilizacao",
            "dataPublicacao",
            "data_publicacao",
        ],
    )
    tipo_comunicacao = _first_present(
        item, ["tipoComunicacao", "tipo_comunicacao", "tipo", "tipoDocumento"]
    )
    teor = _first_present(item, ["texto", "teor", "conteudo", "textoComunicacao"])
    destinatario_advogados = _first_present(
        item,
        [
            "destinatarioadvogados",
            "destinatarioAdvogados",
            "destinatarios_advogados",
            "advogados",
        ],
    )
    if destinatario_advogados is not None and not isinstance(destinatario_advogados, str):
        # Pode vir como lista de objetos/strings; serializamos de forma simples.
        try:
            destinatario_advogados = ", ".join(
                str(a.get("nome", a)) if isinstance(a, dict) else str(a)
                for a in destinatario_advogados
            )
        except TypeError:
            destinatario_advogados = str(destinatario_advogados)

    return PublicacaoNormalizada(
        id_comunicacao=str(id_comunicacao),
        numero_processo=str(numero_processo),
        tribunal=str(tribunal) if tribunal is not None else None,
        data_disponibilizacao=str(data_disponibilizacao)
        if data_disponibilizacao is not None
        else None,
        tipo_comunicacao=str(tipo_comunicacao) if tipo_comunicacao is not None else None,
        teor=str(teor) if teor is not None else None,
        destinatario_advogados=str(destinatario_advogados)
        if destinatario_advogados is not None
        else None,
    )


def _extrair_lista_itens(payload: Any) -> List[Dict[str, Any]]:
    """A API pode retornar a lista diretamente ou aninhada em algum envelope.

    Tentamos as formas mais comuns antes de desistir e retornar lista vazia.
    """
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("items", "data", "content", "comunicacoes", "resultado"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    logger.warning(
        "Formato de resposta do DJEN nao reconhecido (esperava lista ou dict "
        "com uma chave conhecida); retornando lista vazia."
    )
    return []


def _tem_mais_paginas(payload: Any, pagina_atual: int, itens_por_pagina: int, itens_recebidos: int) -> bool:
    """Heuristica defensiva de paginacao.

    Se a API informa um total/count, usamos isso. Caso contrario, assumimos
    que ha mais paginas enquanto a pagina atual vier "cheia" (itens
    recebidos == itens_por_pagina).
    """
    if isinstance(payload, dict):
        total = _first_present(payload, ["count", "total", "totalItens", "total_itens"])
        if total is not None:
            try:
                total_int = int(total)
                return pagina_atual * itens_por_pagina < total_int
            except (TypeError, ValueError):
                pass
    return itens_recebidos >= itens_por_pagina


class DjenRequestFailed(Exception):
    """Levantada quando a 1a pagina de uma busca no DJEN falha (403, rede, etc).

    Distingue "a API respondeu e nao ha publicacoes novas" (lista vazia,
    resultado legitimo) de "a API nao respondeu nada" (falha real). Sem essa
    distincao, uma falha de rede/bloqueio de IP era registrada como "0
    itens recebidos, sucesso" em ExecucaoLog — o que nunca aciona o alerta
    de "2 falhas seguidas" em notify.py, mascarando bloqueios persistentes.
    """


def buscar_publicacoes(
    numero_oab: str,
    uf_oab: str,
    data_inicio: str,
    data_fim: str,
    itens_por_pagina: int = DEFAULT_ITENS_POR_PAGINA,
    proxy_url: Optional[str] = None,
) -> List[PublicacaoNormalizada]:
    """Busca todas as publicacoes para uma OAB dentro da janela de datas.

    data_inicio/data_fim devem estar no formato "YYYY-MM-DD".
    Percorre todas as paginas disponiveis (ate MAX_PAGINAS por seguranca).
    Levanta DjenRequestFailed se a 1a pagina falhar (ver docstring da
    excecao). Falhas em paginas subsequentes (2+) apenas interrompem a
    paginacao e retornam o que ja foi coletado, pois ja houve sucesso real
    nesta busca.

    proxy_url roteia a requisicao por um proxy (ex.: residencial), para
    contornar o bloqueio de IP de datacenter do CNJ — ver DJEN_PROXY_URL em
    config.py. Sem ele (default), o comportamento e identico ao anterior.
    """
    resultados: List[PublicacaoNormalizada] = []
    pagina = 1

    while pagina <= MAX_PAGINAS:
        params = {
            "numeroOab": numero_oab,
            "ufOab": uf_oab,
            "dataDisponibilizacaoInicio": data_inicio,
            "dataDisponibilizacaoFim": data_fim,
            "pagina": pagina,
            "itensPorPagina": itens_por_pagina,
        }
        payload = request_json("GET", BASE_URL, params=params, proxy_url=proxy_url)
        if payload is None:
            if pagina == 1:
                raise DjenRequestFailed(
                    f"Falha ao consultar DJEN para OAB {numero_oab}/{uf_oab} "
                    "(ver logs de http_client para o status HTTP)."
                )
            # Erro ja logado por http_client (403, rede, etc). Interrompe a
            # paginacao desta OAB, mas preserva o que ja foi coletado.
            break

        itens = _extrair_lista_itens(payload)
        if not itens:
            break

        for item in itens:
            if not isinstance(item, dict):
                continue
            normalizado = _normalizar_item(item)
            if normalizado is not None:
                resultados.append(normalizado)

        if not _tem_mais_paginas(payload, pagina, itens_por_pagina, len(itens)):
            break

        pagina += 1

    logger.info(
        "DJEN: %d publicacao(oes) capturada(s) para OAB %s/%s no periodo %s a %s.",
        len(resultados),
        numero_oab,
        uf_oab,
        data_inicio,
        data_fim,
    )
    return resultados
