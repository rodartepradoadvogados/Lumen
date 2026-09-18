---
target: SaaS Portal (app/(app)/*)
total_score: 11
max_score: 20
p0_count: 3
p1_count: 4
p2_count: 8
p3_count: 3
timestamp: 2026-09-15T23:50:00Z
slug: app-(app)
---

# Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | `--tx-3` 2.6:1 fail; focus rings missing 40%; rail collapsed no labels |
| 2 | Performance | 2 | No skeletons on 500–5000 row tables; no virtualization; bundle not analyzed |
| 3 | Responsive Design | 1 | <768px: rail overlay but content doesn't reflow; tables overflow no scroll hint |
| 4 | Theming | 2 | 6 undocumented colors; 5px radius shadow system in financeiro; Portal Noturno partial |
| 5 | Implementation Integrity | 2 | 77 detector hits across 24 files; financeiro shadow design system |
| **Total** | | **11/20** | **Poor** |

# Implementation Integrity Verdict

**FAIL** — Financeiro module (5 screens) operates a parallel design system (5px radius, 0.8rem font). 77 detector findings across 24 files indicate systemic drift, not isolated bugs. Portal Noturno 2px radius only on 60% of modules.

# Executive Summary

- **Audit Health Score: 11/20 (Poor)**
- **Total issues: 18** (P0: 3, P1: 4, P2: 8, P3: 3)
- **Top 3 critical:**
  1. Systemic type ramp violation — 68 instances, 13 sizes vs 5 defined (P0)
  2. Financeiro shadow design system — 5px radius, 12.8px font on 5 screens (P0)
  3. No loading/empty/error states on data-heavy screens (P0)
- **Recommended next steps:** `typeset`, `layout`, `colorize`, `harden`, `extract`, `polish`

# Detailed Findings by Severity

**[P0] Systemic type ramp violation — 68 instances, 24 files, 13 sizes (9–34px)**
- Location: Portal-wide (alertas, assessoria, atendimento, conexoes, configuracoes, financeiro, painel, processos, produtividade, publicacoes, relatorios)
- Category: Theming / Implementation Integrity
- Impact: Cognitive load (13 sizes to decode); trust signal "not designed"
- Recommendation: Map all to DESIGN.md 5 tokens; add `text-caption` (11px) officially if dense tables need it
- Suggested command: `/impeccable typeset`

**[P0] Financeiro shadow design system — 5 screens, 5px radius, 12.8px font**
- Location: `app/(app)/financeiro/{dre,fluxo-de-caixa,livro-caixa,receitas,despesas}/page.tsx`
- Category: Implementation Integrity
- Impact: 20% of portal uses different radius + font size; tokens ignored
- Recommendation: Migrate to `rounded-lg` (10px) + `text-body`/`text-label`; or add dense tokens to DESIGN.md
- Suggested command: `/impeccable layout` + `/impeccable typeset`

**[P0] Zero loading/empty/error states on high-latency screens**
- Location: `/financeiro/dre`, `/processos`, `/publicacoes`, `/assessoria`, `/relatorios`
- Category: Accessibility / Implementation Integrity
- Impact: User sees blank panel 2–5s; assumes broken; refreshes
- Recommendation: `TableSkeleton` (3–5 rows), `EmptyState` (illustrated + action), `ErrorState` (retry + support)
- Suggested command: `/impeccable harden` + `/impeccable onboard`

**[P1] Side-tab slop: `border-l-4` on 3 screens (AI-generated tell)**
- Location: `conexoes/page.tsx:89`, `perfil/page.tsx:16`, `relatorios/personalizado/imprimir/page.tsx:123`
- Category: Implementation Integrity
- Recommendation: Replace with `border-t-2` in `--regua-forte` or category accent
- Suggested command: `/impeccable colorize`

**[P1] Border-accent-on-rounded: accent top-rule on rounded card**
- Location: `painel/page.tsx:382`, `relatorios/page.tsx:594`
- Category: Layout
- Recommendation: Accent rule cards → `rounded-t-lg` only (bottom square)
- Suggested command: `/impeccable layout`

**[P1] 6 undocumented colors leak (#94a3b8, #0f1f3d, #17325c, #c9cdd3, #c9962f, rgba(0,0,0,.12))**
- Location: `configuracoes/page.tsx`, `contatos/equipe/page.tsx`, `relatorios/personalizado/imprimir/page.tsx`
- Category: Theming
- Recommendation: Audit each; map to DESIGN.md tokens or add with named role
- Suggested command: `/impeccable colorize`

**[P1] No breadcrumbs on deep routes (3+ levels)**
- Location: `/processos/[id]/anexos/novo`, `/assessoria/[id]/pareceres/nova`, `/financeiro/contas-a-pagar`
- Category: Accessibility / Layout
- Recommendation: `Breadcrumb` component in `LumenPanel` above `PageHeader`
- Suggested command: `/impeccable clarify` + `/impeccable layout`

**[P2] Portal Noturno 2px radius only 60% applied — 40% modules still 10px**
- Location: Modules not yet migrated per `.impeccable/plano-portal/roteiro-portal.md`
- Category: Theming
- Recommendation: Complete migration or document intentional "legacy radius" zone
- Suggested command: `/impeccable layout`

**[P2] Rail collapsed (56px) — icon only, no aria-label**
- Location: `components/LumenNavRail.tsx`
- Category: Accessibility
- Recommendation: Add `aria-label` to each `NavItem`; tooltip on hover
- Suggested command: `/impeccable harden`

**[P2] EntityPicker "Entidade" label — ambiguous for lawyer**
- Location: `components/ui/EntityPicker.tsx`, used in financeiro/contatos/processos
- Category: Implementation Integrity
- Recommendation: Dynamic label per context: "Fornecedor", "Cliente", "Categoria", "Centro de Custo"
- Suggested command: `/impeccable clarify`

**[P2] Mobile responsive broken — tables overflow, no scroll shadow**
- Location: All table-heavy screens (<768px)
- Category: Responsive Design
- Recommendation: `overflow-x-auto` + scroll gradient hint; or card layout on mobile
- Suggested command: `/impeccable adapt`

**[P2] No bulk actions on any list (processos, publicacoes, financeiro, assessoria)**
- Location: All list pages
- Category: Implementation Integrity
- Recommendation: Checkbox column + bulk action bar (arquivar, delegar, exportar)
- Suggested command: `/impeccable bolder` + `/impeccable onboard`

**[P2] Draft autosave missing on all forms (processo novo, despesa, honorario, parecer)**
- Location: All create/edit forms
- Category: Implementation Integrity
- Recommendation: `useAutoSave` hook + localStorage + server sync on blur
- Suggested command: `/impeccable harden`

**[P2] Print stylesheet (relatorios/personalizado/imprimir) diverged completely**
- Location: `app/(app)/relatorios/personalizado/imprimir/page.tsx`
- Category: Theming
- Recommendation: Create `@media print` token layer in DESIGN.md; share with screen tokens
- Suggested command: `/impeccable extract` + `/impeccable colorize`

**[P3] Stat cards on `/painel` use 30px/34px — DESIGN.md has 24px display**
- Location: `app/(app)/painel/page.tsx:197,270`
- Category: Theming
- Recommendation: Use `text-display` or extend ramp officially
- Suggested command: `/impeccable typeset`

**[P3] Configuracoes mixes `--sf-apoio` with raw `#94a3b8` in same file**
- Location: `app/(app)/configuracoes/page.tsx:227`
- Category: Theming
- Recommendation: Token audit pass
- Suggested command: `/impeccable colorize`

**[P3] Processos/novo modal uses 5px radius — DESIGN.md says 10px for modals**
- Location: `app/(app)/processos/novo/page.tsx:217`
- Category: Layout
- Recommendation: `rounded-lg` (10px)
- Suggested command: `/impeccable layout`

# Patterns & Systemic Issues

- **Type ramp anarchy:** 13 sizes across portal — each module invents its own
- **Financeiro = separate design system:** 5 screens, consistent wrong tokens
- **Portal Noturno partial:** 2px radius via descendant selector only covers migrated components
- **Theme isolation working but fragmenting:** 4 independent mechanisms, no shared token layer

# Positive Findings

- `LumenPanel` wrapper: enforces top-rule, padding, theme switching — the one systemic component
- `portalTheme.ts`: independent mechanism correctly isolated
- `EntityPicker` blue: deliberate differentiation works, users recognize pattern
- `MobilePublicationCard` (shared): progressive disclosure pattern worth cloning
- OfficeId isolation: zero data bleed in multi-tenant — architectural win

# Recommended Actions

1. **[P0] `/impeccable typeset`**: Consolidate 13 sizes → 5 tokens (+ caption); fix financeiro 0.8rem
2. **[P0] `/impeccable layout`**: Migrate financeiro to 10px radius; fix border-accent-on-rounded; complete Portal Noturno 2px
3. **[P0] `/impeccable harden`**: Add TableSkeleton, EmptyState, ErrorState to all data screens
4. **[P1] `/impeccable colorize`**: Kill 6 undocumented colors; fix side-tab slop; map vinho misuse
5. **[P1] `/impeccable clarify`**: Breadcrumbs; EntityPicker dynamic labels; "recomendado" patterns
6. **[P1] `/impeccable adapt`**: Mobile table reflow; rail aria-labels; touch targets 44px
7. **[P2] `/impeccable extract`**: Shared tokens package; print stylesheet tokens; Component patterns
8. **[P2] `/impeccable onboard`**: Draft autosave; first-run flow; progressive disclosure
9. **[P2] `/impeccable bolder`**: Bulk actions; keyboard shortcuts; power-user paths
10. **[P3] `/impeccable document`**: Refresh design.json sidecar
11. **[P3] `/impeccable polish`**: Final comp-diff, finish review