"""Captura de licitacoes via API publica de consulta do PNCP (Portal Nacional
de Contratacoes Publicas) — Fase 1 do Setor de Processos Administrativos.

Endpoint: GET https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao

ATENCAO — MAPEAMENTO DE CAMPOS NAO CONFIRMADO CONTRA UMA RESPOSTA REAL: o
ambiente onde este arquivo foi escrito nao tem acesso a rede (todo host
externo retorna 403) nem ao Postgres de producao, entao NUNCA foi possivel
chamar a API de verdade e inspecionar o JSON retornado. Por isso, exatamente
como em src/djen.py, o parsing e propositalmente DEFENSIVO: para cada campo
do nosso modelo (RoboLicitacao/LicitacaoPNCP) tentamos uma LISTA de nomes
proovaveis (camelCase, variacoes comuns em APIs de governo, inclusive
aninhados em sub-objetos como "orgaoEntidade"/"unidadeOrgao") via
`_primeiro_presente`/`_primeiro_presente_aninhado`, e o item inteiro
SEMPRE e serializado em `payloadBruto` — isso permite reprocessar e corrigir
o mapeamento depois do primeiro run real em producao, sem precisar consultar
o PNCP de novo. A rota app/api/admin/testar-pncp/route.ts (no site) existe
justamente para o dono do escritorio conferir, em producao, as chaves reais
do primeiro item recebido contra a lista de tentativas abaixo.

Os rotulos textuais das modalidades (MODALIDADES, abaixo) sao um melhor-
esforco baseado no conhecimento geral do dominio "Modalidade de Contratacao"
do Manual de Integracao do PNCP (Lei 14.133/2021) — TAMBEM NAO confirmados
contra a API real. Onde a resposta trouxer o proprio nome da modalidade
(campo modalidadeNome ou equivalente), ele tem prioridade sobre este mapa
fixo; o mapa serve so de fallback/rotulo pra log quando a API nao devolver
o nome.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Sequence

from .http_client import request_json
from .logging_config import get_logger

logger = get_logger(__name__)

BASE_URL = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"

TAMANHO_PAGINA = 500  # maximo aceito pela API, segundo a documentacao publica
MAX_PAGINAS = 50  # trava de seguranca para nunca entrar em loop infinito

# Codigos 1 a 14 da tabela de dominio "Modalidade de Contratacao" do PNCP.
# MELHOR-ESFORCO, nao confirmado contra a API real (ver aviso no topo do
# arquivo) — se algum rotulo estiver errado, corrija aqui apos conferir na
# documentacao oficial ou no retorno de /api/admin/testar-pncp.
MODALIDADES: Dict[int, str] = {
    1: "Leilão - Eletrônico",
    2: "Diálogo Competitivo",
    3: "Concurso",
    4: "Concorrência - Eletrônica",
    5: "Concorrência - Presencial",
    6: "Pregão - Eletrônico",
    7: "Pregão - Presencial",
    8: "Dispensa de Licitação",
    9: "Inexigibilidade",
    10: "Manifestação de Interesse",
    11: "Pré-qualificação",
    12: "Credenciamento",
    13: "Leilão - Presencial",
    14: "Inaplicabilidade da Licitação",
}


def _rotulo_modalidade(codigo: int) -> str:
    rotulo = MODALIDADES.get(codigo)
    if rotulo is not None:
        return rotulo
    # Nao inventamos nome oficial para codigo desconhecido — ver instrucao do
    # plano (Tarefa 2). Registrado em log para investigacao manual depois.
    logger.warning(
        "Codigo de modalidade %d fora do mapa conhecido (1-14); usando rotulo generico.",
        codigo,
    )
    return f"Modalidade {codigo}"


def _primeiro_presente(item: Dict[str, Any], keys: Sequence[str]) -> Optional[Any]:
    """Retorna o primeiro valor nao-nulo entre as variacoes de chave dadas
    (mesma tecnica de src/djen.py:_first_present)."""
    for key in keys:
        if key in item and item[key] is not None:
            return item[key]
    return None


def _primeiro_presente_aninhado(
    item: Dict[str, Any], caminhos: Sequence[Sequence[str]]
) -> Optional[Any]:
    """Como _primeiro_presente, mas cada 'caminho' e uma sequencia de chaves
    para descer em sub-objetos (ex.: ("orgaoEntidade", "cnpj")). Usado porque
    a API do PNCP provavelmente aninha dados do orgao/unidade em sub-objetos,
    mas isso tambem nao foi confirmado — por isso tentamos tanto a forma
    aninhada quanto chaves "achatadas" via _primeiro_presente.
    """
    for caminho in caminhos:
        atual: Any = item
        ok = True
        for chave in caminho:
            if isinstance(atual, dict) and chave in atual and atual[chave] is not None:
                atual = atual[chave]
            else:
                ok = False
                break
        if ok:
            return atual
    return None


@dataclass
class LicitacaoNormalizada:
    numero_controle_pncp: str
    orgao_cnpj: Optional[str]
    orgao_nome: Optional[str]
    uf: Optional[str]
    municipio: Optional[str]
    modalidade_nome: Optional[str]
    objeto: Optional[str]
    valor_estimado: Optional[float]
    situacao: Optional[str]
    data_publicacao: Optional[str]
    data_abertura_proposta: Optional[str]
    data_encerramento_proposta: Optional[str]
    link_sistema_origem: Optional[str]
    payload_bruto: str  # item original serializado em JSON, sempre preenchido


def _normalizar_item(item: Dict[str, Any], codigo_modalidade: int) -> Optional[LicitacaoNormalizada]:
    numero_controle = _primeiro_presente(
        item,
        [
            "numeroControlePNCP",
            "numeroControlePncp",
            "numeroControle",
            "numero_controle_pncp",
            "numeroControlePNCPFormatado",
        ],
    )
    if numero_controle is None:
        logger.warning(
            "Item de licitacao sem numeroControlePNCP reconhecivel, ignorado: %s",
            {k: item.get(k) for k in list(item)[:8]},
        )
        return None

    orgao_cnpj = _primeiro_presente(item, ["orgaoCnpj", "cnpjOrgao", "cnpj"])
    if orgao_cnpj is None:
        orgao_cnpj = _primeiro_presente_aninhado(
            item, [("orgaoEntidade", "cnpj"), ("orgao", "cnpj")]
        )

    orgao_nome = _primeiro_presente(item, ["orgaoNome", "razaoSocialOrgao", "nomeOrgao"])
    if orgao_nome is None:
        orgao_nome = _primeiro_presente_aninhado(
            item,
            [
                ("orgaoEntidade", "razaoSocial"),
                ("orgao", "razaoSocial"),
                ("orgaoEntidade", "nome"),
            ],
        )

    uf = _primeiro_presente(item, ["uf", "ufSigla", "siglaUf"])
    if uf is None:
        uf = _primeiro_presente_aninhado(
            item, [("unidadeOrgao", "ufSigla"), ("unidadeOrgao", "uf")]
        )

    municipio = _primeiro_presente(item, ["municipio", "municipioNome", "nomeMunicipio"])
    if municipio is None:
        municipio = _primeiro_presente_aninhado(
            item, [("unidadeOrgao", "municipioNome"), ("unidadeOrgao", "nomeMunicipio")]
        )

    modalidade_nome = _primeiro_presente(item, ["modalidadeNome", "modalidade", "nomeModalidade"])
    if modalidade_nome is None:
        # A resposta nao trouxe o nome; usamos o rotulo do nosso mapa fixo (melhor-esforco),
        # ja que sabemos o codigo (foi ele que usamos para fazer esta consulta).
        modalidade_nome = _rotulo_modalidade(codigo_modalidade)

    objeto = _primeiro_presente(item, ["objetoCompra", "objeto", "descricaoObjeto"])

    valor_estimado_raw = _primeiro_presente(
        item, ["valorTotalEstimado", "valorEstimado", "valorEstimadoTotal", "valorGlobal"]
    )
    valor_estimado: Optional[float]
    if valor_estimado_raw is None:
        valor_estimado = None
    else:
        try:
            valor_estimado = float(valor_estimado_raw)
        except (TypeError, ValueError):
            logger.warning(
                "Valor estimado '%s' da licitacao %s nao e numerico; gravando como None.",
                valor_estimado_raw,
                numero_controle,
            )
            valor_estimado = None

    situacao = _primeiro_presente(item, ["situacaoCompraNome", "situacao", "situacaoNome"])
    data_publicacao = _primeiro_presente(
        item, ["dataPublicacaoPncp", "dataPublicacao", "dataDivulgacaoPNCP"]
    )
    data_abertura_proposta = _primeiro_presente(
        item, ["dataAberturaProposta", "dataAberturaPropostas"]
    )
    data_encerramento_proposta = _primeiro_presente(
        item, ["dataEncerramentoProposta", "dataEncerramentoPropostas"]
    )
    link_sistema_origem = _primeiro_presente(
        item, ["linkSistemaOrigem", "linkOrigem", "urlSistemaOrigem"]
    )

    try:
        payload_bruto = json.dumps(item, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        # Nunca deve acontecer (item veio de response.json()), mas por seguranca nao deixamos
        # uma falha de serializacao derrubar a captura inteira do item.
        payload_bruto = str(item)

    return LicitacaoNormalizada(
        numero_controle_pncp=str(numero_controle),
        orgao_cnpj=str(orgao_cnpj) if orgao_cnpj is not None else None,
        orgao_nome=str(orgao_nome) if orgao_nome is not None else None,
        uf=str(uf) if uf is not None else None,
        municipio=str(municipio) if municipio is not None else None,
        modalidade_nome=str(modalidade_nome) if modalidade_nome is not None else None,
        objeto=str(objeto) if objeto is not None else None,
        valor_estimado=valor_estimado,
        situacao=str(situacao) if situacao is not None else None,
        data_publicacao=str(data_publicacao) if data_publicacao is not None else None,
        data_abertura_proposta=str(data_abertura_proposta) if data_abertura_proposta is not None else None,
        data_encerramento_proposta=str(data_encerramento_proposta)
        if data_encerramento_proposta is not None
        else None,
        link_sistema_origem=str(link_sistema_origem) if link_sistema_origem is not None else None,
        payload_bruto=payload_bruto,
    )


def _extrair_lista_itens(payload: Any) -> List[Dict[str, Any]]:
    """A API pode retornar a lista diretamente ou aninhada em algum envelope
    (mesma incerteza de src/djen.py:_extrair_lista_itens)."""
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("data", "items", "content", "resultado"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    logger.warning(
        "Formato de resposta do PNCP nao reconhecido (esperava lista ou dict "
        "com uma chave conhecida); retornando lista vazia."
    )
    return []


def _tem_mais_paginas(payload: Any, pagina_atual: int) -> Optional[bool]:
    """Heuristica defensiva de paginacao: usa totalPaginas se a API informar
    (retorna True/False). Quando a resposta nao traz essa informacao, retorna
    None — quem chama decide o fallback (ver _buscar_uma_modalidade: assume
    que ha mais paginas enquanto a pagina atual vier "cheia")."""
    if isinstance(payload, dict):
        total_paginas = _primeiro_presente(payload, ["totalPaginas", "totalPages"])
        if total_paginas is not None:
            try:
                return pagina_atual < int(total_paginas)
            except (TypeError, ValueError):
                pass
    return None  # sem total confiavel na resposta


def _contar_campos_nulos(itens: List[LicitacaoNormalizada]) -> Dict[str, int]:
    """Conta, por campo do nosso modelo, quantos itens normalizados ficaram
    com esse campo nulo — usado so para diagnostico em log (ver Tarefa 2)."""
    campos = [
        "orgao_cnpj",
        "orgao_nome",
        "uf",
        "municipio",
        "modalidade_nome",
        "objeto",
        "valor_estimado",
        "situacao",
        "data_publicacao",
        "data_abertura_proposta",
        "data_encerramento_proposta",
        "link_sistema_origem",
    ]
    contagem = {campo: 0 for campo in campos}
    for item in itens:
        for campo in campos:
            if getattr(item, campo) is None:
                contagem[campo] += 1
    return contagem


def _buscar_uma_modalidade(
    uf: str, codigo_modalidade: int, data_inicial: str, data_final: str
) -> List[LicitacaoNormalizada]:
    """Percorre todas as paginas disponiveis para uma combinacao (uf, modalidade).

    Nunca levanta excecao: qualquer falha de rede/parsing e logada e a busca
    desta combinacao simplesmente para, preservando o que ja foi coletado.
    """
    resultados: List[LicitacaoNormalizada] = []
    pagina = 1

    while pagina <= MAX_PAGINAS:
        params = {
            "dataInicial": data_inicial,
            "dataFinal": data_final,
            "codigoModalidadeContratacao": codigo_modalidade,
            "uf": uf,
            "pagina": pagina,
            "tamanhoPagina": TAMANHO_PAGINA,
        }
        try:
            payload = request_json("GET", BASE_URL, params=params)
        except Exception:  # pragma: no cover - protecao extra, request_json ja trata a maioria
            logger.exception(
                "Falha inesperada ao consultar PNCP (uf=%s, modalidade=%d, pagina=%d).",
                uf,
                codigo_modalidade,
                pagina,
            )
            break

        if payload is None:
            # Falha ja logada por http_client (403, rede, JSON invalido, etc). Interrompe a
            # paginacao desta combinacao, mas preserva o que ja foi coletado nas paginas
            # anteriores (se houver).
            break

        itens_brutos = _extrair_lista_itens(payload)
        if not itens_brutos:
            break

        for item in itens_brutos:
            if not isinstance(item, dict):
                continue
            normalizado = _normalizar_item(item, codigo_modalidade)
            if normalizado is not None:
                resultados.append(normalizado)

        tem_mais = _tem_mais_paginas(payload, pagina)
        if tem_mais is None:
            # Sem total de paginas confiavel na resposta: assume que ha mais enquanto a pagina
            # vier "cheia" (mesma heuristica de src/djen.py:_tem_mais_paginas).
            tem_mais = len(itens_brutos) >= TAMANHO_PAGINA

        if not tem_mais:
            break
        pagina += 1

    return resultados


def coletar_licitacoes(ufs: List[str], dias_retroativos: int = 3) -> List[Dict[str, Any]]:
    """Coleta licitacoes publicadas nas UFs informadas, dentro da janela de
    `dias_retroativos` dias, para TODAS as modalidades (1 a 14 — a API exige
    o codigo de modalidade como parametro obrigatorio, entao iteramos).

    Retorna uma lista de dicts com as chaves do model RoboLicitacao (Tarefa 1),
    prontos para upsert em src/db.py. Nunca levanta excecao — qualquer falha
    de rede/parsing e logada e a combinacao (uf, modalidade) que falhou
    simplesmente fica de fora do resultado desta execucao.
    """
    hoje = date.today()
    data_inicial = (hoje - timedelta(days=dias_retroativos)).strftime("%Y%m%d")
    data_final = hoje.strftime("%Y%m%d")

    resultado: List[Dict[str, Any]] = []

    for uf in ufs:
        for codigo_modalidade in sorted(MODALIDADES.keys()):
            try:
                itens = _buscar_uma_modalidade(uf, codigo_modalidade, data_inicial, data_final)
            except Exception:  # pragma: no cover - protecao extra
                logger.exception(
                    "Falha inesperada ao coletar licitacoes (uf=%s, modalidade=%d).",
                    uf,
                    codigo_modalidade,
                )
                continue

            rotulo = _rotulo_modalidade(codigo_modalidade)
            if itens:
                nulos = _contar_campos_nulos(itens)
                campos_com_nulo = {k: v for k, v in nulos.items() if v > 0}
                logger.info(
                    "PNCP uf=%s modalidade=%d (%s): %d licitacao(oes) recebida(s). "
                    "Campos nulos (item, contagem): %s",
                    uf,
                    codigo_modalidade,
                    rotulo,
                    len(itens),
                    campos_com_nulo or "nenhum",
                )
            else:
                logger.info(
                    "PNCP uf=%s modalidade=%d (%s): 0 licitacao(oes) recebida(s).",
                    uf,
                    codigo_modalidade,
                    rotulo,
                )

            for item in itens:
                resultado.append(
                    {
                        "numeroControlePNCP": item.numero_controle_pncp,
                        "orgaoCnpj": item.orgao_cnpj,
                        "orgaoNome": item.orgao_nome,
                        "uf": item.uf,
                        "municipio": item.municipio,
                        "modalidadeNome": item.modalidade_nome,
                        "objeto": item.objeto,
                        "valorEstimado": item.valor_estimado,
                        "situacao": item.situacao,
                        "dataPublicacao": item.data_publicacao,
                        "dataAberturaProposta": item.data_abertura_proposta,
                        "dataEncerramentoProposta": item.data_encerramento_proposta,
                        "linkSistemaOrigem": item.link_sistema_origem,
                        "payloadBruto": item.payload_bruto,
                    }
                )

    logger.info(
        "PNCP: %d licitacao(oes) coletada(s) no total, para %d UF(s) e %d modalidade(s).",
        len(resultado),
        len(ufs),
        len(MODALIDADES),
    )
    return resultado
