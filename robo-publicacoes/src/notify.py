"""Notificacao por e-mail (smtplib + SSL) das novidades encontradas no ciclo.

So envia e-mail quando ha pelo menos uma novidade (publicacao ou andamento)
ou algum alerta de falha persistente. O corpo separa claramente as duas
fontes (PUBLICACOES via DJEN e ANDAMENTOS via Datajud) e, quando
disponivel, inclui um resumo gerado pelo Gemini ANTES do texto original
(nunca em substituicao a ele).
"""

from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage
from typing import List, Optional, Sequence

from . import gemini
from .config import Settings
from .db import Andamento, Publicacao
from .logging_config import get_logger

logger = get_logger(__name__)

TRECHO_TEOR_MAX_CHARS = 500


def _trecho(texto: Optional[str], tamanho: int = TRECHO_TEOR_MAX_CHARS) -> str:
    if not texto:
        return "(sem texto disponivel)"
    texto = texto.strip()
    if len(texto) <= tamanho:
        return texto
    return texto[:tamanho].rstrip() + "..."


def _bloco_publicacao(pub: Publicacao, gemini_api_key: Optional[str]) -> str:
    linhas = [
        f"- Processo: {pub.numero_processo}",
        f"  OAB: {pub.oab}/{pub.uf}",
        f"  Tribunal: {pub.tribunal or '(nao informado)'}",
        f"  Data de disponibilizacao: {pub.data_disponibilizacao or '(nao informada)'}",
        f"  Tipo: {pub.tipo_comunicacao or '(nao informado)'}",
    ]

    resumo = gemini.summarize(pub.teor or "", gemini_api_key)
    if resumo:
        linhas.append(f"  Resumo (Gemini): {resumo}")

    linhas.append(f"  Teor (trecho): {_trecho(pub.teor)}")
    return "\n".join(linhas)


def _bloco_andamento(mov: Andamento, gemini_api_key: Optional[str]) -> str:
    linhas = [
        f"- Processo: {mov.numero_processo}",
        f"  Tribunal: {mov.tribunal or '(nao informado)'}",
        f"  Data/hora do movimento: {mov.data_movimentacao}",
        f"  Codigo do movimento: {mov.codigo_movimento}",
    ]

    resumo = gemini.summarize(mov.descricao_movimento or "", gemini_api_key)
    if resumo:
        linhas.append(f"  Resumo (Gemini): {resumo}")

    linhas.append(f"  Descricao: {_trecho(mov.descricao_movimento)}")
    return "\n".join(linhas)


def montar_corpo_email(
    publicacoes: Sequence[Publicacao],
    andamentos: Sequence[Andamento],
    alertas: Sequence[str],
    gemini_api_key: Optional[str] = None,
) -> str:
    partes: List[str] = []

    if alertas:
        partes.append("=== ALERTAS ===")
        for alerta in alertas:
            partes.append(f"- {alerta}")
        partes.append("")

    partes.append(f"=== PUBLICACOES (DJEN) — {len(publicacoes)} novidade(s) ===")
    if publicacoes:
        for pub in publicacoes:
            partes.append(_bloco_publicacao(pub, gemini_api_key))
            partes.append("")
    else:
        partes.append("(nenhuma publicacao nova)")
        partes.append("")

    partes.append(f"=== ANDAMENTOS (Datajud) — {len(andamentos)} novidade(s) ===")
    if andamentos:
        for mov in andamentos:
            partes.append(_bloco_andamento(mov, gemini_api_key))
            partes.append("")
    else:
        partes.append("(nenhum andamento novo)")
        partes.append("")

    partes.append(
        "--\nMensagem automatica do robo-publicacoes (Rodarte Prado Advogados)."
    )
    return "\n".join(partes)


def montar_assunto(publicacoes: Sequence[Publicacao], andamentos: Sequence[Andamento]) -> str:
    total = len(publicacoes) + len(andamentos)
    return f"[robo-publicacoes] {total} novidade(s): {len(publicacoes)} publicacao(oes), {len(andamentos)} andamento(s)"


def enviar_email(settings: Settings, assunto: str, corpo: str) -> bool:
    """Envia o e-mail via SMTP com SSL. Retorna True se enviado com sucesso.

    Nunca levanta excecao para cima: falha de envio e logada como erro e o
    pipeline continua (as novidades ja estao persistidas no banco).
    """
    if not settings.email_to:
        logger.warning("EMAIL_TO nao configurado; e-mail nao sera enviado.")
        return False
    if not settings.smtp_user or not settings.smtp_password:
        logger.warning(
            "SMTP_USER/SMTP_PASSWORD nao configurados; e-mail nao sera enviado."
        )
        return False

    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = settings.smtp_user
    msg["To"] = ", ".join(settings.email_to)
    msg.set_content(corpo)

    try:
        contexto = ssl.create_default_context()
        with smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, context=contexto, timeout=30
        ) as server:
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        logger.info("E-mail de notificacao enviado para %s.", settings.email_to)
        return True
    except (smtplib.SMTPException, OSError) as exc:
        logger.error("Falha ao enviar e-mail de notificacao: %s", exc)
        return False


def notificar_novidades(
    settings: Settings,
    publicacoes: Sequence[Publicacao],
    andamentos: Sequence[Andamento],
    alertas: Sequence[str] = (),
) -> bool:
    """Envia e-mail somente se houver novidades ou alertas.

    Retorna True se um e-mail foi efetivamente enviado.
    """
    if not publicacoes and not andamentos and not alertas:
        logger.info("Nenhuma novidade nem alerta neste ciclo; e-mail nao sera enviado.")
        return False

    assunto = montar_assunto(publicacoes, andamentos)
    corpo = montar_corpo_email(publicacoes, andamentos, alertas, settings.gemini_api_key)
    return enviar_email(settings, assunto, corpo)
