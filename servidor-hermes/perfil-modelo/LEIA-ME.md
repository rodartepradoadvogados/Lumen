# Perfil-modelo (`lumen-master`)

Este é o esqueleto de onde `servidor-hermes/provision_tenant.py` copia cada perfil de escritório
novo (o comando `provision`). Ele fica instalado, na VPS, em
`/root/.hermes/profiles/lumen-master/` — é dali, não deste repositório, que o script copia; o que
está aqui é a fonte que se leva para lá.

## O que tem aqui, e por quê

- **`profile.yaml`** — as quatro chaves que o dono confirmou existirem em todo perfil real da VPS
  (`description`, `description_auto`, `ui_meta`, `_ui_meta_revisions`). Nenhuma outra chave foi
  inventada: se o Hermes de verdade usa mais alguma, ela precisa ser copiada de um perfil que já
  funciona (ex.: `atendimento-lumen`) na hora de instalar — este repositório não tem como saber.
- **`env.modelo`** — o esqueleto do `.env` do perfil, vazio de propósito (ver o comentário dentro
  dele). **Chama-se `env.modelo` aqui, e `.env` na VPS**, e a diferença de nome é deliberada: um
  arquivo chamado `.env` RASTREADO pelo git deixa de ser protegido pela regra `.env` do
  `.gitignore` (a regra não vale para arquivo já versionado) — e este é exatamente o arquivo que
  alguém vai preencher com valor de verdade. O `provision_tenant.py` aceita os dois nomes e sempre
  escreve `.env` no perfil novo, então nada depende de lembrar de renomear. Os nomes exatos das
  variáveis que o Hermes lê por perfil não foram confirmados daqui: só se sabe QUE elas existem e
  QUE `hermes -p <perfil> config check` mostra o que falta (ver `servidor-hermes/LEIA-ME.md`,
  seção 3, "Subir o serviço"). Preencha copiando de um perfil que já funciona.

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

## O que este LEIA-ME não conseguiu confirmar

- O formato interno de `ui_meta` e de `_ui_meta_revisions` — se são sempre objeto/lista vazios num
  perfil novo, ou se carregam algo mais.
- Se `profile.yaml` tem alguma chave além das quatro citadas.
- Os nomes das variáveis de `.env`.

Nada disso impede o provisionamento: `provision_tenant.py` copia o perfil-modelo **por inteiro**,
qualquer que seja o conteúdo real destes arquivos na VPS. O que falta aqui é só a certeza de que o
esqueleto deste repositório é fiel a cada detalhe — confira contra um perfil real antes do primeiro
uso de verdade.
