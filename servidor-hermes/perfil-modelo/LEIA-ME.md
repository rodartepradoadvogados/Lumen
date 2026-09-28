# Perfil-modelo (`lumen-master`)

Este é o esqueleto de onde `servidor-hermes/provision_tenant.py` copia cada perfil de escritório
novo (o comando `provision`). Ele fica instalado, na VPS, em
`/root/.hermes/profiles/lumen-master/` — é dali, não deste repositório, que o script copia; o que
está aqui é a fonte que se leva para lá.

## O que tem aqui, e por quê

- **`profile.yaml`** — **duas** chaves: `description` e `description_auto`. E agora isso é medido,
  não suposto: um `profile.yaml` de perfil em produção foi lido na VPS e tem 79 bytes, com essas
  duas e mais nada. Antes havia quatro aqui, com `ui_meta` e `_ui_meta_revisions` — elas vieram de
  um `grep` que varria vários perfis ao mesmo tempo, e tratá-las como parte de todo perfil foi
  conclusão errada. Pelo que se vê, a interface as escreve quando alguém mexe no perfil por lá.
- **`env.modelo`** — o esqueleto do `.env` do perfil, vazio de propósito (ver o comentário dentro
  dele). **Chama-se `env.modelo` aqui, e `.env` na VPS**, e a diferença de nome é deliberada: um
  arquivo chamado `.env` RASTREADO pelo git deixa de ser protegido pela regra `.env` do
  `.gitignore` (a regra não vale para arquivo já versionado) — e este é exatamente o arquivo que
  alguém vai preencher com valor de verdade. O `provision_tenant.py` aceita os dois nomes e sempre
  escreve `.env` no perfil novo, então nada depende de lembrar de renomear. Os nomes exatos das
  variáveis que o Hermes lê por perfil não foram confirmados daqui: só se sabe QUE elas existem e
  QUE `hermes -p <perfil> config check` mostra o que falta. Os **nomes** das cinco variáveis que um
  perfil de produção usa já estão no arquivo, comentados, lidos da VPS: `DATABASE_URL`, `REDIS_URL`,
  `HERMES_TOKEN`, `OPENROUTER_API_KEY` e `GROQ_API_KEY`. Os **valores** nunca passam por aqui.

## Os dois arquivos que você leva de um perfil que já funciona

Estes dois **não estão neste repositório** e o `provision_tenant.py` os copia do perfil-modelo
instalado na VPS. Sem eles, cada escritório novo nasce quebrado de um jeito silencioso:

- **`config.yaml`** — a configuração do perfil. É **obrigatório**: sem ele o `provision` recusa. No
  perfil de produção lido ele tem cerca de 2,3 KB e o `hermes config check` reporta a versão dele.
  Um perfil sem `config.yaml` nasce com a configuração em branco, e não avisa.
- **`SOUL.md`** — a persona do agente. Sem ela o escritório novo recebe um assistente genérico em
  vez da atendente do Lúmen. Não é obrigatório para o script, mas é o que você quer em todo perfil.

E uma pasta:

- **`skills/`** — no Hermes **as skills moram dentro do perfil** (no perfil de produção lido são 17
  pastas). Sem ela, o escritório novo nasce sem nenhuma das skills jurídicas da plataforma. O
  `provision_tenant.py` copia esta pasta inteira, e o contrato é simples: **o que está no
  perfil-modelo é o que todo escritório recebe** — então o modelo não guarda skill de um escritório
  só.

## O que NÃO tem aqui, e nunca vai ter

**`auth.json` NÃO ENTRA NESTE REPOSITÓRIO.** É a credencial do provedor de modelo, e um
repositório git — mesmo privado — não é lugar de segredo de produção. Sem ele, aqui dentro,
`provision_tenant.py` **recusa provisionar** (com uma mensagem que diz exatamente este passo).

Antes do primeiro `provision`, na VPS:

```bash
cp /root/.hermes/profiles/<algum-perfil-que-ja-funciona>/auth.json \
   /root/.hermes/profiles/lumen-master/auth.json
```

Confira com `hermes -p lumen-master config check` que o perfil-modelo está completo antes de
provisionar o primeiro escritório de verdade.

## O que se copia, e o que NÃO se copia

`provision_tenant.py` **não copia o perfil-modelo por inteiro** — copia uma lista branca
(`ARQUIVOS_DO_MODELO` e `PASTAS_DO_MODELO`, no próprio script). O motivo é isolamento entre
escritórios, e ele foi medido: um perfil em produção tem **209 MB**, com `state.db` de 3,6 MB de
conversa, `state.db-wal` de 2 MB, mais `sessions/`, `memories/`, `.hermes_history`, `logs/`,
`cache/`, `backups/` e `state-snapshots/`. Copiar a árvore levava tudo isso para dentro de cada
escritório novo — o perfil de um escritório carregando conversa que não é dele.

Há ainda um motivo mecânico: aquele perfil tem um **`gateway.sock`**, que é um socket. A cópia da
árvore inteira estoura ao encontrar um.

Então acrescentar arquivo à lista é decisão, nunca acidente. Se um dia o Hermes passar a precisar
de outro arquivo por perfil, o sintoma aparece no `hermes -p <novo-perfil> config check` na hora da
instalação — e o conserto é uma linha na lista do script.
