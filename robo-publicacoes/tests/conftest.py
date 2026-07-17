"""Fixtures compartilhadas pelos testes: engine SQLite em memoria e settings de teste."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine

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
        log_level="INFO",
    )
