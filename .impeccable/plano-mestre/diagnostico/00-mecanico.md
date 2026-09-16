# F1 · Diagnóstico mecânico — detector do Impeccable

**Data:** 2026-09-16 · **Ferramenta:** `impeccable detect --json` (v0.1.5), rodado estaticamente sobre
o código-fonte, sem navegador e sem banco.

> ⚠️ **DEGRADED** — a skill pede, para um `critique` completo, detector **mais** navegador e
> inspeção visual. Este ambiente não alcança o banco Neon, então nenhuma tela renderiza com dado
> real aqui. O detector mecânico rodou integralmente (é estático); a inspeção visual continua
> pendente e **precisa ser feita na máquina do dono**. Isso está registrado como pendência em F8.

---

## 1. Volume por superfície

| Superfície | Achados | Arquivos | Advisory | Warning |
|---|---:|---:|---:|---:|
| PWA (`app/m`) | 178 | 39 | 178 | 0 |
| Portal (`app/(app)`) | 77 | 24 | 72 | 5 |
| Site público | 23 | 3 | 23 | 0 |
| Painel Mestre | 13 | 5 | 13 | 0 |
| Blog | 5 | 2 | 5 | 0 |
| **Subtotal `app/**`** | **296** | **73** | 291 | 5 |
| **`components/**`** (compartilhado) | **782** | **190** | 765 | 17 |
| **TOTAL** | **1.078** | **263** | 1.056 | 22 |

**Leitura:** só 22 achados são defeito agudo (`warning`). Os outros 1.056 são deriva de sistema. O
produto não está quebrado — está **incoerente**. Isso casa exatamente com a queixa do dono, que é de
desagrado, não de falha.

O peso está em `components/**` (782 de 1.078, 73%): o problema é **compartilhado**, não de uma tela.
É a prova de que a correção pertence à fundação (F3), não a 99 arquivos de rota.

---

## 2. O achado central: a escala tipográfica documentada é ficção

`design-system-font-size` responde por **1.003 dos 1.078 achados (93%)**.

**Rampa documentada no DESIGN.md:** 24 (Display/Headline) · 16 (Title) · 14 (Body) · 12 (Label).

**Rampa realmente usada no código:**

| Tamanho | Usos | |
|---:|---:|---|
| 11px | **422** | ███████████████████████████████████ |
| 13px | **376** | ███████████████████████████████ |
| 10px | **126** | ██████████ |
| 10.5px | 22 | █ |
| 9.5px | 21 | █ |
| 0.8rem (12,8px) | 9 | |
| 15px | 7 | |
| 9px | 5 | |
| 26px · 30px | 3 cada | |
| 8px · 8.5px · 19px | 2 cada | |
| 18px · 32px · 34px | 1 cada | |

**16 tamanhos distintos, 1.003 ocorrências, nenhum dos três mais usados existe na rampa documentada.**

Três conclusões que dirigem o redesign:

1. **O produto é tipograficamente minúsculo.** 11px é o tamanho modal de todo o sistema. Texto de
   10px ou menor aparece **156 vezes**. Para o usuário prioritário — o advogado dono, que não é
   necessariamente jovem e abre isso o dia todo — isso é desconforto estrutural, não questão de
   gosto.
2. **Não há hierarquia porque há 16 hierarquias.** Com 11px e 13px disputando 798 usos, a diferença
   entre "corpo" e "rótulo" virou ruído de 2px. Hierarquia por peso (regra do DESIGN.md) não resolve
   uma escala que não existe.
3. **A combinação com o contraste explica o "modo claro feio".** Texto de 10-11px no token `--tx-3`
   (~2,6:1, reprova WCAG AA) é ilegível no claro. Não é a cor do fundo que incomoda — é texto
   pequeno demais e claro demais ao mesmo tempo. **Autorizado corrigir** (decisão D-07).

---

## 3. Os 22 defeitos reais (`warning`)

Dois antipadrões, ambos em tensão direta com regras do próprio DESIGN.md:

**`side-tab` (filete lateral `border-l-4`) — 13 ocorrências**
`app/(app)/conexoes/page.tsx:89` · `app/(app)/perfil/page.tsx:16` ·
`app/(app)/relatorios/personalizado/imprimir/page.tsx:123` · `components/BreakGlassField.tsx:46,85` ·
`components/DayQueueRow.tsx:35` · `components/PublicationsTriage.tsx:405` ·
`components/TestDjenButton.tsx:33` · `components/comunicados/ComunicadosForm.tsx:127` ·
`components/comunicados/TemplateEditor.tsx:185` · `components/conexoes/ApiKeysManager.tsx:55` ·
`components/conexoes/ConexoesView.tsx:197,285`

**`border-accent-on-rounded` (filete de topo em elemento arredondado) — 9 ocorrências**
`app/(app)/painel/page.tsx:382` · `app/(app)/relatorios/page.tsx:594` ·
`components/AgendaView.tsx:387,483,553,630` · `components/GuiasBar.tsx:70` ·
`components/PendingListModal.tsx:50` · `components/ui.tsx:60`

⚠️ **Conflito a decidir em F2:** o DESIGN.md manda, como regra da casa, que "cartão usa filete só no
topo (`border-t-2`), nunca borda nas 4 arestas" e usa filete lateral de 3px para identificar seção.
O detector classifica exatamente esses dois padrões como antipadrão quando combinados com canto
arredondado. Como o mundo visual vai ser substituído, **a rodada de direção precisa resolver isso de
propósito** — manter o filete e abandonar o arredondamento, ou o contrário. Hoje o produto faz os
dois ao mesmo tempo, que é o caso que o detector acusa.

---

## 4. Cor e raio fora do sistema

**`design-system-color` — 20 ocorrências.** Cores que não existem em token nenhum, sobreviventes da
identidade anterior ao redesenho Modernist: `#0f1f3d` e `rgba(15,31,61,0.12)` (azul-marinho legado,
7 usos), `#c9962f` e `rgba(198,160,92,0.4)` (dourado legado, 6 usos), `#c9cdd3`, `#94a3b8`, `#17325c`,
`rgba(0,0,0,.12)`, `rgba(16,185,129,0.4)`.

**`design-system-radius` — 33 ocorrências.** `0.3125rem` (5px) aparece **22 vezes** — é exatamente a
dívida já registrada das seis classes de input duplicadas (`.fin-input`, `.cfg-input`, `.fp-input`,
`.pr-input`, `.doc-input`, `.lic-input`), cujo raio está fora da escala de 3 paradas (4/6/10px). Mais
`0.5rem` ×8, `2px` ×2, `8px` ×1.

Ambos são alvo direto do `extract` em F3.

---

## 5. O que isso determina para as próximas fases

| Achado | Vai para |
|---|---|
| Escala tipográfica inexistente (1.003 usos, 16 tamanhos) | **F2** decide a nova rampa · **F3** aplica em token |
| 73% dos achados em `components/**` | **F3** — a correção é de fundação, não de rota |
| Texto 10-11px + `--tx-3` reprovado | **F3**, com autorização D-07 |
| Filete × arredondamento em conflito | **F2** — decisão explícita da rodada de direção |
| 20 cores legadas órfãs | **F3** (`colorize`) |
| Raio 5px em 6 classes de input duplicadas | **F3** (`extract`) |
| Inspeção visual real | **F8**, na máquina do dono |

---

*Reprodutível com: `sh .claude/skills/impeccable/scripts/impeccable detect --json <alvo>`.*
