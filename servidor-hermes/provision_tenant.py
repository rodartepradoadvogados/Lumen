#!/usr/bin/env python3
"""O script que `servidor.py` executa para criar e remover perfis de escritório no Hermes.

POR QUE ISTO EXISTE
--------------------
`servidor.py` já sabe COMO chamar este script (ver `executar_provisionamento` e `_provisionamento`
lá): lista de argumentos, sem shell, e a última linha do stdout tem de ser JSON. O que faltava era
o script em si — sem ele, `GET /perfis`, `POST /provisionar` e `POST /desprovisionar` respondem
`501`, e um escritório novo nasce com a caixa de conversa muda (`/chat` responde `404`, e não há
nada que a tela do painel mestre possa fazer a respeito).

O CONTRATO, exatamente como `servidor.py` o impõe (não se inventa nada aqui):

  · instalado em `/root/.hermes/profiles/lumen-master/scripts/provision_tenant.py`
    (`SCRIPT_PROVISIONAMENTO`, configurável por `HERMES_PROVISION_SCRIPT`);
  · chamado como `python3 <este arquivo> <argumentos>`, com uma LISTA de argumentos — nunca uma
    linha de comando montada como texto;
  · três comandos: `list`, `provision --slug S --id OFFICEID --name NOME`,
    `deprovision --slug S`;
  · a ÚLTIMA LINHA do stdout tem de ser JSON, sempre — é literalmente o que a ponte faz:
    `json.loads(stdout.strip().split("\\n")[-1])`. Qualquer diagnóstico vai para o STDERR, nunca
    para o stdout: uma linha de aviso ali quebraria o `json.loads` da ponte;
  · saída diferente de zero → a ponte lê a ÚLTIMA LINHA do stderr como motivo. Se essa linha
    contiver "not found" / "nao encontrado" / "não encontrado", a ponte responde `404`; qualquer
    outra coisa vira `500` (ver `_provisionamento` em servidor.py — é o texto exato que se testa
    contra, em minúsculas).

O `--slug` QUE CHEGA AQUI é o NOME DO DIRETÓRIO DO PERFIL, não necessariamente o slug do
escritório: `lib/hermesPonte.ts:perfilDeCampanha` manda `lumen-campanha-<slug>`, e
`app/api/hermes/provision/route.ts` manda o slug cru do escritório. Este script recebe o que vier
e não adivinha — quem decide o nome do perfil é sempre quem chama.

IDEMPOTÊNCIA, DE PROPÓSITO. `lib/actions/provisionamentoCampanhas.ts` documenta que o disparo
imediato (webhook) e o cron de segurança podem tentar provisionar o MESMO perfil quase ao mesmo
tempo. Uma segunda chamada de `provision` para um perfil que já existe tem de devolver sucesso
dizendo que já existia — sem tocar em `auth.json` nem em nada do estado de sessão do perfil. Tocar
de novo transformaria uma corrida inofensiva num jeito de derrubar a credencial de um escritório
que já está funcionando.

CRIAÇÃO ATÔMICA, DE PROPÓSITO. Um perfil "morre" no meio de uma cópia por uma dezena de motivos
banais (disco cheio, processo morto, arquivo do modelo ilegível). Um perfil MEIO copiado é pior
que perfil nenhum: hoje, sem perfil, o Hermes responde "profile not found" e o Lúmen sabe traduzir
isso numa recusa falada (404). Um perfil pela metade faria o Hermes falhar de um jeito que ninguém
sabe ler — perdendo justamente o sinal que hoje existe. Por isso o perfil é montado inteiro num
diretório temporário, IRMÃO do diretório final (mesmo sistema de arquivos, dentro da própria pasta
de perfis, para o `os.rename` final ser atômico), e só então movido de uma vez para o nome
definitivo.

SEM `auth.json` NO MODELO, O PROVISIONAMENTO FALHA — E FALA O QUE FAZER. Um perfil sem credencial
de provedor nasce quebrado, e isso só se descobriria na primeira pergunta do advogado (um erro
opaco do Hermes, bem mais tarde). A mensagem de erro diz exatamente o passo que falta: copiar o
`auth.json` de um perfil que já funciona para dentro do perfil-modelo, NA VPS — essa credencial
nunca entra no repositório.

SEM SHELL, NUNCA. Nenhuma chamada a `os.system`, nenhum `subprocess` com `shell=True`, nenhum
caminho montado por concatenação de texto vindo de argumento. Toda operação aqui é sobre o sistema
de arquivos, com o nome do perfil primeiro validado contra um formato fixo e depois confinado a um
filho DIRETO da pasta de perfis — nunca um caminho que atravesse a pasta com `..`, e nunca um link
simbólico seguido às cegas.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

# ── AS DUAS VARIÁVEIS DE AMBIENTE DESTA ENTREGA, com padrão seguro ──────────────────────────────
#
# `HERMES_PROFILES_DIR` é o que torna o teste possível: sem ela, provar este script exigiria mexer
# em `/root/.hermes/profiles` de verdade. Com ela, um teste aponta para um diretório temporário e
# o script inteiro se comporta exatamente como na VPS.
PASTA_PERFIS = Path(os.environ.get("HERMES_PROFILES_DIR", "/root/.hermes/profiles"))
# O nome do perfil-modelo, de onde cada escritório novo é copiado.
PERFIL_MODELO = os.environ.get("HERMES_MASTER_PROFILE", "lumen-master")

# ── ESPELHOS DE servidor-hermes/servidor.py — MESMA REGRA, DOIS LUGARES ────────────────────────
#
# O script pode ser chamado direto (sem passar pela ponte), então ele revalida tudo por conta
# própria — a ponte já validar não é motivo para confiar cegamente aqui. As expressões são as
# MESMAS de servidor.py (SLUG_VALIDO, ID_VALIDO, NOME_MAXIMO): copiadas à mão, e é exatamente essa
# cópia que lib/testes/hermesProvisionamento.teste.ts confere, lendo os dois arquivos e comparando
# os valores — foi divergência entre os dois lados que este repositório já pegou antes (ver o
# histórico de PERGUNTA_MAXIMA/CORPO_MAXIMO em lib/peticionamentoJanelaDeContexto.ts).
SLUG_VALIDO = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
ID_VALIDO = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
NOME_MAXIMO = 200


class FalhaDeProvisionamento(Exception):
    """Uma falha que precisa terminar o processo com código != 0 e a frase certa no stderr."""


def falhar(mensagem: str) -> None:
    """Escreve a mensagem no STDERR (nunca no stdout — veja o contrato no topo do arquivo) e sai
    com código diferente de zero. A ÚLTIMA LINHA é o que a ponte lê como motivo."""
    print(mensagem, file=sys.stderr)
    raise SystemExit(1)


def validar_slug(slug: str | None) -> str:
    if not slug or not SLUG_VALIDO.match(slug):
        falhar(f"slug invalido: {slug!r} (formato esperado: {SLUG_VALIDO.pattern})")
    return slug  # type: ignore[return-value]


def validar_id(identificador: str | None) -> str:
    if not identificador or not ID_VALIDO.match(identificador):
        falhar(f"id invalido: {identificador!r} (formato esperado: {ID_VALIDO.pattern})")
    return identificador  # type: ignore[return-value]


def validar_nome(nome: str | None) -> str:
    nome = (nome or "").strip()
    if not nome or len(nome) > NOME_MAXIMO:
        falhar(f"nome ausente ou longo demais (maximo {NOME_MAXIMO} caracteres)")
    return nome


def caminho_do_perfil(slug: str) -> Path:
    """O caminho de um perfil, confinado a um FILHO DIRETO da pasta de perfis.

    `SLUG_VALIDO` já barra `/` e `..` (não aceita ponto nenhum), então em teoria isto nunca
    dispara. Ele fica de propósito como a SEGUNDA trava — a que ainda vale se um dia alguém
    afrouxar a primeira sem perceber o que ela protegia. Nada de caminho relativo escapando da
    pasta, e nada de seguir link simbólico às cegas: quem chama esta função confere
    `is_symlink()` por conta própria antes de tratar o resultado como perfil de verdade.
    """
    raiz = PASTA_PERFIS.resolve()
    candidato = raiz / slug
    if candidato.parent != raiz:
        falhar(f"caminho de perfil fora da pasta de perfis: {slug!r}")
    return candidato


# ── `list` ───────────────────────────────────────────────────────────────────────────────────
#
# FORMATO DA RESPOSTA (documentado aqui porque quem consome — `app/api/hermes/provision/route.ts`
# — repassa o JSON opaco para a tela, sem reinterpretar):
#
#   {"perfis": [
#     {"slug": "<nome-do-diretorio>", "temAuth": true|false,
#      "officeId": "...", "nome": "...", "provisionadoEm": "AAAA-MM-DDTHH:MM:SSZ"}  # só quando
#                                                                                    # existe o
#                                                                                    # metadado
#      (o perfil-modelo e qualquer perfil provisionado antes desta entrega não têm `officeId`,
#      `nome` nem `provisionadoEm` — só `slug` e `temAuth`)
#   ]}
def cmd_list(_args: argparse.Namespace) -> None:
    if not PASTA_PERFIS.is_dir():
        print(json.dumps({"perfis": []}))
        return

    perfis = []
    for entrada in sorted(PASTA_PERFIS.iterdir()):
        # Diretórios ocultos são artefato de provisionamento (o `.slug.tmp-XXXX` que a criação
        # atômica usa e sempre apaga) ou administração da máquina — nunca um perfil de verdade.
        if entrada.name.startswith(".") or not entrada.is_dir():
            continue
        item: dict = {"slug": entrada.name, "temAuth": (entrada / "auth.json").is_file()}
        metadados = entrada / "provisionamento.json"
        if metadados.is_file():
            try:
                dados = json.loads(metadados.read_text(encoding="utf-8"))
                for chave in ("officeId", "nome", "provisionadoEm"):
                    if chave in dados:
                        item[chave] = dados[chave]
            except (ValueError, OSError):
                # Metadado ilegível não derruba a listagem inteira — o perfil continua existindo e
                # continua útil; só a informação extra que falta.
                pass
        perfis.append(item)

    print(json.dumps({"perfis": perfis}, ensure_ascii=False))


# ── `provision` ──────────────────────────────────────────────────────────────────────────────
def cmd_provision(args: argparse.Namespace) -> None:
    slug = validar_slug(args.slug)
    identificador = validar_id(args.id)
    nome = validar_nome(args.name)

    destino = caminho_do_perfil(slug)

    # IDEMPOTÊNCIA: perfil que já existe devolve sucesso sem tocar em NADA dele — nem no
    # `auth.json`, nem no estado de sessão. Ver o comentário do topo do arquivo: o disparo imediato
    # e o cron de segurança podem pegar o mesmo perfil quase ao mesmo tempo.
    if destino.is_symlink():
        falhar(f"recuso: {slug!r} já existe como link simbólico, e não sigo link cegamente")
    if destino.is_dir():
        print(json.dumps({"slug": slug, "officeId": identificador, "criado": False, "jaExistia": True}, ensure_ascii=False))
        return
    if destino.exists():
        falhar(f"recuso: {slug!r} já existe e não é um diretório")

    modelo = PASTA_PERFIS / PERFIL_MODELO
    if not modelo.is_dir():
        falhar(
            f"perfil-modelo nao encontrado ({modelo}) — instale o perfil-modelo em "
            f"{PASTA_PERFIS}/{PERFIL_MODELO} antes de provisionar (ver servidor-hermes/perfil-modelo/LEIA-ME.md)"
        )

    # SEM auth.json NO MODELO, O PROVISIONAMENTO FALHA — E DIZ O QUE FAZER. Um perfil nascido sem
    # credencial de provedor só se descobriria quebrado na primeira pergunta do advogado.
    if not (modelo / "auth.json").is_file():
        falhar(
            f"o perfil-modelo ({modelo}) nao tem auth.json — copie o auth.json de um perfil que ja "
            "funciona para dentro do perfil-modelo, NA VPS, antes de provisionar; essa credencial "
            "nunca entra no repositorio (ver servidor-hermes/perfil-modelo/LEIA-ME.md)"
        )

    # CRIAÇÃO ATÔMICA: monta o perfil inteiro num diretório temporário IRMÃO do destino final
    # (dentro da própria PASTA_PERFIS, para o `os.rename` de baixo ser uma troca atômica no mesmo
    # sistema de arquivos) e só então move. Se a cópia falhar no meio, o que sobra é o diretório
    # temporário — nunca um `destino` pela metade.
    PASTA_PERFIS.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=f".{slug}.tmp-", dir=PASTA_PERFIS))
    try:
        provisorio = tmp / slug
        shutil.copytree(modelo, provisorio, symlinks=False)
        metadados = {
            "officeId": identificador,
            "nome": nome,
            "provisionadoEm": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        (provisorio / "provisionamento.json").write_text(
            json.dumps(metadados, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        # A TRAVESSIA ATÔMICA. Até esta linha, nada com o nome `slug` existe em PASTA_PERFIS — o
        # que existia era só o diretório temporário. `os.rename` entre dois caminhos do MESMO
        # sistema de arquivos é atômico: o perfil aparece pronto, de uma vez, ou não aparece.
        os.rename(str(provisorio), str(destino))
    except Exception as erro:  # noqa: BLE001 — qualquer falha aqui vira recusa falada, não traceback cru
        falhar(f"falha ao criar perfil {slug!r}: {erro}")
    finally:
        # Limpa o temporário nos dois casos (sucesso e falha): depois do `os.rename` bem-sucedido
        # `tmp` já está vazio (só sobrou a casca), e numa falha ele pode conter uma cópia parcial —
        # que não pode ficar no disco com nome nenhum, nem o temporário, para trás.
        shutil.rmtree(tmp, ignore_errors=True)

    print(json.dumps({"slug": slug, "officeId": identificador, "criado": True, "jaExistia": False}, ensure_ascii=False))


# ── `deprovision` ────────────────────────────────────────────────────────────────────────────
def cmd_deprovision(args: argparse.Namespace) -> None:
    slug = validar_slug(args.slug)

    # RECUSA remover o próprio perfil-modelo: é de onde todo escritório novo nasce, e apagá-lo
    # quebraria o provisionamento de QUALQUER escritório futuro, não só o deste pedido.
    if slug == PERFIL_MODELO:
        falhar(f"recuso remover o perfil-modelo ({PERFIL_MODELO})")

    destino = caminho_do_perfil(slug)

    # Link simbólico não é seguido cegamente: apagar por aqui poderia remover o CONTEÚDO de um
    # alvo fora da pasta de perfis, dependendo de para onde o link aponta.
    if destino.is_symlink():
        falhar(f"recuso remover {slug!r}: é um link simbólico, não um perfil")

    # PERFIL INEXISTENTE — A FRASE IMPORTA. A ponte lê a ÚLTIMA LINHA do stderr e responde 404
    # quando ela contém "não encontrado" (ver `_provisionamento` em servidor.py); qualquer outra
    # frase vira 500. "perfil não encontrado" é literalmente a mesma frase que a ponte já devolve
    # em `PerfilAusente` — reaproveitada de propósito.
    if not destino.is_dir():
        falhar(f"perfil não encontrado: {slug}")

    shutil.rmtree(destino)
    print(json.dumps({"slug": slug, "removido": True}, ensure_ascii=False))


def montar_analisador() -> argparse.ArgumentParser:
    analisador = argparse.ArgumentParser(prog="provision_tenant.py")
    sub = analisador.add_subparsers(dest="comando", required=True)

    sub.add_parser("list").set_defaults(funcao=cmd_list)

    p_provision = sub.add_parser("provision")
    p_provision.add_argument("--slug", required=True)
    p_provision.add_argument("--id", required=True)
    p_provision.add_argument("--name", required=True)
    p_provision.set_defaults(funcao=cmd_provision)

    p_deprovision = sub.add_parser("deprovision")
    p_deprovision.add_argument("--slug", required=True)
    p_deprovision.set_defaults(funcao=cmd_deprovision)

    return analisador


def main() -> None:
    analisador = montar_analisador()
    # `argparse` já escreve erro de uso (argumento faltando, comando desconhecido) no STDERR e sai
    # com código 2 — mesma disciplina do resto deste arquivo, sem precisar reimplementar nada.
    args = analisador.parse_args()
    try:
        args.funcao(args)
    except FalhaDeProvisionamento as erro:  # pragma: no cover — hoje nada levanta isto; fica pela clareza do contrato
        falhar(str(erro))


if __name__ == "__main__":
    main()
