# Roteiro de implementação — portal noturno (pós-login)

Origem: proposta aprovada em `.impeccable/plano-portal/andamento-portal.md` (Rodada 0), artefato
"Lúmen — portal noturno" (https://claude.ai/code/artifact/6ed60db1-f543-4f4f-a3c9-136a1c82b193).
Este roteiro é só a ORDEM de execução — decisões de direção já estão fechadas na Rodada 0.

**Como usar:** mesma convenção de `plano-adequacao/roteiro-de-adequacao.md` — lista fixa, não
reordenar item já numerado; progresso vai em `andamento-portal.md`, nunca aqui.

---

## Descobertas técnicas desta rodada (mudam COMO se implementa, não O QUE foi aprovado)

Antes de escrever qualquer item, investiguei a arquitetura real pra não prometer algo que o stack
não sustenta:

1. **O mecanismo de tema (`lib/theme.ts`) é do layout RAIZ (`app/layout.tsx`)** — compartilhado
   entre o site público, o portal (`app/(app)/*`) e o painel-mestre, todos sob a mesma classe
   `.dark` em `<html>` e a mesma chave de `localStorage` (`rp-site-theme`). Redefinir o padrão
   para escuro ali afetaria o site público também — **fora do escopo aprovado**.
   - **Decisão técnica:** o portal ganha seu **próprio mecanismo de tema**, independente — nova
     chave (`rp-portal-theme`), padrão `"dark"`, aplicada via classe num wrapper dentro de
     `app/(app)/layout.tsx` (não em `<html>`). Não é invenção: é o mesmo padrão que o app mobile
     já usa (`rp-mobile-theme`, comentário de `lib/theme.ts` já explica o motivo — "pra não um
     afetar o outro"). Site e painel-mestre continuam exatamente como estão.
2. **Cor já é `var(--...)` (CSS custom property) — escopar por classe funciona sem tocar
   componente por componente.** Raio (`rounded-*`) **não é** — `tailwind.config.ts` compila pra
   px fixo (`sm:4px`, `md:6px`, `lg:10px`), não pra variável. Escopar raio por classe pai não
   funciona pra utilitário Tailwind já compilado.
   - **Decisão técnica:** aplicar o raio quase reto (2px) **diretamente nos componentes tocados**
     desta rodada (valor arbitrário `rounded-[2px]`, não `rounded-md`), só nas 3 telas + casca.
     Migrar a escala inteira do Tailwind pra token de CSS (like cor já é) fica pra uma rodada
     futura, **se** a direção for expandida a mais módulos — não faz sentido reescrever
     `tailwind.config.ts` pra 3 telas.
3. **Fonte (`next/font/google`) pode ser carregada num layout aninhado** (`app/(app)/layout.tsx`),
   sem afetar o `Inter` do layout raiz — Next 14 App Router suporta isso nativamente.
4. **Efeito colateral esperado, não bug:** como a casca (`NavRail`, fundo, tema padrão) é
   compartilhada por TODOS os 15 módulos de `app/(app)/*`, os 12 módulos fora do escopo desta
   rodada (Financeiro, Agenda, Contatos etc.) herdam a cor/fonte/tema escuro **imediatamente**
   assim que P1/P2 forem mergeados — só não ganham o raio quase reto (isso é por arquivo, item 2
   acima). Resultado esperado: cor unificada de cara, forma (cantos) chega módulo por módulo nas
   rodadas seguintes. Avisar o dono do projeto quando isso acontecer, não é regressão.

---

## P1 · Fundação — fontes, tokens de cor, tema próprio do portal

- **Onde:** `app/(app)/layout.tsx` (novo wrapper + fontes), `lib/portalTheme.ts` (novo, espelha
  `lib/theme.ts`), `app/globals.css` (novo bloco de tokens escopado, não mexe em `:root`/`.dark`
  existentes).
- **O quê:** `next/font/google` carrega Barlow (400/500/600/700) e Barlow Condensed
  (600/700/800); novo bloco CSS define a paleta escura "Dracula-aproximada" e a paleta clara
  (Manhã do portal, reaproveitando os tokens já existentes do Lúmen) sob um wrapper
  `.portal-shell`; script anti-flash próprio (mesmo padrão do `THEME_INIT_SCRIPT`, chave
  `rp-portal-theme`, padrão `"dark"`) evita flash de tema errado no primeiro paint.
- **Critério de aceite:** nenhuma tela fora de `app/(app)/*` muda de aparência; `tsc`/`eslint`/
  `next build` limpos; toggle Noite/Manhã funcional (mesmo sem UI ainda — testável via
  `localStorage.setItem`).
- **Registrar em `DESIGN.md`:** nova seção de exceção documentada ("Portal Noturno — escopo
  `app/(app)/*`"), mesmo espírito da exceção Lora do blog e da escala tipográfica do site — não
  reescreve a escala global, documenta um desvio legítimo e onde ele vale.

## P2 · Casca — rail + cabeçalho

- **Onde:** `components/NavRail.tsx`, `app/(app)/layout.tsx` (topbar/alternador de tema).
- **O quê:** rail e cabeçalho passam a usar os tokens/fontes do P1; alternador Noite/Manhã real
  (protótipo já valida a interação no artefato); raio 2px aplicado aqui (arbitrário, por
  componente).
- **Critério de aceite:** rail e cabeçalho batem visualmente com o artefato aprovado; alternância
  de tema funciona em produção, não só no protótipo.

## P3 · Painel (dashboard)

- **Onde:** `app/(app)/painel/page.tsx` e os componentes que já usa (`DayQueueRow`,
  `OverdueTaskRow`, `StatCard`/equivalente).
- **O quê:** KPI em Barlow Condensed/tabular, filas "Hoje"/"Atrasados" com régua fina, ponto "ao
  vivo" com glow nas publicações não lidas (o único glow desta tela).

## P4 · Publicações

- **Onde:** `app/(app)/publicacoes/page.tsx` e componentes de card de publicação.
- **O quê:** agrupamento por processo, filete por fonte (DJEN/DATAJUD/PJe) com as cores já
  existentes, rótulo condensado, réguas finas entre linhas.

## P5 · Processo judicial aberto

- **Onde:** `app/(app)/processos/[id]/page.tsx` + a barra de abas (rótulos reais: Visão Geral,
  Atividades, Comentários, Financeiro, Publicações, Anexos, Protocolos, Vigilância, Anotações
  pessoais).
- **O quê:** barra de abas estilo editor (réguas finas entre abas, sublinhado bordô na ativa);
  Visão Geral nos 3 painéis fixos já existentes, só reestilizados. Maior volume de arquivo tocado
  do roteiro — inclui `ProtocolosTab.tsx` e os componentes de cada aba existente.
- **Critério de aceite:** as 9 abas continuam funcionando (nenhuma lógica de `searchParams.tab`
  muda, só o estilo); nenhuma aba fora do escopo perde conteúdo — só não ganha o retoque visual
  ainda (mesma régua do item 4 das "descobertas técnicas").

---

## Ordem de execução recomendada

**P1 → P2 → P3 → P4 → P5**, um PR por item, gate técnico do `CLAUDE.md` em cada um (P1 é o único
que também toca `DESIGN.md`, no mesmo PR).

Trilha independente, pode intercalar: **dinamismo do site** (`plano-dinamismo/roteiro-dinamismo.md`,
D1–D8, já aprovado) — ordem já registrada lá (D7→D2→D8→D6→D5→D3→D4→D1). As duas trilhas não
compartilham arquivo nenhum (uma é `app/page.tsx`, a outra é `app/(app)/*`), então não há risco de
conflito em mexer nas duas na mesma sessão.
