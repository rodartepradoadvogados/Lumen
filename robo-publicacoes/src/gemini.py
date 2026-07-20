"""Resumo opcional de textos longos via API do Google Gemini.

Uso totalmente opcional: se GEMINI_API_KEY nao estiver configurada, ou se
qualquer erro ocorrer na chamada (rede, formato de resposta, quota
excedida, etc), summarize() retorna None e o fluxo de notificacao segue
normalmente usando apenas o texto original. Nunca deve derrubar o robo.
"""

from __future__ import annotations

from typing import Optional

from .http_client import request_json
from .logging_config import get_logger

logger = get_logger(__name__)

API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-1.5-flash:generateContent"
)

# So vale a pena resumir textos razoavelmente longos.
MIN_CARACTERES_PARA_RESUMIR = 500


def summarize(texto: str, api_key: Optional[str]) -> Optional[str]:
    """Retorna um resumo curto do texto em portugues, ou None se indisponivel.

    Nunca levanta excecao: qualquer falha resulta em None, e o chamador deve
    seguir usando o texto original.
    """
    if not api_key:
        return None
    if not texto or len(texto) < MIN_CARACTERES_PARA_RESUMIR:
        return None

    prompt = (
        "Resuma o texto juridico abaixo em ate 3 frases curtas, em portugues, "
        "destacando prazo, tipo de ato e providencia necessaria, se houver. "
        "Nao invente informacoes que nao estejam no texto.\n\n"
        f"TEXTO:\n{texto}"
    )

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
    }

    try:
        payload = request_json(
            "POST",
            API_URL,
            params={"key": api_key},
            json_body=body,
            timeout=30,
        )
    except Exception as exc:  # pragma: no cover - protecao extra
        logger.warning("Erro inesperado ao chamar Gemini: %s", exc)
        return None

    if payload is None:
        return None

    try:
        candidates = payload.get("candidates", [])
        if not candidates:
            return None
        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            return None
        texto_resumo = parts[0].get("text")
        if not texto_resumo:
            return None
        return texto_resumo.strip()
    except (AttributeError, IndexError, KeyError, TypeError) as exc:
        logger.warning("Resposta inesperada do Gemini, ignorando resumo: %s", exc)
        return None
