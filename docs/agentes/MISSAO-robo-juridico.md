# MISSÃO: Robô de Conteúdo Jurídico, Firecrawl + agendamento no Lúmen

> **Destinatário:** o **Robô de conteúdo jurídico** (sessão do Claude Code, repositório
> `rodartepradoadvogados/Lumen`).
> **Quem enviou:** o dono do projeto (rodartepradoadvogados@gmail.com). Ele acompanha **só por
> você**: você executa e **guia o dono** nos passos que só ele pode fazer.
>
> Versão de 26/09/2026. Substitui qualquer versão anterior desta missão.

---

## 1. O que você vai entregar

| # | Entrega | Especificação (no repositório) |
|---|---|---|
| A | **Lúmen:** agendamento de publicação, aviso por e-mail, checagem de fontes no servidor e correção das lacunas da `/api/blog/draft` | `docs/agentes/robo-news-juridico-firecrawl.md`, Parte A |
| B | **A sua própria skill** (`rp-radar-juridico`) passa a pesquisar e validar pelo **Firecrawl** | mesma especificação, Parte B |
| C1 | **Lúmen, lado do peticionamento:** ferramentas MCP de pesquisa/leitura via Firecrawl para o Hermes, número CNJ com dígito verificador, dupla validação obrigatória com os dois links, skill do Hermes atualizada no repositório | `docs/agentes/peticionamento-firecrawl-validacao.md` |
| D | **Etapa final: redação das matérias pelo Hermes** (perfil `materias-lumen`, OpenRouter), com varredura e validação feitas pelo próprio Lúmen via Firecrawl | `robo-news-juridico-firecrawl.md`, Parte C |

**Leia as duas especificações inteiras antes de começar.** Este documento define a **ordem** e os
**pontos de parada** com o dono.

## 2. Decisões do dono
1. **Sem `ANTHROPIC_API_KEY`.** Nada no Lúmen chama API de IA paga. **Você** continua sendo quem
   pesquisa e redige as matérias, agora com o Firecrawl.
2. **A sua Routine diária continua.** Não a desligue nem esvazie a sua skill. Só **melhore** a
   skill (entrega B).
3. **Etapa final:** a redação passa ao **Hermes** (Parte C da especificação, Etapa 6 abaixo).
   Implemente **por último**, só depois de A, B e C1 (peticionamento) funcionando.
4. **Segredos:** nunca escreva valor de chave, senha ou token em código, commit, PR, log ou chat.
   Nunca peça ao dono para colar um segredo no chat. Oriente-o a colocá-lo no painel certo.
5. **Regras do repositório:** siga o `CLAUDE.md` do Lúmen (sincronizar com `origin/main`, gate
   `tsc` + `eslint` + `next build`, PR em português, fail-closed). Build vermelho **só** por falta
   de acesso ao banco → diga no PR e **pergunte** antes de mergear.

## 3. Como falar com o dono
Em cada **🛑**: diga o que fez, o que precisa dele (passos numerados, dizendo onde clicar) e uma
pergunta objetiva. Depois **espere**. Não faça o dono ler código: dê o link do PR e diga o que
testar na tela.

---

## Etapa 0: ambiente 🛑
Verifique, **sem imprimir valores** (`test -n "$VAR"`):
1. Acesso de **push** e PR em `rodartepradoadvogados/Lumen`.
2. `FIRECRAWL_API_KEY` definida. Teste o saldo:
   `curl -sS https://api.firecrawl.dev/v2/team/credit-usage -H "Authorization: Bearer $FIRECRAWL_API_KEY"`.
3. `BLOG_ROBOT_SECRET` definida no ambiente. **Atenção, confirmado em 26/09/2026: o prompt atual
   da Routine "Robô de conteúdo jurídico — Lúmen" traz o valor desse segredo em texto puro** (linha
   `export BLOG_ROBOT_SECRET=...`). Guie o dono, **nesta ordem**, para a Routine não quebrar:
   > 1. Coloque `BLOG_ROBOT_SECRET` (o mesmo valor da Vercel) nas Environment variables do ambiente
   >    da Routine.
   > 2. claude.ai/code → Routines → "Robô de conteúdo jurídico — Lúmen" → editar o prompt → apague
   >    a linha do `export BLOG_ROBOT_SECRET=...` e escreva no lugar: "use a variável de ambiente
   >    BLOG_ROBOT_SECRET". Salve.
   > 3. Recomendado, quando o dono quiser: gerar um valor novo (o antigo ficou exposto no prompt),
   >    trocar na Vercel **e** no ambiente ao mesmo tempo, e fazer Redeploy na Vercel.

   Você não edita a Routine: quem clica é o dono.

Se faltar algo, guie:
> 1. claude.ai → Claude Code → **Routines** → "Robô de conteúdo jurídico" → veja o **Environment**.
> 2. Abra uma sessão nesse ambiente → barra de título → nome do ambiente → **Edit** →
>    **Environment variables**.
> 3. Adicione a linha `NOME=valor` que faltar → **Save**.
> 4. Me avise. Uma sessão **nova** enxerga a mudança.

**🛑 Mensagem ao dono:** "Ambiente ok (saldo do Firecrawl: N créditos) / falta X."

## Etapa 1: variáveis da Vercel 🛑
Guie o dono:
> Vercel → projeto **lumen** → Settings → Environment Variables. Confirme que existem, em
> Production: `CRON_SECRET`, `BLOG_ROBOT_SECRET`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`,
> `EMAIL_PASSWORD` e `FIRECRAWL_API_KEY` (esta também em **Preview**). Responda "ok" ou diga o
> que falta.

`ANTHROPIC_API_KEY` **não** é necessária. Sem `EMAIL_*`, o aviso por e-mail não sai, mas o resto
funciona.

## Etapa 2: entrega A (Lúmen) 🛑
1. Implemente a **Parte A** da especificação, com testes. Abra **o PR A**.
2. **🛑 Guie o dono no preview** (link no PR):
   > a) Configurações → Blog → Revisão Pendente: aparece o botão **"Agendar…"**?
   > b) Agende um rascunho para daqui a 20 minutos: ele vai para a aba **"Agendadas"**?
   > c) Depois de ~35 minutos, ele aparece em `/blog` do preview?
   > d) Chegou o e-mail "Blog: nova matéria aguardando revisão"? (Só se houver rascunho novo no
   >    preview; se não houver, este item é testado na Etapa 4.)
   > Responda "teste ok" ou conte o que viu.
3. Gate verde + "teste ok" → mergeie (o CLAUDE.md autoriza). Se o build estiver vermelho só por
   causa do banco, pergunte antes.

## Etapa 3: entrega B (sua skill com Firecrawl) 🛑
1. **Depois** do PR A em produção (a API passa a recusar fontes insuficientes), atualize
   `.claude/skills/rp-radar-juridico/SKILL.md` conforme a **Parte B**.
   - Na primeira execução, teste as páginas de listagem e fixe na skill as que funcionam.
2. Abra **o PR B** e **🛑 peça ao dono para mergear** (a skill muda o comportamento da Routine
   diária):
   > "Este PR muda como eu pesquiso: passo a ler as fontes pelo Firecrawl. Confira e mergeie. A
   > partir da próxima execução diária, uso o novo modo."

## Etapa 4: primeira execução no modo novo 🛑
Na próxima execução diária, depois do merge do PR B, envie ao dono um relatório:
- fontes lidas;
- candidatos encontrados;
- matérias enviadas e descartadas, com o motivo;
- créditos gastos.

E guie:
> "Abra Configurações → Blog → Revisão Pendente: as matérias com selo **Robô** chegaram? O
> e-mail chegou? Em cada uma: **Publicar agora**, **Agendar…** ou **Rejeitar**."

## Etapa 5: entrega C (peticionamento, lado Lúmen) 🛑
1. Implemente `docs/agentes/peticionamento-firecrawl-validacao.md`. Abra **o PR C**.
2. Depois do merge e do deploy, **🛑 guie o dono**:
   > 1. Publique no servidor do Hermes a skill atualizada `servidor-hermes/skills/pesquisa-jurisprudencia/`,
   >    seguindo o `servidor-hermes/LEIA-ME.md`. [Cite aqui os comandos exatos que o LEIA-ME traz.]
   > 2. Envie ao Hermes o documento `docs/agentes/MISSAO-hermes-peticionamento.md`. Ele vai te
   >    guiar no teste.

## Etapa 6: redação pelo Hermes (etapa final) 🛑
Só comece com as Etapas 2 a 5 concluídas e funcionando.
1. **🛑 Guie o dono no servidor do Hermes**, conforme a Parte C2 da especificação:
   - criar o perfil `materias-lumen` e colocar a chave do **OpenRouter** no `.env` desse perfil;
   - rodar `hermes -p materias-lumen config check`.

   Cite os comandos exatos do `servidor-hermes/LEIA-ME.md`.
2. Implemente as Partes C2 (skill `redacao-materias-blog` no repositório) e C3 (Lúmen). Abra o
   **PR D**.
3. Depois do merge, **🛑 guie o dono**:
   > 1. Instale a skill `redacao-materias-blog` no perfil `materias-lumen`, conforme o LEIA-ME.
   > 2. Envie ao Hermes a **Parte 2** de `docs/agentes/MISSAO-hermes-peticionamento.md` (redação
   >    de matérias), se ainda não enviou o documento inteiro.
   > 3. Vercel → lumen → Environment Variables → `RADAR_JURIDICO_ATIVO` = `1` → Save →
   >    Deployments → ⋯ → Redeploy.
   > 4. Amanhã, depois das 06:00 (Brasília): em Revisão Pendente aparecem matérias com selo Robô
   >    vindas do Hermes? Chegou o e-mail?
4. Acompanhe 3 dias úteis, com a Routine e o Hermes rodando juntos. Depois, **🛑 pergunte**:
   > "O Hermes gerou X rascunhos (Y aprovados, Z rejeitados). Posso considerar a Routine
   > dispensável? Se sim: claude.ai/code → Routines → 'Robô de conteúdo jurídico — Lúmen' →
   > desative (ou apague). Eu marco a skill antiga como descontinuada."

## Encerramento
Com os PRs A, B, C e D em produção e a decisão da Etapa 6 tomada, mande ao dono um resumo final:
- os PRs;
- o que ficou ligado;
- os créditos médios por dia;
- onde está cada configuração.
