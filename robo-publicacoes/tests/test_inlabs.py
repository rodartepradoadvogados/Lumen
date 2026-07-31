"""Testes de parsing/casamento defensivo do coletor do DOU via INLABS.

Payloads (XML/ZIP) 100% inventados — nao vem do site real (ver aviso no topo de
src/inlabs.py). O objetivo aqui e travar o CONTRATO do parser/matcher (quais tags/atributos
ele tenta, em que ordem, como o casamento com TermoVigilancia funciona e que payloadBruto
sempre preserva o XML do artigo), nao validar contra o INLABS de verdade.
"""

from __future__ import annotations

import io
import xml.etree.ElementTree as ET
import zipfile
from datetime import date

import pytest

from src import inlabs


def _zip_com_arquivos(arquivos: dict) -> bytes:
    """Monta um ZIP em memoria a partir de um dict {nome_arquivo: conteudo_str}."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        for nome, conteudo in arquivos.items():
            zf.writestr(nome, conteudo)
    return buffer.getvalue()


ARTIGO_XML_PADRAO = """<article id="123456" name="Ministerio de Exemplo" pubName="DO1"
         artType="Portaria" pubDate="30-07-2026" artCategory="Atos"
         numberPage="12">
  <body>
    <Identifica>MINISTERIO DE EXEMPLO</Identifica>
    <Titulo>PORTARIA N. 42, DE 29 DE JULHO DE 2026</Titulo>
    <SubTitulo>Dispoe sobre licitacao de interesse do orgao</SubTitulo>
    <Ementa>Homologa o resultado da licitacao referente ao contrato com a Empresa Exemplo Ltda.</Ementa>
    <Texto>O Ministro de Estado, no uso de suas atribuicoes, resolve: <p>Art. 1 Fica homologado
    o processo licitatorio da Empresa Exemplo Ltda, CNPJ 12.345.678/0001-90.</p></Texto>
  </body>
</article>"""


def _parse(xml_str: str) -> ET.Element:
    return ET.fromstring(xml_str)


# ---------------------------------------------------------------------------
# _normalizar_texto
# ---------------------------------------------------------------------------

def test_normalizar_texto_remove_acentos_e_caixa():
    assert inlabs._normalizar_texto("Empresa Exemplo Ltda.") == "empresa exemplo ltda."
    assert inlabs._normalizar_texto("LICITAÇÃO") == "licitacao"
    assert inlabs._normalizar_texto("") == ""
    assert inlabs._normalizar_texto(None) == ""  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# _primeiro_atributo / _primeiro_texto_filho
# ---------------------------------------------------------------------------

def test_primeiro_atributo_tenta_variacoes_de_caixa():
    artigo = _parse(ARTIGO_XML_PADRAO)
    assert inlabs._primeiro_atributo(artigo, ["Id", "id"]) == "123456"
    assert inlabs._primeiro_atributo(artigo, ["naoexiste", "outronome"]) is None


def test_primeiro_texto_filho_ignora_tags_html_internas():
    artigo = _parse(ARTIGO_XML_PADRAO)
    texto = inlabs._primeiro_texto_filho(artigo, ["Texto", "texto"])
    assert texto is not None
    assert "<p>" not in texto  # tag HTML interna nao deve aparecer no texto extraido
    assert "Empresa Exemplo Ltda" in texto


# ---------------------------------------------------------------------------
# _encontrar_artigos / _extrair_artigos_do_zip — os dois formatos possiveis de ZIP
# ---------------------------------------------------------------------------

def test_extrair_artigos_zip_com_um_xml_por_artigo():
    """Caso 1: o ZIP tem varios arquivos .xml, cada um com a raiz JA sendo o <article>."""
    artigo_2 = ARTIGO_XML_PADRAO.replace('id="123456"', 'id="999999"')
    conteudo_zip = _zip_com_arquivos(
        {"Portaria-123456.xml": ARTIGO_XML_PADRAO, "Portaria-999999.xml": artigo_2}
    )

    artigos = inlabs._extrair_artigos_do_zip(conteudo_zip, "DO1")

    assert len(artigos) == 2
    ids = {inlabs._primeiro_atributo(a, inlabs._ATRIBUTOS_ID) for a in artigos}
    assert ids == {"123456", "999999"}


def test_extrair_artigos_zip_com_envelope_de_varios_artigos():
    """Caso 2: o ZIP tem 1 XML grande por secao, com varios <article> aninhados num envelope."""
    artigo_2 = ARTIGO_XML_PADRAO.replace('id="123456"', 'id="777777"')
    envelope = f"<Jornal>{ARTIGO_XML_PADRAO}{artigo_2}</Jornal>"
    conteudo_zip = _zip_com_arquivos({"DO1.xml": envelope})

    artigos = inlabs._extrair_artigos_do_zip(conteudo_zip, "DO1")

    assert len(artigos) == 2


def test_extrair_artigos_zip_sem_xml_retorna_vazio_sem_lancar():
    conteudo_zip = _zip_com_arquivos({"leiame.txt": "nada de xml aqui"})
    assert inlabs._extrair_artigos_do_zip(conteudo_zip, "DO1") == []


def test_extrair_artigos_zip_com_xml_invalido_e_ignorado_sem_derrubar_os_demais():
    conteudo_zip = _zip_com_arquivos(
        {"quebrado.xml": "<article><body><Titulo>sem fechar", "ok.xml": ARTIGO_XML_PADRAO}
    )
    artigos = inlabs._extrair_artigos_do_zip(conteudo_zip, "DO1")
    assert len(artigos) == 1


# ---------------------------------------------------------------------------
# _processar_artigo — casamento com termos de vigilancia
# ---------------------------------------------------------------------------

def test_processar_artigo_bate_com_termo_gera_registro_completo():
    artigo = _parse(ARTIGO_XML_PADRAO)
    termos_normalizados = [("Empresa Exemplo Ltda", inlabs._normalizar_texto("Empresa Exemplo Ltda"), "office-1")]

    registros = inlabs._processar_artigo(artigo, "DO1", "2026-07-30", termos_normalizados)

    assert len(registros) == 1
    reg = registros[0]
    assert reg["chaveUnica"] == "30-07-2026-DO1-123456-office-1"
    assert reg["secao"] == "DO1"
    assert reg["orgao"] == "MINISTERIO DE EXEMPLO"
    assert reg["titulo"] == "PORTARIA N. 42, DE 29 DE JULHO DE 2026"
    assert "Homologa" in reg["ementa"]
    assert reg["dataPublicacao"] == "30-07-2026"  # veio do atributo pubDate do artigo
    assert reg["numeroPagina"] == "12"
    assert reg["termoEncontrado"] == "Empresa Exemplo Ltda"
    assert reg["officeId"] == "office-1"
    assert "Empresa Exemplo Ltda" in reg["textoResumo"]
    assert "<article" in reg["payloadBruto"]  # XML bruto preservado


def test_processar_artigo_sem_match_retorna_lista_vazia():
    artigo = _parse(ARTIGO_XML_PADRAO)
    termos_normalizados = [("Termo Que Nao Aparece", inlabs._normalizar_texto("Termo Que Nao Aparece"), "office-1")]

    registros = inlabs._processar_artigo(artigo, "DO1", "2026-07-30", termos_normalizados)

    assert registros == []


def test_processar_artigo_bate_com_termos_de_escritorios_diferentes_gera_um_registro_por_escritorio():
    artigo = _parse(ARTIGO_XML_PADRAO)
    termos_normalizados = [
        ("Empresa Exemplo Ltda", inlabs._normalizar_texto("Empresa Exemplo Ltda"), "office-1"),
        ("licitacao", inlabs._normalizar_texto("licitacao"), "office-2"),
    ]

    registros = inlabs._processar_artigo(artigo, "DO1", "2026-07-30", termos_normalizados)

    assert len(registros) == 2
    office_ids = {r["officeId"] for r in registros}
    assert office_ids == {"office-1", "office-2"}
    chaves = {r["chaveUnica"] for r in registros}
    assert chaves == {
        "30-07-2026-DO1-123456-office-1",
        "30-07-2026-DO1-123456-office-2",
    }


def test_processar_artigo_sem_id_e_ignorado():
    artigo_sem_id = _parse(ARTIGO_XML_PADRAO.replace(' id="123456"', ""))
    termos_normalizados = [("Empresa Exemplo Ltda", inlabs._normalizar_texto("Empresa Exemplo Ltda"), "office-1")]

    registros = inlabs._processar_artigo(artigo_sem_id, "DO1", "2026-07-30", termos_normalizados)

    assert registros == []


def test_processar_artigo_sem_texto_nenhum_e_ignorado():
    artigo_vazio = _parse('<article id="1"><body></body></article>')
    termos_normalizados = [("qualquer", "qualquer", "office-1")]

    registros = inlabs._processar_artigo(artigo_vazio, "DO1", "2026-07-30", termos_normalizados)

    assert registros == []


# ---------------------------------------------------------------------------
# _parece_pagina_de_erro / _baixar_secao — heuristica de deteccao de ZIP real
# ---------------------------------------------------------------------------

def test_parece_pagina_de_erro_detecta_html():
    assert inlabs._parece_pagina_de_erro(b"<!DOCTYPE html><html>erro de login</html>")
    assert inlabs._parece_pagina_de_erro(b"<html><body>faca login</body></html>")
    assert not inlabs._parece_pagina_de_erro(b"PK\x03\x04conteudo binario de zip")


# ---------------------------------------------------------------------------
# coletar_dou — orquestracao de ponta a ponta, com login/download mockados
# ---------------------------------------------------------------------------

def test_coletar_dou_sem_credenciais_retorna_vazio_sem_tentar_login(monkeypatch):
    chamou_login = {"sim": False}
    monkeypatch.setattr(inlabs, "_login", lambda *a, **k: chamou_login.update(sim=True))

    resultado = inlabs.coletar_dou(["DO1"], None, None, [("termo", "office-1")])

    assert resultado == []
    assert chamou_login["sim"] is False


def test_coletar_dou_sem_termos_retorna_vazio_sem_tentar_login(monkeypatch):
    chamou_login = {"sim": False}
    monkeypatch.setattr(inlabs, "_login", lambda *a, **k: chamou_login.update(sim=True))

    resultado = inlabs.coletar_dou(["DO1"], "usuario", "senha", [])

    assert resultado == []
    assert chamou_login["sim"] is False


def test_coletar_dou_login_falha_retorna_vazio(monkeypatch):
    monkeypatch.setattr(inlabs, "_login", lambda *a, **k: None)

    resultado = inlabs.coletar_dou(["DO1"], "usuario", "senha", [("termo", "office-1")])

    assert resultado == []


def test_coletar_dou_fluxo_completo_com_match(monkeypatch):
    """Login OK, download de DO1 devolve um ZIP com 1 artigo que bate com o termo do
    escritorio 'office-1'; DO3 devolve None (simulando seção sem novidade/falha isolada)."""

    class SessaoFalsa:
        pass

    monkeypatch.setattr(inlabs, "_login", lambda usuario, senha: SessaoFalsa())

    conteudo_zip = _zip_com_arquivos({"DO1.xml": ARTIGO_XML_PADRAO})

    def fake_baixar_secao(session, secao, data_str):
        assert isinstance(session, SessaoFalsa)
        if secao == "DO1":
            return conteudo_zip
        return None  # DO3 sem sucesso nesta rodada — não deve derrubar DO1

    monkeypatch.setattr(inlabs, "_baixar_secao", fake_baixar_secao)

    resultado = inlabs.coletar_dou(
        ["DO1", "DO3"],
        "usuario",
        "senha",
        [("Empresa Exemplo Ltda", "office-1")],
        dia=date(2026, 7, 30),
    )

    assert len(resultado) == 1
    assert resultado[0]["officeId"] == "office-1"
    assert resultado[0]["chaveUnica"] == "30-07-2026-DO1-123456-office-1"


def test_coletar_dou_nunca_levanta_excecao_com_download_sempre_none(monkeypatch):
    monkeypatch.setattr(inlabs, "_login", lambda usuario, senha: object())
    monkeypatch.setattr(inlabs, "_baixar_secao", lambda *a, **k: None)

    resultado = inlabs.coletar_dou(["DO1", "DO3"], "usuario", "senha", [("termo", "office-1")])

    assert resultado == []
