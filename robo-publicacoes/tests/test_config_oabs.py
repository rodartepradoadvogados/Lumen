"""Testes da descoberta de OABs via banco (multi-escritorio) e do fallback
pra OABS_JSON/lista padrao quando o banco nao esta disponivel ou nao
retorna nenhuma OAB."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from src.config import Oab, _parse_oab_texto, _resolver_oabs, carregar_oabs_do_banco


def _sqlite_url_para_teste() -> str:
    """SQLite em memoria com tabelas User/Office minimas (mesmas colunas que
    o robo consulta), pra exercitar carregar_oabs_do_banco sem depender de
    Postgres real. create_engine(url) dentro da funcao testada abre uma
    conexao nova a cada chamada — por isso usamos um arquivo temporario em
    vez de ':memory:' puro (que criaria um banco vazio a cada nova conexao)."""
    import tempfile

    caminho = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
    url = f"sqlite:///{caminho}"

    setup_engine = create_engine(url)
    with setup_engine.connect() as conn:
        conn.execute(text('CREATE TABLE "Office" (id TEXT PRIMARY KEY, status TEXT)'))
        conn.execute(text('CREATE TABLE "User" (id TEXT PRIMARY KEY, name TEXT, oab TEXT, active BOOLEAN, "officeId" TEXT)'))
        conn.execute(text("INSERT INTO \"Office\" VALUES ('office-a', 'ATIVA')"))
        conn.execute(text("INSERT INTO \"Office\" VALUES ('office-b', 'ATIVA')"))
        conn.execute(text("INSERT INTO \"Office\" VALUES ('office-suspensa', 'SUSPENSA')"))
        conn.execute(
            text(
                "INSERT INTO \"User\" VALUES "
                "('u1', 'Jairo Rodarte', 'OAB/GO 78.295', 1, 'office-a'), "
                "('u2', 'Advogada de Outro Escritorio', 'OAB/SP 123456', 1, 'office-b'), "
                "('u3', 'Usuario Inativo', 'OAB/GO 11111', 0, 'office-a'), "
                "('u4', 'Sem OAB Cadastrada', NULL, 1, 'office-a'), "
                "('u5', 'Usuario De Escritorio Suspenso', 'OAB/GO 22222', 1, 'office-suspensa')"
            )
        )
        conn.commit()
    setup_engine.dispose()
    return url


def test_parse_oab_texto_formatos_variados():
    assert _parse_oab_texto("OAB/GO 78.295") == ("78295", "GO")
    assert _parse_oab_texto("78295-GO") == ("78295", "GO")
    assert _parse_oab_texto("texto sem oab valida") is None
    assert _parse_oab_texto("123") is None  # numero curto demais (regex exige 4+ digitos)


def test_carregar_oabs_do_banco_cobre_todos_os_escritorios_ativos():
    url = _sqlite_url_para_teste()

    oabs = carregar_oabs_do_banco(url)
    chaves = {(o.numero, o.uf) for o in oabs}

    assert ("78295", "GO") in chaves, "OAB do escritório A (Rodarte Prado) deve aparecer"
    assert ("123456", "SP") in chaves, "OAB de OUTRO escritório (B) também deve aparecer — é isso que faltava antes"
    assert ("11111", "GO") not in chaves, "usuário inativo não deve entrar"
    assert ("22222", "GO") not in chaves, "usuário de escritório SUSPENSO não deve entrar"
    assert len(oabs) == 2


def test_carregar_oabs_do_banco_retorna_vazio_em_vez_de_lancar_se_banco_invalido():
    # URL apontando pra um banco que não existe/não tem as tabelas — não deve derrubar o robô.
    oabs = carregar_oabs_do_banco("sqlite:////caminho/que/nao/existe/banco.db")
    assert oabs == []


def test_resolver_oabs_usa_fallback_quando_banco_nao_configurado():
    oabs = _resolver_oabs(None)
    assert len(oabs) > 0  # cai no OABS_JSON/_DEFAULT_OABS


def test_resolver_oabs_prioriza_banco_quando_disponivel():
    url = _sqlite_url_para_teste()
    oabs = _resolver_oabs(url)
    chaves = {(o.numero, o.uf) for o in oabs}
    assert ("123456", "SP") in chaves, "com banco disponível, a lista deve vir de lá (multi-escritório), não do fallback"
