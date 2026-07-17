"""Roda o ciclo completo 2x com as mesmas respostas mockadas do DJEN/Datajud
e garante que a segunda execucao nao gera novas notificacoes nem duplica
registros."""

from __future__ import annotations

from sqlalchemy import select

from src import pipeline
from src.datajud import AndamentoNormalizado
from src.db import Andamento, ExecucaoLog, ProcessoMonitorado, Publicacao
from src.djen import PublicacaoNormalizada


def _publicacoes_mockadas():
    return [
        PublicacaoNormalizada(
            id_comunicacao="pub-1",
            numero_processo="0000832-35.2018.4.01.3202",
            tribunal="TRF1",
            data_disponibilizacao="2026-07-10",
            tipo_comunicacao="Intimacao",
            teor="Prazo de 15 dias para manifestacao.",
            destinatario_advogados="Jairo Alexandre Rodarte e Silva",
        )
    ]


def _andamentos_mockados(numero_processo: str):
    return [
        AndamentoNormalizado(
            numero_processo=numero_processo,
            tribunal="TRF1",
            data_movimentacao="2026-07-10T10:00:00",
            codigo_movimento="51",
            descricao_movimento="Juntada de peticao",
        )
    ]


def test_ciclo_e_idempotente(monkeypatch, test_settings, session_factory):
    publicacoes_mock = _publicacoes_mockadas()

    def fake_buscar_publicacoes(numero_oab, uf_oab, data_inicio, data_fim, **kwargs):
        return publicacoes_mock

    def fake_buscar_andamentos(numero_processo, api_key):
        return _andamentos_mockados(numero_processo)

    monkeypatch.setattr(pipeline.djen, "buscar_publicacoes", fake_buscar_publicacoes)
    monkeypatch.setattr(pipeline.datajud, "buscar_andamentos", fake_buscar_andamentos)

    emails_enviados = []
    monkeypatch.setattr(
        pipeline.notify,
        "enviar_email",
        lambda settings, assunto, corpo: emails_enviados.append(assunto) or True,
    )

    resultado_1 = pipeline.executar_ciclo(test_settings, session_factory)
    resultado_2 = pipeline.executar_ciclo(test_settings, session_factory)

    # Primeiro ciclo: descobre 1 publicacao nova. O andamento so pode ser
    # capturado depois que o processo foi descoberto via discovery, ou seja,
    # a partir do PROPRIO ciclo 1 (discovery roda antes da consulta ao
    # Datajud dentro do mesmo ciclo). A partir do ciclo 2, nada e novo.
    assert resultado_1.novas_publicacoes == 1
    assert resultado_1.novos_processos_descobertos == 1
    assert resultado_1.novos_andamentos == 1

    assert resultado_2.novas_publicacoes == 0
    assert resultado_2.novos_processos_descobertos == 0
    assert resultado_2.novos_andamentos == 0

    # Apenas o primeiro ciclo deve ter gerado envio de e-mail (2 OABs
    # configuradas, mas apenas 1 publicacao/andamento no total — 1 email).
    assert len(emails_enviados) == 1

    session = session_factory()
    try:
        total_publicacoes = session.scalars(select(Publicacao)).all()
        total_andamentos = session.scalars(select(Andamento)).all()
        total_processos = session.scalars(select(ProcessoMonitorado)).all()
        total_logs = session.scalars(select(ExecucaoLog)).all()
    finally:
        session.close()

    assert len(total_publicacoes) == 1
    assert len(total_andamentos) == 1
    assert len(total_processos) == 1
    # 2 ciclos x 2 fontes (DJEN, DATAJUD) = 4 entradas de log.
    assert len(total_logs) == 4


def test_ciclo_sem_novidades_nao_envia_email(monkeypatch, test_settings, session_factory):
    monkeypatch.setattr(pipeline.djen, "buscar_publicacoes", lambda *a, **k: [])
    monkeypatch.setattr(pipeline.datajud, "buscar_andamentos", lambda *a, **k: [])

    emails_enviados = []
    monkeypatch.setattr(
        pipeline.notify,
        "enviar_email",
        lambda settings, assunto, corpo: emails_enviados.append(assunto) or True,
    )

    resultado = pipeline.executar_ciclo(test_settings, session_factory)

    assert resultado.email_enviado is False
    assert emails_enviados == []
