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


# ---------------------------------------------------------------------------------------------
# DataJud lento (TJGO com "Read timed out") nao pode prender nem derrubar o ciclo (12/10/2026)
# ---------------------------------------------------------------------------------------------

from src.db import ProcessoMonitorado  # noqa: E402


def _processos_goias(session, quantos):
    # NNNNNNN-DD.AAAA.8.09.OOOO: justica estadual de Goias (alias tjgo)
    for i in range(quantos):
        session.add(ProcessoMonitorado(numero_processo=f"{i:07d}0020248090011", origem="teste"))
    session.commit()


def test_tribunal_que_nao_responde_e_pulado_depois_de_poucas_falhas(monkeypatch, test_settings, session_factory):
    s = session_factory()
    _processos_goias(s, 10)
    chamadas = []

    def sempre_falha(numero, chave):
        chamadas.append(numero)
        return ConsultaDatajud(ok=False, andamentos=[], motivo="timeout")

    monkeypatch.setattr(pipeline.datajud, "consultar_andamentos", sempre_falha)
    pipeline._capturar_andamentos_datajud(s, test_settings)
    assert len(chamadas) == pipeline.DATAJUD_FALHAS_SEGUIDAS_POR_TRIBUNAL
    log = s.scalars(select(ExecucaoLog).where(ExecucaoLog.fonte == "DATAJUD")).all()[-1]
    assert log.sucesso is False  # os pulados contam como falha: o alerta de duas falhas continua valendo
    assert "nao consultado" in log.detalhe
    s.close()


def test_sucesso_zera_a_contagem_de_falhas_seguidas(monkeypatch, test_settings, session_factory):
    s = session_factory()
    _processos_goias(s, 8)
    respostas = iter([False, False, True, False, False, True, False, False])

    def alterna(numero, chave):
        ok = next(respostas)
        return ConsultaDatajud(ok=ok, andamentos=[], motivo=None if ok else "timeout")

    monkeypatch.setattr(pipeline.datajud, "consultar_andamentos", alterna)
    pipeline._capturar_andamentos_datajud(s, test_settings)
    assert next(respostas, "esgotou") == "esgotou"  # nenhum processo foi pulado
    s.close()


def test_orcamento_de_tempo_interrompe_a_etapa(monkeypatch, test_settings, session_factory):
    s = session_factory()
    _processos_goias(s, 5)
    monkeypatch.setattr(pipeline, "DATAJUD_ORCAMENTO_SEGUNDOS", -1)
    chamadas = []
    monkeypatch.setattr(
        pipeline.datajud, "consultar_andamentos", lambda n, c: chamadas.append(n) or ConsultaDatajud(ok=True, andamentos=[])
    )
    pipeline._capturar_andamentos_datajud(s, test_settings)
    assert chamadas == []
    s.close()


def test_captura_do_djen_fica_gravada_antes_da_etapa_do_datajud(monkeypatch, test_settings, session_factory):
    """Queda de conexao no DataJud nao pode jogar fora o que o DJEN ja trouxe."""
    monkeypatch.setattr(pipeline.djen, "buscar_publicacoes", lambda *a, **k: [])
    monkeypatch.setattr(pipeline, "_descobrir_processos", lambda *a, **k: 0)

    def cai(session, settings):
        raise RuntimeError("SSL connection has been closed unexpectedly")

    monkeypatch.setattr(pipeline, "_capturar_andamentos_datajud", cai)
    try:
        pipeline.executar_ciclo(test_settings, session_factory)
    except RuntimeError:
        pass
    s = session_factory()
    djen = s.scalars(select(ExecucaoLog).where(ExecucaoLog.fonte == "DJEN")).all()
    assert len(djen) == 1  # o registro do DJEN sobreviveu ao rollback da etapa seguinte
    s.close()


def test_datajud_so_e_devido_depois_do_intervalo(test_settings, session_factory):
    s = session_factory()
    assert pipeline._datajud_devido(s) is True  # nunca rodou
    _log(s, "DATAJUD", True, 0)
    assert pipeline._datajud_devido(s) is False  # acabou de dar certo
    s.close()


def test_datajud_com_falha_recente_tenta_de_novo_no_proximo_ciclo(test_settings, session_factory):
    s = session_factory()
    _log(s, "DATAJUD", True, 3)  # sucesso antigo
    _log(s, "DATAJUD", False, 0)  # falhou agora: nao conta como sucesso
    assert pipeline._datajud_devido(s) is True
    s.close()


def test_datajud_pulado_nao_consulta_nada(monkeypatch, test_settings, session_factory):
    s = session_factory()
    _processos_goias(s, 3)
    _log(s, "DATAJUD", True, 0)
    chamadas = []
    monkeypatch.setattr(
        pipeline.datajud, "consultar_andamentos", lambda n, c: chamadas.append(n) or ConsultaDatajud(ok=True, andamentos=[])
    )
    pipeline._capturar_andamentos_datajud(s, test_settings)
    assert chamadas == []
    s.close()
