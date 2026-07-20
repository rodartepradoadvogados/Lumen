"""Garante que reprocessar o mesmo id de publicacao ou o mesmo movimento de
andamento nao gera duplicatas no banco."""

from __future__ import annotations

from src import discovery, pipeline
from src.datajud import AndamentoNormalizado
from src.db import Andamento, ProcessoMonitorado, Publicacao
from src.djen import PublicacaoNormalizada
from sqlalchemy import select


def _publicacao_fake(id_comunicacao: str = "123") -> PublicacaoNormalizada:
    return PublicacaoNormalizada(
        id_comunicacao=id_comunicacao,
        numero_processo="0000832-35.2018.4.01.3202",
        tribunal="TRF1",
        data_disponibilizacao="2026-07-10",
        tipo_comunicacao="Intimacao",
        teor="Texto de teste da publicacao.",
        destinatario_advogados="Jairo Alexandre Rodarte e Silva",
    )


def _andamento_fake() -> AndamentoNormalizado:
    return AndamentoNormalizado(
        numero_processo="0000832-35.2018.4.01.3202",
        tribunal="TRF1",
        data_movimentacao="2026-07-10T10:00:00",
        codigo_movimento="51",
        descricao_movimento="Juntada de peticao",
    )


def test_publicacao_nao_duplica_ao_reprocessar_mesmo_id(monkeypatch, test_settings, session_factory):
    fake_item = _publicacao_fake()
    monkeypatch.setattr(pipeline.djen, "buscar_publicacoes", lambda *a, **k: [fake_item])
    monkeypatch.setattr(pipeline.datajud, "buscar_andamentos", lambda *a, **k: [])

    pipeline.executar_ciclo(test_settings, session_factory)
    pipeline.executar_ciclo(test_settings, session_factory)

    session = session_factory()
    try:
        publicacoes = session.scalars(select(Publicacao)).all()
    finally:
        session.close()

    assert len(publicacoes) == 1
    assert publicacoes[0].id_comunicacao == "123"


def test_andamento_nao_duplica_ao_reprocessar_mesmo_movimento(monkeypatch, test_settings, session_factory):
    fake_mov = _andamento_fake()
    monkeypatch.setattr(pipeline.djen, "buscar_publicacoes", lambda *a, **k: [])
    monkeypatch.setattr(pipeline.datajud, "buscar_andamentos", lambda *a, **k: [fake_mov])

    session = session_factory()
    try:
        discovery.registrar_processo_se_novo(
            session, "0000832-35.2018.4.01.3202", origem="cadastrado_manualmente"
        )
        session.commit()
    finally:
        session.close()

    pipeline.executar_ciclo(test_settings, session_factory)
    pipeline.executar_ciclo(test_settings, session_factory)

    session = session_factory()
    try:
        andamentos = session.scalars(select(Andamento)).all()
    finally:
        session.close()

    assert len(andamentos) == 1
    assert andamentos[0].codigo_movimento == "51"


def test_processo_monitorado_nao_duplica(session_factory):
    session = session_factory()
    try:
        criado_1 = discovery.registrar_processo_se_novo(
            session, "0000832-35.2018.4.01.3202", origem="descoberto_via_djen"
        )
        criado_2 = discovery.registrar_processo_se_novo(
            session, "0000832-35.2018.4.01.3202", origem="descoberto_via_djen"
        )
        session.commit()

        total = session.scalars(select(ProcessoMonitorado)).all()
    finally:
        session.close()

    assert criado_1 is True
    assert criado_2 is False
    assert len(total) == 1
