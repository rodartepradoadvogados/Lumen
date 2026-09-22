#!/usr/bin/env python3
"""Ponte HTTP entre o Lúmen (na Vercel) e o Hermes (nesta máquina).

POR QUE ISTO EXISTE
-------------------
O Hermes é um programa de linha de comando, e os perfis dos escritórios ficam no disco DESTA
máquina. O Lúmen roda na Vercel, em contêineres efêmeros onde esse programa não existe e onde não
se segura um processo de dois minutos de pé. A rota antiga tentava `execSync` do binário e nunca
poderia ter funcionado de lá.

Este arquivo é a peça que faltava: recebe a pergunta por HTTP, executa o Hermes aqui, devolve a
resposta. Só isso.

SEM DEPENDÊNCIA NENHUMA, de propósito. Só a biblioteca padrão do Python 3 — nada de pip, nada de
ambiente virtual, nada que quebre numa atualização do sistema daqui a seis meses.

COMO SE FECHA
-------------
- Sem a variável HERMES_TOKEN definida, o serviço NÃO SOBE. Uma ponte sem segredo não é uma ponte
  aberta: é um buraco. Falhar ao iniciar é a única resposta honesta.
- O nome do perfil é conferido contra um formato fixo antes de virar argumento.
- O Hermes é executado com uma LISTA de argumentos, nunca com uma linha de comando montada como
  texto. Não existe shell no caminho, logo não existe injeção de shell — nem pelo nome do perfil,
  nem pela pergunta do usuário.
- O corpo da requisição tem teto de tamanho, e a execução tem tempo máximo.
- O registro (log) guarda o tamanho da pergunta, nunca o conteúdo dela: são dados de cliente de
  escritório de advocacia passando por aqui.
"""

# Anotações adiadas: `str | None` só existe a partir do 3.10, e este arquivo precisa
# subir em qualquer Python 3 que o servidor tenha.
from __future__ import annotations

import hmac
import json
import logging
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERMES_BIN = os.environ.get("HERMES_BIN", "/usr/local/bin/hermes")
PASTA_PERFIS = os.environ.get("HERMES_PROFILES_DIR", "/root/.hermes/profiles")
SCRIPT_PROVISIONAMENTO = os.environ.get(
    "HERMES_PROVISION_SCRIPT",
    "/root/.hermes/profiles/lumen-master/scripts/provision_tenant.py",
)
TOKEN = os.environ.get("HERMES_TOKEN", "")
ENDERECO = os.environ.get("HERMES_BIND", "127.0.0.1")
PORTA = int(os.environ.get("HERMES_PORT", "8787"))
# 240s, e NAO 110s: ver o comentario de PERGUNTA_MAXIMA logo abaixo. Um pedido de peticionamento
# com dezenas de paginas de documento e uma pergunta muito maior do que qualquer conversa de
# atendimento, e demora proporcionalmente mais para ser respondida. Subir o teto de TAMANHO sem
# subir o teto de TEMPO trocaria um 400 limpo ("nao cabe, faca assim") por um 504 no meio da
# geracao — que e pior: o advogado espera dois minutos para nao receber nada.
#
# A CORRENTE INTEIRA, do mais curto para o mais longo, e cada elo tem de ser menor que o seguinte
# para o erro sempre vir de quem sabe explica-lo:
#   Lumen (ESPERA_PETICIONAMENTO_MS em lib/hermesPonte.ts) 230s
#     < esta ponte (ESPERA_S)                              240s
#       < nginx (proxy_read_timeout, ver LEIA-ME.md)       280s
#         < Vercel (maxDuration da tela de confirmacao)    300s
# Quem desiste primeiro e o Lumen, que e o unico lado capaz de dizer ao advogado o que aconteceu.
#
# O caminho da Ana (atendimento) NAO muda com isto: ela continua desistindo em ESPERA_MS (105s)
# do lado do Lumen, muito antes deste teto. Subir o teto daqui nao afrouxa nada do lado dela.
ESPERA_S = int(os.environ.get("HERMES_TIMEOUT_S", "240"))

CORPO_MAXIMO = 512 * 1024  # 512 KiB, e este numero e em BYTES.
#
# AS DUAS UNIDADES DESTE ARQUIVO, e nao confundi-las e metade do que esta entrega existe para
# consertar:
#   · CORPO_MAXIMO conta BYTES   — e o `content-length` do JSON que chega pela rede;
#   · PERGUNTA_MAXIMA conta CARACTERES — e o comprimento do texto da pergunta.
#
# Em portugues com acento o UTF-8 gasta 2 bytes por caractere acentuado: 200.000 caracteres de
# peca juridica dao cerca de 210.000 a 230.000 BYTES, e o JSON ainda acrescenta os escapes de
# aspas e de quebra de linha. 512 KiB = 524.288 bytes cobre isso com mais do que o dobro de
# folga. O corpo TEM de caber a maior pergunta que a linha de baixo aceita, ou a trava de corpo
# recusaria (com 413, e sem explicar nada) justamente o pedido que a trava de pergunta aprovou.
#
# A conta esta PROVADA em lib/testes/peticionamentoLimiteDaPonte.teste.ts, montando uma string de
# portugues de verdade de 200.000 caracteres, serializando o corpo com JSON.stringify e medindo
# os bytes que saem. Antes ela era uma RAZAO CHUTADA ("1,5 byte por caractere e margem de sobra")
# — e razao chutada nao e medicao: e exatamente o genero de conta que deixou passar o defeito
# anterior.
PERGUNTA_MAXIMA = 200_000  # CARACTERES
# A HISTORIA DESTE NUMERO, que ja vai em quatro capitulos:
#
#   8.000  — o valor original, tamanho de uma conversa de chat.
#  16.000  — a maquina de producao passou a rodar com este valor quando o orcamento do prompt do
#            atendimento (LIMITE_DA_PERGUNTA em lib/agenteAtendimento.ts) apertou com os
#            parametros de recusa da Ana. O repositorio ficou para tras, e quem um dia
#            reinstalasse a ponte a partir daqui faria a Ana voltar a recusar mensagem longa em
#            producao, sem ninguem entender por que.
# 200.000  — o Peticionamento passou a mandar o TEXTO dos documentos anexados, e nao so o nome
#            deles. No primeiro uso real (dois documentos), o dono recebeu na tela
#            `400 {"erro": "mensagem ausente ou longa demais"}` — porque 16.000 caracteres sao
#            oito paginas, e nenhum processo de verdade cabe em oito paginas.
# 200.000  — (o mesmo numero, por um triz) o teste seguinte do dono mostrou que este teto era
#            INALCANCAVEL: a pergunta ia como UM argumento de linha de comando, e o Linux limita
#            um unico argumento a MAX_ARG_STRLEN = 32 paginas = 131.072 BYTES. Uma mensagem de
#            160.059 caracteres morreu em 9 milesimos de segundo, antes de chegar ao Hermes:
#            `[Errno 7] Argument list too long: '/usr/local/bin/hermes'`. Pior que o 400 antigo,
#            porque virava `500 {"erro": "falha ao executar o Hermes"}` na tela do advogado.
#            O conserto NAO foi baixar o teto: foi tirar a pergunta do argv. O binario aceita
#            `--query-file PATH` (com `-` lendo a entrada padrao), e e assim que ela viaja agora
#            — ver `executar_hermes`. Com a pergunta fora da linha de comando, MAX_ARG_STRLEN
#            deixa de ser o teto do produto e 200.000 caracteres passam a ser alcancaveis DE
#            VERDADE, que e o que este numero sempre disse que era.
#
# POR QUE 200.000 E NAO "SEM LIMITE": sao algumas dezenas de paginas — grande o bastante para o
# processo real que o dono quer que o agente leia inteiro, e pequeno o bastante para continuar
# sendo um TETO. Um teto existe para que a recusa venha cedo, barata e explicada, em vez de a
# maquina aceitar um pedido de tamanho arbitrario e morrer sem resposta la na frente.
#
# QUEM RECUSA DEVE SER O LUMEN, NAO ESTA LINHA. Este numero e espelhado em
# lib/peticionamentoJanelaDeContexto.ts (PERGUNTA_MAXIMA_DA_PONTE), que recusa ANTES de mandar e
# com uma frase que diz ao advogado o que fazer. O teste
# lib/testes/peticionamentoLimiteDaPonte.teste.ts le ESTE arquivo e falha se os dois numeros
# divergirem — mudar um lado so foi exatamente como o defeito chegou a producao.
#
# O CAMINHO DA ANA NAO MUDA: LIMITE_DA_PERGUNTA (7.500) continua sendo o orcamento dela, e
# lib/testes/limiteDoPedido.teste.ts continua exigindo que ele caiba aqui dentro.

# O TETO DE UM UNICO ARGUMENTO DE LINHA DE COMANDO, em BYTES.
#
# MAX_ARG_STRLEN do Linux, definido em include/uapi/linux/binfmts.h como 32 * PAGE_SIZE. Numa
# maquina de pagina de 4 KiB (todo x86-64, e a VPS do escritorio) sao 32 * 4096 = 131.072 bytes,
# contando o byte nulo do fim. Paginas maiores (16 KiB ou 64 KiB em alguns ARM) so AUMENTAM o
# teto, entao 131.072 e o PISO — e piso e o unico numero seguro de usar num teto.
#
# Desde que a pergunta viaja por `--query-file -`, NADA no argv depende do tamanho do pedido:
# sobram o caminho do binario, `-p <perfil>`, `chat`, `--query-file`, `-`, `--oneshot`, `-Q` e,
# quando ha sessao, `--resume <id>` — algumas centenas de bytes no pior caso. A conferencia
# abaixo, portanto, NAO e o que segura o tamanho do pedido: ela e o cinto que garante que a
# pergunta nao VOLTE para o argv por descuido. Se alguem um dia reintroduzir `-q`, a recusa vem
# como 400 falado, e nao como E2BIG virando 500 opaco na tela do advogado — que foi exatamente o
# que aconteceu em producao.
TETO_DE_ARGUMENTO_BYTES = 32 * 4096

# Folga sobre TETO_DE_ARGUMENTO_BYTES na conferencia do argv. Nao e para o tamanho do pedido (a
# pergunta nao esta mais ali): e para o que o argv tem de variavel e nao controlamos de perto —
# HERMES_BIN pode ser um caminho longo, e o id de sessao vem do Hermes.
FOLGA_DO_ARGV_BYTES = 8 * 1024


# O nome do perfil é conferido contra um formato, não contra uma lista: minúsculas, dígitos, ponto,
# hífen e sublinhado. NÃO se exige mais o prefixo "lumen-tenant-" — esse prefixo era invenção do
# código antigo. O perfil que existe de verdade nesta instalação chama-se "atendimento-lumen", e
# exigir um prefixo inventado recusaria justamente o perfil real.
#
# O que o formato garante continua valendo: o nome não pode virar opção de linha de comando (não
# começa com hífen) nem caminho de arquivo (não tem barra).
PERFIL_VALIDO = re.compile(r"^[a-z0-9][a-z0-9._-]{0,62}$")
SESSAO_VALIDA = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
SLUG_VALIDO = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
ID_VALIDO = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
NOME_MAXIMO = 200

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [ponte-hermes] %(message)s",
)
log = logging.getLogger("ponte-hermes")


class ProvisionamentoIndisponivel(Exception):
    """Esta instalação do Hermes não tem o script de provisionamento."""


class PerfilAusente(Exception):
    """O escritório ainda não tem perfil provisionado no Hermes."""


class ArgumentoGrandeDemais(Exception):
    """A linha de comando montada não caberia no teto do sistema operacional.

    Recusar AQUI, antes do `subprocess.run`, é o ponto inteiro: deixar o `exec` estourar devolve
    `[Errno 7] Argument list too long`, que vira `500 {"erro": "falha ao executar o Hermes"}` —
    um erro opaco, que não diz ao advogado nada que ele possa fazer. Uma recusa 400 falada é
    infinitamente melhor que um 500 mudo.
    """


class HermesDesatualizado(Exception):
    """Este binário do Hermes não conhece `--query-file`.

    Só pode acontecer numa instalação que ficou para trás. Merece mensagem própria porque o
    conserto é do lado do servidor (atualizar o binário), não do lado de quem perguntou — e um
    "falha ao executar o Hermes" genérico mandaria o dono procurar defeito no lugar errado, que
    foi como o prefixo inventado `lumen-tenant-` manteve esta integração quebrada por dias.
    """


def checar_argumentos(argumentos: list) -> None:
    """Recusa ANTES de executar, se algum argumento passar do teto do sistema operacional.

    Mede em BYTES UTF-8, e não em caracteres: MAX_ARG_STRLEN é um limite de bytes, e foi
    justamente medir em caracteres o que fez `200.000` parecer alcançável quando o teto real
    eram 131.072 bytes — em português com acento, a diferença é de 10% a 15%.

    O `+ 1` é o byte nulo com que o sistema termina cada argumento; ele conta para o teto.
    """
    teto = TETO_DE_ARGUMENTO_BYTES - FOLGA_DO_ARGV_BYTES
    for argumento in argumentos:
        tamanho = len(argumento.encode("utf-8")) + 1
        if tamanho > teto:
            raise ArgumentoGrandeDemais(
                "um argumento da linha de comando tem %d bytes, acima do teto de %d" % (tamanho, teto)
            )


def executar_hermes(perfil: str, mensagem: str, sessao: str | None, ferramentas: dict | None = None):
    """Roda o Hermes e devolve (resposta, id_da_sessao).

    Sem shell: `subprocess.run` recebe a lista de argumentos e o sistema operacional a entrega ao
    programa como está. A pergunta do usuário nem sequer passa por essa lista — vai pela entrada
    padrão, via `--query-file -` (ver o comentário longo abaixo). Sem shell e fora do argv, não há
    injeção de comando nem teto de tamanho de argumento a respeitar.

    AS FERRAMENTAS VÃO PELO AMBIENTE, e só deste processo. O Lúmen manda, junto com a pergunta, o
    endereço onde o agente consulta os dados e a credencial daquela pergunta. Aqui elas viram duas
    variáveis de ambiente do processo filho — que morre quando a resposta sai.

    Por que não gravar num arquivo de configuração do perfil: a credencial é DE UMA PERGUNTA. Ela
    sabe quem perguntou e o que essa pessoa pode ver. Guardá-la no disco a transformaria numa
    credencial do escritório inteiro, valendo para sempre — e aí o financeiro de um sócio passaria
    a responder a quem apenas soubesse formular a pergunta. É exatamente o que o dono proibiu.
    """
    # O COMANDO REAL, confirmado com `hermes --help` e `hermes chat --help` na máquina:
    #
    #   hermes -p <perfil> chat --query-file - --oneshot -Q [--resume <id>]
    #
    # `-p` vem ANTES do subcomando: é opção do programa, não do `chat`. O código antigo usava
    # `chat --profile <perfil>`, opção que NÃO EXISTE — por isso nunca funcionou.
    # `--oneshot` responde e sai, em vez de abrir sessão interativa. `-Q` cala o supérfluo.
    #
    # ── A PERGUNTA NÃO VAI MAIS NA LINHA DE COMANDO, e é esta a correção desta entrega ────────
    #
    # Era `-q <mensagem>`: a pergunta inteira como UM argumento. O Linux limita um único argumento
    # a MAX_ARG_STRLEN (ver TETO_DE_ARGUMENTO_BYTES) — 131.072 bytes, que em português com acento
    # são entre ~110.000 e ~125.000 caracteres. Uma geração real do dono, com 160.059 caracteres,
    # morreu em 9 milésimos de segundo sem nunca chegar ao Hermes:
    #
    #   [ponte-hermes] pergunta para peticionamento-lumen (160059 caracteres, nova conversa, ...)
    #   [ponte-hermes] falha ao executar o Hermes: [Errno 7] Argument list too long
    #
    # `--query-file PATH` lê a pergunta de um arquivo, e `-` lê da ENTRADA PADRÃO. É por ela que a
    # pergunta viaja agora. `-q` e `--query-file` são MUTUAMENTE EXCLUSIVOS — mandar os dois é erro
    # de uso, então `-q` desapareceu daqui inteiro.
    #
    # POR QUE STDIN E NÃO UM ARQUIVO TEMPORÁRIO, que `--query-file PATH` também aceita:
    #
    #   · a pergunta é dado de cliente de escritório de advocacia. Sigilo profissional não é
    #     detalhe: um arquivo temporário coloca a peça inteira no disco, ainda que por segundos,
    #     onde backup, snapshot da VPS e qualquer outro processo da máquina podem alcançá-la. A
    #     entrada padrão não encosta no disco;
    #   · não há o que apagar, logo não há caminho de erro em que o apagar não aconteça. Com
    #     arquivo seria preciso um `try/finally` que sobrevivesse ao tempo esgotado e a qualquer
    #     exceção — e "quase sempre apaga" é, em dado sigiloso, o mesmo que "vaza às vezes";
    #   · não há nome para colidir entre duas perguntas simultâneas (esta ponte é
    #     `ThreadingHTTPServer`: duas gerações ao mesmo tempo são o caso normal, não a exceção);
    #   · a permissão do arquivo deixaria de ser um problema porque o arquivo deixa de existir.
    #
    # `encoding="utf-8"` é EXPLÍCITO de propósito: sem ele o Python usa a codificação do ambiente,
    # e uma VPS com `LANG=C` escreveria a pergunta em ASCII e quebraria no primeiro "ção". O mesmo
    # `encoding` vale para a resposta que volta.
    #
    # SE UM DIA PRECISAR VOLTAR A SER ARQUIVO (por exemplo, se alguma versão do Hermes deixar de
    # aceitar `-`): o único lugar a mexer é este bloco — trocar `"-"` pelo caminho e `input=` por
    # um `try/finally` que grave e apague. Nada mais neste arquivo sabe por onde a pergunta viaja.
    argumentos = [HERMES_BIN, "-p", perfil, "chat", "--query-file", "-", "--oneshot", "-Q"]
    if sessao:
        argumentos += ["--resume", sessao]

    # RECUSA ANTES DE EXECUTAR. Com a pergunta fora do argv isto nunca deve disparar — e é
    # exatamente por isso que fica: se alguém reintroduzir `-q` aqui, a recusa vem falada e 400,
    # em vez de `[Errno 7]` virando 500 opaco na tela do advogado.
    checar_argumentos(argumentos)

    ambiente = os.environ.copy()
    if ferramentas:
        ambiente["LUMEN_FERRAMENTAS_URL"] = str(ferramentas.get("url") or "")
        ambiente["LUMEN_FERRAMENTAS_CREDENCIAL"] = str(ferramentas.get("credencial") or "")

    concluido = subprocess.run(
        argumentos,
        # A PERGUNTA ENTRA POR AQUI, e não pelo argv — ver o bloco acima.
        input=mensagem,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=ESPERA_S,
        check=False,
        env=ambiente,
    )

    if concluido.returncode != 0:
        erro = (concluido.stderr or "").strip()
        minusculo = erro.lower()
        # Binário antigo, que ainda não conhece `--query-file`. Merece resposta própria: o
        # conserto é atualizar o Hermes na máquina, e um "falha ao executar" genérico mandaria
        # quem cuida do servidor procurar defeito no lugar errado.
        if "--query-file" in erro and ("unrecognized" in minusculo or "no such option" in minusculo or "invalid" in minusculo):
            raise HermesDesatualizado(erro[:300])
        # O Hermes diz "profile ... not found" quando o escritório não foi provisionado. Esse caso
        # tem conserto pelo painel mestre, e não por quem cuida do servidor — por isso vira 404.
        if "profile" in minusculo and ("not found" in minusculo or "unknown" in minusculo):
            raise PerfilAusente(erro[:300])
        raise RuntimeError(erro[:300] or f"o Hermes terminou com código {concluido.returncode}")

    linhas = (concluido.stdout or "").strip().split("\n")
    linha_sessao = next((l for l in linhas if l.startswith("session_id:")), None)
    nova_sessao = linha_sessao.replace("session_id:", "").strip() if linha_sessao else (sessao or "")
    resposta = "\n".join(l for l in linhas if not l.startswith("session_id:")).strip()
    return resposta, nova_sessao


def executar_provisionamento(argumentos: list, espera_s: int):
    """Roda o script de provisionamento e devolve o JSON da ultima linha.

    Mesma regra do chat: lista de argumentos, nunca linha de comando montada como texto. A rota
    antiga interpolava o slug direto — `--slug ${slug}` — o que fazia de um parametro de URL um
    pedaco de comando. Aqui nao ha shell para interpolar nada.
    """
    # O script de provisionamento não existe em toda instalação — nesta, por exemplo, não existe.
    # Dizer isso com clareza vale mais que um erro genérico de execução: quem lê o 501 sabe que
    # falta instalar algo, e não fica procurando defeito na ponte.
    if not os.path.exists(SCRIPT_PROVISIONAMENTO):
        raise ProvisionamentoIndisponivel(SCRIPT_PROVISIONAMENTO)

    concluido = subprocess.run(
        ["python3", SCRIPT_PROVISIONAMENTO, *argumentos],
        capture_output=True,
        text=True,
        timeout=espera_s,
        check=False,
    )
    if concluido.returncode != 0:
        erro = (concluido.stderr or "").strip().split("\n")
        raise RuntimeError((erro[-1] if erro else "")[:300] or f"codigo {concluido.returncode}")

    ultima = (concluido.stdout or "").strip().split("\n")[-1]
    try:
        return json.loads(ultima or "{}")
    except ValueError:
        raise RuntimeError("o script nao devolveu JSON na ultima linha")


def estado_do_perfil(perfil: str) -> dict:
    """O que se sabe sobre um perfil SEM gastar uma pergunta ao modelo.

    O painel mestre precisa dizer se um escritorio esta provisionado. A rota antiga descobria isso
    mandando o Hermes responder "ping" — uma chamada de modelo, paga, para CADA escritorio, a cada
    vez que a tela abrisse. Custo real para uma informacao que o disco ja da de graca.

    Aqui a resposta vem do sistema de arquivos: a pasta do perfil existe, quanto ocupa a memoria
    dele, e quantas conversas ele guarda. Se alguem quiser mesmo saber se ele RESPONDE, que peca
    uma pergunta de verdade — de proposito, e nao por acidente de renderizacao.
    """
    caminho = os.path.join(PASTA_PERFIS, perfil)
    existe = os.path.isdir(caminho)
    memoria_kb = 0
    sessoes = 0

    if existe:
        estado = os.path.join(caminho, "state.db")
        if os.path.exists(estado):
            memoria_kb = round(os.path.getsize(estado) / 1024)
        pasta_sessoes = os.path.join(caminho, "sessions")
        if os.path.isdir(pasta_sessoes):
            try:
                sessoes = len([n for n in os.listdir(pasta_sessoes) if not n.startswith(".")])
            except OSError:
                sessoes = 0

    return {"perfil": perfil, "existe": existe, "memoriaKB": memoria_kb, "sessoes": sessoes}


def memoria_da_maquina() -> dict:
    """RAM e swap livres da MAQUINA (nao de um perfil) — para o alerta do Lumen (Sec 4 da
    especificacao do modulo pago de campanhas).

    So biblioteca padrao, lendo /proc/meminfo (Linux). MemAvailable e o numero que o proprio
    kernel calcula como "livre para uso sem precisar trocar para o swap" — mais correto que
    MemFree sozinho, que conta como ocupado boa parte do cache de disco que o kernel devolve na
    hora se algum processo precisar. SwapFree e direto.
    """
    valores: dict[str, int] = {}
    with open("/proc/meminfo", "r", encoding="utf-8") as arquivo:
        for linha in arquivo:
            partes = linha.split(":")
            if len(partes) != 2:
                continue
            chave = partes[0].strip()
            if chave not in ("MemAvailable", "MemTotal", "SwapFree", "SwapTotal"):
                continue
            numero = partes[1].strip().split()[0]  # "12345 kB" -> "12345"
            try:
                valores[chave] = int(numero)
            except ValueError:
                continue

    return {
        "ramDisponivelKB": valores.get("MemAvailable", 0),
        "ramTotalKB": valores.get("MemTotal", 0),
        "swapLivreKB": valores.get("SwapFree", 0),
        "swapTotalKB": valores.get("SwapTotal", 0),
    }


class Ponte(BaseHTTPRequestHandler):
    server_version = "ponte-hermes"
    sys_version = ""  # não anuncia a versão do Python para quem bater na porta

    def _responder(self, codigo: int, corpo: dict):
        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def _autorizado(self) -> bool:
        cabecalho = self.headers.get("authorization", "")
        if not cabecalho.startswith("Bearer "):
            return False
        # Comparação de tempo constante: comparar segredo com `==` vaza, pelo tempo de resposta,
        # quantos caracteres do começo estavam certos.
        return hmac.compare_digest(cabecalho[7:], TOKEN)

    def do_GET(self):  # noqa: N802 (nome exigido pela biblioteca padrão)
        # /saude nao exige segredo de proposito: serve ao nginx e a quem cuida da maquina, e nao
        # revela nada alem de "estou de pe" e "o binario esta no lugar".
        if self.path == "/saude":
            self._responder(200, {"ok": True, "hermes": os.path.exists(HERMES_BIN)})
            return

        if self.path == "/perfis":
            if not self._autorizado():
                self._responder(401, {"erro": "não autorizado"})
                return
            try:
                self._responder(200, executar_provisionamento(["list"], 30))
            except ProvisionamentoIndisponivel as erro:
                self._responder(501, {"erro": f"esta instalacao nao tem o script de provisionamento ({erro})"})
            except subprocess.TimeoutExpired:
                self._responder(504, {"erro": "o provisionamento demorou demais"})
            except Exception as erro:  # noqa: BLE001
                log.error("falha ao listar perfis: %s", erro)
                self._responder(500, {"erro": "falha ao listar perfis"})
            return

        if self.path == "/memoria":
            if not self._autorizado():
                self._responder(401, {"erro": "não autorizado"})
                return
            try:
                self._responder(200, memoria_da_maquina())
            except OSError as erro:
                log.error("falha ao ler /proc/meminfo: %s", erro)
                self._responder(500, {"erro": "falha ao ler memória da máquina"})
            return

        self._responder(404, {"erro": "rota desconhecida"})

    def do_POST(self):  # noqa: N802
        if self.path == "/estado":
            if not self._autorizado():
                self._responder(401, {"erro": "não autorizado"})
                return
            try:
                tamanho = int(self.headers.get("content-length", "0"))
                corpo = json.loads(self.rfile.read(tamanho).decode("utf-8")) if tamanho else {}
            except (ValueError, UnicodeDecodeError):
                self._responder(400, {"erro": "corpo inválido"})
                return
            perfis = corpo.get("perfis")
            if not isinstance(perfis, list) or not perfis:
                self._responder(400, {"erro": "informe a lista de perfis"})
                return
            validos = [p for p in perfis[:100] if isinstance(p, str) and PERFIL_VALIDO.match(p)]
            self._responder(200, {"estados": [estado_do_perfil(p) for p in validos]})
            return

        if self.path in ("/provisionar", "/desprovisionar"):
            self._provisionamento()
            return

        if self.path != "/chat":
            self._responder(404, {"erro": "rota desconhecida"})
            return

        if not self._autorizado():
            log.warning("recusada: credencial inválida")
            self._responder(401, {"erro": "não autorizado"})
            return

        try:
            tamanho = int(self.headers.get("content-length", "0"))
        except ValueError:
            tamanho = 0
        if tamanho <= 0 or tamanho > CORPO_MAXIMO:
            self._responder(413, {"erro": "corpo ausente ou grande demais"})
            return

        try:
            corpo = json.loads(self.rfile.read(tamanho).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._responder(400, {"erro": "corpo inválido"})
            return

        perfil = str(corpo.get("perfil") or "")
        mensagem = str(corpo.get("mensagem") or "").strip()
        sessao = str(corpo.get("sessao") or "").strip() or None

        # As ferramentas são opcionais: sem elas o agente responde só com o que já sabe.
        ferramentas = corpo.get("ferramentas")
        if ferramentas is not None:
            if not isinstance(ferramentas, dict):
                self._responder(400, {"erro": "ferramentas inválidas"})
                return
            url_ferramentas = str(ferramentas.get("url") or "")
            # Só HTTPS: a credencial da pergunta viaja neste endereço, e em texto limpo ela
            # entregaria a quem estiver no caminho o direito de consultar aquele escritório.
            if not url_ferramentas.startswith("https://"):
                self._responder(400, {"erro": "a url das ferramentas precisa ser https"})
                return
            if not str(ferramentas.get("credencial") or ""):
                self._responder(400, {"erro": "credencial das ferramentas ausente"})
                return

        if not PERFIL_VALIDO.match(perfil):
            self._responder(400, {"erro": "perfil inválido"})
            return
        # EM CARACTERES, e de propósito: PERGUNTA_MAXIMA é um teto de CARACTERES (é assim que ele
        # está escrito, é assim que o Lúmen o espelha, e é o texto da pergunta que ele mede).
        # Quem conta BYTES aqui dentro é CORPO_MAXIMO, lá em cima, sobre o `content-length` —
        # duas travas, duas unidades, cada uma medindo o que de fato limita.
        if not mensagem or len(mensagem) > PERGUNTA_MAXIMA:
            self._responder(400, {"erro": "mensagem ausente ou longa demais"})
            return
        if sessao and not SESSAO_VALIDA.match(sessao):
            self._responder(400, {"erro": "sessão inválida"})
            return

        # O conteúdo da pergunta NÃO entra no registro: são dados de cliente.
        # Nem a pergunta nem a credencial entram no registro: uma é dado de cliente, a outra abre
        # a consulta ao escritório. Fica o tamanho, o perfil, e se há ferramentas — o suficiente
        # para investigar, longe de virar uma segunda cópia do que passou por aqui.
        # O TAMANHO VAI NAS DUAS UNIDADES. Foi este registro que revelou o defeito do argv — e ele
        # mostrava só caracteres, justamente a unidade que NÃO era a do limite estourado. Com os
        # bytes ao lado, a próxima investigação começa com o número certo na mão.
        log.info("pergunta para %s (%d caracteres, %d bytes, %s, ferramentas: %s)", perfil,
                 len(mensagem), len(mensagem.encode("utf-8")),
                 "continuando" if sessao else "nova conversa", "sim" if ferramentas else "nao")

        try:
            resposta, nova_sessao = executar_hermes(perfil, mensagem, sessao, ferramentas)
        except ArgumentoGrandeDemais as erro:
            # MESMA FRASE da trava de tamanho lá em cima, e isso é intencional: o Lúmen já sabe
            # traduzir "mensagem ausente ou longa demais" numa recusa falada e acionável, com os
            # botões de saída da tela de limite. Uma segunda frase para o mesmo motivo só criaria
            # um caminho novo para o advogado ficar sem instrução nenhuma.
            log.error("argumento grande demais em %s: %s", perfil, erro)
            self._responder(400, {"erro": "mensagem ausente ou longa demais"})
            return
        except HermesDesatualizado as erro:
            log.error("hermes sem --query-file em %s: %s", perfil, erro)
            self._responder(
                501,
                {"erro": "esta instalação do hermes não conhece --query-file — atualize o binário (ver LEIA-ME.md)"},
            )
            return
        except PerfilAusente as erro:
            log.warning("perfil ausente: %s", erro)
            self._responder(404, {"erro": "perfil não provisionado"})
            return
        except subprocess.TimeoutExpired:
            log.error("o Hermes passou de %ds em %s", ESPERA_S, perfil)
            self._responder(504, {"erro": "o Hermes demorou demais"})
            return
        except Exception as erro:  # noqa: BLE001 — qualquer falha vira 500 com motivo curto
            log.error("falha ao executar o Hermes: %s", erro)
            self._responder(500, {"erro": "falha ao executar o Hermes"})
            return

        if not resposta:
            self._responder(502, {"erro": "o Hermes respondeu vazio"})
            return

        self._responder(200, {"resposta": resposta, "sessao": nova_sessao})

    def _provisionamento(self):
        """Cria ou remove o perfil de um escritorio no Hermes.

        Um escritorio sem perfil provisionado tem a caixa de conversa muda — o /chat responde 404
        e nao ha o que o dono possa fazer pela tela. Por isso estas duas portas existem: elas sao
        o que transforma "escritorio criado" em "escritorio que pode perguntar".
        """
        if not self._autorizado():
            log.warning("recusada: credencial inválida em %s", self.path)
            self._responder(401, {"erro": "não autorizado"})
            return

        try:
            tamanho = int(self.headers.get("content-length", "0"))
        except ValueError:
            tamanho = 0
        if tamanho <= 0 or tamanho > CORPO_MAXIMO:
            self._responder(413, {"erro": "corpo ausente ou grande demais"})
            return

        try:
            corpo = json.loads(self.rfile.read(tamanho).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._responder(400, {"erro": "corpo inválido"})
            return

        slug = str(corpo.get("slug") or "")
        if not SLUG_VALIDO.match(slug):
            self._responder(400, {"erro": "slug inválido"})
            return

        if self.path == "/desprovisionar":
            argumentos = ["deprovision", "--slug", slug]
            espera = 60
        else:
            identificador = str(corpo.get("officeId") or "")
            nome = str(corpo.get("nome") or "").strip()
            if not ID_VALIDO.match(identificador):
                self._responder(400, {"erro": "officeId inválido"})
                return
            if not nome or len(nome) > NOME_MAXIMO:
                self._responder(400, {"erro": "nome ausente ou longo demais"})
                return
            argumentos = ["provision", "--slug", slug, "--id", identificador, "--name", nome]
            espera = 120

        log.info("%s para %s", self.path.lstrip("/"), slug)

        try:
            resultado = executar_provisionamento(argumentos, espera)
        except ProvisionamentoIndisponivel as erro:
            log.error("provisionamento indisponivel: %s", erro)
            self._responder(501, {"erro": f"esta instalacao nao tem o script de provisionamento ({erro})"})
            return
        except subprocess.TimeoutExpired:
            log.error("o provisionamento de %s passou de %ds", slug, espera)
            self._responder(504, {"erro": "o provisionamento demorou demais"})
            return
        except Exception as erro:  # noqa: BLE001
            log.error("falha no provisionamento de %s: %s", slug, erro)
            # "nao existe" e um caso previsto, nao uma falha do servidor: quem chamou mandou um
            # escritorio que o Hermes nao conhece, e a tela sabe o que dizer sobre isso.
            texto = str(erro).lower()
            if "not found" in texto or "nao encontrado" in texto or "não encontrado" in texto:
                self._responder(404, {"erro": "perfil não encontrado"})
            else:
                self._responder(500, {"erro": f"falha no provisionamento: {erro}"})
            return

        self._responder(200, resultado)

    def log_message(self, formato, *args):
        # Silencia o registro padrão da biblioteca, que imprimiria a linha da requisição inteira.
        pass


def main():
    if not TOKEN:
        print(
            "ERRO: HERMES_TOKEN não está definido. O serviço não sobe sem o segredo — "
            "uma ponte sem autenticação deixaria o Hermes aberto a quem alcançar a porta.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    if len(TOKEN) < 32:
        print("ERRO: HERMES_TOKEN curto demais (mínimo 32 caracteres).", file=sys.stderr)
        raise SystemExit(1)
    if not os.path.exists(HERMES_BIN):
        log.warning("atenção: %s não existe nesta máquina — /chat vai falhar", HERMES_BIN)

    servidor = ThreadingHTTPServer((ENDERECO, PORTA), Ponte)
    log.info("ouvindo em %s:%d, executando %s", ENDERECO, PORTA, HERMES_BIN)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        log.info("encerrando")
        servidor.server_close()


if __name__ == "__main__":
    main()
