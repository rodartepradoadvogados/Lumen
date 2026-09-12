# Andamento do plano de redesign — Painel da Empresa (`app/painel-mestre/*`)

> **Instrução permanente:** mesma convenção de `plano-adequacao/`, `plano-portal/` e `plano-pwa/`
> — ler este arquivo inteiro antes de qualquer rodada, acrescentar bloco novo ao final, nunca
> reescrever um já registrado.

**Origem:** pedido direto do dono do projeto, depois do PWA Noturno concluído — "painel mestre e
site público" como próximos itens. Nenhum dos dois tinha escopo definido; este arquivo cobre só o
Painel da Empresa (área de administração da plataforma, só Jairo/Rodrigo/equipe Lúmen).

---

## Origem — sessão de `grilling` (`mattpocock-skills:grilling`)

**Data:** 2026-09-11. Fatos levantados antes de perguntar (nunca perguntados ao dono do projeto):
9 telas (`app/painel-mestre/*`), layout próprio (nunca herdou do portal/PWA), **já permanentemente
escuro** (sem alternador Manhã/Noite), base de cor mista (parte tokens semânticos, parte
`text-white`/`bg-grafite-900` cru), audiência restrita (`requirePlatformAccess()`).

**Rodada 1:**
1. **Motivo**: resposta rica, não só "visual datado" — navegabilidade difícil, pouco
   aproveitamento de espaço, Financeiro Lúmen fraco comparado ao financeiro de escritório-cliente,
   Preços confuso/layout fraco, Escritórios com tudo escondido dentro de 1 clique (`[officeId]`,
   `max-w-[700px]`, Cards empilhados), Assinaturas pouco funcional/misturada com Escritórios.
2. **Escopo inicial aceito**: casca + Cockpit + Escritórios.
3. **Direção visual**: reaproveitar o mesmo sistema do portal/PWA (Dracula, raio 2px, glow) —
   consistência entre as 3 áreas internas.
4. **Tema único**: mantém só escuro, sem alternador — mudou na Rodada 2 (ver abaixo).
5. **Migrar texto cru pros tokens semânticos**: aceito.

**Rodada 2** (depois de eu investigar `[officeId]/page.tsx`, `precos/page.tsx`,
`assinaturas/page.tsx`, `financeiro/page.tsx`, confirmando cada queixa da Rodada 1 no código real):
1. **Escopo revisado, aceito**: cresce para cobrir Escritórios+`[officeId]` (reforma de IA) +
   Preços + Financeiro Lúmen + Assinaturas — Cockpit fica com tratamento leve (sem queixa
   específica).
2. **Assinaturas**: vira sub-aba dentro de `[officeId]` (não fica página própria com mais
   funcionalidade) — recomendação minha, aceita.
3. **Financeiro Lúmen**: opção (a) — só polimento visual (cards mais fortes + tendência), sem
   sub-relatórios novos tipo DRE/Fluxo de Caixa (a Lúmen não tem contas a pagar/receber de
   cliente pra gerenciar).
4. **`[officeId]`**: layout largo, abas reais (Visão Geral/Equipe/Cobrança & Assinatura/Faturas/
   Uso) em vez de Cards empilhados.

**Validação do protótipo (2026-09-11)**: artefato publicado
(https://claude.ai/code/artifact/6fdb0f29-ed69-4526-8333-91e09f38642b) — 5 telas, alternador
Escuro/Claro funcional. **Aprovado, com 1 ajuste**: "tema claro pode ser tudo um pouco mais
escuro, como se fosse um misto entre o claro e o escuro, sem perder a harmonia das cores" — a
Manhã do protótipo (cinza-arroxeado claro `#dcdae1`) ficou mais escura na implementação real
(`#b3aebc`), mantendo a mesma família de matiz.

---

## Rodada 1 — P1 implementado (fundação de tema + Cockpit/Escritórios/Preços/Financeiro)

**Data:** 2026-09-11 · **Sessão:** mesma sessão do `grilling` e do protótipo, a pedido do dono do
projeto ("implemente").

### O que foi feito

- **Fundação de tema** (mesma técnica auto-contida de `.portal-shell`/`.mobile-shell`):
  - `app/globals.css`: `.painel-mestre-shell` (Escuro, padrão — mesmos valores Dracula do
    portal/PWA) + `.painel-mestre-shell.painel-mestre-light` (Claro "misto", paleta nova
    cinza-arroxeada mais fechada, pedido explícito do dono do projeto ao validar o protótipo —
    não é o Manhã quase-branco do resto do produto).
  - `lib/painelMestreTheme.ts` (novo) + `components/painelMestre/PainelMestreThemeToggle.tsx`
    (novo) — mesmo padrão de `lib/portalTheme.ts`/`PortalThemeToggle.tsx`, chave própria
    (`rp-painel-mestre-theme`), padrão "dark".
  - `app/painel-mestre/layout.tsx`: `id="painel-mestre-shell"` + script anti-flash; Rail
    (`LumenNavRail.tsx`) e TopStrip (`LumenTopStrip.tsx`) **continuam grafite fixo nos dois
    temas** (mesma regra do Rail do site e do cabeçalho do PWA) — só o conteúdo dentro de
    `<main>` retemea. Alternador adicionado ao `LumenTopStrip.tsx`.
  - `components/painelMestre/LumenUi.tsx`: `text-white`/`bg-grafite-800` → tokens
    (`text-tx`/`bg-sf-superficie`/`border-regua`) + `rounded-sm` (2px, mesma exceção do
    portal/PWA — aqui sem precisar de seletor descendente, porque o Painel nunca tinha raio
    nenhum antes, então não havia nada pra sobrescrever).
- **Cockpit** (`app/painel-mestre/page.tsx`): tratamento leve, só migração de tokens — sem
  mudança de estrutura, conforme decidido na Rodada 2.
- **Escritórios** (`escritorios/page.tsx` + `OfficeListRow.tsx`): tokens migrados + **selo de
  saúde da cobrança por linha** (reaproveitando `avaliarSaudeCobranca`, mesma consulta que a
  antiga página Assinaturas fazia) — resolve o pedido original de "bater o olho e saber se a
  cobrança está saudável" sem precisar de uma página própria.
- **Preços** (`precos/page.tsx` + `PlanCatalogEditor.tsx`): `PlansEditor` virou **grade lado a
  lado** (1 cartão por plano, 4 colunas no desktop) em vez da lista empilhada — resolve
  literalmente a queixa "layout fraco, pouco aproveitamento do espaço". `ModulePricesEditor`
  só migrou tokens (já estava numa estrutura razoável).
- **Financeiro Lúmen** (`financeiro/page.tsx`): tokens migrados + **indicador de tendência**
  (margem vs. mês anterior) no card de Margem — sem criar sub-relatório novo, conforme decisão
  (a). Nota registrada no código: a tendência reflete variação de DESPESA, não MRR histórico
  (Office.monthlyFee não tem snapshot por mês).
- **`PlatformExpenseModal.tsx`**: labels e `.pm-input` migrados de branco/opacidade cru pra
  tokens (`--sf-apoio`/`--regua-forte`/`--tx`) — o modal (`ModalShell.tsx`, componente
  compartilhado do site) já era auto-contido/tokenizado, só o conteúdo próprio deste modal ainda
  usava cor crua.

### Pendente desta rodada

- Nenhuma. Verificação técnica local (`tsc`/`eslint`/`next build`) limpa — ver PR abaixo.
- Próximo item da ordem de execução: **Rodada 2 — Escritórios/`[officeId]`** (reforma de IA:
  layout largo + abas + fusão de Assinaturas).

## Rodada 2 — P2 implementado (`[officeId]` com abas largas + fusão de Assinaturas)

**Data:** 2026-09-11 · **Sessão:** mesma sessão da Rodada 1, sequência direta.

### O que foi feito

- **`app/painel-mestre/[officeId]/page.tsx` reescrito**: de `max-w-[700px]` com Cards empilhados
  para `max-w-[1280px]` com 5 abas reais (Visão Geral/Equipe/Cobrança & Assinatura/Faturas/Uso),
  mesmo padrão de `searchParams.tab` já usado em `app/(app)/processos/[id]/page.tsx` e
  `app/m/processos/[id]/page.tsx` — nenhum mecanismo de aba novo inventado.
- **Página `/painel-mestre/assinaturas` removida** (junto com `AssinaturasTable.tsx`) — o
  conteúdo por escritório (ciclo/forma de pagamento/desconto/Pix/situação da última fatura/
  motivos da saúde) virou parte das novas abas "Cobrança & Assinatura" (configuração, novo
  componente `OfficeCobrancaTab.tsx`) e "Faturas" (status/histórico, novo componente
  `OfficeFaturasTab.tsx`) — a visão consolidada "todos os escritórios" que a página antiga dava
  já foi coberta na Rodada 1 (selo por linha em Escritórios).
- **`OfficeDetailPanel.tsx` removido** — seu conteúdo (plano/módulos/limites/dados de cobrança/
  histórico de faturas/ações de fatura/bloquear acesso) foi redistribuído entre
  `OfficeCobrancaTab.tsx` (configuração) e `OfficeFaturasTab.tsx` (status/ações de fatura),
  nenhuma Server Action foi alterada — só reorganização de UI.
- **`LumenNavRail.tsx`**: item "Assinaturas" removido do grupo Negócio (3 itens agora, não 4).
- **4 `revalidatePath("/painel-mestre/assinaturas")` corrigidos** (2 em
  `lib/actions/painelMestre.ts`, 2 em `lib/actions/subscriptionBilling.ts`) — apontavam pra uma
  rota que não existe mais; agora revalidam `/painel-mestre/${officeId}` (e `/escritorios` onde
  fazia sentido, pelo selo de saúde na lista). `setOfficeAccess` ganhou revalidação da página do
  escritório, que faltava antes desta rodada.
- Comentário desatualizado corrigido em `app/(app)/configuracoes/page.tsx` (apontava pra
  `/painel-mestre/assinaturas`).
- Verificação técnica local isolada (mesma técnica de rodadas anteriores — `git stash push -u
  --keep-index`, restaurado depois): `tsc --noEmit` limpo, `eslint` nos arquivos alterados limpo,
  `next build` **exit 0**.

### Pendente desta rodada

- Nenhuma edição pendente. Verificação visual real (abrir `/painel-mestre` no navegador,
  testar o alternador Escuro/Claro e navegar pelas 5 abas de um escritório) ainda não foi feita
  nesta sessão — recomendado antes de considerar a reforma encerrada, mesmo padrão de cuidado que
  pegou o bug da Manhã do PWA (PR #174) só depois do teste real.
- Fora de escopo desde a Rodada 2 (nunca pedido): `painel-mestre/produto`, `/cofre`, `/confianca`,
  `/equipe`, `/novo` — herdam tema/raio automaticamente (mesmo efeito colateral já documentado no
  portal/PWA), sem trabalho dedicado nesta rodada.
