"""Testes do mapeamento de alias de tribunal e do parsing de movimentos do Datajud."""

from __future__ import annotations

from src import datajud


def test_alias_estadual_goias():
    # J=8 (estadual), TR=09 -> TJGO
    assert datajud.alias_do_tribunal("0000000-00.2020.8.09.0001") == "tjgo"


def test_alias_federal_trf1():
    # J=4 (federal), TR=01 -> TRF1
    assert datajud.alias_do_tribunal("0000832-35.2018.4.01.3202") == "trf1"


def test_alias_trabalho_trt18():
    # J=5 (trabalho), TR=18 -> TRT18
    assert datajud.alias_do_tribunal("0000000-00.2020.5.18.0001") == "trt18"


def test_alias_tst():
    # J=5, TR=90 -> TST
    assert datajud.alias_do_tribunal("0000000-00.2020.5.90.0001") == "tst"


def test_alias_eleitoral():
    # J=6, TR=09 -> TRE-GO (com hifen, confirmado contra a lista oficial do CNJ)
    assert datajud.alias_do_tribunal("0000000-00.2020.6.09.0001") == "tre-go"


def test_alias_estadual_df():
    # J=8, TR=07 -> TJDFT (sufixo "dft", nao "df")
    assert datajud.alias_do_tribunal("0000000-00.2020.8.07.0001") == "tjdft"


def test_alias_eleitoral_df():
    # J=6, TR=07 -> TRE-DFT (sufixo "dft", nao "df")
    assert datajud.alias_do_tribunal("0000000-00.2020.6.07.0001") == "tre-dft"


def test_alias_militar_uniao_stm():
    # J=7 -> STM (Justica Militar da Uniao)
    assert datajud.alias_do_tribunal("0000000-00.2020.7.00.0001") == "stm"


def test_alias_militar_estadual_sp():
    # J=9, TR=26 -> TJM-SP
    assert datajud.alias_do_tribunal("0000000-00.2020.9.26.0001") == "tjmsp"


def test_alias_stj():
    assert datajud.alias_do_tribunal("0000000-00.2020.3.00.0001") == "stj"


def test_alias_numero_sem_mascara():
    assert datajud.alias_do_tribunal("00008323520184013202") == "trf1"


def test_alias_numero_invalido_retorna_none():
    assert datajud.alias_do_tribunal("123") is None


def test_alias_tr_fora_de_faixa_retorna_none():
    # TR=99 nao existe no segmento estadual (max 27)
    assert datajud.alias_do_tribunal("0000000-00.2020.8.99.0001") is None


def test_buscar_andamentos_sem_api_key_retorna_vazio():
    resultado = datajud.buscar_andamentos("0000832-35.2018.4.01.3202", api_key=None)
    assert resultado == []


def test_buscar_andamentos_parse_movimentos(monkeypatch):
    payload = {
        "hits": {
            "hits": [
                {
                    "_source": {
                        "numeroProcesso": "00008323520184013202",
                        "tribunal": "TRF1",
                        "movimentos": [
                            {"codigo": 51, "nome": "Juntada de peticao", "dataHora": "2026-07-10T10:00:00"},
                            {"codigo": 26, "nome": "Distribuicao", "dataHora": "2018-01-05T09:00:00"},
                        ],
                    }
                }
            ]
        }
    }
    monkeypatch.setattr(datajud, "request_json", lambda *a, **k: payload)

    resultado = datajud.buscar_andamentos(
        "0000832-35.2018.4.01.3202", api_key="chave-de-teste"
    )

    assert len(resultado) == 2
    codigos = {mov.codigo_movimento for mov in resultado}
    assert codigos == {"51", "26"}
    assert all(mov.numero_processo == "0000832-35.2018.4.01.3202" for mov in resultado)


def test_buscar_andamentos_alias_desconhecido_retorna_vazio(monkeypatch):
    chamado = {"valor": False}

    def fake_request_json(*a, **k):
        chamado["valor"] = True
        return {"hits": {"hits": []}}

    monkeypatch.setattr(datajud, "request_json", fake_request_json)

    resultado = datajud.buscar_andamentos("0000000-00.2020.8.99.0001", api_key="x")

    assert resultado == []
    assert chamado["valor"] is False  # nem tentou chamar a API sem alias valido


def test_buscar_andamentos_movimento_sem_codigo_e_ignorado(monkeypatch):
    payload = {
        "hits": {
            "hits": [
                {
                    "_source": {
                        "movimentos": [
                            {"nome": "Sem codigo nem data"},
                            {"codigo": 1, "dataHora": "2026-01-01T00:00:00"},
                        ]
                    }
                }
            ]
        }
    }
    monkeypatch.setattr(datajud, "request_json", lambda *a, **k: payload)

    resultado = datajud.buscar_andamentos("0000832-35.2018.4.01.3202", api_key="x")

    assert len(resultado) == 1
    assert resultado[0].codigo_movimento == "1"
