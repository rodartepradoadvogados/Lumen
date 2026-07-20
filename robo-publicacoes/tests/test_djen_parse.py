"""Testes de parsing defensivo do payload do DJEN, incluindo variacoes de
nome de campo que a API pode retornar."""

from __future__ import annotations

from src import djen


def test_normalizar_item_camel_case(monkeypatch):
    payload = {
        "items": [
            {
                "id": "abc123",
                "numeroProcesso": "0000832-35.2018.4.01.3202",
                "siglaTribunal": "TRF1",
                "dataDisponibilizacao": "2026-07-10",
                "tipoComunicacao": "Intimacao",
                "texto": "Teor da publicacao em camelCase.",
                "destinatarioadvogados": ["Jairo Alexandre Rodarte e Silva"],
            }
        ]
    }
    monkeypatch.setattr(djen, "request_json", lambda *a, **k: payload)

    resultados = djen.buscar_publicacoes("78295", "GO", "2026-07-01", "2026-07-10")

    assert len(resultados) == 1
    item = resultados[0]
    assert item.id_comunicacao == "abc123"
    assert item.numero_processo == "0000832-35.2018.4.01.3202"
    assert item.tribunal == "TRF1"
    assert item.data_disponibilizacao == "2026-07-10"
    assert item.tipo_comunicacao == "Intimacao"
    assert "camelCase" in item.teor
    assert "Jairo" in item.destinatario_advogados


def test_normalizar_item_snake_case(monkeypatch):
    payload = {
        "data": [
            {
                "hash": "def456",
                "numero_processo": "1111111-11.2020.8.09.0001",
                "sigla_tribunal": "TJGO",
                "data_disponibilizacao": "2026-07-11",
                "tipo_comunicacao": "Citacao",
                "teor": "Teor em snake_case.",
            }
        ]
    }
    monkeypatch.setattr(djen, "request_json", lambda *a, **k: payload)

    resultados = djen.buscar_publicacoes("32943", "GO", "2026-07-01", "2026-07-10")

    assert len(resultados) == 1
    item = resultados[0]
    assert item.id_comunicacao == "def456"
    assert item.numero_processo == "1111111-11.2020.8.09.0001"
    assert item.tribunal == "TJGO"


def test_item_sem_id_e_ignorado(monkeypatch):
    payload = {"items": [{"numeroProcesso": "123", "texto": "sem id"}]}
    monkeypatch.setattr(djen, "request_json", lambda *a, **k: payload)

    resultados = djen.buscar_publicacoes("78295", "GO", "2026-07-01", "2026-07-10")

    assert resultados == []


def test_item_sem_numero_processo_e_ignorado(monkeypatch):
    payload = {"items": [{"id": "1", "texto": "sem processo"}]}
    monkeypatch.setattr(djen, "request_json", lambda *a, **k: payload)

    resultados = djen.buscar_publicacoes("78295", "GO", "2026-07-01", "2026-07-10")

    assert resultados == []


def test_resposta_lista_direta(monkeypatch):
    payload = [{"id": "1", "numeroProcesso": "123", "texto": "lista direta"}]
    monkeypatch.setattr(djen, "request_json", lambda *a, **k: payload)

    resultados = djen.buscar_publicacoes("78295", "GO", "2026-07-01", "2026-07-10")

    assert len(resultados) == 1


def test_resposta_none_retorna_lista_vazia(monkeypatch):
    monkeypatch.setattr(djen, "request_json", lambda *a, **k: None)

    resultados = djen.buscar_publicacoes("78295", "GO", "2026-07-01", "2026-07-10")

    assert resultados == []


def test_paginacao_para_quando_pagina_incompleta(monkeypatch):
    """Se a pagina retornar menos itens que itens_por_pagina e nao houver
    campo de total, a paginacao deve parar (heuristica de "pagina cheia")."""
    chamadas = []

    def fake_request_json(method, url, params=None, **kwargs):
        chamadas.append(params["pagina"])
        if params["pagina"] == 1:
            return {"items": [{"id": str(i), "numeroProcesso": "123"} for i in range(5)]}
        return {"items": []}

    monkeypatch.setattr(djen, "request_json", fake_request_json)

    resultados = djen.buscar_publicacoes(
        "78295", "GO", "2026-07-01", "2026-07-10", itens_por_pagina=40
    )

    assert len(resultados) == 5
    assert chamadas == [1]
