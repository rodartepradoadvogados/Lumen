"""Camada de persistencia (SQLAlchemy): engine, sessao e models.

Usa Postgres quando DATABASE_URL esta definida (ex.: plugin Postgres do
Railway) e cai para um arquivo SQLite local ("./robo.db") caso contrario —
util para rodar e testar localmente sem depender de infraestrutura externa.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    select,
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


class LicitacaoPNCP(Base):
    """Licitacao capturada via API publica de consulta do PNCP (ver src/pncp.py).

    Espelha o model RoboLicitacao do schema Prisma (tabela licitacoes_pncp) —
    ATENCAO: ali os campos NAO usam @map (ao contrario dos outros 3 modelos do
    robo acima), entao os nomes de coluna no Postgres sao exatamente os nomes
    de campo do Prisma, em camelCase (ex.: "numeroControlePNCP"), e nao
    snake_case. Por isso os mapped_column() abaixo informam o nome explicito
    da coluna — se o schema.prisma mudar os nomes, replicar aqui tambem.

    `id` e uma string tipo cuid do lado do Prisma, mas como este robo grava
    direto no Postgres via SQLAlchemy (sem passar pelo Prisma Client), o valor
    e gerado aqui mesmo (uuid4 hex) — nao ha DEFAULT a nivel de banco para
    esta coluna.
    """

    __tablename__ = "licitacoes_pncp"

    id: Mapped[str] = mapped_column("id", String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    numero_controle_pncp: Mapped[str] = mapped_column(
        "numeroControlePNCP", String(64), unique=True, nullable=False, index=True
    )
    orgao_cnpj: Mapped[Optional[str]] = mapped_column("orgaoCnpj", String(32), nullable=True)
    orgao_nome: Mapped[Optional[str]] = mapped_column("orgaoNome", String(500), nullable=True)
    uf: Mapped[Optional[str]] = mapped_column("uf", String(4), nullable=True)
    municipio: Mapped[Optional[str]] = mapped_column("municipio", String(255), nullable=True)
    modalidade_nome: Mapped[Optional[str]] = mapped_column("modalidadeNome", String(255), nullable=True)
    objeto: Mapped[Optional[str]] = mapped_column("objeto", Text, nullable=True)
    valor_estimado: Mapped[Optional[float]] = mapped_column("valorEstimado", Float, nullable=True)
    situacao: Mapped[Optional[str]] = mapped_column("situacao", String(255), nullable=True)
    data_publicacao: Mapped[Optional[str]] = mapped_column("dataPublicacao", String(32), nullable=True)
    data_abertura_proposta: Mapped[Optional[str]] = mapped_column("dataAberturaProposta", String(32), nullable=True)
    data_encerramento_proposta: Mapped[Optional[str]] = mapped_column(
        "dataEncerramentoProposta", String(32), nullable=True
    )
    link_sistema_origem: Mapped[Optional[str]] = mapped_column("linkSistemaOrigem", Text, nullable=True)
    payload_bruto: Mapped[Optional[str]] = mapped_column("payloadBruto", Text, nullable=True)
    data_captura: Mapped[datetime] = mapped_column("dataCaptura", DateTime(timezone=True), default=_utcnow)
    status_processado: Mapped[bool] = mapped_column("statusProcessado", Boolean, default=False)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<LicitacaoPNCP {self.numero_controle_pncp}>"


# Campos de LicitacaoPNCP que sao atualizados num upsert (tudo exceto a chave natural
# numeroControlePNCP e os campos que nao devem ser sobrescritos: id, dataCaptura original,
# statusProcessado — este ultimo e controlado pela ponte lib/pncpBridge.ts no site, nao pelo
# robo, entao um novo upsert nunca deve reabrir uma licitacao ja processada).
_CAMPOS_ATUALIZAVEIS = (
    ("orgaoCnpj", "orgao_cnpj"),
    ("orgaoNome", "orgao_nome"),
    ("uf", "uf"),
    ("municipio", "municipio"),
    ("modalidadeNome", "modalidade_nome"),
    ("objeto", "objeto"),
    ("valorEstimado", "valor_estimado"),
    ("situacao", "situacao"),
    ("dataPublicacao", "data_publicacao"),
    ("dataAberturaProposta", "data_abertura_proposta"),
    ("dataEncerramentoProposta", "data_encerramento_proposta"),
    ("linkSistemaOrigem", "link_sistema_origem"),
    ("payloadBruto", "payload_bruto"),
)


def upsert_licitacao(session: Session, dado: Dict[str, Any]) -> bool:
    """Insere ou atualiza uma LicitacaoPNCP pela chave natural numeroControlePNCP
    (unica em todo o pais) — nunca duplica, mesmo se o mesmo item vier de novo
    num ciclo seguinte (a API do PNCP nao garante que uma licitacao so aparece
    numa unica janela de data).

    `dado` e um dict com as chaves do model RoboLicitacao (ver Tarefa 1 do
    plano / src/pncp.py:coletar_licitacoes). Retorna True se foi uma insercao
    nova, False se atualizou um registro ja existente.
    """
    numero_controle = dado.get("numeroControlePNCP")
    if not numero_controle:
        # Defensivo: pncp.py ja descarta itens sem numero de controle antes de chegar aqui,
        # mas nunca confiamos demais no chamador.
        raise ValueError("dado sem numeroControlePNCP; nao pode ser upsertado.")

    existente = session.scalar(
        select(LicitacaoPNCP).where(LicitacaoPNCP.numero_controle_pncp == numero_controle)
    )
    if existente is not None:
        for chave_dado, atributo in _CAMPOS_ATUALIZAVEIS:
            setattr(existente, atributo, dado.get(chave_dado))
        return False

    nova = LicitacaoPNCP(
        numero_controle_pncp=numero_controle,
        **{atributo: dado.get(chave_dado) for chave_dado, atributo in _CAMPOS_ATUALIZAVEIS},
    )
    session.add(nova)
    session.flush()
    return True


class DouItem(Base):
    """Artigo do Diario Oficial da Uniao (DOU), capturado via INLABS (ver src/inlabs.py),
    que bateu com um termo de vigilancia (TermoVigilancia) de algum escritorio.

    Espelha o model RoboDouItem do schema Prisma. ATENCAO — ao contrario de LicitacaoPNCP
    (que usa @@map para uma tabela snake_case "licitacoes_pncp"), RoboDouItem NAO usa
    @@map no Prisma: a tabela no Postgres se chama exatamente "RoboDouItem" (mesmo nome do
    model, caixa preservada — mesmo padrao de TermoVigilancia/FonteAdministrativa), e os
    nomes de coluna sao exatamente os nomes de campo do Prisma, em camelCase. Por isso
    __tablename__ e os mapped_column() abaixo usam esses nomes explicitos. Se o
    schema.prisma mudar, replicar a mudanca aqui tambem.

    Ao contrario dos outros models do robo (Publicacao/Andamento/LicitacaoPNCP), este JA
    NASCE com officeId preenchido: o casamento com o termo de vigilancia acontece DENTRO do
    Python (src/inlabs.py), no momento da propria captura — nao depois, numa ponte
    TypeScript (ver decisao de arquitetura no topo de src/inlabs.py).

    `id` e uma string tipo cuid do lado do Prisma, mas como este robo grava direto no
    Postgres via SQLAlchemy (sem passar pelo Prisma Client), o valor e gerado aqui mesmo
    (uuid4 hex), igual a LicitacaoPNCP.
    """

    __tablename__ = "RoboDouItem"

    id: Mapped[str] = mapped_column("id", String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    chave_unica: Mapped[str] = mapped_column("chaveUnica", String(255), unique=True, nullable=False, index=True)
    secao: Mapped[str] = mapped_column("secao", String(16), nullable=False)
    orgao: Mapped[Optional[str]] = mapped_column("orgao", String(500), nullable=True)
    titulo: Mapped[Optional[str]] = mapped_column("titulo", Text, nullable=True)
    ementa: Mapped[Optional[str]] = mapped_column("ementa", Text, nullable=True)
    texto_resumo: Mapped[Optional[str]] = mapped_column("textoResumo", Text, nullable=True)
    data_publicacao: Mapped[Optional[str]] = mapped_column("dataPublicacao", String(32), nullable=True)
    numero_pagina: Mapped[Optional[str]] = mapped_column("numeroPagina", String(32), nullable=True)
    termo_encontrado: Mapped[str] = mapped_column("termoEncontrado", String(500), nullable=False)
    payload_bruto: Mapped[Optional[str]] = mapped_column("payloadBruto", Text, nullable=True)
    data_captura: Mapped[datetime] = mapped_column("dataCaptura", DateTime(timezone=True), default=_utcnow)
    status_processado: Mapped[bool] = mapped_column("statusProcessado", Boolean, default=False)
    office_id: Mapped[str] = mapped_column("officeId", String(32), nullable=False)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<DouItem {self.chave_unica} office={self.office_id}>"


# Campos de DouItem atualizados num upsert (tudo exceto a chave natural chaveUnica e os campos
# que nao devem ser sobrescritos: id, dataCaptura original, statusProcessado — este ultimo e
# controlado pela ponte lib/douBridge.ts no site, nao pelo robo, entao um novo upsert nunca deve
# reabrir um item ja processado).
_CAMPOS_ATUALIZAVEIS_DOU = (
    ("secao", "secao"),
    ("orgao", "orgao"),
    ("titulo", "titulo"),
    ("ementa", "ementa"),
    ("textoResumo", "texto_resumo"),
    ("dataPublicacao", "data_publicacao"),
    ("numeroPagina", "numero_pagina"),
    ("termoEncontrado", "termo_encontrado"),
    ("payloadBruto", "payload_bruto"),
    ("officeId", "office_id"),
)


def upsert_dou_item(session: Session, dado: Dict[str, Any]) -> bool:
    """Insere ou atualiza um DouItem pela chave natural chaveUnica (dataPublicacao + secao +
    id do artigo + officeId, ver src/inlabs.py:coletar_dou) — nunca duplica, mesmo que o
    mesmo artigo apareca de novo num ciclo seguinte (ex.: o robo rodou duas vezes no mesmo
    dia, ou o INLABS reabriu a mesma data). Retorna True se foi uma insercao nova, False se
    atualizou um registro ja existente.
    """
    chave_unica = dado.get("chaveUnica")
    if not chave_unica:
        # Defensivo: src/inlabs.py ja descarta artigos sem id reconhecivel antes de chegar
        # aqui, mas nunca confiamos demais no chamador.
        raise ValueError("dado sem chaveUnica; nao pode ser upsertado.")

    existente = session.scalar(select(DouItem).where(DouItem.chave_unica == chave_unica))
    if existente is not None:
        for chave_dado, atributo in _CAMPOS_ATUALIZAVEIS_DOU:
            setattr(existente, atributo, dado.get(chave_dado))
        return False

    nova = DouItem(
        chave_unica=chave_unica,
        **{atributo: dado.get(chave_dado) for chave_dado, atributo in _CAMPOS_ATUALIZAVEIS_DOU},
    )
    session.add(nova)
    session.flush()
    return True


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
