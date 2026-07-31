"""Captura de artigos do Diario Oficial da Uniao (DOU) via INLABS (servico de distribuicao
de conteudo da Imprensa Nacional) — Fase 2 do Setor de Processos Administrativos.

Fluxo: login (sessao com cookie) -> download de um ZIP por secao/dia -> extracao dos XMLs
de artigo dentro do ZIP -> casamento de cada artigo contra os termos de vigilancia
(TermoVigilancia) de todos os escritorios -> so os artigos que baterem com pelo menos um
termo sao devolvidos, prontos para persistir como RoboDouItem.

ATENCAO — ESTE ARQUIVO FOI ESCRITO SEM NENHUM ACESSO DE REDE NEM AO POSTGRES DE PRODUCAO
(mesma restricao de ambiente descrita no topo de src/pncp.py). O contrato do INLABS e
conhecimento geral de dominio publico, e e MENOS confiavel do que o do PNCP (que ao menos
tem Swagger publico) — aqui tudo abaixo e melhor-esforco, nunca confirmado contra o site
real. Alem disso, ao contrario do PNCP, NAO existe uma rota de teste facil no site (o Vercel
nao tem as credenciais do INLABS — ver aviso no topo do plano), entao o log desta captura
PRECISA servir de diagnostico sozinho quando o primeiro ciclo real rodar em producao
(Railway, que tem internet de verdade). Pontos especificos NAO confirmados:

  1. NOME DOS CAMPOS DO FORMULARIO DE LOGIN (POST https://inlabs.in.gov.br/logar.php,
     x-www-form-urlencoded). Tentamos, em ordem: {"email": usuario, "password": senha}
     (par mais comumente documentado publicamente para este servico) e, se isso nao
     parecer ter funcionado, {"login": usuario, "senha": senha}. Se AMBOS falharem no
     primeiro run real, o nome dos campos mudou e precisa ser corrigido em _login()
     abaixo — o log de erro final lista exatamente quais pares foram tentados.

  2. HEURISTICA DE SUCESSO DE LOGIN: no INLABS nao ha um endpoint de "quem sou eu" para
     confirmar autenticacao diretamente. Consideramos o login bem-sucedido apenas se (a)
     a sessao recebeu ALGUM cookie do servidor E (b) o download subsequente nao devolveu
     uma pagina HTML (heuristica: corpo comecando com "<!doctype" ou "<html", ver
     _parece_pagina_de_erro) — se o download vier como HTML, tratamos como sessao invalida/
     nao autenticada, mesmo que o POST de login tenha retornado 200.

  3. FORMATO EXATO DO DOWNLOAD: GET https://inlabs.in.gov.br/index.php?p=&dt=DD-MM-AAAA&
     section=SECAO. O formato da data (DD-MM-AAAA) e o nome dos parametros (p/dt/section)
     sao melhor-esforco. Verificamos se o corpo e um ZIP pelos PRIMEIROS BYTES (assinatura
     "PK", nunca pelo header Content-Type, que pode vir errado/generico).

  4. ESTRUTURA DO XML DE CADA ARTIGO: assumimos algo como
        <article id="..." name="..." pubName="DO1" artType="..." pubDate="..."
                 artCategory="..." numberPage="...">
          <body>
            <Identifica>...</Identifica>
            <Titulo>...</Titulo>
            <SubTitulo>...</SubTitulo>
            <Ementa>...</Ementa>
            <Texto>...</Texto>
          </body>
        </article>
     mas tanto o nome dos atributos quanto o nome das tags-filho podem variar (inclusive
     em caixa). Por isso, para CADA campo, tentamos MULTIPLAS variacoes de nome via
     _primeiro_atributo()/_primeiro_texto_filho() (mesma tecnica de _primeiro_presente em
     src/pncp.py, adaptada para arvore XML em vez de dict). O XML de cada artigo (truncado
     com seguranca) e sempre guardado em payloadBruto, para permitir reprocessar/corrigir o
     mapeamento depois do primeiro run real, sem precisar consultar o INLABS de novo.

  5. SE O ZIP TEM UM XML POR ARTIGO OU UM XML GRANDE POR SECAO: tratamos os dois casos
     (ver _extrair_artigos_do_zip/_encontrar_artigos) — se o ZIP tiver varios ".xml",
     processamos cada um (cada arquivo pode ser 1 artigo ou conter varios elementos
     <article> na raiz); se tiver so 1 arquivo XML grande, iteramos sobre todos os
     elementos <article> encontrados dentro dele.

Nunca levanta excecao: qualquer falha (login, download de uma secao, parsing de um artigo)
e logada de forma acionavel e a coleta segue com o que der, sem derrubar o ciclo do robo
(ver src/pipeline.py).
"""

from __future__ import annotations

import io
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from typing import Any, Dict, List, Optional, Sequence, Tuple

import requests

from .http_client import DEFAULT_TIMEOUT, DEFAULT_USER_AGENT
from .logging_config import get_logger

logger = get_logger(__name__)

LOGIN_URL = "https://inlabs.in.gov.br/logar.php"
DOWNLOAD_URL = "https://inlabs.in.gov.br/index.php"

# Tamanho da janela de texto (em caracteres) extraida ao redor da primeira ocorrencia do
# termo, para compor textoResumo — nunca guardamos o artigo inteiro nesse campo.
JANELA_RESUMO = 500

# Tamanho maximo do XML bruto de um artigo guardado em payloadBruto — protege o banco de um
# artigo anormalmente grande (ex.: um anexo inteiro embutido no XML).
MAX_PAYLOAD_CHARS = 20000

# Pares de campo tentados, em ordem, para o formulario de login (ver item 1 do aviso acima).
_TENTATIVAS_CAMPOS_LOGIN = ("email/password", "login/senha")


def _corpo_login(tentativa: str, usuario: str, senha: str) -> Dict[str, str]:
    if tentativa == "email/password":
        return {"email": usuario, "password": senha}
    return {"login": usuario, "senha": senha}


def _sanitizar_para_log(texto: str, limite: int = 200) -> str:
    """Remove quebras de linha e trunca — nunca despejamos uma página HTML inteira no log,
    só o suficiente para diagnosticar (ver itens 2/3 do aviso no topo do arquivo)."""
    return texto.replace("\n", " ").replace("\r", " ")[:limite]


def _parece_pagina_de_erro(conteudo: bytes) -> bool:
    """Heurística: corpo que começa com marcação de página HTML é sinal de página de
    erro/login, não um ZIP de verdade (ver item 2/3 do aviso no topo do arquivo)."""
    inicio = conteudo[:100].lstrip().lower()
    return inicio.startswith(b"<!doctype") or inicio.startswith(b"<html")


def _login(usuario: str, senha: str) -> Optional[requests.Session]:
    """Autentica no INLABS e devolve uma requests.Session com o cookie de sessão recebido,
    ou None se nenhuma variação de campo funcionar.

    Usamos requests.Session() DEDICADA aqui (em vez do get_session()/request_json de
    src/http_client.py) porque precisamos manter o MESMO cookie de sessão entre a chamada
    de login e a(s) chamada(s) de download subsequentes — http_client.request_json() não
    expõe a sessão para quem chama (ela é módulo-global, get_session(), compartilhada com
    outros coletores como PNCP), e reaproveitá-la aqui arriscaria misturar cookies de fontes
    diferentes numa mesma sessão. Uma Session() isolada, só para o INLABS, evita esse risco.
    """
    for tentativa in _TENTATIVAS_CAMPOS_LOGIN:
        corpo = _corpo_login(tentativa, usuario, senha)
        session = requests.Session()
        session.headers.update({"User-Agent": DEFAULT_USER_AGENT})
        try:
            resposta = session.post(LOGIN_URL, data=corpo, timeout=DEFAULT_TIMEOUT, allow_redirects=True)
        except requests.exceptions.RequestException as exc:
            logger.error(
                "Falha de rede ao tentar login no INLABS (campos tentados: %s): %s", tentativa, exc
            )
            continue

        if resposta.status_code >= 400:
            logger.warning(
                "Login no INLABS com campos '%s' retornou HTTP %d; tentando próxima variação.",
                tentativa,
                resposta.status_code,
            )
            continue

        if not session.cookies:
            logger.warning(
                "Login no INLABS com campos '%s' não retornou nenhum cookie de sessão; "
                "tentando próxima variação.",
                tentativa,
            )
            continue

        logger.info(
            "Login no INLABS aparentemente OK com campos '%s' (recebeu cookie de sessão). "
            "A confirmação definitiva só acontece na primeira chamada de download (ver "
            "_parece_pagina_de_erro).",
            tentativa,
        )
        return session

    logger.error(
        "Não foi possível autenticar no INLABS com NENHUMA das variações de campo conhecidas "
        "(%s). Verifique INLABS_USERNAME/INLABS_PASSWORD nas variáveis do Railway; se as "
        "credenciais estiverem certas e o problema persistir, o nome real dos campos do "
        "formulário em %s provavelmente mudou — ajuste _corpo_login()/_TENTATIVAS_CAMPOS_LOGIN "
        "neste arquivo (ver item 1 do aviso no topo).",
        ", ".join(_TENTATIVAS_CAMPOS_LOGIN),
        LOGIN_URL,
    )
    return None


def _formatar_data_inlabs(dia: date) -> str:
    return dia.strftime("%d-%m-%Y")


def _baixar_secao(session: requests.Session, secao: str, data_str: str) -> Optional[bytes]:
    """Baixa o ZIP de uma seção/data. Retorna os bytes do ZIP, ou None em qualquer falha
    (rede, HTTP de erro, ou corpo que não parece um ZIP de verdade) — nunca levanta.

    A verificação de "é um ZIP" é feita pelos PRIMEIROS BYTES (assinatura "PK", ver item 3
    do aviso no topo do arquivo) e NÃO pelo header Content-Type, que a documentação pública
    do INLABS não garante estar correto.
    """
    params = {"p": "", "dt": data_str, "section": secao}
    try:
        resposta = session.get(DOWNLOAD_URL, params=params, timeout=DEFAULT_TIMEOUT)
    except requests.exceptions.RequestException as exc:
        logger.error("Falha de rede ao baixar seção %s (data %s) do INLABS: %s", secao, data_str, exc)
        return None

    if resposta.status_code >= 400:
        logger.error(
            "Download da seção %s (data %s) retornou HTTP %d.", secao, data_str, resposta.status_code
        )
        return None

    conteudo = resposta.content

    if _parece_pagina_de_erro(conteudo):
        logger.warning(
            "Download da seção %s (data %s) devolveu uma página HTML em vez de um ZIP — "
            "provável sessão expirada/não autenticada, ou a seção/data não existe. Abortando "
            "esta seção, sem afetar as demais. Início do corpo (sanitizado): %r",
            secao,
            data_str,
            _sanitizar_para_log(conteudo[:200].decode("utf-8", errors="replace")),
        )
        return None

    if not conteudo.startswith(b"PK"):
        logger.warning(
            "Download da seção %s (data %s) não começa com a assinatura ZIP ('PK'); "
            "abortando esta seção, sem derrubar as outras. Início do corpo (sanitizado): %r",
            secao,
            data_str,
            _sanitizar_para_log(conteudo[:200].decode("utf-8", errors="replace")),
        )
        return None

    return conteudo


# Nomes de tag tentados para reconhecer um elemento de artigo (ver item 5 do aviso no topo).
_TAGS_ARTICLE = ("article", "Article", "ARTICLE")


def _encontrar_artigos(root: ET.Element) -> List[ET.Element]:
    """Localiza elementos de artigo numa árvore XML, cobrindo os dois formatos possíveis:
    a raiz JÁ é o article (1 arquivo XML por artigo dentro do ZIP), ou a raiz é um envelope
    contendo múltiplos elementos article (1 XML grande por seção) — ver item 5 do aviso."""
    if root.tag in _TAGS_ARTICLE:
        return [root]
    artigos: List[ET.Element] = []
    for tag in _TAGS_ARTICLE:
        artigos.extend(root.findall(f".//{tag}"))
    return artigos


def _extrair_artigos_do_zip(conteudo_zip: bytes, secao: str) -> List[ET.Element]:
    """Abre o ZIP em memória e devolve todos os elementos <article> encontrados em todos os
    arquivos .xml dentro dele. Nunca levanta — qualquer arquivo problemático dentro do ZIP é
    logado e simplesmente pulado, sem descartar os demais."""
    artigos: List[ET.Element] = []
    try:
        with zipfile.ZipFile(io.BytesIO(conteudo_zip)) as zf:
            nomes_xml = [n for n in zf.namelist() if n.lower().endswith(".xml")]
            if not nomes_xml:
                logger.warning(
                    "ZIP da seção %s não contém nenhum arquivo .xml (conteúdo do ZIP: %s).",
                    secao,
                    zf.namelist()[:20],
                )
                return []

            for nome in nomes_xml:
                try:
                    conteudo_xml = zf.read(nome)
                except Exception:
                    logger.exception(
                        "Falha ao ler o arquivo '%s' dentro do ZIP da seção %s; ignorado.", nome, secao
                    )
                    continue

                try:
                    root = ET.fromstring(conteudo_xml)
                except ET.ParseError:
                    logger.warning(
                        "Arquivo '%s' dentro do ZIP da seção %s não é XML válido; ignorado.", nome, secao
                    )
                    continue

                encontrados = _encontrar_artigos(root)
                if not encontrados:
                    logger.warning(
                        "Arquivo '%s' (seção %s) não contém nenhum elemento <article> "
                        "reconhecível (tags tentadas: %s); ignorado.",
                        nome,
                        secao,
                        _TAGS_ARTICLE,
                    )
                    continue
                artigos.extend(encontrados)
    except zipfile.BadZipFile:
        logger.error(
            "Conteúdo baixado para a seção %s não pôde ser aberto como ZIP (BadZipFile), "
            "mesmo tendo passado na checagem de assinatura 'PK'.",
            secao,
        )
        return []
    return artigos


def _primeiro_atributo(elemento: ET.Element, nomes: Sequence[str]) -> Optional[str]:
    """Retorna o primeiro atributo não-vazio entre as variações de nome dadas (mesma técnica
    de _primeiro_presente em src/pncp.py, adaptada para atributos de elemento XML)."""
    for nome in nomes:
        valor = elemento.attrib.get(nome)
        if valor:
            return valor
    return None


def _primeiro_texto_filho(elemento: ET.Element, nomes: Sequence[str]) -> Optional[str]:
    """Procura, em profundidade (não só filhos diretos — Titulo/Ementa/Texto ficam dentro de
    <body>, não direto sob <article>), o primeiro elemento cujo nome de tag bate com alguma
    das variações dadas, e devolve seu texto VISÍVEL (itertext(), ignorando tags internas
    como <p>/<br> — ver item 4 do aviso no topo: o corpo pode vir com HTML embutido)."""
    for nome in nomes:
        achado = elemento.find(f".//{nome}")
        if achado is not None:
            texto = "".join(achado.itertext()).strip()
            if texto:
                return texto
    return None


def _normalizar_texto(texto: str) -> str:
    """Remove acentuação e normaliza caixa para comparação — mesma técnica usada em
    lib/pncpBridge.ts (normalizar), só que aqui via unicodedata (NFKD + filtro de combining
    chars) por não termos o método nativo de string.normalize("NFD") do JS."""
    if not texto:
        return ""
    decomposto = unicodedata.normalize("NFKD", texto)
    sem_acentos = "".join(c for c in decomposto if not unicodedata.combining(c))
    return sem_acentos.lower().strip()


def _extrair_resumo(texto_original: str, termo_normalizado: str, janela: int = JANELA_RESUMO) -> str:
    """Recorta ~`janela` caracteres ao redor da primeira ocorrência do termo (buscada de
    forma normalizada) dentro do texto ORIGINAL (com acentos/caixa preservados, para ficar
    legível). A busca da posição é feita no texto normalizado; como NFKD + remoção de
    combining chars preserva o comprimento na esmagadora maioria dos casos (cada caractere
    acentuado vira exatamente 1 caractere sem acento), usamos o mesmo índice no texto
    original — mas sempre com limites (min/max) para nunca estourar a string, mesmo no raro
    caso de um caractere Unicode cuja decomposição mude o comprimento."""
    normalizado = _normalizar_texto(texto_original)
    pos = normalizado.find(termo_normalizado)
    if pos == -1:
        # Defensivo: só chamamos isto depois de já ter confirmado o match, mas nunca
        # confiamos demais — devolve o início do texto truncado em vez de falhar.
        return texto_original[:janela]

    inicio = max(0, pos - janela // 2)
    fim = pos + len(termo_normalizado) + janela // 2
    inicio = min(inicio, len(texto_original))
    fim = min(fim, len(texto_original))
    return texto_original[inicio:fim]


def _serializar_artigo(artigo: ET.Element) -> str:
    """Serializa o XML do artigo para payloadBruto, truncado com segurança (ver
    MAX_PAYLOAD_CHARS) — nunca guardamos um artigo gigante inteiro."""
    try:
        bruto = ET.tostring(artigo, encoding="unicode")
    except Exception:  # pragma: no cover - proteção extra, tostring quase nunca falha
        logger.exception("Falha ao serializar XML de um artigo para payloadBruto.")
        return "(falha ao serializar XML do artigo)"
    if len(bruto) > MAX_PAYLOAD_CHARS:
        return bruto[:MAX_PAYLOAD_CHARS] + "... [truncado]"
    return bruto


# Variações de nome tentadas para cada campo do artigo (ver item 4 do aviso no topo).
_ATRIBUTOS_ID = ("id", "Id", "ID")
_ATRIBUTOS_NOME_ORGAO = ("name", "Name", "NAME")
_ATRIBUTOS_PUB_DATE = ("pubDate", "pubdate", "PubDate", "PUBDATE")
_ATRIBUTOS_NUMERO_PAGINA = ("numberPage", "numberpage", "NumberPage", "pagina", "Pagina")
_TAGS_IDENTIFICA = ("Identifica", "identifica", "IDENTIFICA")
_TAGS_TITULO = ("Titulo", "titulo", "TITULO")
_TAGS_SUBTITULO = ("SubTitulo", "Subtitulo", "subTitulo", "subtitulo")
_TAGS_EMENTA = ("Ementa", "ementa", "EMENTA")
_TAGS_TEXTO = ("Texto", "texto", "TEXTO")


def _processar_artigo(
    artigo: ET.Element,
    secao: str,
    data_publicacao_fallback: str,
    termos_normalizados: List[Tuple[str, str, str]],
) -> List[Dict[str, Any]]:
    """Extrai os campos de UM artigo e, se algum termo vigiado bater no texto completo,
    devolve um registro pronto para persistir por escritório que bateu (pode devolver mais
    de um registro se termos de escritórios diferentes baterem no mesmo artigo — ver
    decisão de arquitetura no topo do arquivo/plano). Devolve lista vazia se não bater com
    nenhum termo (comportamento ESPERADO e a maioria dos casos: o DOU é gigante e só uma
    fração ínfima interessa a algum escritório-cliente)."""
    article_id = _primeiro_atributo(artigo, _ATRIBUTOS_ID)
    if not article_id:
        logger.warning(
            "Artigo da seção %s sem atributo de id reconhecível (tentado: %s); ignorado — "
            "sem id não é possível montar uma chaveUnica estável.",
            secao,
            _ATRIBUTOS_ID,
        )
        return []

    orgao = _primeiro_texto_filho(artigo, _TAGS_IDENTIFICA) or _primeiro_atributo(artigo, _ATRIBUTOS_NOME_ORGAO)
    titulo = _primeiro_texto_filho(artigo, _TAGS_TITULO)
    subtitulo = _primeiro_texto_filho(artigo, _TAGS_SUBTITULO)
    ementa = _primeiro_texto_filho(artigo, _TAGS_EMENTA)
    texto_corpo = _primeiro_texto_filho(artigo, _TAGS_TEXTO)

    data_publicacao = _primeiro_atributo(artigo, _ATRIBUTOS_PUB_DATE) or data_publicacao_fallback
    numero_pagina = _primeiro_atributo(artigo, _ATRIBUTOS_NUMERO_PAGINA)

    texto_completo = " ".join(t for t in (titulo, subtitulo, ementa, texto_corpo) if t)
    if not texto_completo.strip():
        # Artigo sem nenhum texto reconhecível para comparar — não há como casar com termo
        # nenhum. Não é necessariamente um erro (pode ser um artigo puramente estrutural),
        # só não gera registro.
        return []

    texto_normalizado = _normalizar_texto(texto_completo)

    registros: List[Dict[str, Any]] = []
    payload_bruto: Optional[str] = None  # serializado só na primeira vez que precisar (lazy)

    for termo_original, termo_normalizado, office_id in termos_normalizados:
        if termo_normalizado and termo_normalizado in texto_normalizado:
            if payload_bruto is None:
                payload_bruto = _serializar_artigo(artigo)
            chave_unica = f"{data_publicacao}-{secao}-{article_id}-{office_id}"
            registros.append(
                {
                    "chaveUnica": chave_unica,
                    "secao": secao,
                    "orgao": orgao,
                    "titulo": titulo,
                    "ementa": ementa,
                    "textoResumo": _extrair_resumo(texto_completo, termo_normalizado),
                    "dataPublicacao": data_publicacao,
                    "numeroPagina": numero_pagina,
                    "termoEncontrado": termo_original,
                    "payloadBruto": payload_bruto,
                    "officeId": office_id,
                }
            )

    return registros


def coletar_dou(
    secoes: List[str],
    usuario: Optional[str],
    senha: Optional[str],
    termos: List[Tuple[str, str]],
    dia: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """Coleta artigos do DOU (INLABS) para as `secoes` informadas, no dia `dia` (padrão:
    hoje), e devolve APENAS os que baterem com algum termo de `termos` (lista de tuplas
    (termo, office_id) — ver config.py:carregar_termos_vigilancia_do_banco). Cada item
    devolvido é um dict pronto para upsert com as chaves do model RoboDouItem (Tarefa 1).

    DECISÃO DE ARQUITETURA (ver topo do arquivo/plano): diferente de coletar_licitacoes()
    em src/pncp.py, o casamento com os termos vigiados acontece AQUI DENTRO, não numa ponte
    TypeScript depois — o DOU publica milhares de artigos por dia, e gravar todos incharia
    o banco à toa. Artigos que não batem com nenhum termo são silenciosamente descartados
    (não é erro, é o comportamento esperado e a imensa maioria dos casos).

    Nunca levanta exceção: falha de login, de download de uma seção, ou de parsing de um
    artigo específico é logada de forma acionável e a coleta segue com o que der — nenhuma
    falha aqui derruba o ciclo do robô (ver src/pipeline.py).
    """
    resultado: List[Dict[str, Any]] = []

    if not usuario or not senha:
        logger.warning(
            "INLABS_USERNAME/INLABS_PASSWORD não configurados (são variáveis de ambiente do "
            "RAILWAY, não da Vercel — ver README). Pulando a coleta do DOU neste ciclo."
        )
        return resultado

    if not termos:
        logger.info(
            "Nenhum termo de vigilância ativo encontrado em nenhum escritório; nenhum "
            "artigo do DOU será avaliado/persistido neste ciclo (comportamento esperado "
            "enquanto nenhum escritório cadastrar um TermoVigilancia)."
        )
        return resultado

    termos_normalizados: List[Tuple[str, str, str]] = []
    for termo_original, office_id in termos:
        norm = _normalizar_texto(termo_original)
        if norm:
            termos_normalizados.append((termo_original, norm, office_id))

    if not termos_normalizados:
        logger.warning("Todos os termos de vigilância carregados ficaram vazios após normalização; abortando.")
        return resultado

    try:
        session = _login(usuario, senha)
    except Exception:  # pragma: no cover - proteção extra
        logger.exception("Falha inesperada e não tratada durante o login no INLABS.")
        session = None

    if session is None:
        logger.error(
            "Login no INLABS falhou; coleta do DOU abortada neste ciclo inteiro (ver "
            "mensagens de log acima para diagnóstico específico)."
        )
        return resultado

    data_alvo = dia or date.today()
    data_str = _formatar_data_inlabs(data_alvo)
    data_publicacao_fallback = data_alvo.isoformat()

    total_artigos_avaliados = 0

    for secao in secoes:
        try:
            conteudo_zip = _baixar_secao(session, secao, data_str)
        except Exception:  # pragma: no cover - proteção extra
            logger.exception("Falha inesperada ao baixar a seção %s do DOU.", secao)
            continue

        if conteudo_zip is None:
            continue  # falha já logada em _baixar_secao; segue para a próxima seção

        try:
            artigos = _extrair_artigos_do_zip(conteudo_zip, secao)
        except Exception:  # pragma: no cover - proteção extra
            logger.exception("Falha inesperada ao extrair artigos do ZIP da seção %s.", secao)
            continue

        logger.info("DOU seção %s (data %s): %d artigo(s) extraído(s) do ZIP.", secao, data_str, len(artigos))
        total_artigos_avaliados += len(artigos)

        for artigo_elem in artigos:
            try:
                registros = _processar_artigo(artigo_elem, secao, data_publicacao_fallback, termos_normalizados)
            except Exception:  # pragma: no cover - proteção extra
                logger.exception(
                    "Falha inesperada ao processar um artigo da seção %s; artigo ignorado, "
                    "coleta continua.",
                    secao,
                )
                continue
            resultado.extend(registros)

    logger.info(
        "DOU/INLABS: %d artigo(s) avaliado(s) no total (em %d seção/ões), %d registro(s) "
        "gerado(s) por bater com algum termo vigiado (1 registro por par artigo×escritório). "
        "Artigos sem match não são persistidos — comportamento esperado.",
        total_artigos_avaliados,
        len(secoes),
        len(resultado),
    )
    return resultado
