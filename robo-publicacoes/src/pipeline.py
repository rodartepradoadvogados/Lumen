"""Orquestracao de um ciclo idempotente de captura e notificacao.

Um ciclo consiste em, para cada OAB monitorada:
  1. Capturar publicacoes novas no DJEN dentro da janela de dias configurada.
  2. Persistir as publicacoes novas (dedup por id_comunicacao).
  3. Descobrir novos processos a partir dessas publicacoes
     (ProcessoMonitorado).
  4. Para cada processo monitorado, consultar andamentos no Datajud.
  5. Persistir andamentos novos (dedup por processo+data+codigo).
  6. Notificar por e-mail tudo que for novo neste ciclo (se houver).
  7. Registrar sucesso/falha de cada fonte em ExecucaoLog.

O ciclo e seguro para rodar repetidamente com a mesma janela de tempo: nada
e duplicado e nenhuma notificacao repetida e enviada para o mesmo dado.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import List

from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from . import datajud, discovery, djen, notify
from .config import Settings
from .db import Andamento, ExecucaoLog, Publicacao, ProcessoMonitorado
from .logging_config import get_logger

logger = get_logger(__name__)

FONTE_DJEN = "DJEN"
FONTE_DATAJUD = "DATAJUD"


@dataclass
class ResultadoCiclo:
    novas_publicacoes: int = 0
    novos_andamentos: int = 0
    novos_processos_descobertos: int = 0
    email_enviado: bool = False
    alertas: List[str] = field(default_factory=list)


def _registrar_execucao(session, fonte: str, sucesso: bool, detalhe: str) -> None:
    session.add(ExecucaoLog(fonte=fonte, sucesso=sucesso, detalhe=detalhe))


def _duas_falhas_seguidas(session, fonte: str) -> bool:
    """Verifica se as duas ultimas execucoes registradas para a fonte falharam.

    Usado para incluir um alerta de atencao no e-mail quando uma fonte
    parece estar falhando persistentemente (ex.: bloqueio de IP continuo).
    """
    ultimas = session.scalars(
        select(ExecucaoLog)
        .where(ExecucaoLog.fonte == fonte)
        .order_by(ExecucaoLog.executado_em.desc())
        .limit(2)
    ).all()
    if len(ultimas) < 2:
        return False
    return all(not log.sucesso for log in ultimas)


def _capturar_publicacoes_djen(session, settings: Settings) -> List[Publicacao]:
    """Busca publicacoes de todas as OABs configuradas e persiste as novas.

    Retorna a lista de instancias Publicacao recem-criadas neste ciclo.
    """
    hoje = date.today()
    data_inicio = (hoje - timedelta(days=settings.janela_dias)).isoformat()
    data_fim = hoje.isoformat()

    novas: List[Publicacao] = []
    sucesso_geral = True
    detalhes: List[str] = []

    for oab in settings.oabs:
        try:
            itens = djen.buscar_publicacoes(
                oab.numero, oab.uf, data_inicio, data_fim, proxy_url=settings.djen_proxy_url
            )
            detalhes.append(f"OAB {oab.numero}/{oab.uf}: {len(itens)} item(ns) recebido(s).")
        except Exception as exc:  # pragma: no cover - protecao extra
            logger.exception("Falha inesperada ao consultar DJEN para OAB %s", oab.numero)
            sucesso_geral = False
            detalhes.append(f"OAB {oab.numero}/{oab.uf}: falhou ({exc}).")
            continue

        for item in itens:
            existente = session.get(Publicacao, item.id_comunicacao)
            if existente is not None:
                continue

            nova = Publicacao(
                id_comunicacao=item.id_comunicacao,
                oab=oab.numero,
                uf=oab.uf,
                nome_advogado=oab.nome,
                numero_processo=item.numero_processo,
                tribunal=item.tribunal,
                data_disponibilizacao=item.data_disponibilizacao,
                tipo_comunicacao=item.tipo_comunicacao,
                teor=item.teor,
            )
            session.add(nova)
            novas.append(nova)

    # Uma unica entrada de log por CICLO (nao por OAB), para que a deteccao
    # de "duas falhas seguidas" reflita execucoes consecutivas do robo, e
    # nao duas OABs distintas dentro do mesmo ciclo.
    _registrar_execucao(session, FONTE_DJEN, sucesso=sucesso_geral, detalhe=" | ".join(detalhes))

    return novas


def _descobrir_processos(session, publicacoes_novas: List[Publicacao]) -> int:
    numeros = [pub.numero_processo for pub in publicacoes_novas]
    return discovery.descobrir_processos_de_publicacoes(session, numeros)


def _capturar_andamentos_datajud(session, settings: Settings) -> List[Andamento]:
    """Consulta o Datajud para cada processo monitorado e persiste andamentos novos."""
    processos = discovery.listar_processos_monitorados(session)
    novos: List[Andamento] = []

    if not processos:
        return novos

    sucesso_geral = True
    detalhes: List[str] = []

    for processo in processos:
        try:
            movimentos = datajud.buscar_andamentos(
                processo.numero_processo, settings.datajud_api_key
            )
        except Exception as exc:  # pragma: no cover - protecao extra
            logger.exception(
                "Falha inesperada ao consultar Datajud para o processo %s",
                processo.numero_processo,
            )
            sucesso_geral = False
            detalhes.append(f"{processo.numero_processo}: {exc}")
            continue

        for mov in movimentos:
            ja_existe = session.scalar(
                select(Andamento).where(
                    Andamento.numero_processo == mov.numero_processo,
                    Andamento.data_movimentacao == mov.data_movimentacao,
                    Andamento.codigo_movimento == mov.codigo_movimento,
                )
            )
            if ja_existe is not None:
                continue

            novo = Andamento(
                numero_processo=mov.numero_processo,
                tribunal=mov.tribunal,
                data_movimentacao=mov.data_movimentacao,
                codigo_movimento=mov.codigo_movimento,
                descricao_movimento=mov.descricao_movimento,
            )
            session.add(novo)
            novos.append(novo)

    detalhe_txt = (
        f"{len(processos)} processo(s) consultado(s), {len(novos)} andamento(s) novo(s)."
    )
    if detalhes:
        detalhe_txt += " Falhas: " + "; ".join(detalhes)

    _registrar_execucao(session, FONTE_DATAJUD, sucesso=sucesso_geral, detalhe=detalhe_txt)
    return novos


def executar_ciclo(settings: Settings, session_factory: sessionmaker) -> ResultadoCiclo:
    """Executa um ciclo completo e retorna um resumo do que foi feito."""
    session = session_factory()
    try:
        publicacoes_novas = _capturar_publicacoes_djen(session, settings)
        processos_novos = _descobrir_processos(session, publicacoes_novas)
        andamentos_novos = _capturar_andamentos_datajud(session, settings)

        alertas: List[str] = []
        if _duas_falhas_seguidas(session, FONTE_DJEN):
            alertas.append(
                "A captura de PUBLICACOES (DJEN) falhou nas duas ultimas execucoes "
                "seguidas. Possivel bloqueio de IP ou instabilidade da API do CNJ — "
                "veja os logs e a secao LIMITACOES E RISCOS do README."
            )
        if _duas_falhas_seguidas(session, FONTE_DATAJUD):
            alertas.append(
                "A captura de ANDAMENTOS (Datajud) falhou nas duas ultimas execucoes "
                "seguidas. Verifique DATAJUD_API_KEY e os logs."
            )

        email_enviado = notify.notificar_novidades(
            settings, publicacoes_novas, andamentos_novos, alertas
        )

        session.commit()

        return ResultadoCiclo(
            novas_publicacoes=len(publicacoes_novas),
            novos_andamentos=len(andamentos_novos),
            novos_processos_descobertos=processos_novos,
            email_enviado=email_enviado,
            alertas=alertas,
        )
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
