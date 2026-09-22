#!/usr/bin/env python3
"""EXERCITA a ponte de verdade — e imprime o resultado em JSON para a suite TypeScript ler.

POR QUE ISTO EXISTE. As regras da ponte (servidor-hermes/servidor.py) sempre foram provadas por
VARREDURA do arquivo, a partir do TypeScript. Varredura prova que o codigo EXISTE, nunca que ele
FUNCIONA — e esta casa ja pagou por essa diferenca duas vezes: uma trava inteira virou `if (false)`
com as 76 suites verdes, e um `encoding="utf-8"` procurado no arquivo inteiro casava com OUTRA
chamada. Nesta entrega a lista de opcoes do argv passou a ser DERIVADA, e uma varredura presa a
grafia chegou a IMPEDIR a propria correcao que guardava.

Aqui a ponte e SUBIDA de verdade, num porta efemera, com um `hermes` de mentira no lugar do
binario, e as regras sao exercitadas por requisicao HTTP real: o caminho sincrono da Ana, o
caminho assincrono novo, a autorizacao do `/resultado`, o teto de tarefas, a validade e o
desaparecimento depois da leitura.

Uso: python3 lib/testes/ponteHermes.harness.py <pasta-temporaria>
Saida: uma linha de JSON com todos os fatos observados.
"""

import importlib.util
import json
import os
import stat
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

TOKEN = "t" * 40
PASTA = sys.argv[1]
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def escrever_hermes_falso(nome: str, corpo: str) -> str:
    caminho = os.path.join(PASTA, nome)
    with open(caminho, "w", encoding="utf-8") as arquivo:
        arquivo.write(corpo)
    os.chmod(caminho, os.stat(caminho).st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return caminho


# Um "hermes" que ecoa o proprio argv: e assim que se prova que `--run-budget` e `--max-turns`
# chegam MESMO ao binario, em vez de so estarem escritos no arquivo.
ECOA_ARGV = escrever_hermes_falso(
    "hermes-eco",
    "#!/bin/sh\ncat > /dev/null\necho 'session_id: sessao-de-mentira'\necho \"ARGV: $@\"\n",
)
# Um que demora: serve para observar o estado "trabalhando" antes de a tarefa terminar.
DEMORA = escrever_hermes_falso("hermes-lento", "#!/bin/sh\ncat > /dev/null\nsleep 3\necho 'pronto'\n")
# Um que falha com "perfil nao encontrado": o 404 que o painel mestre usa.
FALHA_PERFIL = escrever_hermes_falso("hermes-sem-perfil", "#!/bin/sh\ncat > /dev/null\necho 'profile not found' >&2\nexit 1\n")
# Um que nao conhece as opcoes novas: o 501 de binario velho.
OPCAO_DESCONHECIDA = escrever_hermes_falso(
    "hermes-velho",
    "#!/bin/sh\ncat > /dev/null\necho 'error: unrecognized option --run-budget' >&2\nexit 2\n",
)

os.environ["HERMES_TOKEN"] = TOKEN
os.environ["HERMES_BIN"] = ECOA_ARGV
os.environ["HERMES_TAREFAS_MAXIMAS"] = "2"
os.environ["HERMES_TAREFA_VALIDADE_S"] = "2"

spec = importlib.util.spec_from_file_location("ponte", os.path.join(RAIZ, "servidor-hermes", "servidor.py"))
ponte = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ponte)

servidor = ThreadingHTTPServer(("127.0.0.1", 0), ponte.Ponte)
PORTA = servidor.server_address[1]
threading.Thread(target=servidor.serve_forever, daemon=True).start()


def chamar(metodo, caminho, corpo=None, token=TOKEN):
    req = urllib.request.Request("http://127.0.0.1:%d%s" % (PORTA, caminho), method=metodo)
    if token is not None:
        req.add_header("authorization", "Bearer " + token)
    dados = None
    if corpo is not None:
        dados = json.dumps(corpo).encode("utf-8")
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, dados, timeout=30) as resposta:
            return resposta.status, json.loads(resposta.read().decode("utf-8"))
    except urllib.error.HTTPError as erro:
        return erro.code, json.loads(erro.read().decode("utf-8"))


def esperar_fim(tarefa, limite_s=25):
    ate = time.time() + limite_s
    visto_trabalhando = False
    while time.time() < ate:
        codigo, corpo = chamar("GET", "/resultado/" + tarefa)
        if corpo.get("estado") == "trabalhando":
            visto_trabalhando = True
            time.sleep(0.2)
            continue
        return codigo, corpo, visto_trabalhando
    return 0, {"estado": "nunca terminou"}, visto_trabalhando


fatos = {}

# ── 1. O ORCAMENTO CHEGA MESMO AO BINARIO ────────────────────────────────────────────────────
fatos["espera_s"] = ponte.ESPERA_S
fatos["orcamento_s"] = ponte.ORCAMENTO_S
fatos["folga_s"] = ponte.FOLGA_DO_ORCAMENTO_S
fatos["max_turns"] = ponte.MAX_TURNS

# ── DERIVADO, E ISSO SE PROVA MOVENDO O OUTRO NUMERO ─────────────────────────────────────────
#
# Conferir que ORCAMENTO_S == ESPERA_S - FOLGA com os padroes de hoje NAO prova derivacao: um
# numero escrito a mao que por acaso bata passa igual. A unica prova e MOVER o teto do processo e
# ver o orcamento ir junto — e e exatamente o defeito que o comentario do arquivo descreve
# (alguem baixa HERMES_TIMEOUT_S numa maquina menor e o `subprocess` volta a matar o agente antes
# de o orcamento sequer avisa-lo).
#
# Roda num interpretador SEPARADO, porque as constantes sao lidas no momento do import.
import subprocess as _sub  # noqa: E402

_prova = _sub.run(
    [
        sys.executable,
        "-c",
        (
            "import importlib.util,os,json;"
            "spec=importlib.util.spec_from_file_location('p', %r);"
            "m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);"
            "print(json.dumps({'espera': m.ESPERA_S, 'orcamento': m.ORCAMENTO_S}))"
        ) % os.path.join(RAIZ, "servidor-hermes", "servidor.py"),
    ],
    capture_output=True,
    text=True,
    env=dict(os.environ, HERMES_TIMEOUT_S="120"),
    timeout=60,
)
fatos["com_outro_teto"] = json.loads(_prova.stdout.strip().split("\n")[-1]) if _prova.returncode == 0 else {"erro": _prova.stderr[-300:]}
codigo, corpo = chamar("POST", "/chat", {"perfil": "peticionamento-lumen", "mensagem": "uma pergunta"})
fatos["chat_sincrono"] = {"codigo": codigo, "corpo": corpo}

# ── 2. O CAMINHO ASSINCRONO ─────────────────────────────────────────────────────────────────
codigo, corpo = chamar("POST", "/chat-async", {"perfil": "peticionamento-lumen", "mensagem": "uma pergunta"})
fatos["disparo"] = {"codigo": codigo, "corpo": corpo}
tarefa = corpo.get("tarefa", "")

# A AUTORIZACAO DO /resultado — a mesma de /chat, exercitada de verdade.
fatos["resultado_sem_token"] = {"codigo": chamar("GET", "/resultado/" + tarefa, token=None)[0]}
fatos["resultado_token_errado"] = {"codigo": chamar("GET", "/resultado/" + tarefa, token="x" * 40)[0]}

codigo, corpo, _ = esperar_fim(tarefa)
fatos["resultado_pronto"] = {"codigo": codigo, "corpo": corpo}
# SOME DEPOIS DE LIDA.
codigo, corpo = chamar("GET", "/resultado/" + tarefa)
fatos["resultado_depois_de_lido"] = {"codigo": codigo, "corpo": corpo}
# TAREFA DESCONHECIDA (o mesmo que acontece quando a ponte reinicia).
fatos["resultado_desconhecido"] = dict(zip(("codigo", "corpo"), chamar("GET", "/resultado/" + ("z" * 24))))
fatos["resultado_id_invalido"] = {"codigo": chamar("GET", "/resultado/xx")[0]}

# ── 3. O ESTADO "TRABALHANDO" E O TETO DE TAREFAS ───────────────────────────────────────────
ponte.HERMES_BIN = DEMORA
lentas = []
for _ in range(3):
    lentas.append(chamar("POST", "/chat-async", {"perfil": "peticionamento-lumen", "mensagem": "demorada"}))
fatos["teto_de_tarefas"] = {"maximo": ponte.TAREFAS_MAXIMAS, "codigos": [c for c, _ in lentas]}
em_voo = [corpo["tarefa"] for c, corpo in lentas if c == 202]
if em_voo:
    codigo, corpo = chamar("GET", "/resultado/" + em_voo[0])
    fatos["estado_enquanto_trabalha"] = {"codigo": codigo, "corpo": corpo}
for identificador in em_voo:
    esperar_fim(identificador)

# ── 4. A VALIDADE (TTL) ─────────────────────────────────────────────────────────────────────
ponte.HERMES_BIN = ECOA_ARGV
codigo, corpo = chamar("POST", "/chat-async", {"perfil": "peticionamento-lumen", "mensagem": "para vencer"})
vencivel = corpo.get("tarefa", "")
time.sleep(ponte.TAREFA_VALIDADE_S + 0.6)
fatos["resultado_vencido"] = dict(zip(("codigo", "corpo"), chamar("GET", "/resultado/" + vencivel)))
fatos["tarefas_na_memoria_depois_do_vencimento"] = len(ponte._tarefas)

# ── 5. A TRADUCAO DE FALHA E A MESMA NOS DOIS CAMINHOS ──────────────────────────────────────
# A funcao, exercitada direto: e ela que os dois caminhos usam.
classificacoes = {}
for nome, erro in (
    ("argumento_grande", ponte.ArgumentoGrandeDemais("qualquer coisa")),
    ("binario_velho", ponte.HermesDesatualizado("--run-budget — unrecognized option")),
    ("perfil_ausente", ponte.PerfilAusente("profile not found")),
    ("tempo_esgotado", __import__("subprocess").TimeoutExpired(cmd=["hermes"], timeout=1)),
    ("inesperado", RuntimeError("qualquer outra coisa")),
):
    codigo, corpo = ponte.classificar_falha(erro, "peticionamento-lumen")
    classificacoes[nome] = {"codigo": codigo, "erro": corpo.get("erro", "")}
fatos["classificacoes"] = classificacoes

# E pela REDE, nos dois caminhos, para o mesmo defeito: o perfil ausente.
ponte.HERMES_BIN = FALHA_PERFIL
codigo, corpo = chamar("POST", "/chat", {"perfil": "peticionamento-lumen", "mensagem": "x"})
fatos["sincrono_perfil_ausente"] = {"codigo": codigo, "corpo": corpo}
codigo, corpo = chamar("POST", "/chat-async", {"perfil": "peticionamento-lumen", "mensagem": "x"})
codigo, corpo, _ = esperar_fim(corpo["tarefa"])
fatos["assincrono_perfil_ausente"] = {"codigo": codigo, "corpo": corpo}

ponte.HERMES_BIN = OPCAO_DESCONHECIDA
codigo, corpo = chamar("POST", "/chat", {"perfil": "peticionamento-lumen", "mensagem": "x"})
fatos["sincrono_binario_velho"] = {"codigo": codigo, "corpo": corpo}

# ── 6. AS TRAVAS DE TAMANHO VALEM NAS DUAS PORTAS ───────────────────────────────────────────
ponte.HERMES_BIN = ECOA_ARGV
gigante = "x" * (ponte.PERGUNTA_MAXIMA + 1)
fatos["sincrono_mensagem_grande"] = dict(zip(("codigo", "corpo"), chamar("POST", "/chat", {"perfil": "peticionamento-lumen", "mensagem": gigante})))
fatos["assincrono_mensagem_grande"] = dict(zip(("codigo", "corpo"), chamar("POST", "/chat-async", {"perfil": "peticionamento-lumen", "mensagem": gigante})))
fatos["assincrono_sem_token"] = {"codigo": chamar("POST", "/chat-async", {"perfil": "p", "mensagem": "x"}, token=None)[0]}
fatos["assincrono_perfil_invalido"] = {"codigo": chamar("POST", "/chat-async", {"perfil": "-nao/vale", "mensagem": "x"})[0]}

servidor.shutdown()
print(json.dumps(fatos, ensure_ascii=False))
