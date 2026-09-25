# MISSÃO: Robô de Conteúdo Jurídico implementa o Firecrawl no Lúmen

> **Destinatário:** o **Robô de conteúdo jurídico** (sessão do Claude Code, repositório
> `rodartepradoadvogados/Lumen`).
> **Quem enviou:** o dono do projeto (rodartepradoadvogados@gmail.com). Ele vai acompanhar só por
> você: **não existe outra sessão cuidando disso**. Você executa o trabalho e **guia o dono** em
> cada passo que só ele pode fazer (painéis, variáveis, testes na tela, decisões).
>
> Documento escrito em 25/09/2026.

---

## 1. O que você vai entregar

| # | Entrega | Especificação técnica (já está no repositório) |
|---|---|---|
| A | **Robô News nativo no Lúmen:** cron diário com Firecrawl, dupla validação por código, rascunho em "Revisão Pendente", **agendamento de publicação** e aviso por e-mail | `docs/agentes/robo-news-juridico-firecrawl.md` |
| B | **Suporte do Lúmen à pesquisa de jurisprudência do peticionamento:** ferramentas MCP de pesquisa/leitura via Firecrawl, número CNJ com dígito verificador, dupla validação obrigatória com os dois links, skill do Hermes atualizada no repositório | `docs/agentes/peticionamento-firecrawl-validacao.md` |

**Leia as duas especificações inteiras antes de começar.** Elas trazem arquivos, funções, testes e
critérios de aceite. Este documento diz **em que ordem** trabalhar e **quando parar para falar com
o dono**.

## 2. Decisões do dono que valem para toda a missão
1. **A sua Routine diária continua rodando** (skill `.claude/skills/rp-radar-juridico/`). **Não**
   a desligue, não a apague e não esvazie a skill. A Fase 7 da especificação A só acontece se o
   dono disser "pode desligar", depois de você perguntar (Etapa 6).
2. O Hermes (agente de peticionamento, em servidor próprio) recebe do dono um documento separado
   (`docs/agentes/MISSAO-hermes-peticionamento.md`). A parte **de código** do peticionamento é
   sua (entrega B). O Hermes só passa a usar as ferramentas depois que o seu PR estiver em produção.
3. **Segredos:** nunca escreva valor de chave, senha ou token em código, commit, PR, log ou chat
   (CLAUDE.md, achado F3). Se precisar de um valor, peça ao dono para colocá-lo no lugar certo
   (Vercel ou variáveis do ambiente desta Routine). Nunca peça para ele colar o valor no chat.
4. **Regras do repositório:** siga o `CLAUDE.md` do Lúmen (sincronizar com `origin/main`, gate
   `tsc` + `eslint` + `next build`, commit e PR em português, padrão fail-closed). Se o
   `next build` falhar **só** porque o ambiente não alcança o banco Neon, diga isso no PR e
   **pergunte ao dono** antes de mergear.

## 3. Como falar com o dono
- Em cada **ponto de parada (🛑)**, envie uma mensagem curta com: o que foi feito, o que você
  precisa dele (passo a passo numerado, dizendo onde clicar) e a pergunta objetiva. Depois
  **espere a resposta**.
- Não faça o dono ler código. Dê links de PR e diga o que testar na tela.
- Um passo que falhar é relatado com o erro real e a próxima ação proposta.

---

## Etapa 0: verificar o ambiente 🛑
1. Confirme que esta sessão tem o repositório `rodartepradoadvogados/Lumen` com permissão de
   **push** e de abrir PR. Se não tiver, oriente o dono: claude.ai → Claude Code → esta Routine ou
   o ambiente dela → repositórios → adicionar `rodartepradoadvogados/Lumen` com escrita.
2. Confirme se `FIRECRAWL_API_KEY` existe **nesta sessão** (`test -n "$FIRECRAWL_API_KEY"`; nunca
   imprima o valor). Ela é necessária para a Fase 0 da especificação A (testar as fontes). Se não
   existir, guie o dono:
   > claude.ai → Claude Code → Environments → ambiente usado por esta Routine → Environment
   > variables → adicionar `FIRECRAWL_API_KEY` (mesma chave cadastrada na Vercel) → salvar →
   > reenviar esta missão numa sessão nova.
3. Rode `npm ci` e `npm run testar` em `main` para saber se a base está verde.

**🛑 Mensagem ao dono:** "Ambiente OK / falta X. Próximo passo: conferir as variáveis na Vercel."

## Etapa 1: variáveis na Vercel (quem faz é o dono) 🛑
Guie o dono, item por item:
> Vercel → projeto **lumen** → Settings → Environment Variables (ambiente Production):
> 1. Confirme que existem: `FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `EMAIL_HOST`,
>    `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`.
> 2. Adicione `RADAR_JURIDICO_ATIVO` com valor `0` (o robô novo nasce **desligado**).
> 3. Me responda "variáveis ok" ou diga qual está faltando.

Se faltar `EMAIL_*`, o aviso por e-mail não sai, mas o resto funciona. Registre e siga.

## Etapa 2: entrega A, fases 0 a 6 🛑
1. Execute a **Fase 0** da especificação A (testar as páginas de listagem das fontes com o
   Firecrawl). **🛑 Envie o relatório ao dono:** quais fontes funcionam e o custo estimado em
   créditos por dia. Espere o "ok".
2. Execute as Fases 1 a 6 numa branch, com testes. Abra **um PR** (o PR A).
3. **🛑 Guie o dono no teste do preview da Vercel** (link no PR):
   > a) Configurações → Blog → Revisão Pendente: a nova ação **"Agendar…"** aparece?
   > b) Agende um rascunho qualquer para daqui a 20 minutos. Ele sai de "Revisão Pendente" e vai
   >    para a aba **"Agendadas"**?
   > c) Depois de ~35 minutos ele aparece em `/blog` do preview?
   > Responda "teste ok" ou descreva o que viu.

   Para disparar o cron do radar no preview, você mesmo pode chamar a rota com o
   `CRON_SECRET`, se o dono tiver colocado no seu ambiente. Senão, peça a ele que rode o comando
   que você fornecer, sem colar o segredo no chat.
4. Com o "teste ok" e o gate verde, **mergeie** (CLAUDE.md autoriza) ou pergunte, se o build
   estiver vermelho só por causa do banco.

## Etapa 3: entrega B, lado Lúmen do peticionamento 🛑
1. Implemente a especificação B inteira (módulo CNJ com dígito verificador, régua de fontes, as
   duas ferramentas MCP, lista branca e testes, prompt, e a skill
   `servidor-hermes/skills/pesquisa-jurisprudencia/SKILL.md` atualizada sem nomes de tribunal nem
   URLs). Abra **o PR B**.
2. Depois do merge e do deploy em produção, **🛑 guie o dono**:
   > 1. Publique no servidor do Hermes a skill atualizada `pesquisa-jurisprudencia`, seguindo
   >    `servidor-hermes/LEIA-ME.md` (seção de skills). [Cite os comandos exatos que o LEIA-ME traz.]
   > 2. Envie ao Hermes o documento `docs/agentes/MISSAO-hermes-peticionamento.md`.
   > 3. Gere uma petição de teste com um precedente: a minuta **só pode ser aprovada** se cada
   >    julgado tiver número CNJ completo e válido **e** os dois links (oficial + secundário). Me
   >    diga o que aconteceu.

## Etapa 4: ligar o robô News 🛑
Guie o dono:
> 1. Vercel → lumen → Environment Variables → `RADAR_JURIDICO_ATIVO` = `1` → salvar.
> 2. Deployments → último deploy de produção → **Redeploy** (variável nova só vale em deploy novo).
> 3. Amanhã, depois das 06:00 (Brasília), abra Configurações → Blog → Revisão Pendente: os
>    rascunhos com selo **"Robô"** chegaram? O e-mail "Blog: N matéria(s) aguardando revisão"
>    chegou?
> 4. Em cada rascunho: **Publicar agora**, **Agendar…** ou **Rejeitar**.

Enquanto isso, a sua Routine antiga também continua mandando rascunhos pela `/api/blog/draft`.
**Avise o dono** que, nesse período, podem aparecer matérias parecidas das duas origens. O
anti-duplicata (mesmo título ou mesma fonte em 60 dias) barra os casos idênticos.

## Etapa 5: acompanhamento (3 dias úteis)
A cada dia, nas execuções da sua Routine, verifique (se tiver acesso) ou pergunte ao dono:
quantos rascunhos o cron novo gerou, quantos foram rejeitados e se houve erro. Corrija defeitos
por PR.

## Etapa 6: decisão sobre o robô antigo 🛑
Pergunte ao dono, com os números da Etapa 5:
> "O robô novo gerou X rascunhos em 3 dias (Y aprovados, Z rejeitados). Quer desligar a Routine
> antiga agora (Fase 7 da especificação), manter as duas por mais tempo, ou manter só a antiga e
> desligar o cron novo (`RADAR_JURIDICO_ATIVO=0`)?"

Execute **só** o que ele escolher. Na Fase 7, **o dono** desativa ou apaga a Routine no claude.ai
(guie o clique). Você só marca a skill como descontinuada, por PR.

---

## Encerramento
A missão termina quando os PRs A e B estiverem em produção, o teste do peticionamento tiver passado
e a decisão da Etapa 6 tiver sido tomada. Mande ao dono um resumo final: PRs, o que ficou ligado, o
que ficou pendente e onde está cada configuração.
