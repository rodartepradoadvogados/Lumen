"""Fixtures compartilhadas pelos testes: engine SQLite em memoria e settings de teste."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine

from src import pipeline
from src.config import Oab, Settings
from src.db import build_session_factory, init_db


@pytest.fixture()
def engine():
    """Engine SQLite em memoria, isolada por teste (StaticPool para
    compartilhar a mesma conexao entre usos, ja que ':memory:' sozinho
    criaria um banco novo a cada conexao)."""
    from sqlalchemy.pool import StaticPool

    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    init_db(eng)
    return eng


@pytest.fixture()
def session_factory(engine):
    return build_session_factory(engine)


@pytest.fixture()
def test_settings() -> Settings:
    return Settings(
        database_url=None,
        oabs=[
            Oab(nome="Jairo Alexandre Rodarte e Silva", numero="78295", uf="GO"),
            Oab(nome="Rodrigo Araujo do Prado", numero="32943", uf="GO"),
        ],
        janela_dias=5,
        intervalo_horas=2,
        smtp_host="smtp.example.com",
        smtp_port=465,
        smtp_user=None,
        smtp_password=None,
        email_to=["rodartepradoadvogados@gmail.com"],
        datajud_api_key="chave-de-teste",
        gemini_api_key=None,
        djen_proxy_url=None,
        pncp_ufs=["GO", "DF"],
        # Sem credenciais nos testes: src/inlabs.py:coletar_dou() detecta a ausencia e retorna
        # cedo (loga aviso, nunca tenta rede) — mesmo comportamento defensivo de producao
        # quando INLABS_USERNAME/INLABS_PASSWORD nao estao configuradas (ver config.py).
        inlabs_username=None,
        inlabs_password=None,
        inlabs_secoes=["DO1", "DO3"],
        log_level="INFO",
    )


@pytest.fixture(autouse=True)
def _pncp_sem_rede(monkeypatch):
    """Autouse: nenhum teste de pipeline deve depender de acesso real a rede do PNCP (src/pncp.py)
    — os testes existentes de DJEN/Datajud (test_dedup.py, test_pipeline_idempotente.py) chamam
    pipeline.executar_ciclo(), que agora tambem tenta coletar licitacoes do PNCP; sem este mock
    eles fariam requisicoes HTTP reais (bloqueadas neste ambiente, e lentas/instaveis em qualquer
    ambiente de CI).

    Importante: o mock e no nivel de request_json (simula "rede indisponivel"), NAO em
    coletar_licitacoes() diretamente — assim o caminho defensivo REAL de src/pncp.py continua
    sendo exercitado (retorna [] porque request_json devolve None, exatamente como aconteceria
    em producao se o PNCP estivesse fora do ar), e os testes de tests/test_pncp.py que precisam
    exercitar coletar_licitacoes() de verdade podem sobrescrever pncp.request_json de novo, sem
    conflito com este fixture (o setattr mais recente vence dentro do mesmo teste)."""
    monkeypatch.setattr(pipeline.pncp, "request_json", lambda *a, **k: None)
