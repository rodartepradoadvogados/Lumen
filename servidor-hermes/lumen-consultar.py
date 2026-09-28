#!/usr/bin/env python3
"""Consulta os dados do escritório no Lúmen. É a ferramenta que o Lúmen Agent usa.

APOSENTADO EM 23/09/2026 — NÃO USE, E NÃO CONSERTE SEM LER ISTO PRIMEIRO
-----------------------------------------------------------------------
Este programa nunca chegou a rodar de verdade: ele dependia de uma INSTRUÇÃO DE PROMPT no perfil do
Hermes mandando chamá-lo como comando de terminal, e essa instrução nunca entrou no perfil. Efeito
medido: as ferramentas do Lúmen não chegaram ao agente por caminho nenhum durante semanas.

O caminho que substituiu este é MCP, que o Hermes fala nativamente: app/api/agente/mcp/route.ts,
declarado no `mcp_servers` do `config.yaml` do perfil. E, desde a mesma data, `LUMEN_FERRAMENTAS_URL`
NÃO APONTA MAIS PARA A ROTA REST que este programa sabe consumir — ela agora carrega o endereço do
servidor MCP (ver lib/agenteFerramentasEndereco.ts no Lúmen). Ou seja: rodar este programa hoje é
mandar uma requisição REST para um endereço que fala JSON-RPC, e a resposta não vai fazer sentido.
O texto abaixo descreve o desenho ANTIGO e está aqui como registro, não como instrução.

PARA QUE SERVE
--------------
O agente vive nesta máquina e NÃO tem o banco de dados do Lúmen — nem deve ter. Quando precisa de
um número (quantos processos, o que há na agenda, qual o saldo a receber), ele roda este programa,
que pergunta ao Lúmen e devolve a resposta.

COMO ELE SABE A QUEM RESPONDER
------------------------------
Duas variáveis de ambiente, postas pela ponte a cada pergunta:

    LUMEN_FERRAMENTAS_URL          onde perguntar
    LUMEN_FERRAMENTAS_CREDENCIAL   a credencial DAQUELA pergunta

A credencial não é do escritório: é da pergunta. Ela carrega quem perguntou e o que essa pessoa
pode ver. Quem decide o que responder é o Lúmen, do outro lado — este programa não tem opinião
sobre permissão, e é justamente isso que torna a regra confiável.

Em particular: **o financeiro só responde a quem tem acesso ao financeiro.** Se a pessoa não tem,
a resposta é uma recusa, não importa como a pergunta foi formulada. Não adianta insistir, nem
pedir "de outro jeito": a porta não está aqui.

COMO USAR
---------
    lumen-consultar                          lista o que dá para perguntar
    lumen-consultar <ferramenta>             executa sem parâmetros
    lumen-consultar <ferramenta> '<json>'    executa com parâmetros

Exemplos:

    lumen-consultar consultar_processos
    lumen-consultar consultar_agenda '{"dias": 7}'
    lumen-consultar buscar_cliente '{"nome": "Silva"}'

A saída é texto pronto para ser lido. Em caso de erro, sai pelo canal de erro e o código de saída
é diferente de zero.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

ESPERA_S = 25


def erro(mensagem: str, codigo: int = 1):
    print(mensagem, file=sys.stderr)
    raise SystemExit(codigo)


def pedir(metodo: str, corpo: dict | None):
    url = os.environ.get("LUMEN_FERRAMENTAS_URL", "").strip()
    credencial = os.environ.get("LUMEN_FERRAMENTAS_CREDENCIAL", "").strip()
    if not url or not credencial:
        erro(
            "As ferramentas do Lúmen não estão disponíveis nesta execução.\n"
            "Isto acontece quando a pergunta não veio pelo Lúmen. Responda com o que você já sabe, "
            "e diga que não conseguiu consultar os dados do escritório."
        )

    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    req = urllib.request.Request(
        url,
        data=dados,
        method=metodo,
        headers={
            "authorization": f"Bearer {credencial}",
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=ESPERA_S) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        bruto = ""
        try:
            bruto = e.read().decode("utf-8", "replace")
            detalhe = json.loads(bruto)
        except Exception:  # noqa: BLE001
            detalhe = {}

        # A Vercel também responde 401, e por outro motivo: quando o endereço aponta para um
        # deploy protegido por login, ela barra ANTES de o Lúmen ver o pedido. Confundir os dois
        # manda quem procura o defeito para o lado errado — foi o que aconteceu na primeira vez
        # que este programa rodou de verdade.
        if isinstance(detalhe, dict) and "protection" in detalhe:
            erro(
                "O endereço configurado aponta para um deploy PROTEGIDO da Vercel, e o pedido nem "
                "chegou ao Lúmen.\nQuem cuida do sistema precisa apontar APP_URL para o endereço "
                "público.\nNão é problema de credencial nem de permissão.",
                6,
            )
        if not detalhe and "vercel" in bruto.lower():
            erro("O endereço configurado não é a API do Lúmen: veio uma página, não uma resposta.", 6)

        mensagem = detalhe.get("erro") or f"o Lúmen respondeu {e.code}"
        if e.code == 403:
            # Vale explicar, porque é a recusa que o agente mais vai encontrar — e ele precisa
            # entender que não é falha técnica nem coisa a contornar.
            erro(f"{mensagem}\nEsta é uma regra do escritório, não um erro. Não há outro caminho.", 3)
        if e.code == 401:
            erro(f"{mensagem}\nA credencial desta pergunta expirou. Peça para refazerem a pergunta.", 4)
        disponiveis = detalhe.get("disponiveis")
        if disponiveis:
            mensagem += "\nDisponíveis: " + ", ".join(disponiveis)
        erro(mensagem, 2)
    except Exception as e:  # noqa: BLE001
        erro(f"não foi possível falar com o Lúmen: {e}", 5)


def main():
    argumentos = sys.argv[1:]

    if not argumentos or argumentos[0] in ("-h", "--help"):
        catalogo = pedir("GET", None)
        print("Ferramentas disponíveis nesta pergunta:\n")
        if catalogo.get("comoMostrar"):
            print("  " + catalogo["comoMostrar"] + "\n")
        for f in catalogo.get("ferramentas", []):
            print(f"  {f['nome']}  ({f['modulo']})")
            if f.get("descricao"):
                print(f"      {f['descricao']}")
        print("\nUse: lumen-consultar <ferramenta> '<json de parâmetros>'")
        return

    nome = argumentos[0]
    entrada = {}
    if len(argumentos) > 1:
        try:
            entrada = json.loads(argumentos[1])
        except ValueError:
            erro("o segundo argumento precisa ser um JSON válido (ex.: '{\"dias\": 7}')")
        if not isinstance(entrada, dict):
            erro("o JSON de parâmetros precisa ser um objeto")

    resposta = pedir("POST", {"ferramenta": nome, "entrada": entrada})
    print(resposta.get("resultado", ""))

    # A instrução de como MOSTRAR o resultado vem junto do resultado, de propósito: instrução que
    # mora só no prompt do perfil se perde quando o perfil é recriado, e aí o agente volta a
    # devolver número de processo solto em vez de link clicável.
    instrucao = resposta.get("instrucao")
    if instrucao:
        print("\n[como mostrar] " + instrucao)


if __name__ == "__main__":
    main()
