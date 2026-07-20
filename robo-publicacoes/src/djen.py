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


def buscar_publicacoes(
    numero_oab: str,
    uf_oab: str,
    data_inicio: str,
    data_fim: str,
    itens_por_pagina: int = DEFAULT_ITENS_POR_PAGINA,
) -> List[PublicacaoNormalizada]:
    """Busca todas as publicacoes para uma OAB dentro da janela de datas.

    data_inicio/data_fim devem estar no formato "YYYY-MM-DD".
    Percorre todas as paginas disponiveis (ate MAX_PAGINAS por seguranca).
    Nunca levanta excecao por erro de rede/parse — nesses casos loga e
    retorna o que conseguiu capturar ate o momento (possivelmente vazio).
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
        payload = request_json("GET", BASE_URL, params=params)
        if payload is None:
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
