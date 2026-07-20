"""Camada de persistencia (SQLAlchemy): engine, sessao e models.

Usa Postgres quando DATABASE_URL esta definida (ex.: plugin Postgres do
Railway) e cai para um arquivo SQLite local ("./robo.db") caso contrario —
util para rodar e testar localmente sem depender de infraestrutura externa.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Publicacao(Base):
    """Publicacao/intimacao oficial capturada via API Comunica/DJEN."""

    __tablename__ = "publicacoes"

    id_comunicacao: Mapped[str] = mapped_column(String(128), primary_key=True)
    oab: Mapped[str] = mapped_column(String(32), nullable=False)
    uf: Mapped[str] = mapped_column(String(4), nullable=False)
    nome_advogado: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    numero_processo: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    tribunal: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    data_disponibilizacao: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    tipo_comunicacao: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    teor: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    data_captura: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    status_lido: Mapped[bool] = mapped_column(Boolean, default=False)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Publicacao {self.id_comunicacao} processo={self.numero_processo}>"


class Andamento(Base):
    """Movimentacao processual capturada via API Publica Datajud."""

    __tablename__ = "andamentos"
    __table_args__ = (
        UniqueConstraint(
            "numero_processo",
            "data_movimentacao",
            "codigo_movimento",
            name="uq_andamento_processo_data_codigo",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    numero_processo: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    tribunal: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    data_movimentacao: Mapped[str] = mapped_column(String(64), nullable=False)
    codigo_movimento: Mapped[str] = mapped_column(String(32), nullable=False)
    descricao_movimento: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    data_captura: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    status_lido: Mapped[bool] = mapped_column(Boolean, default=False)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Andamento processo={self.numero_processo} codigo={self.codigo_movimento}>"


class ProcessoMonitorado(Base):
    """Processo acompanhado pelo robo (para consulta de andamentos no Datajud)."""

    __tablename__ = "processos_monitorados"

    numero_processo: Mapped[str] = mapped_column(String(64), primary_key=True)
    origem: Mapped[str] = mapped_column(String(32), nullable=False)
    data_inclusao: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    oab_relacionada: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<ProcessoMonitorado {self.numero_processo} origem={self.origem}>"


class ExecucaoLog(Base):
    """Registro de cada tentativa de captura, por fonte, para diagnostico."""

    __tablename__ = "execucao_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fonte: Mapped[str] = mapped_column(String(16), nullable=False)  # "DJEN" | "DATAJUD"
    sucesso: Mapped[bool] = mapped_column(Boolean, nullable=False)
    detalhe: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    executado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<ExecucaoLog fonte={self.fonte} sucesso={self.sucesso}>"


def build_engine(database_url: Optional[str]):
    """Cria a engine SQLAlchemy: Postgres se database_url for informado,
    senao SQLite local em ./robo.db.
    """
    if database_url:
        # Railway costuma prover URLs no formato "postgres://"; SQLAlchemy
        # com psycopg2 espera "postgresql://". Normalizamos por seguranca.
        normalized = database_url
        if normalized.startswith("postgres://"):
            normalized = normalized.replace("postgres://", "postgresql://", 1)
        return create_engine(normalized, pool_pre_ping=True, future=True)

    return create_engine("sqlite:///./robo.db", future=True)


def init_db(engine) -> None:
    Base.metadata.create_all(engine)


def build_session_factory(engine) -> sessionmaker:
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)


@contextmanager
def session_scope(session_factory: sessionmaker) -> Iterator[Session]:
    """Context manager que garante commit/rollback e fechamento da sessao."""
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
