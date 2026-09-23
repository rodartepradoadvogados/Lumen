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

DOIS CAMINHOS, E O SEGUNDO É O QUE TIRA A ESPERA DE DENTRO DA REQUISIÇÃO WEB
---------------------------------------------------------------------------
- `POST /chat` é o caminho de sempre: espera o Hermes e devolve a resposta na mesma requisição. É
  por ele que o atendimento (a Ana) fala, e ele NÃO MUDA — nem de comportamento, nem de código de
  erro, nem de frase de recusa.
- `POST /chat-async` recebe o MESMO corpo, começa o trabalho numa thread e devolve NA HORA um
  identificador de tarefa; `GET /resultado/<id>` diz em que pé está. Existe porque o teto duro da
  Vercel é de 300 segundos, e uma peça a partir de um processo de dezenas de páginas pode
  legitimamente precisar de mais — limitar o agente para caber num cano de rede é limitar a
  qualidade do trabalho ao tempo de uma requisição HTTP.

E O AGENTE PASSOU A SABER QUE HÁ PRAZO: `--run-budget`, derivado de `HERMES_TIMEOUT_S` (ver
ORCAMENTO_S), faz o Hermes receber um aviso para concluir aos 80% do tempo em vez de ser MORTO no
meio da redação, que foi o defeito real registrado nesta VPS.

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
import secrets
import subprocess
import sys
import threading
import time
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
# 900s = QUINZE MINUTOS, e este numero e O TETO DO PROCESSO DA GERACAO — nao ha nenhum outro elo
# mais curto que o constranja. Pedido do dono, textual: "tem muita coisa que e complexa". Era 240s,
# e 240s era o teto de uma requisicao HTTP disfarcado de teto de trabalho: uma peca a partir de um
# processo de dezenas de paginas leva o tempo que leva, e em producao o Hermes foi MORTO aos 240s
# com o agente ainda escrevendo.
#
# POR QUE SUBIR AGORA PODE, E ANTES NAO PODIA. Antes desta corrente, a geracao acontecia DENTRO de
# uma requisicao web, e por isso o teto duro da Vercel (300s) limitava o trabalho. Com
# `/chat-async` NINGUEM segura conexao esperando a geracao: o disparo responde na hora (202) e
# `GET /resultado/<id>` responde na hora. O teto do trabalho deixou de ser o teto de um cano de
# rede — que e o ponto inteiro da entrega anterior, agora cobrado.
#
# A CORRENTE DE HOJE, e cada elo existe por um motivo diferente:
#
#   O TRABALHO (o caminho assincrono, que e o normal do peticionamento):
#     esta ponte (ESPERA_S, teto do processo)                          900s  ← 15 min
#       < Lumen (PRAZO_MAXIMO_DA_GERACAO_MS, quando desiste de esperar) 1200s
#         < validade da tarefa aqui (TAREFA_VALIDADE_S)                2400s
#     e a janela do cron (JANELA_DE_BUSCA_DO_CRON_MS, 24h) cobre tudo isso.
#     Aqui quem desiste primeiro e o AGENTE, avisado pelo proprio orcamento (ORCAMENTO_S) —
#     e nao um relogio de rede matando o processo no meio da redacao.
#
#   A REQUISICAO WEB (o caminho sincrono de compatibilidade, e o da Ana):
#     Ana (ESPERA_MS no Lumen)                             105s
#       < peticionamento sincrono (ESPERA_PETICIONAMENTO_MS) 230s
#         < nginx (proxy_read_timeout, ver LEIA-ME.md)       280s
#           < Vercel (maxDuration da tela de confirmacao)    300s
#     Quem desiste primeiro continua sendo o Lumen, que e o unico lado capaz de dizer ao advogado
#     o que aconteceu.
#
# O NGINX NAO CONSTRANGE MAIS A GERACAO, e isso e consequencia do desenho, nao sorte: as duas
# rotas do caminho assincrono respondem na hora, entao nenhuma conexao fica aberta 900s para o
# `proxy_read_timeout` cortar. Ele continua valendo para quem AINDA segura conexao — o `/chat`
# sincrono —, e 280s ja esta acima do teto do Lumen nesse caminho (230s). Nao ha nada a editar na
# VPS por causa deste arquivo. Ver LEIA-ME.md, secao 4.
#
# O caminho da Ana (atendimento) NAO muda com isto: ela continua desistindo em ESPERA_MS (105s)
# do lado do Lumen, muito antes deste teto. Subir o teto daqui nao afrouxa nada do lado dela — e
# ela nunca chega perto dele, porque quem desiste primeiro e sempre ela.
ESPERA_S = int(os.environ.get("HERMES_TIMEOUT_S", "900"))

# ── O ORCAMENTO DO AGENTE, E POR QUE ELE E DERIVADO DE ESPERA_S ──────────────────────────────
#
# O DEFEITO REAL, do registro da VPS (dois documentos anexados, uma decisao judicial em PDF e um
# parecer em DOCX):
#
#   subprocess.TimeoutExpired: Command '['/usr/local/bin/hermes', '-p', 'peticionamento-lumen',
#   'chat', ...]' timed out after 240 seconds
#   BrokenPipeError: [Errno 32] Broken pipe
#
# O Hermes passou de 240s SEM TERMINAR e foi MORTO no meio da redacao. O cano quebrado veio logo
# atras: o Lumen ja havia desistido aos 230s, entao quando esta ponte tentou responder nao havia
# mais ninguem do outro lado. O advogado leu "DEMORA: o Hermes nao respondeu em 230s" e TODO o
# trabalho (e o custo das chamadas de modelo) se perdeu.
#
# `hermes chat` aceita `--run-budget SEGUNDOS`. A propria ajuda do binario descreve o que ele faz:
# aos 80% do orcamento o agente recebe UM aviso para concluir, e os tempos implicitos de provedor
# passam a ser limitados ao que resta do orcamento, para uma unica chamada pendurada nao consumir
# a execucao inteira. Sem ele, o agente trabalha SEM SABER que ha prazo — e a unica coisa que
# acontece no fim do prazo e a morte do processo.
#
# A diferenca e entre "perdeu tudo" e "entregou uma minuta".
#
# DERIVADO, NUNCA UM SEGUNDO NUMERO SOLTO. Se o orcamento fosse escrito a mao (por exemplo, 840),
# bastaria alguem baixar HERMES_TIMEOUT_S para 120 numa maquina menor para o `subprocess` voltar a
# matar o agente antes de o orcamento sequer avisa-lo — o defeito de hoje, de volta, em silencio.
# Aqui o orcamento e SEMPRE ESPERA_S menos uma folga, entao mover um move o outro junto.
#
# O QUE A FOLGA COMPRA: o aviso de conclusao chega aos 80% do orcamento; do aviso ate o fim do
# orcamento o agente ainda tem 20% para fechar o texto; e depois do fim do orcamento ele ainda tem
# a FOLGA inteira para escrever a resposta na saida padrao antes de o `subprocess` matar o
# processo. Com os padroes de hoje (900s e 60s): orcamento de 840s, aviso aos 672s, 168s para
# concluir, e 60s de margem entre o fim do orcamento e a machadada. Quem termina a execucao passa
# a ser o AGENTE, e nao o sistema operacional — que e o ponto inteiro desta mudanca.
#
# A FOLGA SUBIU DE 25s PARA 60s junto com o teto, e nao por proporcao: o que ela paga e ESCREVER a
# resposta na saida padrao depois do fim do orcamento, e uma execucao de quinze minutos produz uma
# peca MAIOR do que uma de quatro. Vinte e cinco segundos eram folga para uma peca curta; sessenta
# cobrem uma peca longa sem depender de a maquina estar descarregada naquele instante. Continua
# sendo uma fracao pequena do teto (60 de 900), entao nao rouba tempo de trabalho do agente.
#
# O PISO DE 30s existe para uma instalacao com HERMES_TIMEOUT_S muito curto nao acabar com um
# orcamento zero ou negativo, que o binario rejeitaria (ou, pior, trataria como "sem orcamento").
FOLGA_DO_ORCAMENTO_S = int(os.environ.get("HERMES_RUN_BUDGET_FOLGA_S", "60"))
ORCAMENTO_S = max(30, ESPERA_S - FOLGA_DO_ORCAMENTO_S)

# ── O TETO DE ITERACOES DE FERRAMENTA ────────────────────────────────────────────────────────
#
# `--max-turns` e o numero maximo de iteracoes de chamada de ferramenta por turno de conversa, e o
# padrao do binario e 500.
#
# 500 E MUITO PARA UMA PECA, e o numero errado pelo motivo errado: uma ferramenta em laco (uma
# busca que sempre devolve o mesmo resultado, uma leitura que nunca converge) gasta o orcamento
# INTEIRO sem escrever uma linha — e aí o aviso de conclusao dos 80% chega a um agente que passou
# o tempo todo girando, e o que ele "entrega" e o nada que ele tem. O orcamento sozinho nao
# protege disso; ele so garante que o nada chegue no prazo.
#
# 60 E O NUMERO, e ele nao e chute: o pedido de peticionamento ja leva o TEXTO dos documentos
# DENTRO da pergunta (ver PERGUNTA_MAXIMA abaixo — ate 200.000 caracteres). O agente nao precisa
# de dezenas de rodadas para ABRIR arquivo: ele precisa de algumas para consultar os dados do
# escritorio pelas ferramentas do Lumen e conferir precedentes. Sessenta iteracoes sao varias
# vezes o que uma geracao saudavel usa, e ainda assim um TETO — uma ferramenta travada bate nele
# em vez de consumir o orcamento inteiro (hoje, 840 segundos).
#
# CONFIGURAVEL de proposito, e com padrao seguro: se um dia uma peca legitimamente precisar de
# mais, sobe-se HERMES_MAX_TURNS na maquina sem esperar deploy nenhum do Lumen.
MAX_TURNS = int(os.environ.get("HERMES_MAX_TURNS", "60"))

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


class TarefasDemais(Exception):
    """A memoria de tarefas da ponte esta cheia — nao da para comecar outra geracao agora.

    Recusar AQUI, falado, e o ponto: uma tarefa pronta guarda uma peca inteira, e esta VPS tem
    1,6 GB livres. Aceitar sem teto trocaria uma recusa honesta ("tente em alguns minutos") por
    uma ponte que fica sem memoria no meio de tres geracoes ao mesmo tempo — e aí quem perde nao e
    so quem chegou por ultimo, e todo mundo, inclusive o atendimento.
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
    #
    # ── E O AGENTE PASSOU A SABER QUE HA PRAZO ────────────────────────────────────────────────
    #
    # `--run-budget` e `--max-turns` entraram aqui porque, sem eles, o unico fim possivel de uma
    # geracao longa era o `subprocess` MATAR o processo no meio da redacao (ver o comentario de
    # ORCAMENTO_S, com o registro real de producao). Os dois numeros vem das constantes la de
    # cima — derivados e configuraveis —, nunca escritos a mao nesta linha.
    argumentos = [
        HERMES_BIN, "-p", perfil, "chat", "--query-file", "-", "--oneshot", "-Q",
        "--run-budget", str(ORCAMENTO_S),
        "--max-turns", str(MAX_TURNS),
    ]
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
        # BINARIO VELHO — E A CONFERENCIA E DERIVADA DO QUE FOI MANDADO, nao de uma grafia fixa.
        #
        # Antes esta linha procurava literalmente "--query-file". Ela nasceu certa e envelheceu
        # errada no minuto em que esta entrega passou a mandar TAMBEM `--run-budget` e
        # `--max-turns`: um Hermes que nao conhecesse uma dessas duas cairia no balde do 500
        # generico ("falha ao executar o Hermes"), e quem cuida do servidor iria procurar defeito
        # no lugar errado — exatamente o que o 501 existe para evitar.
        #
        # Agora a lista sai do PROPRIO argv montado acima. Uma opcao nova acrescentada amanha ja
        # nasce coberta, sem ninguem precisar lembrar de vir aqui.
        opcoes_enviadas = [a for a in argumentos if a.startswith("--")]
        desconhecida = next((o for o in opcoes_enviadas if o in erro), None)
        if desconhecida and ("unrecognized" in minusculo or "no such option" in minusculo or "invalid" in minusculo):
            raise HermesDesatualizado("%s — %s" % (desconhecida, erro[:260]))
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


def classificar_falha(erro: Exception, perfil: str):
    """Traduz uma falha de `executar_hermes` em (codigo HTTP, corpo JSON) — UM lugar so.

    POR QUE ISTO VIROU FUNCAO. Ate esta entrega a traducao morava, escrita a mao, dentro do
    `try/except` de `/chat`. Com o caminho assincrono passou a existir um SEGUNDO lugar que
    precisa exatamente das mesmas frases: a tarefa que roda na thread nao tem requisicao HTTP
    aberta para responder, mas guarda a falha para `/resultado/<id>` entregar depois.

    Duas copias da mesma traducao divergiriam no primeiro dia em que alguem mexesse numa delas — e
    a divergencia seria MUDA: o mesmo defeito daria uma recusa falada pelo caminho sincrono e uma
    frase desconhecida pelo assincrono, que e justamente o que o Lumen nao sabe traduzir para o
    advogado. Uma funcao so, e os dois caminhos chamam esta.

    AS FRASES SAO AS MESMAS DE ANTES, ao pe da letra. O Lumen ja sabe traduzir cada uma delas numa
    recusa acionavel (ver `confirmarTriagemEGerar`), e o atendimento (a Ana) usa ESTA MESMA ponte:
    reescrever uma frase aqui mudaria, sem aviso, o que ela responde.
    """
    if isinstance(erro, ArgumentoGrandeDemais):
        # MESMA FRASE da trava de tamanho da rota, e isso e intencional: o Lumen ja sabe traduzir
        # "mensagem ausente ou longa demais" numa recusa falada, com os botoes de saida da tela de
        # limite. Uma segunda frase para o mesmo motivo so criaria um caminho novo para o advogado
        # ficar sem instrucao nenhuma.
        log.error("argumento grande demais em %s: %s", perfil, erro)
        return 400, {"erro": "mensagem ausente ou longa demais"}

    if isinstance(erro, HermesDesatualizado):
        # O conserto e do lado do servidor (atualizar o binario), nao do lado de quem perguntou. O
        # nome da opcao vem do proprio erro — `executar_hermes` o poe na frente — para quem cuida
        # da maquina saber QUAL opcao falta, em vez de sair conferindo todas.
        log.error("hermes sem uma opcao que a ponte usa, em %s: %s", perfil, erro)
        opcao = str(erro).split(" — ")[0].strip() or "desconhecida"
        return 501, {
            "erro": "esta instalação do hermes não conhece uma opção que a ponte usa (%s) — atualize o binário (ver LEIA-ME.md)" % opcao
        }

    if isinstance(erro, PerfilAusente):
        # Tem conserto pelo painel mestre, e nao por quem cuida do servidor — por isso 404.
        log.warning("perfil ausente: %s", erro)
        return 404, {"erro": "perfil não provisionado"}

    if isinstance(erro, subprocess.TimeoutExpired):
        # DEPOIS DESTA ENTREGA, CAIR AQUI PASSOU A SER ANORMAL. Com `--run-budget` o agente recebe
        # o aviso de conclusao aos 80% do orcamento e ainda tem a FOLGA inteira para escrever a
        # resposta antes de o `subprocess` mata-lo. Se mesmo assim estourou, o registro leva os
        # DOIS numeros — o teto do processo e o orcamento do agente —, porque a proxima
        # investigacao comeca por saber se o orcamento estava mesmo chegando ao binario.
        log.error("o Hermes passou de %ds em %s (orçamento do agente: %ds)", ESPERA_S, perfil, ORCAMENTO_S)
        return 504, {"erro": "o Hermes demorou demais"}

    # O BALDE. Qualquer falha inesperada vira 500 com motivo curto — e o Lumen sabe traduzir
    # "falha ao executar o Hermes" numa recusa falada, porque um 500 opaco ja chegou cru a tela do
    # advogado uma vez e nao pode chegar de novo.
    log.error("falha ao executar o Hermes: %s", erro)
    return 500, {"erro": "falha ao executar o Hermes"}


# ══════════════════════════════════════════════════════════════════════════════════════════════
# O CAMINHO ASSINCRONO — a espera sai de dentro da requisicao web
# ══════════════════════════════════════════════════════════════════════════════════════════════
#
# O TETO DURO DE UMA REQUISICAO WEB E A VERCEL: 300 segundos. Nenhuma funcao da plataforma passa
# disso, e a corrente antiga (Lumen 230s < ponte 240s < nginx 280s < Vercel 300s) nao tinha para
# onde crescer. "Aumentar os tempos" nao era conserto: era adiar. Uma peca a partir de um processo
# de dezenas de paginas pode legitimamente precisar de mais do que 300s, e limitar o agente para
# caber numa requisicao HTTP e limitar a QUALIDADE do trabalho ao tempo de um cano de rede.
#
# E E POR ISTO QUE O TETO DO TRABALHO PODE SER 900s HOJE (ver ESPERA_S): as duas rotas daqui
# respondem NA HORA, entao nenhum dos relogios de rede — nem o do nginx, nem o da Vercel — fica
# contando durante a geracao. Quando o teto de 15 minutos subiu, nada na VPS precisou mudar.
#
# Por isso a geracao passa a ser um TRABALHO COM NOME: `POST /chat-async` comeca o trabalho numa
# thread e devolve NA HORA um identificador; `GET /resultado/<id>` diz em que pe esta. O Lumen
# dispara, volta na hora, e acompanha — pela tela, enquanto o advogado estiver olhando, e pelo
# cron, quando ele fechar a aba.
#
# `/chat` SINCRONO CONTINUA EXISTINDO, INTACTO. O atendimento (a Ana) usa esta mesma ponte, e o
# pedido dela — uma pergunta de conversa, com teto de 105s do lado do Lumen — nunca precisou de
# nada disto. Esta entrega nao encosta no caminho dela: e regra, nao preferencia.
#
# AS TAREFAS VIVEM EM MEMORIA, e e por isso que elas tem teto e validade:
#
#   · TETO DE QUANTIDADE — uma tarefa pronta guarda uma PECA INTEIRA (ate algumas centenas de
#     KiB). Sem teto, a ponte vira um vazamento de memoria que guarda pecas, e esta VPS tem 1,6 GB
#     livres. Cheia, a ponte RECUSA comecar outra (503) em vez de aceitar e ficar sem memoria no
#     meio — recusar cedo e falado e sempre melhor que morrer no meio.
#   · VALIDADE (TTL) — uma tarefa que ninguem veio buscar (a aba fechou, o Lumen caiu) nao pode
#     ficar de pe para sempre.
#   · SOME DEPOIS DE LIDA — assim que `/resultado/<id>` entrega um estado FINAL (pronto ou
#     falhou), a tarefa sai da memoria. O conteudo de uma peca nao fica guardado aqui um segundo
#     a mais do que o necessario para atravessar a rede uma vez.
#
# E O CONTEUDO NUNCA VAI AO REGISTRO. Mesma disciplina que o resto do arquivo ja tem: fica o
# tamanho, o perfil e o estado — nunca a pergunta nem a resposta, que sao dados de cliente de
# escritorio de advocacia.
#
# SE A PONTE REINICIAR, AS TAREFAS SOMEM. Isso e estado possivel do mundo, nao erro de
# programacao: `/resultado/<id>` de tarefa desconhecida responde 404 com `estado: "desconhecida"`,
# e e o Lumen que transforma isso numa recusa falada ("a geracao se perdeu, tente de novo") — em
# vez de um erro cru na tela ou, pior, de uma espera que nunca termina.

TAREFAS_MAXIMAS = int(os.environ.get("HERMES_TAREFAS_MAXIMAS", "32"))
# 2400s = QUARENTA MINUTOS, e este numero e DEPOIS do prazo maximo do Lumen, nunca antes.
#
# A ORDEM E A REGRA, e ela e o que separa "geracao concluida" de "trabalho pago que virou geracao
# perdida": teto do processo (900s) < prazo maximo do Lumen (1200s) < validade da tarefa (2400s).
# Uma tarefa que vence ANTES de o Lumen desistir apagaria da memoria uma peca PRONTA — o advogado
# leria "a geracao se perdeu" por causa de um relogio de limpeza, e nao por causa de uma falha.
#
# Subiu de 1800s junto com o resto da corrente, mantendo a mesma proporcao de antes (o dobro do
# prazo maximo). A margem tem de caber a espera do cron: uma geracao que termina aos 900s com a
# aba fechada so e colhida na proxima varredura, e o cron corre a cada cinco minutos.
#
# ISTO NAO AFETA O TETO DE MEMORIA: quem limita o que a ponte guarda e TAREFAS_MAXIMAS (quantidade),
# nao a validade. Uma validade maior guarda pelo mesmo teto de pecas, por mais tempo.
TAREFA_VALIDADE_S = int(os.environ.get("HERMES_TAREFA_VALIDADE_S", "2400"))

# O identificador nao e sequencial de proposito. A autorizacao de `/resultado/<id>` e a MESMA de
# `/chat` (o segredo da ponte), e ela e que segura a porta; mas um id sorteado e a segunda tranca:
# mesmo com o segredo em maos, ninguem adivinha o id da geracao de outro escritorio.
TAREFA_VALIDA = re.compile(r"^[A-Za-z0-9_-]{16,64}$")

_tarefas: dict = {}
_trava_das_tarefas = threading.Lock()


def _descartar_vencidas(agora: float) -> int:
    """Tira da memoria o que passou da validade. SO PODE SER CHAMADA COM A TRAVA NA MAO."""
    vencidas = [chave for chave, tarefa in _tarefas.items() if agora - tarefa["criada_em"] > TAREFA_VALIDADE_S]
    for chave in vencidas:
        del _tarefas[chave]
    return len(vencidas)


def abrir_tarefa() -> str:
    """Reserva uma tarefa e devolve o id. Estoura `TarefasDemais` quando a memoria ja esta cheia."""
    agora = time.time()
    with _trava_das_tarefas:
        descartadas = _descartar_vencidas(agora)
        if descartadas:
            log.info("%d tarefa(s) vencida(s) descartada(s)", descartadas)
        if len(_tarefas) >= TAREFAS_MAXIMAS:
            raise TarefasDemais("%d tarefas em andamento, teto de %d" % (len(_tarefas), TAREFAS_MAXIMAS))
        identificador = secrets.token_urlsafe(24)
        _tarefas[identificador] = {"estado": "trabalhando", "criada_em": agora}
        return identificador


def fechar_tarefa(identificador: str, **dados) -> None:
    """Grava o resultado FINAL de uma tarefa. Silenciosa se a tarefa ja venceu ou ja foi lida."""
    with _trava_das_tarefas:
        tarefa = _tarefas.get(identificador)
        if tarefa is None:
            return
        tarefa.update(dados)


def ler_tarefa(identificador: str):
    """O estado de uma tarefa; `None` quando ela e desconhecida (venceu, foi lida, ou a ponte reiniciou).

    LER UM ESTADO FINAL APAGA A TAREFA. O conteudo de uma peca nao fica na memoria da ponte depois
    de atravessar a rede uma vez — e a consequencia disso esta escrita, de proposito, no desenho:
    se o Lumen morrer entre ler e gravar, a geracao se perde e a proxima leitura diz
    "desconhecida", que vira a recusa falada de sempre. Guardar para sempre "por via das duvidas"
    seria trocar essa perda rara por um vazamento permanente de peca em memoria.
    """
    agora = time.time()
    with _trava_das_tarefas:
        _descartar_vencidas(agora)
        tarefa = _tarefas.get(identificador)
        if tarefa is None:
            return None
        if tarefa["estado"] == "trabalhando":
            return dict(tarefa)
        return dict(_tarefas.pop(identificador))


def _trabalhar(identificador: str, perfil: str, mensagem: str, sessao, ferramentas) -> None:
    """O corpo da thread: roda o MESMO `executar_hermes` do caminho sincrono e guarda o resultado.

    NUNCA ESTOURA. Uma excecao que escapasse daqui morreria na thread e deixaria a tarefa
    "trabalhando" para sempre — o advogado olhando uma tela que nunca muda, ate a validade. Todo
    caminho de saida daqui fecha a tarefa.
    """
    try:
        resposta, nova_sessao = executar_hermes(perfil, mensagem, sessao, ferramentas)
        if not resposta:
            fechar_tarefa(identificador, estado="falhou", erro="o Hermes respondeu vazio", codigo=502)
            return
        # O TAMANHO VAI AO REGISTRO, O CONTEUDO NAO.
        log.info("tarefa concluída em %s (%d caracteres de resposta)", perfil, len(resposta))
        fechar_tarefa(identificador, estado="pronto", resposta=resposta, sessao=nova_sessao)
    except Exception as erro:  # noqa: BLE001 — a thread nao tem para quem estourar
        codigo, corpo = classificar_falha(erro, perfil)
        fechar_tarefa(identificador, estado="falhou", erro=corpo.get("erro", "falha ao executar o Hermes"), codigo=codigo)


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

        # ── O RESULTADO DE UMA GERACAO ────────────────────────────────────────────────────────
        #
        # A MESMA AUTORIZACAO DE `/chat`, e isto nao e detalhe: um id vazado nao pode virar porta
        # de leitura de peca alheia. O id e sorteado (nao da para adivinhar o do vizinho) E a
        # porta exige o segredo da ponte — as duas trancas, nao uma.
        if self.path.startswith("/resultado/"):
            if not self._autorizado():
                log.warning("recusada: credencial inválida em /resultado")
                self._responder(401, {"erro": "não autorizado"})
                return
            identificador = self.path[len("/resultado/"):]
            if not TAREFA_VALIDA.match(identificador):
                self._responder(400, {"erro": "identificador de tarefa inválido"})
                return
            tarefa = ler_tarefa(identificador)
            if tarefa is None:
                # TAREFA DESCONHECIDA — E ISTO E ESTADO POSSIVEL DO MUNDO, NAO DEFEITO.
                #
                # Tres caminhos chegam aqui, e os tres sao normais: a ponte REINICIOU (as tarefas
                # vivem em memoria); a tarefa VENCEU sem ninguem vir busca-la; ou alguem ja LEU o
                # resultado (e ler um estado final apaga a tarefa, de proposito — ver `ler_tarefa`).
                #
                # Por isso a resposta e FALADA e tem estado proprio: o Lumen a transforma numa
                # recusa em portugues ("a geracao se perdeu, tente de novo"), e nunca numa espera
                # que nao termina — que seria o pior dos mundos para quem esta olhando a tela.
                self._responder(404, {"estado": "desconhecida", "erro": "tarefa desconhecida — a ponte pode ter reiniciado, ou o resultado já foi entregue"})
                return
            if tarefa["estado"] == "trabalhando":
                self._responder(200, {"estado": "trabalhando"})
                return
            if tarefa["estado"] == "pronto":
                # O CONTEUDO SO ATRAVESSA A REDE, nunca o registro (ver a disciplina no topo do
                # arquivo): aqui vai a peca; no `log` foi so o tamanho dela.
                self._responder(200, {"estado": "pronto", "resposta": tarefa.get("resposta", ""), "sessao": tarefa.get("sessao", "")})
                return
            self._responder(200, {"estado": "falhou", "erro": tarefa.get("erro", "falha ao executar o Hermes"), "codigo": tarefa.get("codigo", 500)})
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

        # AS DUAS PORTAS DE PERGUNTA, e elas compartilham a validacao inteira (`_ler_pedido_de_chat`)
        # de proposito: um teto que valesse numa e nao na outra seria uma porta dos fundos em volta
        # do teto — e quem entra por ela e o pedido grande demais, que e o que este arquivo passou
        # duas entregas aprendendo a recusar cedo e falado.
        if self.path in ("/chat", "/chat-async"):
            pedido = self._ler_pedido_de_chat()
            if pedido is None:
                return  # a recusa ja foi respondida por quem validou
            if self.path == "/chat":
                self._chat_sincrono(*pedido)
            else:
                self._chat_assincrono(*pedido)
            return

        self._responder(404, {"erro": "rota desconhecida"})

    def _ler_pedido_de_chat(self):
        """Autoriza, le e confere o corpo de uma pergunta. Devolve a tupla do pedido, ou `None`
        quando ja respondeu a recusa (e aí quem chamou so precisa voltar).

        UMA VALIDACAO SO PARA AS DUAS ROTAS. `/chat` e `/chat-async` recebem o MESMO corpo; se
        cada uma conferisse por conta propria, bastaria alguem consertar um teto num lugar para o
        outro continuar aceitando o que este arquivo inteiro existe para recusar.
        """
        if not self._autorizado():
            log.warning("recusada: credencial inválida")
            self._responder(401, {"erro": "não autorizado"})
            return None

        try:
            tamanho = int(self.headers.get("content-length", "0"))
        except ValueError:
            tamanho = 0
        if tamanho <= 0 or tamanho > CORPO_MAXIMO:
            self._responder(413, {"erro": "corpo ausente ou grande demais"})
            return None

        try:
            corpo = json.loads(self.rfile.read(tamanho).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._responder(400, {"erro": "corpo inválido"})
            return None

        perfil = str(corpo.get("perfil") or "")
        mensagem = str(corpo.get("mensagem") or "").strip()
        sessao = str(corpo.get("sessao") or "").strip() or None

        # As ferramentas são opcionais: sem elas o agente responde só com o que já sabe.
        ferramentas = corpo.get("ferramentas")
        if ferramentas is not None:
            if not isinstance(ferramentas, dict):
                self._responder(400, {"erro": "ferramentas inválidas"})
                return None
            url_ferramentas = str(ferramentas.get("url") or "")
            # Só HTTPS: a credencial da pergunta viaja neste endereço, e em texto limpo ela
            # entregaria a quem estiver no caminho o direito de consultar aquele escritório.
            if not url_ferramentas.startswith("https://"):
                self._responder(400, {"erro": "a url das ferramentas precisa ser https"})
                return None
            if not str(ferramentas.get("credencial") or ""):
                self._responder(400, {"erro": "credencial das ferramentas ausente"})
                return None

        if not PERFIL_VALIDO.match(perfil):
            self._responder(400, {"erro": "perfil inválido"})
            return None
        # EM CARACTERES, e de propósito: PERGUNTA_MAXIMA é um teto de CARACTERES (é assim que ele
        # está escrito, é assim que o Lúmen o espelha, e é o texto da pergunta que ele mede).
        # Quem conta BYTES aqui dentro é CORPO_MAXIMO, lá em cima, sobre o `content-length` —
        # duas travas, duas unidades, cada uma medindo o que de fato limita.
        if not mensagem or len(mensagem) > PERGUNTA_MAXIMA:
            self._responder(400, {"erro": "mensagem ausente ou longa demais"})
            return None
        if sessao and not SESSAO_VALIDA.match(sessao):
            self._responder(400, {"erro": "sessão inválida"})
            return None

        # O conteúdo da pergunta NÃO entra no registro: são dados de cliente.
        # Nem a pergunta nem a credencial entram no registro: uma é dado de cliente, a outra abre
        # a consulta ao escritório. Fica o tamanho, o perfil, e se há ferramentas — o suficiente
        # para investigar, longe de virar uma segunda cópia do que passou por aqui.
        # O TAMANHO VAI NAS DUAS UNIDADES. Foi este registro que revelou o defeito do argv — e ele
        # mostrava só caracteres, justamente a unidade que NÃO era a do limite estourado. Com os
        # bytes ao lado, a próxima investigação começa com o número certo na mão.
        log.info("pergunta para %s (%d caracteres, %d bytes, %s, ferramentas: %s, via %s)", perfil,
                 len(mensagem), len(mensagem.encode("utf-8")),
                 "continuando" if sessao else "nova conversa", "sim" if ferramentas else "nao",
                 self.path.lstrip("/"))

        return perfil, mensagem, sessao, ferramentas

    def _chat_sincrono(self, perfil, mensagem, sessao, ferramentas):
        """O caminho de sempre: espera o Hermes dentro da requisição e responde com a peça pronta.

        NÃO MUDOU DE COMPORTAMENTO NESTA ENTREGA, e é regra que não mude: o atendimento (a Ana)
        fala por aqui, com o teto de 105s do lado do Lúmen, e nada do caminho assíncrono pode
        chegar até ela. Os códigos e as frases de recusa são os mesmos de antes — hoje eles vêm de
        `classificar_falha`, que é a MESMA tradução de antes, agora num lugar só (ver lá).
        """
        try:
            resposta, nova_sessao = executar_hermes(perfil, mensagem, sessao, ferramentas)
        except Exception as erro:  # noqa: BLE001 — a tradução inteira mora em classificar_falha
            codigo, corpo = classificar_falha(erro, perfil)
            self._responder(codigo, corpo)
            return

        if not resposta:
            self._responder(502, {"erro": "o Hermes respondeu vazio"})
            return

        self._responder(200, {"resposta": resposta, "sessao": nova_sessao})

    def _chat_assincrono(self, perfil, mensagem, sessao, ferramentas):
        """Começa o trabalho numa thread e devolve o identificador NA HORA.

        202, e não 200: o pedido foi aceito, o trabalho não terminou. Quem chama volta em
        `GET /resultado/<id>` para saber em que pé está.
        """
        try:
            identificador = abrir_tarefa()
        except TarefasDemais as erro:
            # RECUSA FALADA, e 503 (o servidor é que não pode agora), nunca 500. E NÃO é para o
            # Lúmen cair no caminho síncrono aqui: a ponte estar cheia é justamente o momento em
            # que segurar mais uma requisição de quatro minutos seria a pior escolha possível.
            log.warning("recusada: %s", erro)
            self._responder(503, {"erro": "a ponte já está com o máximo de gerações em andamento — tente de novo em alguns minutos"})
            return

        threading.Thread(
            target=_trabalhar,
            args=(identificador, perfil, mensagem, sessao, ferramentas),
            # `daemon`: se a ponte for reiniciada, a thread não segura o desligamento. A tarefa se
            # perde junto com a memória — estado previsto, com resposta própria em `/resultado`.
            daemon=True,
        ).start()

        log.info("tarefa aberta para %s", perfil)
        self._responder(202, {"tarefa": identificador})

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
