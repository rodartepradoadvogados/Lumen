"""A URL do banco nao pode depender de como foi escrita: o robo ja ficou 19 dias parado por
`No module named 'psycopg'` (URL pedindo o driver v3, imagem so com psycopg2)."""

from __future__ import annotations

import pytest

from src.dburl import normalizar_database_url


@pytest.mark.parametrize(
    "entrada",
    [
        "postgres://u:p@host:5432/db?sslmode=require",
        "postgresql://u:p@host:5432/db?sslmode=require",
        "postgresql+psycopg://u:p@host:5432/db?sslmode=require",
        "postgresql+psycopg2://u:p@host:5432/db?sslmode=require",
    ],
)
def test_todas_as_escritas_postgres_vao_para_o_driver_instalado(entrada):
    assert normalizar_database_url(entrada, driver="psycopg2") == "postgresql+psycopg2://u:p@host:5432/db?sslmode=require"
    assert normalizar_database_url(entrada, driver="psycopg") == "postgresql+psycopg://u:p@host:5432/db?sslmode=require"


def test_sqlite_passa_intacta():
    assert normalizar_database_url("sqlite:///./robo.db") == "sqlite:///./robo.db"


def test_espacos_nas_pontas_sao_removidos():
    assert normalizar_database_url("  postgres://u:p@h/db \n", driver="psycopg2").startswith("postgresql+psycopg2://u:p@h/db")


def test_sem_nenhum_driver_cai_em_psycopg2(monkeypatch):
    import src.dburl as dburl

    monkeypatch.setattr(dburl, "find_spec", lambda nome: None)
    assert normalizar_database_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg2://u:p@h/db"


def test_prefere_psycopg2_quando_ambos_existem(monkeypatch):
    import src.dburl as dburl

    monkeypatch.setattr(dburl, "find_spec", lambda nome: object())
    assert dburl.driver_postgres_instalado() == "psycopg2"
