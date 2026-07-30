"""Testes de parsing defensivo do payload do PNCP.

Payloads 100% inventados (nao vem de nenhuma resposta real, ver aviso no topo
de src/pncp.py) — o objetivo aqui e travar o CONTRATO do normalizador (quais
chaves ele tenta, em que ordem, e que payload_bruto sempre preserva o item
original), nao validar contra a API de verdade."""

from __future__ import annotations

import json

from src import pncp


def test_normalizar_item_formato_aninhado_camel_case():
    """Payload no formato que a documentacao do PNCP sugere: orgao/unidade
    aninhados em sub-objetos."""
    item = {
        "numeroControlePNCP": "12345678000190-1-000001/2026",
        "orgaoEntidade": {"cnpj": "12345678000190", "razaoSocial": "Prefeitura de Exemplo"},
        "unidadeOrgao": {"ufSigla": "GO", "municipioNome": "Goiânia"},
        "modalidadeNome": "Pregão - Eletrônico",
        "objetoCompra": "Aquisição de material de escritório.",
        "valorTotalEstimado": 15000.5,
        "situacaoCompraNome": "Divulgada no PNCP",
        "dataPublicacaoPncp": "2026-07-28",
        "dataAberturaProposta": "2026-08-01T09:00:00",
        "dataEncerramentoProposta": "2026-08-10T18:00:00",
        "linkSistemaOrigem": "https://exemplo.gov.br/licitacao/1",
    }

    resultado = pncp._normalizar_item(item, codigo_modalidade=6)

    assert resultado is not None
    assert resultado.numero_controle_pncp == "12345678000190-1-000001/2026"
    assert resultado.orgao_cnpj == "12345678000190"
    assert resultado.orgao_nome == "Prefeitura de Exemplo"
    assert resultado.uf == "GO"
    assert resultado.municipio == "Goiânia"
    assert resultado.modalidade_nome == "Pregão - Eletrônico"
    assert resultado.objeto == "Aquisição de material de escritório."
    assert resultado.valor_estimado == 15000.5
    assert resultado.situacao == "Divulgada no PNCP"
    assert resultado.data_publicacao == "2026-07-28"
    assert resultado.data_abertura_proposta == "2026-08-01T09:00:00"
    assert resultado.data_encerramento_proposta == "2026-08-10T18:00:00"
    assert resultado.link_sistema_origem == "https://exemplo.gov.br/licitacao/1"
    # payload_bruto preserva o item ORIGINAL inteiro, para reprocessamento futuro.
    assert json.loads(resultado.payload_bruto) == item


def test_normalizar_item_formato_achatado_sem_nome_modalidade():
    """Payload alternativo: campos "achatados" (sem sub-objetos) e sem o nome
    da modalidade — o normalizador deve cair no rotulo fixo (MODALIDADES)."""
    item = {
        "numeroControlePncp": "98765432000199-1-000002/2026",
        "cnpjOrgao": "98765432000199",
        "nomeOrgao": "Governo do Estado Exemplo",
        "ufSigla": "DF",
        "nomeMunicipio": "Brasília",
        "objeto": "Contratação de serviços de limpeza.",
        "valorEstimado": "250000.00",  # string, mesmo assim deve virar float
        "situacaoNome": "Aberta",
    }

    resultado = pncp._normalizar_item(item, codigo_modalidade=8)

    assert resultado is not None
    assert resultado.numero_controle_pncp == "98765432000199-1-000002/2026"
    assert resultado.orgao_cnpj == "98765432000199"
    assert resultado.orgao_nome == "Governo do Estado Exemplo"
    assert resultado.uf == "DF"
    assert resultado.municipio == "Brasília"
    # Sem modalidadeNome no payload: cai no rotulo fixo do codigo 8.
    assert resultado.modalidade_nome == "Dispensa de Licitação"
    assert resultado.objeto == "Contratação de serviços de limpeza."
    assert resultado.valor_estimado == 250000.0
    assert resultado.situacao == "Aberta"
    # Datas/link ausentes no payload viram None, sem levantar excecao.
    assert resultado.data_publicacao is None
    assert resultado.link_sistema_origem is None


def test_normalizar_item_sem_numero_controle_e_ignorado():
    """Sem numeroControlePNCP reconhecivel (nenhuma variacao de chave bate),
    o item e descartado (retorna None) em vez de gerar um registro inutil."""
    item = {"objeto": "Item incompleto, sem identificador."}

    resultado = pncp._normalizar_item(item, codigo_modalidade=1)

    assert resultado is None


def test_normalizar_item_valor_estimado_invalido_vira_none():
    """Valor nao numerico no campo de valor estimado nunca deve levantar
    excecao — vira None e o resto do item continua normalizado."""
    item = {
        "numeroControlePNCP": "11111111000111-1-000003/2026",
        "valorEstimado": "não é um número",
    }

    resultado = pncp._normalizar_item(item, codigo_modalidade=1)

    assert resultado is not None
    assert resultado.valor_estimado is None


def test_coletar_licitacoes_normaliza_paginas_e_para_com_pagina_vazia(monkeypatch):
    """Exercita coletar_licitacoes() de ponta a ponta com request_json mockado
    (envelope {"data": [...], "totalPaginas": N}), confirmando paginacao e
    que o resultado final tem as chaves exatas do model RoboLicitacao."""

    pagina_1 = {
        "data": [
            {
                "numeroControlePNCP": "1-1-000001/2026",
                "orgaoEntidade": {"cnpj": "00000000000191", "razaoSocial": "Órgão A"},
                "unidadeOrgao": {"ufSigla": "GO", "municipioNome": "Goiânia"},
                "objetoCompra": "Objeto A",
            }
        ],
        "totalPaginas": 2,
    }
    pagina_2 = {
        "data": [
            {
                "numeroControlePNCP": "1-1-000002/2026",
                "orgaoEntidade": {"cnpj": "00000000000191", "razaoSocial": "Órgão A"},
                "unidadeOrgao": {"ufSigla": "GO", "municipioNome": "Goiânia"},
                "objetoCompra": "Objeto B",
            }
        ],
        "totalPaginas": 2,
    }

    chamadas = {"n": 0}

    def fake_request_json(method, url, *, params=None, **kwargs):
        chamadas["n"] += 1
        pagina = params["pagina"] if params else 1
        # Só a modalidade 6 (Pregão - Eletrônico) devolve algo; as demais, lista vazia —
        # simula a maioria das modalidades sem licitação nova na janela.
        if params.get("codigoModalidadeContratacao") != 6:
            return {"data": [], "totalPaginas": 1}
        return pagina_1 if pagina == 1 else pagina_2

    monkeypatch.setattr(pncp, "request_json", fake_request_json)

    resultado = pncp.coletar_licitacoes(["GO"], dias_retroativos=3)

    assert len(resultado) == 2
    chaves_esperadas = {
        "numeroControlePNCP",
        "orgaoCnpj",
        "orgaoNome",
        "uf",
        "municipio",
        "modalidadeNome",
        "objeto",
        "valorEstimado",
        "situacao",
        "dataPublicacao",
        "dataAberturaProposta",
        "dataEncerramentoProposta",
        "linkSistemaOrigem",
        "payloadBruto",
    }
    assert set(resultado[0].keys()) == chaves_esperadas
    assert {item["numeroControlePNCP"] for item in resultado} == {
        "1-1-000001/2026",
        "1-1-000002/2026",
    }


def test_coletar_licitacoes_nunca_levanta_excecao_em_falha_de_rede(monkeypatch):
    """Se request_json falhar/retornar None para todas as combinacoes (rede
    indisponivel), coletar_licitacoes NUNCA levanta excecao — retorna lista
    vazia. Este e o comportamento exigido pelo pipeline (Tarefa 3): o PNCP
    nao pode derrubar o ciclo inteiro."""

    def fake_request_json(*args, **kwargs):
        return None

    monkeypatch.setattr(pncp, "request_json", fake_request_json)

    resultado = pncp.coletar_licitacoes(["GO", "DF"], dias_retroativos=3)

    assert resultado == []
