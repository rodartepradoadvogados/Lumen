# Andamento do plano de adequação — crítica Impeccable (site + PWA)

> **Instrução permanente (leia antes de qualquer ação neste plano):**
> Sempre que for solicitado trabalhar em `roteiro-de-adequacao.md`, **leia este documento
> inteiro primeiro** para saber o que já foi feito, o que está validado e o que ainda depende do
> dono do projeto. Ao final de cada rodada de trabalho, **acrescente um bloco novo abaixo** —
> **nunca sobrescreva ou edite** um bloco de rodada já registrado. Este arquivo é o único lugar
> onde o estado de cada item do roteiro é rastreado; o roteiro em si (`roteiro-de-adequacao.md`)
> não leva campo de status.

**Para retomar em qualquer sessão futura:** peça para "consultar o andamento do plano de
adequação do Impeccable" — a resposta certa é ler este arquivo inteiro (ele é curto o bastante
para caber no contexto) antes de tocar em qualquer item do roteiro.

**Convenção de status por item:** `pendente` (nada feito) · `aguardando validação visual` (item
🎨 sem aprovação do dono do projeto ainda) · `em andamento` · `concluído (PR #N)` · `bloqueado
(motivo)`.

---

## Estado atual por item (resumo — ver rodadas abaixo para o histórico completo)

| Item | Status |
|---|---|
| P0-1 · Site · preço "Substituir" | **concluído (PR #144)** |
| P0-2 · Site · placeholders de recurso | **concluído (PR #146)** |
| P0-3 · PWA · aba Financeiro | **concluído (PR #147)** |
| P0-4 · PWA · Novo Atendimento | **concluído (PR #148)** |
| P1-1 · Site · nav mobile | **concluído (PR #149)** |
| P1-2 · PWA · alvos de toque | **concluído (PR #150)** |
| P1-3 · PWA · piso de 13px | **concluído (PR #151)** |
| P2-1 · Site · plano recomendado | **concluído (PR #157)** |
| P2-2 · PWA · menu "+" / checklist | **concluído (PR #157)** |
| P3-1 · Site · token vinho | pendente (resolve junto com P0-1) |
| P0-5 · Site · contraste do CTA | **concluído (PR #161)** |
| P1-7 · PWA · label sem htmlFor | **concluído (PR #152, merge manual)** |
| P1-8 · PWA · erro sem aria-live | **concluído (PR #154)** |
| P1-9 · Site · alvo de toque nav/rodapé | **concluído (PR #155)** |
| P1-10 · Site · heading h1→h3 | **concluído (PR #156)** |
| P2-3 · Site · blog sem paginação | **concluído (PR #158)** |
| P2-4 · Site · imagens sem lazy | **concluído (PR #159)** |
| P2-5 · Site · force-dynamic sem cache | **concluído (PR #160)** |
| P2-6 · Site · cookie banner sem ARIA | **concluído (PR #162)** |
| P2-7 · PWA · publicações sem paginação | **concluído (PR #163)** |
| P2-8 · PWA · `/m` sem max-width | pendente (sem mockup — mecânico) |
| P3-2 · Site · escala tipográfica própria | pendente (sem mockup — mecânico) |
| P3-3 · Site · superfície escura não documentada | pendente (sem mockup — mecânico) |
| P3-4 · PWA · `.mobile-input` duplicado | pendente (sem mockup — mecânico) |
| P3-5 · PWA · filete de fonte 4px vs 2px | pendente (sem mockup — mecânico) |

**Todos os 7 itens 🎨 da crítica de UX estão validados em 2026-09-10.** Os 16 itens novos vindos
do `$impeccable audit` (2026-09-10) são todos mecânicos/técnicos — nenhum exige validação visual,
todos liberados para execução assim que alcançados na ordem do roteiro.

**Regra para quem atualizar esta tabela:** ela é um resumo de conveniência, não a fonte de
verdade — se ela e o texto de uma rodada abaixo divergirem, o texto da rodada mais recente vence.
Atualize a tabela no mesmo commit que a rodada.

---

## Validação visual

Artifact publicado ("Adequação Lúmen"):
https://claude.ai/code/artifact/042ef61b-4bd4-4fef-8696-3418299585cf

Cópia local do mesmo HTML: `.impeccable/plano-adequacao/mockups.html` (gerada em 2026-09-10,
cobre os itens P0-1, P0-2, P0-4, P1-1, P2-1, P2-2, P0-3).

---

## Validações do dono do projeto (log à parte — item por item, conforme aprovado)

> Cada linha é adicionada quando o dono do projeto aprova (ou pede ajuste em) um item 🎨 do
> mockup. Isto não é uma rodada de trabalho — é só o registro de "pode implementar" por item.
> Quando um item aqui está `aprovado`, ele pode entrar em execução; enquanto não aparecer aqui,
> continua "aguardando validação visual" na tabela acima.

- **2026-09-10 06:40** — **P0-1 (Site · preço "Substituir") → aprovado**, direção do mockup como está (esconder o cartão/mostrar "Fale com a gente", sem `--vinho`). Liberado para implementação.
- **2026-09-10 06:47** — **P0-2 (Site · placeholders de recurso) → aprovado**, direção do mockup como está (diagrama de marca por linha de recurso). Liberado para implementação.
- **2026-09-10 06:47** — **P0-3 (PWA · aba Financeiro) → aprovado**, direção do mockup como está (resumo de 3 números + "Ver detalhes"). Liberado para implementação.
- **2026-09-10 06:47** — **P0-4 (PWA · Novo Atendimento) → aprovado, com ajuste**: o dono do projeto pediu que o controle "mais detalhes" tenha destaque visual real (não ficar escondido/discreto) — tratado como botão secundário, não texto de rodapé. Roteiro e mockup já atualizados para refletir isso. Liberado para implementação com esse ajuste.
- **2026-09-10 06:47** — **P1-1 (Site · nav mobile) → aprovado**, direção do mockup como está (hambúrguer + overlay). Liberado para implementação.
- **2026-09-10 06:47** — **P2-1 (Site · plano recomendado) → aprovado, com requisito adicional**: o dono do projeto pediu que qual plano é "recomendado" vire uma configuração administrável em Painel Mestre → Preços (`app/painel-mestre/precos/`), em vez de fixo no código — a implementar sem perguntar de novo, só informando quando pronto. Roteiro já atualizado. Liberado para implementação com esse requisito.
- **2026-09-10 06:47** — **P2-2 (PWA · menu "+" / checklist) → aprovado**, direção do mockup como está (Atendimento em destaque, checklist recolhido). Liberado para implementação.

## Rodada 0 — geração do plano

**Data:** 2026-09-10 · **Sessão:** crítica dupla (`$impeccable critique` no site público e no
PWA mobile) seguida de planejamento de adequação, a pedido do dono do projeto.

### O que foi feito

- Rodada de `$impeccable critique` completa nos dois alvos, dual-agent (Assessment A + B
  isoladas), snapshots salvos em `.impeccable/critique/2026-09-10T09-22-18Z__app-page-tsx.md`
  (site, 19/32) e `.impeccable/critique/2026-09-10T09-22-28Z__app-m.md` (PWA, 23/40).
- `roteiro-de-adequacao.md` escrito a partir dos 10 achados de severidade P0-P3 dos dois
  relatórios, com ordem global por criticidade (P0 do site e do PWA primeiro, depois P1, P2, P3)
  e um backlog separado para achados menores sem severidade atribuída.
- Este arquivo (`andamento.md`) criado como log cumulativo.
- Mockup HTML gerado (ver seção "Validação visual" acima) cobrindo os 6 itens marcados 🎨 no
  roteiro que envolvem decisão visual: P0-1, P0-2, P0-4, P1-1, P2-1, P2-2, mais P0-3 (resumo de
  3 números do Financeiro).

### Pendente desta rodada

- **Aguardando o dono do projeto validar a direção visual do mockup** antes de qualquer item 🎨
  entrar em execução (P0-1, P0-2, P0-3, P0-4, P1-1, P2-1, P2-2).
- Itens sem mockup (P1-2, P1-3, P3-1) podem começar a qualquer momento — são mudanças mecânicas
  (tamanho de alvo de toque, piso tipográfico, troca de token de cor) sem ambiguidade de direção
  visual a validar.
- Nenhum código de produto foi alterado nesta rodada — só os documentos deste plano e o mockup
  de validação.

## Rodada 1 — auditoria técnica (`$impeccable audit`) e expansão do roteiro

**Data:** 2026-09-10 · **Sessão:** mesma sessão da Rodada 0, a pedido do dono do projeto — depois
de validar as 7 direções visuais, mas antes de começar a implementação.

### O que foi feito

- Os 7 itens 🎨 pendentes da Rodada 0 foram validados pelo dono do projeto (ver seção
  "Validações do dono do projeto" acima), com dois ajustes de escopo registrados diretamente nos
  itens correspondentes do roteiro:
  - **P0-4:** o controle "mais detalhes" precisa ter destaque visual real (botão, não texto
    apagado) — roteiro e mockup (`mockups.html`, artifact republicado) já atualizados.
  - **P2-1:** qual plano é "recomendado" vira uma configuração em Painel Mestre → Preços
    (`app/painel-mestre/precos/`), não um valor fixo no código — a implementar sem perguntar de
    novo, só informando quando pronto. Roteiro já atualizado.
- `$impeccable audit` rodado nos mesmos dois alvos (site público, PWA mobile), um subagente por
  alvo (não dual-agent isolado como o critique — o `audit.md` da skill não exige isso). Site:
  **8/20 (Poor)**, veredito de Implementation Integrity **FAIL**. PWA: **10/20 (Aceitável)**,
  veredito de Implementation Integrity **PASS (com ressalvas)**.
- **16 itens novos** incorporados ao `roteiro-de-adequacao.md`, sempre ao final do nível de
  severidade correspondente (nunca reordenando os 10 itens já existentes da Rodada 0):
  `P0-5`, `P1-7`–`P1-10`, `P2-3`–`P2-8`, `P3-2`–`P3-5`. Dois achados do audit foram registrados
  como *addendum* de itens já existentes em vez de item novo, por serem a mesma causa raiz: o
  botão "Salvar atendimento" abaixo de 52px (addendum do P0-4) e o piso de 13px violado 266x via
  `text-xs` — invisível ao detector, que só é calibrado contra a escala global do DESIGN.md, não
  contra o piso específico do `/m` (addendum do P1-3).
- Dois achados do audit foram para o Backlog em vez de virar item novo, por já serem a mesma
  causa raiz de um achado de UX já registrado: a estrutura de cartão-dentro-de-cartão em
  `MobilePublicationCard.tsx` (mesma raiz do "387 anti-padrões" da crítica de UX) e o "13px fora
  da escala" do detector no site (que na verdade é o piso do `/m`, não uma regra do site).
- "Ordem de execução recomendada" reescrita para intercalar os itens novos na ordem global de
  criticidade.

### Achados de maior destaque desta rodada (não estavam na Rodada 0)

- **Site — contraste WCAG AA reprovado no CTA de fechamento** (2,15:1, precisa 4,5:1) — o mesmo
  bug se repete no subtítulo do blog; o código já resolve esse exato problema corretamente em
  outro lugar (`text-white` em vez de bordô sobre escuro), então é inconsistência de aplicação,
  não desconhecimento da regra.
- **PWA — rótulo de formulário sem `htmlFor`/`id` em praticamente todo `components/mobile/`**
  (1 exceção em dezenas de arquivos) — gap sistêmico de acessibilidade que a disciplina de token
  de cor (impecável, zero hex cru encontrado) não cobre.
- **PWA — piso de 13px violado 266 vezes via `text-xs`**, um achado inteiro fora do alcance do
  detector automático — registrado como addendum do P1-3 para não se perder.

### Pendente desta rodada

- Nenhuma validação visual pendente — todos os 16 itens novos são mecânicos/técnicos.
- **Nenhum código de produto foi alterado nesta rodada** — só os documentos do plano. A próxima
  rodada (Rodada 2) deve ser a primeira a de fato implementar itens do roteiro, começando por
  P0-1, na ordem registrada em "Ordem de execução recomendada".

## Rodada 2 — início da implementação (P0-1)

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-1, a pedido do dono do projeto —
primeira rodada a alterar código de produto.

### O que foi feito

- **P0-1 implementado** em `app/page.tsx`: cartão de plano com módulo incluso sem preço
  configurado agora mostra "Sob consulta" + CTA "Falar com a gente" (mesmo padrão já usado no
  cartão "sob medida" da própria seção), no lugar da etiqueta interna "Substituir" e da moldura
  tracejada. Resolveu junto o **P3-1** (token `--vinho` reaproveitado) — removido, o novo
  tratamento não usa nenhum token de cor de destrutivo/alerta.
- Verificação técnica local do `CLAUDE.md` rodada **isolando a mudança** (stash de todo o resto
  do working tree, que já tinha alterações não relacionadas de outra frente de trabalho —
  `lib/roboBridge.ts`, `docs/gauntlet/*`, `components/BancadaMenu.tsx` etc. — preservadas
  intactas depois, nada foi descartado):
  - `tsc --noEmit -p .` → limpo.
  - `eslint app/page.tsx` → limpo.
  - `next build` → **falhou**, mas a falha foi reproduzida também rodando o build direto em cima
    do `origin/main` sem esta mudança — confirmado como bug pré-existente de ambiente (Windows +
    `@vercel/og`, `TypeError: Invalid URL` ao prerenderizar `/icon`, `/icon-192`, `/icon-512`,
    `/apple-icon`), não relacionado ao P0-1.
- Como o gate de build não fechou limpo (por causa alheia à mudança), **não segui o merge
  automático** do `CLAUDE.md` — commit isolado em `fix/p0-1-preco-substituir` (`d438a42`), PR
  aberto para revisão manual: **https://github.com/rodartepradoadvogados/Lumen/pull/144**.

### Pendente desta rodada

- **PR #144 aguardando revisão/merge manual do dono do projeto** (não é um item 🎨 — é o gate de
  build quebrado que está pendente, não a mudança em si).
- O bug do `next build` (`@vercel/og`/ícones no Windows) fica registrado aqui como um problema
  de ambiente conhecido, fora do escopo do roteiro de adequação — vale investigar separadamente
  antes da próxima rodada que precisar do gate de build limpo para mergear sozinho.
- Próximo item da ordem de execução: **P0-2** (site · placeholders de recurso "Captura de
  tela").

## Rodada 3 — PR #144 mergeado + correção do bug do gate de build

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-2. O dono do projeto mergeou o
PR #144 manualmente e pediu orientação sobre o bug do `next build` registrado como pendente na
Rodada 2.

### O que foi feito

- **PR #144 (P0-1) mergeado** pelo dono do projeto. `main` local sincronizado
  (`146c093`). Tabela-resumo atualizada: P0-1 → `concluído (PR #144)`.
- **Investigado e corrigido o bug do gate de build** (`next build`/`next dev` falhando com
  `TypeError: Invalid URL` nas 4 rotas de ícone do PWA). Causa raiz confirmada dentro do próprio
  `next/og`: `fileURLToPath(join(import.meta.url, "../noto-sans-v27-latin-regular.ttf"))` usa o
  `path.join` do Node (dependente de SO) sobre uma URL `file://` — no Windows isso embaralha a
  URL (troca `/` por `\`) e quebra o `fileURLToPath`. Bug do Next.js 14.2.35 (última da linha
  14.2.x, sem patch), reproduzido tanto em `next build` quanto em `next dev`; **não afeta o
  build de produção da Vercel** (Linux).
- **Correção aplicada** (opção escolhida pelo dono do projeto entre 3 propostas: trocar por PNG
  estático / só documentar exceção / tentar Next 15): os 4 ícones (`app/icon.tsx`,
  `app/apple-icon.tsx`, `app/icon-192/route.tsx`, `app/icon-512/route.tsx`) eram sempre o mesmo
  desenho fixo (`lib/pwaIcon.tsx`, sem dado dinâmico) — viraram PNG estático versionado
  (`app/icon.png`, `app/apple-icon.png`, `public/icons/icon-{192,512}.png`), gerados uma vez via
  `scripts/generate-pwa-icons.tsx` (satori + `@resvg/resvg-js`, instalados só na hora de gerar,
  não ficam como dependência do projeto). `manifest.ts`, `manifest-desktop.webmanifest` e
  `public/sw.js` atualizados para os novos caminhos.
- **Efeito colateral encontrado e corrigido durante a verificação**: a convenção de arquivo
  estático do Next passou a servir `app/apple-icon.png` em `/apple-icon.png` (com extensão), não
  mais `/apple-icon` — o `middleware.ts` liberava acesso anônimo comparando o caminho exato
  `pathname === "/apple-icon"`, o que teria quebrado o ícone do PWA no iOS para visitante sem
  sessão. Corrigido para `pathname.startsWith("/apple-icon")`, mesmo padrão já usado para
  `/icon`. Só foi pego porque o build isolado listou as rotas de saída — reforça o valor de
  sempre olhar a saída completa do `next build`, não só o código de saída.
- Verificação técnica local completa **isolando a mudança** (mesma técnica das rodadas
  anteriores): `tsc --noEmit` limpo, `eslint` limpo, `next build` **exit 0** — desbloqueado.
  Commit `1dd4644`, PR **https://github.com/rodartepradoadvogados/Lumen/pull/145**, mergeado
  pelo Claude (autorização de merge automático do `CLAUDE.md`, já que a causa raiz foi corrigida
  e o gate fechou limpo, diferente do PR #144). `main` sincronizado em `40e2269`.
- **Nota de processo:** ao isolar a mudança via `git stash --keep-index`, um `git commit --amend`
  sem pathspec chegou a incluir por engano 3 arquivos alheios que estavam parados no índice
  (`docs/gauntlet/2026-09-roteiro-de-implementacao.md`, `docs/gauntlet/andamento-2026-09.md`,
  `lib/roboBridge.ts` — outra frente de trabalho, sem relação com este PR). Percebido antes do
  push, corrigido com `git restore --source=HEAD~1 --staged -- <arquivos>` + novo amend, sem
  perda de conteúdo (conferido por diff). Fica registrado como lembrete: `git commit --amend`
  sem pathspec explícito arrasta qualquer coisa que esteja no índice, não só o que se pretende
  alterar — preferir `git commit <pathspec>` (nova ou emendada) quando o índice tiver algo alheio
  parado nele.

### Pendente desta rodada

- Nenhuma. Gate de build desbloqueado para as próximas rodadas.
- Próximo item da ordem de execução: **P0-2** (site · placeholders de recurso "Captura de
  tela").

## Rodada 4 — P0-2 implementado

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-3, retomada a pedido do dono do
projeto ("descubra onde estamos e faça o próximo passo").

### O que foi feito

- **P0-2 implementado** em `app/page.tsx`: as 5 seções de recurso (Publicações, Painel,
  Peticionamento, Financeiro, Sigilo) trocaram a legenda "Captura de tela — {descrição}" por um
  diagrama de marca próprio — SVG inline por feature, linguagem de réguas + bordô (tokens já
  existentes: `marca-tx`, `fonte-pje`, `aviso`, `urgente`, `regua`/`regua-forte`, `tx-2`/`tx-3`,
  `sf`; nenhum token novo introduzido), seguindo a direção já validada pelo dono do projeto no
  mockup (`mockups.html`, item P0-2 — "réguas + bordô... não um placeholder de desenvolvedor").
  O texto `figure` que antes era legenda visível virou `aria-label` do `<svg role="img">`, sem
  perda de informação para leitor de tela.
- Resolveu junto o `skipped-heading` **não** — isso continua no backlog (item separado). Este
  item tratou só a substituição de imagem/legenda.
- Verificação técnica local do `CLAUDE.md` rodada **isolando a mudança** (`git stash push -u` de
  tudo que já estava em andamento no working tree de outra frente de trabalho —
  `docs/gauntlet/*`, `lib/roboBridge.ts`, `.impeccable/`, `DESIGN.md`, `PRODUCT.md`,
  `components/BancadaMenu.tsx`, `components/NavModeToggle.tsx`, `dist/`, e mais alguns arquivos
  soltos — todos restaurados intactos depois via `git stash pop`, nada descartado):
  - `rm -rf .next && tsc --noEmit -p .` → limpo.
  - `eslint app/page.tsx` → limpo.
  - `next build` → **exit 0** (gate do bug do Windows/`@vercel/og` já resolvido na Rodada 3
    continua limpo).
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`),
  commit `753f2b5`, PR **https://github.com/rodartepradoadvogados/Lumen/pull/146**, squash-merge
  `65e843a`. `main` local sincronizado e branch `fix/p0-2-diagrama-recursos` removida (local +
  remoto).
- **Nota de processo:** `gh pr merge --squash` falhou duas vezes com "GraphQL: API rate limit
  already exceeded" mesmo com `gh api rate_limit` mostrando 5000/5000 disponível — sintoma de
  limite secundário específico de mutação GraphQL, não do limite de leitura. Contornado com
  `gh api -X PUT .../pulls/146/merge -f merge_method=squash` (REST direto) em vez de
  `gh pr merge`. Fica registrado como solução pronta se o mesmo erro aparecer de novo em rodada
  futura.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P0-3** (PWA · aba Financeiro — resumo de 3
  números em vez do hub de 6 sub-rotas), já validado, pronto para implementação.

## Rodada 5 — P0-3 implementado

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-4, retomada a pedido do dono do
projeto ("implemente o P0-3").

### O que foi feito

- **P0-3 implementado.** `app/m/financeiro/page.tsx` deixou de abrir direto na lista de 6
  sub-rotas e passou a mostrar 3 números antes de qualquer lista:
  - **Saldo em caixa** — soma ENTRADA/SAIDA de `listarMovimentosCaixa` (`lib/caixaMovimentos.ts`)
    sem filtro de período (acumulado de toda a história, mesma leitura do Livro Caixa — "quanto
    tem em caixa agora", não "quanto moveu este mês"). Filete/valor verde por padrão, vira
    vermelho se o saldo ficar negativo (caso não coberto pelo mockup, decisão própria desta
    rodada).
  - **A vencer hoje** e **Atrasadas** — somam Contas a Pagar e a Receber juntas (o resumo responde
    "o que precisa de atenção agora", não separa por tipo), reusando `effectiveStatus` já
    calculado por `getFilteredPayables`/`getFilteredReceivables` (`lib/financeQuery.ts`) em vez de
    recalcular a promoção PENDENTE→ATRASADO — mesma regra de negócio usada em toda tela de
    Financeiro do produto. "Hoje" comparado por data-calendário UTC, mesma convenção documentada
    em `lib/dueStatus.ts`.
  - Direção visual (3 linhas empilhadas, filete de topo colorido verde/âmbar/vermelho) seguindo
    fielmente o mockup já validado (item P0-3 de `mockups.html`).
  - As 6 sub-rotas (Despesas, Receitas, Relatórios Gerenciais, Fluxo de Caixa, DRE, Livro Caixa)
    foram **movidas** (não duplicadas) para `app/m/financeiro/menu/page.tsx`, um toque atrás do
    botão "Ver detalhes" — o gate de módulo/acesso de `app/m/financeiro/layout.tsx` cobre a rota
    nova automaticamente por herança de layout, sem precisar duplicar a checagem.
- Verificação técnica local do `CLAUDE.md` rodada **isolando a mudança** (mesma técnica das
  rodadas anteriores — `git stash push -u` de tudo mais que já estava em andamento no working
  tree, restaurado intacto depois via `git stash pop`): `tsc --noEmit` limpo, `eslint` limpo,
  `next build` **exit 0** (rota nova `/m/financeiro/menu` compilada no manifesto de saída).
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`),
  commit `0705e06`, PR **https://github.com/rodartepradoadvogados/Lumen/pull/147**, squash-merge
  `3924df5`. `main` local sincronizado e branch `fix/p0-3-financeiro-resumo` removida (local +
  remoto).
- **Nota de processo (repetida da Rodada 3):** `gh pr create` e `gh pr merge` voltaram a falhar
  com "GraphQL: API rate limit already exceeded" mesmo com `gh api rate_limit` mostrando
  5000/5000 disponível. Contornado com `gh api` direto no endpoint REST (`POST .../pulls` para
  criar, `PUT .../pulls/147/merge` para mergear) em vez dos subcomandos `gh pr create`/
  `gh pr merge`, que parecem usar GraphQL internamente. Solução pronta para a próxima vez que
  aparecer.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P0-4** (PWA · Novo Atendimento — 3 campos +
  ditado + "mais detalhes" com destaque visual), já validado com o ajuste pedido pelo dono do
  projeto, pronto para implementação.

## Rodada 6 — P0-4 implementado

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-5, retomada a pedido do dono do
projeto ("faça o P0-4").

### O que foi feito

- **P0-4 implementado** em `components/mobile/MobileNewAttendanceForm.tsx`. Caminho padrão da
  tela virou só Nome, Telefone e Assunto (com botão de microfone ao lado — Web Speech API,
  `SpeechRecognition`/`webkitSpeechRecognition` com feature-detect: sem suporte no navegador, o
  botão simplesmente não renderiza, sem erro nem estado quebrado) + "Salvar atendimento" com
  `h-[52px]` explícito (addendum do `$impeccable audit` — o botão antigo media ~40-41px por
  padding implícito).
  - E-mail, canal, matéria, prazo de resposta, honorário (3 variantes), pendências e anexos
    continuam existindo e funcionais — só ficaram atrás de um botão "Mais detalhes", reusando
    `ButtonSecondary` (`components/ui.tsx`) por exigência explícita do dono do projeto ao validar
    o mockup (destaque real, não texto apagado de rodapé). A seção abre sozinha
    (`useEffect` em `uploadWarnings`) se algum anexo falhar no envio depois do atendimento já
    criado, para não esconder o aviso de reenvio atrás de um toque a mais.
  - Nenhuma mudança na lógica de `handleSubmit`: os campos que ficam escondidos continuam
    contribuindo com seus valores de sempre — os que leem via `formData.get(...)` já tinham
    fallback opcional (`|| undefined`), e os que vivem em estado do componente (`feeMode`,
    `feePercentual`, `pendenciaRows`, `stagedAttachments`, `responseDeadline`) continuam vivos
    independente de a seção estar visível ou não, porque são `useState` do componente, não
    valor lido do DOM.
- Verificação técnica local do `CLAUDE.md` rodada **isolando a mudança** (mesma técnica das
  rodadas anteriores, `git stash push -u`/`pop`, nada descartado): `tsc --noEmit` limpo,
  `eslint` limpo, `next build` **exit 0** (o build rodou mais devagar que o normal nesta rodada e
  passou para background automaticamente — sem relação com a mudança, terminou limpo).
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`),
  commit `4443d8d`, PR **https://github.com/rodartepradoadvogados/Lumen/pull/148**, squash-merge
  `de64ad7`. `main` local sincronizado e branch `fix/p0-4-novo-atendimento` removida (local +
  remoto). PR criado e mergeado via `gh api` REST direto (mesmo contorno das Rodadas 3 e 5 para o
  rate limit intermitente do `gh pr create`/`gh pr merge` via GraphQL).

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P1-1** (Site · nav do cabeçalho some no mobile —
  menu hambúrguer), já validado, pronto para implementação. Depois vêm P1-2/P1-3/P1-7 a P1-10
  (mecânicos, sem mockup necessário).

## Rodada 7 — P1-1 implementado

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-6, retomada a pedido do dono do
projeto ("faça o P1-1").

### O que foi feito

- **P1-1 implementado.** Novo `components/site/MobileNav.tsx` (client component) — hambúrguer de
  44×44px (ícones `Menu`/`X` do lucide-react) que abre um overlay de réguas com Produto/Preço/Blog,
  montado em `app/page.tsx` só abaixo do breakpoint `md`.
  - "Entrar" ficou **fora** do menu de propósito — o próprio código já tinha um comentário
    explicando por quê (precisa continuar visível sem toque extra: é o único jeito de logar de
    volta depois de um logout no PWA) — escondê-lo atrás do hambúrguer teria reintroduzido esse
    problema. Isso diverge um pixel do mockup literal (que mostrava "Entrar" também dentro do
    overlay), decisão tomada nesta rodada para não regredir uma correção documentada já existente
    no arquivo; critério de aceite do roteiro ("todo link do nav do desktop é alcançável em
    mobile") continua satisfeito porque "Entrar" já era alcançável antes desta rodada.
  - Overlay fixo (`top-[76px]`, mesma altura do cabeçalho `sticky`) cobrindo o resto da viewport,
    fecha ao tocar em qualquer link.
- Verificação técnica local do `CLAUDE.md` rodada **isolando a mudança** (mesma técnica das
  rodadas anteriores): `tsc --noEmit` limpo, `eslint` limpo, `next build` **exit 0**.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`),
  commit `2576408`, PR **https://github.com/rodartepradoadvogados/Lumen/pull/149**, squash-merge
  `6e3387f`. `main` local sincronizado e branch `fix/p1-1-nav-mobile` removida (local + remoto).
  PR criado/mergeado via `gh api` REST direto (mesmo contorno das rodadas anteriores para o rate
  limit intermitente do `gh pr create`/`gh pr merge`).

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P1-2** (PWA · alvos de toque abaixo de 44px em
  `app/m/agenda/page.tsx` e `app/m/layout.tsx`) — mecânico, sem mockup necessário.

## Rodada 8 — P1-2 implementado

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-7, retomada a pedido do dono do
projeto ("continuar o roteiro de adequação").

### O que foi feito

- **P1-2 implementado.** `h-11 w-11` (44px) nos 6 elementos abaixo do piso de 44px que
  `08-pwa.md` exige:
  - `app/m/agenda/page.tsx`: as 4 setas de paginação (dia anterior/próximo dia, semana
    anterior/próxima semana), antes `h-9 w-9` (36px).
  - `app/m/layout.tsx`: os 2 ícones do cabeçalho (Central de Alertas/sino, Menu/"mais"), antes
    `h-8 w-8` (32px).
  - Tamanho visual do ícone dentro da área de toque mantido (`size={16}`/`size={18}` do
    `lucide-react`, sem alteração) — só a área clicável cresceu.
- Verificação técnica local do `CLAUDE.md` rodada **isolando a mudança** (mesma técnica das
  rodadas anteriores — `git stash push -u` de tudo mais que já estava em andamento no working
  tree, restaurado intacto depois via `git stash pop`): `tsc --noEmit` limpo, `eslint` limpo,
  `next build` **exit 0**.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`),
  commit `25ea5af`, PR **https://github.com/rodartepradoadvogados/Lumen/pull/150**, squash-merge
  `4402232`. `main` local sincronizado e branch `fix/p1-2-alvos-toque-44px` removida (local +
  remoto). PR criado/mergeado via `gh api` REST direto (mesmo contorno das rodadas anteriores
  para o rate limit intermitente do `gh pr create`/`gh pr merge` via GraphQL) — desta vez não
  reproduziu o erro, mas o caminho REST foi usado por consistência com as rodadas anteriores.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P1-3** (PWA · piso de 13px violado
  sistematicamente, incluindo o addendum de 266 ocorrências via `text-xs` fora do alcance do
  detector) — mecânico, sem mockup necessário.

## Rodada 9 — P1-3 implementado

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-8, retomada a pedido do dono do
projeto ("faça o P1-3").

### O que foi feito

- **P1-3 implementado**, incluindo o addendum do `$impeccable audit`. Sweep mecânico em
  `app/m/` e `components/mobile/`:
  - As 121 ocorrências arbitrárias (`text-[9px]`/`text-[10px]`/`text-[11px]`/`text-[12px]`,
    achado original do detector) → `text-[13px]`.
  - As 268 ocorrências de `text-xs` (12px, addendum — fora do alcance do detector automático,
    que só é calibrado contra a escala global do DESIGN.md) → `text-[13px]`.
  - Total: 389 ocorrências em 78 arquivos.
  - Dois badges circulares de contagem ficariam apertados demais com o texto maior e tiveram o
    contêiner ampliado (texto, não só a moldura, continua informativo — contagem de alertas):
    sino de alertas em `app/m/layout.tsx` (`min-w-[15px] h-[15px]` → `min-w-[18px] h-[18px]`,
    `px-[3px]` → `px-1`) e badge da aba ativa em `components/mobile/MobileBottomNav.tsx`
    (`min-w-[16px] h-4` → `min-w-[18px] h-[18px]`). Nenhum outro contêiner de tamanho fixo
    precisou de ajuste (os demais círculos com texto pequeno — iniciais de avatar, ranking — já
    tinham 24-32px de diâmetro, folga suficiente para 13px).
  - **Nota de processo:** o `sed -i` usado para o sweep reescreveu (sem mudança de conteúdo) 11
    arquivos que não continham nenhum dos padrões-alvo, só por tocar o arquivo — `git diff
    --ignore-all-space` confirmou zero diferença real neles e foram restaurados com `git
    checkout --` antes do commit, para não poluir o PR com ruído de fim de linha (CRLF/LF).
  - Não foi encontrado nenhum caso de texto "puramente decorativo" que justificasse ficar abaixo
    do piso — todas as 389 ocorrências eram rótulo, badge, metadado ou valor, texto que carrega
    informação.
- Verificação técnica local do `CLAUDE.md` rodada **isolando a mudança** (mesma técnica das
  rodadas anteriores — `git stash push -u` de tudo mais que já estava em andamento no working
  tree, restaurado intacto depois via `git stash pop`): `tsc --noEmit` limpo, `eslint` nos 78
  arquivos alterados limpo, `next build` **exit 0**.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`),
  commit `284ea5c`, PR **https://github.com/rodartepradoadvogados/Lumen/pull/151**, squash-merge
  `836a53b`. `main` local sincronizado e branch `fix/p1-3-piso-13px` removida (local + remoto).
  PR criado/mergeado via `gh api` REST direto (mesmo padrão das rodadas anteriores).
- **Não registrada** uma regra própria/checável para este piso de 13px (sugestão deixada em
  aberto no roteiro) — fora do escopo mecânico deste item; considerar como frente separada se o
  dono do projeto quiser evitar regressão futura sem depender de sweep manual.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P1-7** (PWA · rótulo de formulário sem
  `htmlFor`/`id` — sistêmico em `components/mobile/*Form*.tsx`) — mecânico, sem mockup
  necessário.

## Rodada 10 — P1-7 implementado, PR aberto sem merge automático (build bloqueado por memória local)

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-9, retomada a pedido do dono do
projeto ("prossiga").

### O que foi feito

- **P1-7 implementado.** `htmlFor`/`id` pareados em 12 arquivos de `components/mobile/` (só
  `MobileNovaAnotacaoForm.tsx` já seguia o padrão; `NotificationPreferences.tsx` já usava label
  envolvendo o checkbox, que dispensa `htmlFor`):
  `MobileChangePasswordForm.tsx`, `MobileConvertAttendanceForm.tsx`,
  `MobileLancarHonorariosForm.tsx` (32 labels — o maior arquivo), `MobileLicitacaoForm.tsx`,
  `MobileNewAssessoriaForm.tsx`, `MobileNewAttendanceForm.tsx`, `MobileNewCaseForm.tsx`,
  `MobileNewPayableForm.tsx`, `MobileNewReceivableForm.tsx`, `MobileNewTaskForm.tsx`,
  `MobileParecerForm.tsx`, `MobileSettleForm.tsx`.
  - Padrão simples (rótulo → `input`/`select`/`textarea`/`MoneyInput`): `id`/`htmlFor` direto.
  - Rótulo sobre um grupo de botões segmentados (sem controle único de formulário para
    associar — ex.: "Natureza", "Quem arca com o custo"): `role="group"
    aria-labelledby={id do label}` no `<div>` que envolve o grupo, em vez de um `htmlFor`
    inválido.
  - Rótulo "Telefone" sobre `PhoneInput` (dois `<input>` internos — DDI + número, componente
    compartilhado com o desktop): mesmo padrão `role="group"`/`aria-labelledby`, sem alterar o
    componente compartilhado.
  - `MobileSettleForm.tsx` é renderizado **uma vez por linha de lista** (Contas a Pagar/Receber,
    aba Financeiro do processo) — múltiplas instâncias podem coexistir montadas na mesma página
    se mais de uma linha estiver com "Dar baixa" aberto ao mesmo tempo. Id estático colidiria
    (HTML inválido, `htmlFor` ambíguo); usado `settle-${id}-...` prefixado pelo id da própria
    conta.
  - Dois ids estáticos reaproveitados de propósito, confirmado que nunca renderizam
    simultaneamente (branches condicionais mutuamente exclusivas — não é o mesmo risco do
    `MobileSettleForm`): `MobileNewCaseForm.tsx` (`case-court`, usado no ramo Judicial OU no ramo
    Administrativo, nunca os dois) e `MobileNewPayableForm.tsx` (`payable-payee`, select de
    fornecedor OU de cliente, nunca os dois).
  - Checkbox/radio já aninhado dentro do próprio `<label>` (associação implícita por nesting,
    sem necessidade de `htmlFor`) deixado como estava — confirmado em cada arquivo antes de
    fechar (`grep` final por `<label` sem `htmlFor`/`id` só retornou esse padrão).
- Verificação técnica local do `CLAUDE.md`, **isolando a mudança** (mesma técnica das rodadas
  anteriores): `tsc --noEmit` limpo, `eslint` nos 12 arquivos limpo.
- **`next build` não fechou o gate nesta rodada** — duas tentativas consecutivas foram
  encerradas pelo próprio ambiente por falta de memória (a máquina chegou a ~0,7-0,9GB livres de
  15,7GB, com Chrome/VS Code/outras sessões Claude ocupando o resto; um processo `node` órfão da
  primeira tentativa (`jest-worker`) ainda segurava ~1GB depois de "morto" — tentativa de
  encerrá-lo foi bloqueada pelo classifier de permissão da sessão, então não foi possível liberar
  memória por conta própria). Sem esse gate fechando limpo, **não segui o merge automático** —
  mesmo caminho já registrado na Rodada 2 (PR #144) quando um bloqueio de ambiente (não
  relacionado ao código) impediu o build.
- Perguntado ao dono do projeto como proceder; escolheu **abrir o PR sem merge automático**.
  Commit `2bdb455`, PR **https://github.com/rodartepradoadvogados/Lumen/pull/152** aberto,
  branch `fix/p1-7-labels-htmlFor` **não removida** (PR ainda não mergeado). `main` local
  permanece em `836a53b` (mesmo commit da Rodada 9).

### Pendente desta rodada

- Nenhuma — **PR #152 mergeado manualmente pelo dono do projeto** (`main` local sincronizado em
  `7a5c34a` via fast-forward; branch `fix/p1-7-labels-htmlFor` removida local + remoto). Gate de
  build nunca chegou a fechar limpo nesta máquina para este item (ver acima) — aceito via revisão
  manual, mesmo padrão da Rodada 2/PR #144.
- Próximo item da ordem de execução: **P1-8** (PWA · erro de validação sem anúncio a leitor de
  tela, `role="alert"`) — mecânico, sem mockup necessário.

## Rodada 11 — pasta `.impeccable/` versionada no git

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-10, a pedido do dono do projeto
("registrou o andamento na pasta?" → confirmar que `.impeccable/` nunca tinha sido commitada →
"sim" para versioná-la).

### O que foi feito

- Confirmado que `.impeccable/` (este arquivo, `roteiro-de-adequacao.md`, `mockups.html`,
  `design.json`, os dois snapshots de `critique/`, `live/config.json`, `live/roots.json`) estava
  **fora do controle de versão** desde a Rodada 0 — só em disco local, nunca commitada.
  Verificado antes de commitar: nenhum segredo real em nenhum arquivo (design tokens,
  configuração local do Impeccable live com paths absolutos da máquina, relatórios de auditoria
  em markdown — nada sensível).
- Commitada diretamente em `main` (não é código de produto, dispensa o gate de build do
  `CLAUDE.md`).

## Rodada 12 — P1-8 implementado

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-11, retomada a pedido do dono do
projeto ("vamos seguir com o plano, conforme andamento... P1-8").

### O que foi feito

- **P1-8 implementado.** `role="alert"` acrescentado no parágrafo de erro de validação de todo
  formulário mobile que segue o padrão `{error && <p ...>{error}</p>}`, para o erro ser anunciado
  automaticamente por leitor de tela no momento em que aparece (o achado citava
  `MobileNewAttendanceForm.tsx:375` como exemplo, mas o padrão se repete em praticamente todo
  `components/mobile/`). 17 arquivos, 18 ocorrências (`MobileSettleForm.tsx` tem duas):
  `MobileChangePasswordForm.tsx`, `MobileDocumentUpload.tsx`, `MobileLancarHonorariosForm.tsx`,
  `MobileLicitacaoDetail.tsx`, `MobileLicitacaoDocumentUpload.tsx`, `MobileLicitacaoForm.tsx`,
  `MobileNewAssessoriaForm.tsx`, `MobileNewAttendanceForm.tsx`, `MobileNewCaseForm.tsx`,
  `MobileNewPayableForm.tsx`, `MobileNewReceivableForm.tsx`, `MobileNewTaskForm.tsx`,
  `MobileNovaAnotacaoForm.tsx`, `MobileParecerForm.tsx`, `MobileSearchCasesModal.tsx`,
  `MobileSettleForm.tsx`, `NotificationPreferences.tsx`. Escopo deliberadamente mais amplo que só
  "formulários de criar/editar" citado no roteiro — incluiu também `MobileSearchCasesModal.tsx`
  (busca) e `MobileDocumentUpload.tsx`/`MobileLicitacaoDocumentUpload.tsx` (upload), porque
  seguem exatamente o mesmo anti-padrão (erro visual sem anúncio a tecnologia assistiva) e o
  WCAG 4.1.3 (Status Messages) não distingue por tipo de formulário.
- Verificação técnica local do `CLAUDE.md` rodada com a mudança isolada por commit (arquivos
  alheios já modificados no working tree — `docs/gauntlet/*`, `lib/roboBridge.ts` — ficaram de
  fora do `git add`, sem alteração):
  - `rm -rf .next && tsc --noEmit -p .` → limpo.
  - `eslint` nos 17 arquivos alterados → limpo.
  - `next build` → **falhou na primeira tentativa**, mas por causa alheia: `components/BancadaMenu.tsx`
    (arquivo não versionado, de outra frente de trabalho) tinha um import não usado
    (`usePathname`) e um `any` explícito, e o `next build` linta todo `.tsx` do diretório de
    trabalho independente de rastreamento pelo git. Como isso bloqueava a verificação completa do
    P1-8, perguntado ao dono do projeto como proceder — escolheu corrigir os dois erros triviais
    (`usePathname` removido do import, `icon: any` → `icon: LucideIcon` de `lucide-react`). Com o
    ambiente desbloqueado, `next build` fechou **exit 0**. `BancadaMenu.tsx` continua fora do
    controle de versão (não fazia parte deste PR) — a correção fica só em disco local, à espera de
    quem estiver trabalhando nesse arquivo.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`),
  PR **https://github.com/rodartepradoadvogados/Lumen/pull/154**, branch
  `fix/p1-8-erro-validacao-role-alert` removida (local + remoto) após o merge.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P1-9** (Site · alvo de toque do nav/rodapé abaixo
  do mínimo) — mecânico, sem mockup necessário.

## Rodada 13 — P1-9 implementado

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-12, retomada a pedido do dono do
projeto ("faça o P1-9").

### O que foi feito

- **P1-9 implementado** em `app/page.tsx` e `app/blog/[slug]/page.tsx`, nos três locais citados
  pelo roteiro:
  - Nav do cabeçalho (Produto/Preço/Blog/Entrar) — a constante compartilhada `navLink` ganhou
    `inline-block py-2` (antes só `text-sm font-semibold ...`, sem padding — altura de toque era
    só a linha de texto, ~20px). Os 4 links (incluindo "Entrar", fora do `<nav>` por razão já
    documentada no próprio arquivo) usam essa constante, então um único ponto de mudança cobre
    todos.
  - Links do rodapé — nova constante `footerLink` (`inline-block py-2 text-tx-2 ...`), extraída da
    string repetida 7 vezes (Recursos, Preço, Entrar, WhatsApp, e-mail, Política de privacidade,
    DPO), substituindo o `className` inline duplicado em cada `<li><a>`/`<li><Link>`.
  - `app/blog/[slug]/page.tsx:57` ("Voltar ao blog") — `py-2` acrescentado ao `inline-flex`
    existente (já era flex, só faltava o padding).
  - `inline-block`/`inline-flex` (não `block`) porque os links continuam lado a lado (nav) ou em
    lista vertical já espaçada por `space-y-2.5` (rodapé) — mesmo padrão já usado no hambúrguer
    mobile (`components/site/MobileNav.tsx`, criado no P1-1), que usa `block py-4` por estar numa
    lista vertical de largura total, mas o princípio de padding garantindo área de clique
    confiável em `<a>` inline é o mesmo.
  - `py-2` (8px cada lado) escolhido em vez de `py-3`/44px cheio porque é a correção sugerida
    literalmente pelo roteiro ("`py-2` (ou equivalente) para alcançar ao menos 24px") — com
    `text-sm`/`text-xs` (20px/16px de linha), o resultado fica em 36px/32px, acima do piso mínimo
    AA de 24px sem inflar demais a barra e o rodapé, que têm pouco espaço vertical de sobra.
- Verificação técnica local do `CLAUDE.md` rodada com a mudança isolada por commit (arquivos
  alheios já modificados no working tree — `docs/gauntlet/*`, `lib/roboBridge.ts` — ficaram de
  fora do `git add`, sem alteração): `rm -rf .next && tsc --noEmit -p .` limpo, `eslint` nos 2
  arquivos alterados limpo, `next build` **exit 0** (o gate do `BancadaMenu.tsx` não versionado,
  corrigido na Rodada 12, continua desbloqueado nesta máquina).
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`), PR
  **https://github.com/rodartepradoadvogados/Lumen/pull/155**, branch
  `fix/p1-9-alvo-toque-nav-rodape` removida (local + remoto) após o merge.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P1-10** (Site · hierarquia de heading pula de h1
  para h3) — mecânico, sem mockup necessário.

## Rodada 14 — P1-10 implementado

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-13, retomada a pedido do dono do
projeto ("prossiga com o P1-10").

### O que foi feito

- **P1-10 implementado** em `app/page.tsx`. Entre o `<h1>` do hero e o `<h3>` de cada recurso
  (seção `#recursos`) não havia nenhum `<h2>` — escolhida a segunda opção oferecida pelo roteiro
  ("inserir um `<h2>` de seção visualmente oculto"), em vez de promover cada título de recurso a
  `<h2>`: os cinco recursos são subseções de uma única seção "Recursos", não seções de primeiro
  nível cada uma — um `<h2 className="sr-only">Recursos</h2>` acima do `.map` de `FEATURES`
  corrige a hierarquia sem tocar em nenhum título visível nem em nenhuma classe de estilo
  (nenhum seletor de tag `h1`/`h2`/`h3` existe em `app/globals.css` — toda a estilização já era
  via `className`, então a troca de nível de heading não muda nada visualmente). `sr-only` já era
  usado no projeto (`components/mobile/MobileNovaAnotacaoForm.tsx`), reaproveitado em vez de
  inventar um padrão novo de texto oculto.
  - Hierarquia resultante: `h1` → `h2` (oculto, "Recursos") → `h3` (título de cada recurso) →
    `h2` ("Um plano para cada tamanho de escritório") → `h2` (CTA final) — nenhum nível pulado
    entre o `h1` e o primeiro `h2`, que é exatamente o critério de aceite do item.
  - Os três `<h4>` do rodapé (Produto/Contato/Legal) ficaram de fora — o critério de aceite do
    roteiro é escopado ao trecho "entre o `<h1>` e o primeiro `<h2>` de conteúdo", e o rodapé é um
    padrão comum (`role="contentinfo"`) de headings de bloco não ligados ao fluxo do documento
    principal; não fazia parte do "Onde" citado pelo achado.
- Verificação técnica local do `CLAUDE.md` rodada com a mudança isolada por commit (arquivos
  alheios já modificados no working tree — `docs/gauntlet/*`, `lib/roboBridge.ts` — ficaram de
  fora do `git add`, sem alteração): `rm -rf .next && tsc --noEmit -p .` limpo, `eslint
  app/page.tsx` limpo, `next build` **exit 0**.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`), PR
  **https://github.com/rodartepradoadvogados/Lumen/pull/156**, branch
  `fix/p1-10-heading-h1-h2-h3` removida (local + remoto) após o merge.

### Pendente desta rodada

- Nenhuma. Todos os **10 itens P1** do roteiro estão concluídos (P1-1 a P1-10). Próximo item da
  ordem de execução: **P2-1** (Site · plano recomendado — já validado, requer o requisito
  adicional de configuração em Painel Mestre → Preços registrado na validação do dono do projeto).

## Rodada 15 — P2-1 e P2-2 implementados, no mesmo PR

**Data:** 2026-09-10 · **Sessão:** mesma sessão das Rodadas 0-14, a pedido do dono do projeto
("faça, em sequência e sem parar, no mesmo PR, P2-1 e P2-2").

### O que foi feito

- **P2-1 implementado**, incluindo o requisito adicional já registrado na validação do dono do
  projeto (controle em Painel Mestre → Preços, sem valor fixo no código):
  - **Schema:** `Plan.recommended Boolean @default(false)` (`prisma/schema.prisma`). Comentário no
    campo já deixa explícito que a invariante "no máximo 1 `true`" é imposta em código, não em
    constraint de banco.
  - **Ação nova** `setRecommendedPlan(planId: string | null)` (`lib/actions/painelMestre.ts`):
    transação que zera `recommended` em todos os planos antes de marcar o escolhido — nunca um
    `update` isolado, que deixaria dois planos "recomendados" se chamada duas vezes em sequência
    rápida. `planId: null` limpa o destaque (nenhum plano recomendado).
  - **UI em Painel Mestre → Preços** (`components/painelMestre/PlanCatalogEditor.tsx`): rádio
    "Recomendado" por linha de plano (grupo `name="recommended-plan"`, mutuamente exclusivo por
    natureza do próprio `<input type="radio">`), com um link "Remover destaque…" abaixo da lista
    para voltar a nenhum recomendado. Chama a ação imediatamente ao clicar (mesmo padrão de save
    imediato já usado em `ModulePricesEditor`, não empacotado no botão "Salvar" de módulos/limites
    porque é uma decisão de outra natureza — global, não por linha).
  - **Capa pública** (`app/page.tsx`, seção Preço): o cartão do plano com `recommended` true ganha
    `border-acao-light` (em vez de `border-regua-forte`) e um selo "Recomendado" (`bg-acao-light
    text-acao-tx`) — nenhum token de cor novo introduzido, `--acao-light` já existia reservado no
    DESIGN.md exatamente para isso. Optou-se por um selo em fluxo normal (não sobreposto com
    posição absoluta sobre a borda, como o mockup de referência) porque a grade de preço quebra em
    2 linhas em telas médias (`md:grid-cols-3` com 6 cartões) — um selo com `position:absolute` e
    `top` negativo, se o plano recomendado caísse na segunda linha, sobreporia visualmente o
    cartão da linha de cima. A alternativa em fluxo normal entrega o mesmo critério de aceite
    (tratamento visual distinto + rótulo) sem esse risco de layout.
- **P2-2 implementado**, os dois achados do mesmo item:
  - **Menu "+"** (`components/mobile/MobileNewEntitySheet.tsx`): "Atendimento" saiu do grid de 4
    colunas do grupo "Cadastro" e virou uma faixa cheia acima dos dois grupos secundários — `bg-
    acao`/`text-acao-tx`/`font-bold`, mesmo tratamento do mockup validado (`mockups.html`, item
    P2-2). Só aparece quando `modules.atendimento` (mesma condição de antes, só moveu de lugar).
  - **Checklist de pendências** (`components/mobile/MobileNewAttendanceForm.tsx`): as 14 caixas
    (7 "Solicitar ao lead" + 7 "Enviar ao lead", `PendenciasEditor` em modo `compact`) não
    apareciam mais expandidas por padrão nem quando o usuário já tinha aberto "Mais detalhes"
    (P0-4, Rodada 6) — collapse próprio com toggle "+ Adicionar pendência" (`showPendencias`,
    novo estado, `false` por padrão), independente do "Mais detalhes" que já as envolve. A
    especificação do achado pedia exatamente este toggle nomeado ("adicionar pendência"), não
    apenas reaproveitar o "Mais detalhes" que por si só já as escondia na tela inicial — a UX
    dentro do painel expandido também precisava do próprio recolhimento.
  - `PendenciasEditor.tsx` (componente compartilhado com o desktop, `NewAttendanceModal.tsx` e
    `AttendancePendenciasPanel.tsx`) não foi tocado — o toggle vive só no componente mobile que
    o chama, sem afetar as outras duas telas que o reaproveitam sem esse problema de carga
    cognitiva (2 colunas lado a lado no desktop, não uma pilha de 14 num só grupo).
- **`npx prisma generate` falhou** ao copiar o binário do motor de consulta
  (`query_engine-windows.dll.node`, `EPERM`) — outro processo Node nesta máquina (um `next dev`
  já rodando na porta 3000, confirmado por `netstat`) segurava o arquivo. Não interrompido (não é
  processo desta sessão, risco de atrapalhar outro trabalho em andamento). Verificado que os
  tipos TypeScript (`node_modules/.prisma/client/index.d.ts`) já tinham sido regravados com o
  campo `recommended` **antes** da falha no binário — só o motor nativo (inalterado entre
  gerações do mesmo schema, indiferente ao conteúdo do schema) não foi recopiado, sem efeito no
  `tsc`/`next build`, que rodaram limpos normalmente.
- Verificação técnica local do `CLAUDE.md` rodada com a mudança isolada por commit (arquivos
  alheios já modificados no working tree — `docs/gauntlet/*`, `lib/roboBridge.ts` — ficaram de
  fora do `git add`, sem alteração): `rm -rf .next && tsc --noEmit -p .` limpo, `eslint` nos 6
  arquivos alterados limpo (1 correção no meio do caminho: `react/no-unescaped-entities` nas
  aspas de "Recomendado" no link de limpar destaque, trocadas por `&ldquo;`/`&rdquo;`), `next
  build` **exit 0**.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`,
  inclusive para a mudança de `prisma/schema.prisma` — sem exceção por área sensível), PR único
  com os dois itens conforme pedido **https://github.com/rodartepradoadvogados/Lumen/pull/157**,
  branch `feat/p2-1-p2-2-recomendado-e-checklist` removida (local + remoto) após o merge.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P2-3** (Site · consulta do blog sem
  paginação/limite) — mecânico, sem mockup necessário.

## Rodada 16 — P2-3 implementado

- **P2-3 implementado** (`app/blog/page.tsx`): `prisma.blogPost.findMany` buscava todo post
  `PUBLICADO` do escritório numa página só, sem `take`/`skip` — achado do `$impeccable audit`
  (custo sem teto conforme o robô de conteúdo jurídico continua publicando). Trocado por
  paginação por página (`?page=N`, `PAGE_SIZE = 20`), com `skip`/`take` no Prisma. Em vez de um
  `count()` à parte só para saber se existe próxima página, busca `PAGE_SIZE + 1` linhas e usa a
  extra como sinal de `hasNext` (uma consulta a menos por carga). Links "← Página anterior" /
  "Próxima página →" abaixo da grade, exibidos só quando fazem sentido (`page > 1` /
  `hasNext`) — sem JS de cliente, mesma renderização 100% server component que já existia.
- Verificação técnica local: `rm -rf .next && tsc --noEmit -p .` limpo, `eslint
  app/blog/page.tsx` limpo, `next build` **exit 0**.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`), PR
  **https://github.com/rodartepradoadvogados/Lumen/pull/158**, branch
  `fix/p2-3-blog-paginacao` removida (local + remoto) após o merge.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P2-4** (Site · imagens do blog sem
  lazy-loading) — mecânico, sem mockup necessário.

## Rodada 17 — P2-4 implementado

- **P2-4 implementado**: `<img>` do blog (`app/blog/page.tsx`, cartões da listagem; `app/blog/
  [slug]/page.tsx`, imagem de capa da matéria) sem `loading`/`decoding` — achado do `$impeccable
  audit`. Adicionado `loading="lazy" decoding="async"` nos dois pontos, correção mínima que a
  ficha já indicava (bypass de `next/image` mantido como estava, `eslint-disable-next-line
  @next/next/no-img-element` inalterado — trocar para `next/image` exigiria configurar domínio
  remoto, fora do escopo mecânico deste item).
- Verificação técnica local: `rm -rf .next && tsc --noEmit -p .` limpo, `eslint` nos 2 arquivos
  limpo, `next build` **exit 0**.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`), PR
  **https://github.com/rodartepradoadvogados/Lumen/pull/159**, branch
  `fix/p2-4-blog-lazy-loading` removida (local + remoto) após o merge.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P2-5** (Site · rotas públicas `force-dynamic`
  sem cache) — mecânico, sem mockup necessário.

## Rodada 18 — P2-5 implementado (decisão registrada: as duas correções da ficha não cabem neste stack)

- **Achado revisitado antes de aplicar a correção sugerida**: a ficha do P2-5 propõe duas saídas
  — (a) separar a checagem de sessão (dinâmica) do conteúdo de marketing (ISR) na mesma rota, ou
  (b) mover a checagem de sessão pro `middleware.ts`. Nenhuma das duas serve `app/page.tsx` neste
  stack: (a) exige Partial Prerendering, não estável no Next 14.2.35 aqui instalado; (b) exigiria
  rodar Prisma dentro do middleware, que roda em Edge Runtime no Next 14 (sem suporte a Node.js
  middleware) — `@prisma/client` sem driver adapter não funciona em Edge. **Decisão tomada sem
  perguntar de novo, documentada no próprio código** (comentário em `app/page.tsx` antes do
  `export const dynamic`): resolver a causa concreta de custo citada no achado (ida ao banco ao
  vivo a cada visita) em vez da forma exata sugerida.
- **`app/page.tsx`**: `prisma.plan.findMany` + `prisma.modulePrice.findMany` (conteúdo de preço,
  muda no máximo algumas vezes por dia) movidos para dentro de um `unstable_cache`
  (`getHomepagePricingData`, `revalidate: 300`). A checagem de sessão (`getCurrentUser` +
  redirect) continua 100% dinâmica, por request — só o "conteúdo" saiu do caminho quente.
  `updateModulePrice`/`updatePlan`/`setRecommendedPlan` (`lib/actions/painelMestre.ts`) já
  chamavam `revalidatePath("/")` desde a Rodada 15 — antes um no-op nesta rota sempre dinâmica,
  agora invalida de fato o cache acima, sem precisar tocar nessas três funções.
- **`app/blog/[slug]/page.tsx`**: sem sessão/cookie nenhum aqui — `force-dynamic` → `export const
  revalidate = 300` (ISR de verdade, ganho de cache de borda real, sem nenhum dos entraves de
  `app/page.tsx`).
- **`app/blog/page.tsx`**: `force-dynamic` removido por ser redundante — a paginação por
  `searchParams` (P2-3, Rodada anterior) já obriga renderização dinâmica por request, então não
  havia cache de borda a ganhar aqui de qualquer jeito.
- Verificação técnica local: `rm -rf .next && tsc --noEmit -p .` limpo, `eslint` nos 3 arquivos
  limpo, `next build` **exit 0** (as 3 rotas seguem listadas como `ƒ` Dynamic no relatório do
  build, esperado — nenhuma das três virou rota estática, o ganho é no cache das leituras de
  banco/ISR do conteúdo, não na renderização em si).
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`), PR
  **https://github.com/rodartepradoadvogados/Lumen/pull/160**, branch
  `fix/p2-5-cache-rotas-publicas` removida (local + remoto) após o merge.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P0-5** (Site · CTA de fechamento reprova
  contraste WCAG AA) — mecânico, sem mockup necessário.

## Rodada 19 — P0-5 implementado (escopo maior que a ficha: achado sistêmico, não 2 linhas)

- **Escopo revisado antes de aplicar**: a ficha nomeia só 2 linhas (`app/page.tsx`,
  `app/blog/page.tsx`), mas o próprio critério de aceite da ficha ("nenhum outro uso de
  `text-marca` sobre fundo `grafite-800`/`bg-marca` escuro") obrigava a varrer o resto do
  código. Medido: `text-marca` (bordô `#8a2f42`) sobre `bg-grafite-800`/`bg-grafite-700`
  (`#16191d`/próximo) dá **~2,16:1** ao vivo — a mesma falha WCAG AA (precisa 4,5:1) nas duas
  linhas da ficha, achada em **20 pontos a mais**, em 17 arquivos, a maioria círculos de
  iniciais de avatar e ícones de navegação sobre chrome fixo escuro. Inclusive dentro do
  Painel da Empresa (`components/painelMestre/LumenUi.tsx`), cujo próprio comentário afirma
  que os tokens semânticos "já foram escolhidos pra funcionar sobre grafite escuro" — o que
  vale para `--aviso`/`--urgente`/`--concluido`, mas não para `--marca` na prática (mesmo
  ~2,16:1 medido ali).
- **Correção**: `text-marca` → `text-rail-marca` (variante clara do bordô, `--rail-marca`
  `#c9707f`, fixa nos dois temas — DESIGN.md já a documenta pra exatamente este caso: bordô
  como texto sobre superfície fixa escura) em todos os 20 pontos, exceto o CTA da home
  (`app/page.tsx`), que foi pra `text-acao-tx` (creme) por já estar ao lado do botão primário
  do hero com o mesmo tom, e a linha do Painel da Empresa que empilhava `bg-marca-bg` (badge
  "Sócio", `LumenTopStrip.tsx`) — trocada pro par `bg-rail-marca-bg`/`text-rail-marca` que o
  `NavRail.tsx` já usa pro mesmo caso, em vez de inventar um par novo.
- Arquivos: `app/page.tsx`, `app/blog/page.tsx`, `app/(app)/configuracoes/page.tsx`,
  `app/m/configuracoes/page.tsx`, `app/m/layout.tsx`, `app/m/mais/page.tsx`,
  `app/m/processos/[id]/page.tsx`, `components/BulkSettleBar.tsx`,
  `components/ClaudeAssistantWidget.tsx`, `components/EditProfileForm.tsx`,
  `components/TaskDetailModal.tsx`, `components/TeamMonitorPanel.tsx`,
  `components/TopBarActionsContent.tsx`, `components/UndoToastProvider.tsx`,
  `components/mobile/MobileThemeToggle.tsx`, `components/painelMestre/AssinaturasTable.tsx`,
  `components/painelMestre/LumenTopStrip.tsx`.
- Fora do escopo, confirmado por inspeção: `components/NoticesPanel.tsx:143` (`text-marca` sobre
  card `bg-sf` claro, não escuro) e todo par `bg-marca-bg`/`text-marca-tx` (o badge "gold"
  padrão, já correto — `--marca-bg` é um tingimento claro, não a superfície escura sólida que a
  ficha aponta).
- Verificação técnica local: `rm -rf .next && tsc --noEmit -p .` limpo, `eslint` nos 17
  arquivos alterados limpo, `next build` **exit 0**.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`), PR
  **https://github.com/rodartepradoadvogados/Lumen/pull/161**, branch
  `fix/p0-5-contraste-marca-sobre-escuro` removida (local + remoto) após o merge.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P2-6** (Site · banner de cookies sem
  ARIA/região viva) — mecânico, sem mockup necessário.

## Rodada 20 — P2-6 implementado

- **P2-6 implementado** (`components/site/CookieConsent.tsx`): o banner aparece via mudança de
  estado client-side (`useState`/`useEffect`) sem `role`/`aria-live` — leitor de tela não era
  avisado que um elemento interativo novo apareceu na tela (WCAG 4.1.3, Status Messages). Achado
  do `$impeccable audit`. Adicionado `role="region" aria-label="Aviso de cookies"
  aria-live="polite"` no contêiner.
- Verificação técnica local: `rm -rf .next && tsc --noEmit -p .` limpo, `eslint` no arquivo
  limpo, `next build` **exit 0**.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`), PR
  **https://github.com/rodartepradoadvogados/Lumen/pull/162**, branch
  `fix/p2-6-cookie-banner-aria` removida (local + remoto) após o merge.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P2-7** (PWA · lista de publicações sem
  paginação/virtualização) — mecânico, sem mockup necessário.

## Rodada 21 — P2-7 implementado

- **P2-7 implementado**: `app/m/publicacoes/page.tsx` renderizava todo grupo de publicação
  pendente de uma vez (`groups.map`, sem janelamento), com até 3000 linhas vindas do banco
  (`take: 3000`, rede de segurança documentada no próprio código, não um corte de exibição) —
  achado do `$impeccable audit`. Nenhuma lib de virtualização (`react-window`/`react-virtual`)
  instalada, e a ficha aceitava paginação simples como alternativa.
- **Correção**: novo `components/mobile/MobilePublicationsList.tsx` (client component) —
  recebe os grupos já buscados no servidor e renderiza só os primeiros 50 (`PAGE_SIZE`), com um
  botão "Carregar mais (N restantes)" que revela mais 50 por vez sem nova ida ao servidor (os
  dados já vieram numa carga só do `page.tsx`; isto só limita quantos nós de DOM existem de uma
  vez). Abaixo de 50 grupos pendentes — a esmagadora maioria dos escritórios hoje — o
  comportamento é idêntico ao anterior (sem botão, tudo visível). O mapeamento de cor de borda
  por fonte (`SOURCE_BORDER_COLORS`) foi movido junto pro novo arquivo, único ponto que ainda o
  usa — não duplicado, `app/m/publicacoes/page.tsx` não guarda mais essa lógica.
- Verificação técnica local: `rm -rf .next && tsc --noEmit -p .` limpo, `eslint` nos 2 arquivos
  limpo, `next build` **exit 0**.
- Gate fechou limpo → **mergeado automaticamente pelo Claude** (autorização do `CLAUDE.md`), PR
  **https://github.com/rodartepradoadvogados/Lumen/pull/163**, branch
  `fix/p2-7-publicacoes-paginacao` removida (local + remoto) após o merge.

### Pendente desta rodada

- Nenhuma. Próximo item da ordem de execução: **P2-8** (PWA · casca do `/m` sem `max-width`) —
  mecânico, sem mockup necessário.
