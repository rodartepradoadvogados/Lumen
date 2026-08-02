# robo-publicacoes

Robo standalone, 100% gratuito, do escritorio **Rodarte Prado Advogados**
(Goiania/GO) para monitorar automaticamente, para as OABs cadastradas:

1. **Publicacoes/intimacoes oficiais** — via API publica **Comunica/DJEN**
   do CNJ.
2. **Andamentos processuais** — via **API Publica Datajud** do CNJ.
3. **Licitacoes/contratacoes publicas** — via API publica de consulta do
   **PNCP** (Portal Nacional de Contratacoes Publicas), para as UFs
   configuradas (ver [Licitacoes (PNCP)](#licitacoes-pncp) abaixo). Fonte 3,
   parte do Setor de Processos Administrativos (Fase 1) — o roteamento por
   escritorio acontece depois, em `lib/pncpBridge.ts` no site, casando contra
   os termos vigiados (`TermoVigilancia`) de cada escritorio.
4. **Diario Oficial da Uniao (DOU)** — via **INLABS** (servico de distribuicao
   de conteudo da Imprensa Nacional), para as secoes configuradas (ver
   [DOU (INLABS)](#dou-inlabs) abaixo). Fonte 4, Fase 2 do Setor de Processos
   Administrativos — DIFERENTE da Fase 1: aqui o casamento contra os termos
   vigiados (`TermoVigilancia`) ja acontece DENTRO deste robo (`src/inlabs.py`),
   nao depois no site, porque o DOU publica milhares de artigos por dia e so
   vale a pena persistir o que ja bateu com um termo de algum escritorio.

O robo roda em ciclos curtos e idempotentes (varias vezes por dia, via Cron
Job do Railway), evita duplicar qualquer dado ja capturado, persiste tudo em
Postgres e so envia e-mail quando ha novidade de fato.

Este projeto e **independente do app Next.js** que vive na raiz deste
repositorio. Ele fica na subpasta `robo-publicacoes/` apenas por
conveniencia de controle de versao — o deploy no Railway usa somente o
conteudo desta subpasta como raiz do servico.

---

## Sumario

- [Arquitetura](#arquitetura)
- [OABs monitoradas](#oabs-monitoradas)
- [Licitacoes (PNCP)](#licitacoes-pncp)
- [DOU (INLABS)](#dou-inlabs)
- [Como rodar localmente](#como-rodar-localmente)
- [Como rodar os testes](#como-rodar-os-testes)
- [Adicionar/remover uma OAB](#adicionarremover-uma-oab)
- [Adicionar um processo manualmente](#adicionar-um-processo-manualmente)
- [Exportar historico (CSV/JSON)](#exportar-historico-csvjson)
- [Deploy no Railway (passo a passo)](#deploy-no-railway-passo-a-passo)
- [Limitacoes e riscos](#limitacoes-e-riscos)
- [LGPD](#lgpd)

---

## Arquitetura

```
robo-publicacoes/
  src/
    config.py         # le e valida variaveis de ambiente
    logging_config.py # logging estruturado
    http_client.py     # sessao HTTP compartilhada, retry/backoff, trata 403
    db.py              # SQLAlchemy: engine, models, sessao
    djen.py             # captura publicacoes (API Comunica/DJEN)
    datajud.py          # captura andamentos (API Publica Datajud)
    discovery.py        # descobre processos novos a partir das publicacoes
    notify.py            # monta e envia e-mail de novidades
    gemini.py            # resumo opcional (Google Gemini) de textos longos
    pncp.py                # captura licitacoes (API publica de consulta do PNCP)
    inlabs.py               # captura + casa artigos do DOU (INLABS) contra TermoVigilancia
    pipeline.py               # orquestra um ciclo completo, idempotente
    main.py                    # entrypoint (um ciclo, ou --loop continuo)
  scripts/
    add_processo.py       # CLI: cadastra manualmente um processo
    export_historico.py   # CLI: exporta publicacoes/andamentos p/ CSV/JSON
  tests/                   # testes com payloads mockados (pytest)
```

### Fonte 1 — Publicacoes (DJEN)

`src/djen.py` consulta:

```
GET https://comunicaapi.pje.jus.br/api/v1/comunicacao
    ?numeroOab=...&ufOab=...
    &dataDisponibilizacaoInicio=YYYY-MM-DD
    &dataDisponibilizacaoFim=YYYY-MM-DD
    &pagina=1&itensPorPagina=40
```

para cada OAB monitorada, dentro de uma janela de dias (`JANELA_DIAS`), com
paginacao automatica. O parsing dos campos e **defensivo**: a API do DJEN
nao tem contrato formalmente estavel, entao o codigo tenta multiplas
variacoes de nome de campo (`numeroprocesso` / `numero_processo` /
`numeroProcesso`, `siglaTribunal` / `sigla_tribunal`, etc.) antes de
descartar um item por falta de dado essencial (id ou numero de processo).

Toda publicacao nova e persistida (dedup por `id_comunicacao`) e todo
numero de processo novo encontrado nela e automaticamente cadastrado em
`ProcessoMonitorado` (ver `src/discovery.py`), passando a ser tambem
consultado no Datajud.

### Fonte 2 — Andamentos (Datajud)

`src/datajud.py` consulta, para cada processo em `ProcessoMonitorado`:

```
POST https://api-publica.datajud.cnj.jus.br/api_publica_{alias}/_search
Header: Authorization: APIKey {DATAJUD_API_KEY}
Body:   {"query": {"match": {"numeroProcesso": "<20 digitos sem mascara>"}}}
```

O `{alias}` do indice Elasticsearch e derivado do proprio numero CNJ do
processo (mascara `NNNNNNN-DD.AAAA.J.TR.OOOO`), usando os digitos **J**
(segmento de justica) e **TR** (tribunal). Veja a tabela e as ressalvas na
secao [Limitacoes e riscos](#limitacoes-e-riscos).

### Pipeline (um ciclo)

`src/pipeline.py` executa, em ordem, para cada ciclo:

1. Para cada OAB: busca publicacoes novas no DJEN (janela de `JANELA_DIAS`
   dias) e persiste as que ainda nao existem (dedup por `id_comunicacao`).
2. Descobre processos novos a partir dessas publicacoes.
3. Para cada processo monitorado (descoberto ou cadastrado manualmente):
   consulta andamentos no Datajud e persiste os novos (dedup por
   `numero_processo` + `data_movimentacao` + `codigo_movimento`).
4. Se houver qualquer novidade (ou alerta de falha persistente), envia
   **um** e-mail resumindo tudo.
5. Registra o resultado (sucesso/falha) de cada fonte em `ExecucaoLog`. Se
   as duas ultimas execucoes de uma fonte falharam, um alerta e incluido no
   e-mail (ou o robo continua silencioso se nao houver novidade nem
   alerta).

Cada etapa e desenhada para ser **idempotente**: rodar o mesmo ciclo (ou a
mesma janela de datas) varias vezes nunca duplica publicacao, andamento,
processo monitorado ou notificacao.

---

## OABs monitoradas

Desde que o site (Lúmen) passou a ser multi-tenant, a lista de OABs a
monitorar **e descoberta automaticamente consultando a tabela `User`** do
banco de producao (mesma `DATABASE_URL` do site) — todo usuario ativo, de
todo escritorio ativo, com OAB cadastrada em Configuracoes -> Equipe &
Acesso. O robo nao precisa saber a qual escritorio cada OAB pertence: ele
so busca no DJEN/Datajud; a atribuicao de cada publicacao ao escritorio
certo acontece depois, na ponte (`lib/roboBridge.ts`, no site), que casa
por numero de processo dentro de cada escritorio.

`OABS_JSON` (variavel de ambiente, lista JSON de objetos
`{"nome", "numero", "uf"}`) vira **fallback**: só é usada se `DATABASE_URL`
não estiver configurada, ou se a consulta ao banco falhar ou não retornar
nenhuma OAB (ex.: rodando local sem banco). Se `OABS_JSON` também não for
definida, os defaults abaixo (do escritório original) são usados:

| Nome | OAB | UF |
|---|---|---|
| Jairo Alexandre Rodarte e Silva | 78295 | GO |
| Rodrigo Araujo do Prado | 32943 | GO |

---

## Como rodar localmente

Pre-requisitos: Python 3.11+ (funciona com 3.10+ tambem).

```bash
cd robo-publicacoes
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edite .env com suas variaveis (ou deixe DATABASE_URL vazio para usar
# SQLite local automaticamente em ./robo.db)

python -m src.main
```

Isso roda **um ciclo** completo e sai — comportamento pensado para um Cron
Job. Para rodar continuamente em loop (repetindo a cada `INTERVALO_HORAS`
horas, sem depender de cron externo):

```bash
python -m src.main --loop
```

Sem `SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_TO` configurados, o robo continua
funcionando normalmente (captura e persiste tudo), apenas não envia
e-mail — um aviso e logado.

---

## Como rodar os testes

```bash
cd robo-publicacoes
source venv/bin/activate
pip install -r requirements.txt
pytest -q
```

Os testes usam **exclusivamente payloads mockados** (nunca chamam as APIs
reais do CNJ) e um banco SQLite em memoria. Cobrem:

- `tests/test_dedup.py` — reprocessar o mesmo id de publicacao, o mesmo
  movimento de andamento ou o mesmo processo nao duplica nada.
- `tests/test_djen_parse.py` — parsing defensivo do DJEN com variacoes de
  nome de campo (camelCase, snake_case), formatos de resposta (lista
  direta vs. envelope `items`/`data`) e paginacao.
- `tests/test_datajud.py` — `alias_do_tribunal()` para varios numeros CNJ e
  parsing de movimentos mockados.
- `tests/test_pipeline_idempotente.py` — o ciclo completo rodado duas
  vezes com a mesma resposta mockada gera notificacao apenas na primeira
  vez.

---

## Adicionar/remover uma OAB

Com `DATABASE_URL` configurada (producao), basta cadastrar/editar a OAB do
usuario em Configuracoes -> Equipe & Acesso, no proprio site — o robo
descobre sozinho no proximo ciclo, sem precisar editar nada aqui.

Sem banco (uso local/teste), edite `OABS_JSON` (no `.env` local ou nas
variaveis do Railway) com a lista completa desejada, por exemplo:

```json
[
  {"nome": "Jairo Alexandre Rodarte e Silva", "numero": "78295", "uf": "GO"},
  {"nome": "Rodrigo Araujo do Prado", "numero": "32943", "uf": "GO"},
  {"nome": "Novo Advogado", "numero": "99999", "uf": "GO"}
]
```

Nao e necessario alterar codigo. Para remover uma OAB, basta tira-la da
lista (publicacoes ja capturadas permanecem no banco).

---

## Licitacoes (PNCP)

`src/pncp.py` consulta, para cada UF configurada e para CADA modalidade de
contratacao (codigos 1 a 14 — a API exige o codigo de modalidade como
parametro obrigatorio, entao o robo itera sobre todos):

```
GET https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
    ?dataInicial=AAAAMMDD&dataFinal=AAAAMMDD
    &codigoModalidadeContratacao=<1-14>
    &uf=<UF>&pagina=1&tamanhoPagina=500
```

**As UFs monitoradas vem de `PNCP_UFS`** (variavel de ambiente, lista
separada por virgula, ex.: `"GO,DF,SP"`). Sem essa variavel, o padrao e
`GO,DF` (base atual de clientes do escritorio original). Nao e necessario
alterar codigo para adicionar/remover uma UF — so a variavel de ambiente.

**IMPORTANTE — mapeamento de campos NAO confirmado contra a API real**: o
ambiente onde este robo foi construido nao tem acesso a rede nem ao Postgres
de producao, entao o parsing de `src/pncp.py` (nomes de chave do JSON de
resposta, inclusive se orgao/unidade vem aninhado em sub-objetos) e uma
tentativa defensiva e de melhor-esforco — nunca testada contra uma resposta
de verdade. Assim que o primeiro ciclo real rodar em producao, use
`GET /api/admin/testar-pncp` (rota admin-only do site) para conferir as
chaves reais do primeiro item devolvido pela API e corrigir
`_normalizar_item()` em `src/pncp.py` se necessario. O item bruto de cada
licitacao e sempre guardado em `payloadBruto` (tabela `licitacoes_pncp`),
entao um ajuste de mapeamento pode ser reaplicado sem precisar consultar o
PNCP de novo.

A coleta e **isolada** no pipeline (`src/pipeline.py:_capturar_licitacoes_pncp`):
qualquer falha (rede, parsing, bug) e registrada em `ExecucaoLog` (fonte
`"pncp"`) e logada, mas nunca interrompe a captura de DJEN/Datajud no mesmo
ciclo. Upsert idempotente por `numeroControlePNCP` (`src/db.py:upsert_licitacao`)
— nunca duplica, mesmo que a mesma licitacao apareca em ciclos seguidos.

---

## DOU (INLABS)

`src/inlabs.py` faz login no **INLABS** (servico de distribuicao de conteudo
da Imprensa Nacional) e baixa, para cada secao configurada, o ZIP diario do
Diario Oficial da Uniao:

```
POST https://inlabs.in.gov.br/logar.php          (login, mantem cookie de sessao)
GET  https://inlabs.in.gov.br/index.php?p=&dt=DD-MM-AAAA&section=<SECAO>
```

**As secoes monitoradas vem de `INLABS_SECOES`** (variavel de ambiente, lista
separada por virgula, ex.: `"DO1,DO2,DO3"`). Sem essa variavel, o padrao e
`DO1,DO3` (ver src/config.py). **`INLABS_USERNAME`/`INLABS_PASSWORD` sao
variaveis do RAILWAY (nunca da Vercel)** — o site Next.js nao chama o INLABS
diretamente, so le o que este robo ja gravou no Postgres (ver
`lib/douBridge.ts`). Sem essas credenciais, o coletor loga um aviso claro e
pula a coleta do DOU neste ciclo, sem derrubar o robo.

**DECISAO DE ARQUITETURA — diferente do PNCP**: no PNCP, o robo grava TODAS
as licitacoes e o casamento contra os termos vigiados (`TermoVigilancia`)
acontece depois, no site (`lib/pncpBridge.ts`). No DOU, esse casamento
acontece **DENTRO deste robo**, no momento da propria captura
(`src/inlabs.py:coletar_dou`, que consulta `TermoVigilancia` direto no banco
via `config.py:carregar_termos_vigilancia_do_banco`, mesmo padrao de
`carregar_oabs_do_banco`) — motivo: o DOU publica milhares de artigos por
dia, e gravar todos incharia o banco a toa, ja que so interessa o artigo que
bate com um termo de algum escritorio. Artigos sem nenhum termo batendo sao
descartados (nao persistidos) — comportamento esperado.

**IMPORTANTE — contrato do INLABS NAO confirmado contra o site real, e MENOS
confiavel que o do PNCP** (que ao menos tem Swagger publico): o ambiente
onde este robo foi construido nao tem acesso a rede nem ao Postgres de
producao, entao (a) o nome dos campos do formulario de login, (b) o formato
exato do download, e (c) as tags do XML de cada artigo sao tentativas
defensivas de melhor-esforco (ver aviso detalhado no topo de `src/inlabs.py`)
— NUNCA testadas contra o site real. Ao contrario do PNCP, **nao existe uma
rota de teste facil no site** para o DOU (o Vercel nao tem as credenciais do
INLABS para chamar o servico por conta propria) — por isso o LOG desta
captura precisa servir de diagnostico sozinho quando o primeiro ciclo real
rodar em producao (Railway). Use `GET /api/admin/status-fontes` (rota
admin-only do site) para conferir, sem acessar o Railway, se a fonte
`DOU_INLABS` rodou hoje e qual foi o ultimo status/detalhe registrado. O XML
de cada artigo que bateu com um termo e sempre guardado (truncado com
seguranca) em `payloadBruto` (tabela `RoboDouItem`), para permitir
reprocessar/corrigir o mapeamento depois sem precisar consultar o INLABS de
novo.

A coleta e **isolada** no pipeline (`src/pipeline.py:_capturar_dou_inlabs`):
qualquer falha (login, rede, parsing, bug) e registrada em `ExecucaoLog`
(fonte `"dou_inlabs"`) e logada, mas nunca interrompe a captura de
DJEN/Datajud/PNCP no mesmo ciclo. Upsert idempotente por `chaveUnica`
(`src/db.py:upsert_dou_item`) — nunca duplica, mesmo que o mesmo artigo
apareca de novo num ciclo seguinte.

---

## Adicionar um processo manualmente

Quando um processo precisa ser monitorado no Datajud sem ter vindo de uma
publicacao do DJEN (ex.: processo antigo, ou parte que ainda nao gerou
intimacao):

```bash
python scripts/add_processo.py 0000832-35.2018.4.01.3202
python scripts/add_processo.py 0000832-35.2018.4.01.3202 --oab 78295
```

O comando e idempotente: rodar de novo para o mesmo numero apenas informa
que ja estava cadastrado, sem erro nem duplicata.

---

## Exportar historico (CSV/JSON)

Para uso manual, por exemplo alimentando o NotebookLM ou qualquer outra
ferramenta externa de analise:

```bash
# JSON completo (publicacoes + andamentos) em um arquivo
python scripts/export_historico.py --formato json --saida historico.json

# CSV (dois arquivos separados)
python scripts/export_historico.py --formato csv \
    --saida publicacoes.csv --andamentos-saida andamentos.csv
```

---

## Deploy no Railway (passo a passo)

1. **Criar o projeto**: no Railway, "New Project" > "Deploy from GitHub
   repo", selecione este repositorio. Como o codigo do robo fica em uma
   subpasta, configure o **Root Directory** do servico como
   `robo-publicacoes` (em Settings > Source do servico).
2. **Adicionar o Postgres**: no mesmo projeto Railway, clique em "New" >
   "Database" > "Add PostgreSQL". O Railway cria automaticamente uma
   variavel `DATABASE_URL` — se o nome vier diferente (ex.:
   `DATABASE_PUBLIC_URL`), referencie-a explicitamente na variavel
   `DATABASE_URL` do servico do robo usando a sintaxe de referencia de
   variaveis do Railway (`${{Postgres.DATABASE_URL}}`).
3. **Configurar as variaveis de ambiente** do servico do robo (Settings >
   Variables), replicando o `.env.example`:
   - `DATABASE_URL` (referenciada do plugin Postgres, ver acima)
   - `OABS_JSON` (opcional — os defaults do escritorio ja funcionam)
   - `JANELA_DIAS` (ex.: `5`)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
   - `EMAIL_TO` (ex.: `rodartepradoadvogados@gmail.com`)
   - `DATAJUD_API_KEY` (veja
     [datajud-wiki.cnj.jus.br/api-publica/acesso](https://datajud-wiki.cnj.jus.br/api-publica/acesso))
   - `PNCP_UFS` (opcional — o default `GO,DF` ja funciona)
   - `INLABS_USERNAME`, `INLABS_PASSWORD` (credenciais da assinatura INLABS —
     **so existem aqui, no Railway**; sem elas o coletor do DOU pula a
     coleta, sem erro fatal) e `INLABS_SECOES` (opcional — o default
     `DO1,DO3` ja cobre a maior parte do que interessa)
   - `GEMINI_API_KEY` (opcional)
   - `LOG_LEVEL` (ex.: `INFO`)
4. **Configurar o servico como Cron Job**: em Settings > Cron Schedule,
   habilite o cron e defina a expressao. Sugestao (a cada 2h em horario
   comercial de Brasilia, dias uteis) — **atencao: a expressao do Railway e
   avaliada em UTC**, entao para cobrir 8h-18h em Brasilia (UTC-3) o campo
   de hora precisa estar 3h a frente:

   ```
   0 11-21/2 * * 1-5
   ```

   O **comando de start** do servico deve ser (ja definido em
   `railway.json`, mas confirme em Settings > Deploy > Custom Start
   Command se necessario):

   ```
   python -m src.main
   ```

   Cada disparo do cron roda **um ciclo** e o processo encerra — modelo
   ideal para Cron Job (nao precisa de `--loop`). Se preferir rodar como
   servico continuo (sem usar o Cron Job do Railway), troque o comando de
   start para `python -m src.main --loop` e desabilite o cron — nesse
   caso o processo fica de pe indefinidamente, o que pode consumir mais
   horas do plano gratuito/hobby.
5. **Verificar o plano**: o plano gratuito/Hobby do Railway tem limite de
   horas de execucao e de uso de recursos por mes. Como Cron Job, o robo
   so consome tempo de execucao durante os poucos segundos/minutos de cada
   ciclo (bem mais economico que rodar em `--loop` continuo). Ainda assim,
   confirme os limites atuais do seu plano no dashboard do Railway antes de
   habilitar uma frequencia muito alta.
6. **Primeiro deploy**: apos configurar tudo, faca o deploy manual (ou
   aguarde o push) e acompanhe os logs do servico para confirmar que o
   ciclo roda sem erros de configuracao (ex.: variavel faltando).

---

## Limitacoes e riscos

### (a) Segredo de justica e Domicilio Judicial Eletronico — fora de escopo

Este robo cobre apenas comunicacoes/andamentos **publicos**, acessiveis sem
autenticacao. Processos em **segredo de justica** e comunicacoes feitas
exclusivamente via **Domicilio Judicial Eletronico (DJE-e)** exigem
certificado digital e/ou login autenticado no sistema do tribunal — isso
esta **fora do escopo** deste robo gratuito e exigiria uma integracao
completamente diferente (com credenciais/certificado do advogado).

### (b) AVISO IMPORTANTE — possivel bloqueio de IP na API Comunica/DJEN (HTTP 403)

A API `comunicaapi.pje.jus.br` **ja foi observada retornando HTTP 403** a
partir de IPs de datacenter/nuvem (o que inclui provedores como Vercel,
Railway, AWS, GCP etc. — confirmado em testes a partir de dois provedores
diferentes em 2026-07-20/21) em testes anteriores. O robo trata esse
cenario de forma explicita (`src/http_client.py`): loga um aviso claro e
**nao derruba o processo** — a captura daquela fonte simplesmente falha
naquele ciclo e o sistema tenta novamente no proximo (com alerta
automatico no e-mail apos 2 falhas seguidas, ver `src/pipeline.py`).

**Correcao aplicada em 2026-07-21:** antes, uma falha de rede/403 na
consulta ao DJEN era silenciosamente registrada em `ExecucaoLog` como "0
publicacoes recebidas, sucesso" (porque `buscar_publicacoes` engolia o
erro e retornava lista vazia) — isso significava que o alerta de "2
falhas seguidas" **nunca disparava**, mesmo com o bloqueio de IP ativo
todos os dias. Agora `buscar_publicacoes` levanta `DjenRequestFailed`
quando a 1a pagina falha, e o pipeline registra isso como falha de
verdade — o alerta por e-mail passa a funcionar como documentado.

**Suporte a proxy ja existe no codigo** (`DJEN_PROXY_URL` em
`.env.example`/`src/config.py`, usado só nas chamadas ao DJEN via
`src/http_client.py`) — hoje vazio/desativado por padrao. Se/quando for
contratado um proxy residencial, basta configurar essa variavel na
Railway, sem mudanca de codigo.

Planos B (fora do escopo gratuito atual, decisao de custo separada):

1. Usar um **proxy residencial** para as chamadas ao DJEN (suporte no
   codigo ja pronto, so falta contratar o servico e configurar
   `DJEN_PROXY_URL` — ex.: Webshare, IPRoyal, ~R$25-50/mes);
2. Rodar a captura a partir de um **IP nao bloqueado** (ex.: uma maquina
   fora de nuvens publicas conhecidas, ou um provedor de hospedagem menos
   associado a scraping);
3. Avaliar a **API paga do Jusbrasil** (ou similar) como camada adicional
   de captura de publicacoes — decisao de custo/beneficio separada, fora
   deste escopo 100% gratuito.

### (c) Mapa de aliases do Datajud pode precisar de ajuste

`src/datajud.py::alias_do_tribunal()` deriva o alias do indice Elasticsearch
do Datajud (ex.: `tjgo`, `trf1`, `trt18`) a partir dos digitos J
(segmento de justica) e TR (tribunal) do numero CNJ do processo. O
mapeamento implementado e uma **heuristica razoavel**, cobrindo:

- **J=8 (Estadual)**: `tj` + UF, usando a ordem oficial de codigos TR
  (01=AC ... 26=SP ... 27=TO). Ex.: TR=09 -> `tjgo`.
- **J=4 (Federal)**: `trf` + numero do TRF (01 a 06). Ex.: TR=01 -> `trf1`.
- **J=5 (Trabalho)**: `trt` + numero do TRT; TR=90 -> `tst`.
- **J=6 (Eleitoral)**: `tre` + UF, mesma ordem de codigos do segmento
  estadual.
- **J=9 (Militar Estadual)**: mapeamento explicito apenas para MG, RS e SP
  (unicos estados com TJM).
- **J=3 -> `stj`**, **J=1 -> `stf`**, **J=2 -> `cnj`**.

Essa tabela **nao foi validada contra a lista oficial e completa de todos
os aliases publicados pelo Datajud** (que pode ter nomes ligeiramente
diferentes ou ser atualizada pelo CNJ). Se a consulta a um tribunal
especifico falhar persistentemente, verifique o alias esperado na
documentacao oficial do Datajud
([datajud-wiki.cnj.jus.br](https://datajud-wiki.cnj.jus.br/)) e ajuste o
mapeamento em `alias_do_tribunal()`.

### Sobre o teste deste robo

**Nada neste projeto foi testado contra as APIs reais do CNJ.** O ambiente
de desenvolvimento usado para construir este robo tem a rede bloqueada para
`comunicaapi.pje.jus.br` e `api-publica.datajud.cnj.jus.br` — por isso toda
a validacao foi feita com `pytest` e payloads **mockados**. E essencial
testar em producao (ou em um ambiente com acesso liberado) antes de confiar
cegamente nas primeiras execucoes: acompanhe os logs do Railway
atentamente no primeiro dia.

---

## LGPD

Os dados capturados (publicacoes e andamentos processuais) sao **dados
publicos**, disponibilizados pelos proprios tribunais e pelo CNJ atraves de
APIs publicas oficiais. Ainda assim:

- O **banco de dados** (Postgres) deve ter acesso restrito — use apenas
  credenciais do proprio escritorio, nunca exponha a `DATABASE_URL`
  publicamente.
- O **e-mail de notificacao** (`EMAIL_TO`) deve ser uma conta de acesso
  restrito ao escritorio (ex.: `rodartepradoadvogados@gmail.com`), pois o
  corpo do e-mail pode conter trechos de teor de publicacoes e descricoes
  de andamentos.
- Nao ha coleta de dados de terceiros alem do que os proprios tribunais ja
  publicam nos canais oficiais consultados.
