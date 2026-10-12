"""Janela de recuperacao do DJEN e falha honesta do DataJud (robo parado 19 dias sem ninguem saber)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from src import discovery, pipeline
from src.datajud import ConsultaDatajud
from src.db import ExecucaoLog


def _log(session, fonte, sucesso, ha_dias):
    session.add(
        ExecucaoLog(
            fonte=fonte,
            sucesso=sucesso,
            detalhe="teste",
            executado_em=datetime.now(timezone.utc) - timedelta(days=ha_dias),
        )
    )
    session.commit()


def test_janela_normal_quando_o_ultimo_sucesso_e_recente(test_settings, session_factory):
    s = session_factory()
    _log(s, "DJEN", True, 0)
    assert pipeline._janela_efetiva_dias(s, test_settings) == test_settings.janela_dias
    s.close()


def test_janela_sem_historico_usa_a_configurada(test_settings, session_factory):
    s = session_factory()
    assert pipeline._janela_efetiva_dias(s, test_settings) == test_settings.janela_dias
    s.close()


def test_janela_estica_para_cobrir_o_buraco(test_settings, session_factory):
    s = session_factory()
    _log(s, "DJEN", True, 19)
    janela = pipeline._janela_efetiva_dias(s, test_settings)
    assert janela >= 19 + pipeline.JANELA_FOLGA_DIAS - 1
    assert janela > test_settings.janela_dias
    s.close()


def test_janela_tem_teto(test_settings, session_factory):
    s = session_factory()
    _log(s, "DJEN", True, 400)
    assert pipeline._janela_efetiva_dias(s, test_settings) == pipeline.JANELA_MAXIMA_DIAS
    s.close()


def test_falha_do_djen_nao_conta_como_ultimo_sucesso(test_settings, session_factory):
    s = session_factory()
    _log(s, "DJEN", True, 20)
    _log(s, "DJEN", False, 1)  # ontem falhou: o buraco continua contando do ultimo SUCESSO
    assert pipeline._janela_efetiva_dias(s, test_settings) >= 20
    s.close()


def test_datajud_com_todas_as_consultas_falhando_registra_falha(monkeypatch, test_settings, session_factory):
    monkeypatch.setattr(pipeline.djen, "buscar_publicacoes", lambda *a, **k: [])
    monkeypatch.setattr(
        pipeline.datajud,
        "consultar_andamentos",
        lambda *a, **k: ConsultaDatajud(ok=False, andamentos=[], motivo="sem resposta util do Datajud (tjgo)"),
    )
    s = session_factory()
    discovery.registrar_processo_se_novo(s, "0000832-35.2018.4.01.3202", "teste")
    discovery.registrar_processo_se_novo(s, "5001234-56.2026.8.09.0051", "teste")
    s.commit()
    s.close()

    pipeline.executar_ciclo(test_settings, session_factory)

    s = session_factory()
    log = s.scalars(select(ExecucaoLog).where(ExecucaoLog.fonte == "DATAJUD").order_by(ExecucaoLog.id.desc())).first()
    s.close()
    assert log is not None and log.sucesso is False
    assert "2 consulta(s) com falha" in (log.detalhe or "")


def test_datajud_sem_novidade_continua_sendo_sucesso(monkeypatch, test_settings, session_factory):
    monkeypatch.setattr(pipeline.djen, "buscar_publicacoes", lambda *a, **k: [])
    monkeypatch.setattr(
        pipeline.datajud, "consultar_andamentos", lambda *a, **k: ConsultaDatajud(ok=True, andamentos=[])
    )
    s = session_factory()
    discovery.registrar_processo_se_novo(s, "0000832-35.2018.4.01.3202", "teste")
    s.commit()
    s.close()

    pipeline.executar_ciclo(test_settings, session_factory)

    s = session_factory()
    log = s.scalars(select(ExecucaoLog).where(ExecucaoLog.fonte == "DATAJUD").order_by(ExecucaoLog.id.desc())).first()
    s.close()
    assert log is not None and log.sucesso is True


def test_consultar_andamentos_sem_chave_e_falha_mas_alias_desconhecido_nao_e(monkeypatch):
    from src import datajud

    assert datajud.consultar_andamentos("0000832-35.2018.4.01.3202", None).ok is False
    monkeypatch.setattr(datajud, "alias_do_tribunal", lambda n: None)
    r = datajud.consultar_andamentos("0000832-35.2018.4.01.3202", "chave")
    assert r.ok is True and r.andamentos == []
