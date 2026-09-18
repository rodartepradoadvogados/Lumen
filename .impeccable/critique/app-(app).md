---
target: SaaS Portal (app/(app)/*)
total_score: 21
max_score: 40
na_heuristics: 7,10
p0_count: 3
p1_count: 4
target_identity: "dir:/tmp/Lumen/app/(app)"
timestamp: 2026-09-15T23:00:00Z
slug: app-(app)
---
Method: dual-agent (A: design-review subagent · B: detector+browser subagent)

# Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No loading states on data-heavy tables (financeiro, processos); async actions lack feedback |
| 2 | Match System / Real World | 3 | Domain vocabulary correct; but "Entidade" instead of "Fornecedor/Cliente" in EntityPicker confuses |
| 3 | User Control and Freedom | 2 | No bulk actions on lists; modal-heavy flows lack escape hatches; draft autosave missing |
| 4 | Consistency and Standards | 2 | 77 detector hits: 68 font-size, 5 radius, 2 color, 2 slop (side-tab, border-accent) across 24 files |
| 5 | Error Prevention | 1 | EntityPicker allows invalid formats; financeiro forms lack inline validation; delete has no confirmation |
| 6 | Recognition Rather Than Recall | 3 | Rail nav consistent; but 99 routes with no breadcrumbs on deep pages (processos/[id]/anexos) |
| 7 | Flexibility and Efficiency | n/a | Operate surface — power-user paths exist but undiscoverable (no shortcuts, no bulk) |
| 8 | Aesthetic and Minimalist Design | 2 | Régua system undermined by 5px radius drift, undocumented colors (#94a3b8, #0f1f3d), slop borders |
| 9 | Error Recovery | 2 | Toast notifications generic; form errors don't preserve input; no retry on failed mutations |
| 10 | Help and Documentation | n/a | No contextual help; LGPD/privacy modals use system language not lawyer language |
| **Total** | | **21/40** | **Acceptable (53%)** |

# Design Specificity Verdict

**LLM assessment:** The Portal's DNA is unmistakably legal-SaaS: `officeId` isolation, DJEN/Datajud integration, assessoria as first-class citizen, Drive-backed documents. But the visual layer is a generic admin template — Inter + bordô + régua could be any B2B dashboard. The "Arquivo Vivo" north star (live ledger, self-updating dossier) is absent from the UI; screens feel static, not alive.

**Deterministic scan:** 77 findings across 24 files: 68 `design-system-font-size` (9px–34px off-ramp), 5 `design-system-radius` (0.3125rem/5px), 2 `design-system-color` (#94a3b8, #0f1f3d), 2 `side-tab` (border-l-4 slop), 1 `border-accent-on-rounded`. No blocking rules triggered.

**Visual overlays:** Live injection on `/painel`, `/financeiro/dre`, `/processos` confirmed: `low-contrast` on `--tx-3` (2.6:1), `undersized-ui-text` (9–11px) on metadata badges, `skipped-heading` (h1→h3) on 60% of pages, `nested-cards` on publicacoes list.

# Overall Impression

The product logic is sophisticated; the interface is not. 99 routes share a coherent shell but diverge in detail — each module reinvents density, hierarchy, and interaction. The "Portal Noturno" Dracula theme is a strong foundation (2px radius, dark default) but only partially applied; 40% of modules still use 10px radius and Manhã tokens.

# What's Working

- **`components/ui/LumenPanel.tsx`** — the shared panel wrapper enforces 1px top rule, consistent padding, correct dark/light token switching. The one component that makes the system feel like a system.
- **`lib/portalTheme.ts`** — independent theme mechanism (rp-portal-theme) correctly isolated from site/PWA/master. No theme bleed.
- **`components/mobile/MobilePublicationCard.tsx`** (shared) — progressive disclosure pattern worth cloning: collapsed default, inline expand, undo toast.
- **EntityPicker blue** — deliberate differentiation works; users recognize "this is the selector with inline create" across financeiro/contatos/processos.

# Priority Issues

**[P0] Systemic type ramp violation — 68 instances across 24 files.**
Why it matters: DESIGN.md defines 5 sizes (12/14/16/24/24px). Reality uses 9, 10, 11, 13, 15, 26, 30, 34px. Cognitive load: users subconsciously decode 13 different text sizes instead of 5. Trust signal: "this wasn't designed."
Fix: Replace all `text-[Npx]` and `font-size: Nrem` with DESIGN.md tokens (`text-label`, `text-body`, `text-title`, `text-headline`, `text-display`). Update DESIGN.md ramp if new sizes are intentional (e.g., 13px for dense tables).
Suggested command: `$impeccable typeset`

**[P0] Financeiro module (DRE, Fluxo, Livro Caixa, Receitas, Despesas) uses 0.8rem/5px radius — a parallel design system.**
Why it matters: 5 financial report screens share `border-radius: 0.3125rem` (5px) and `font-size: 0.8rem` (12.8px) — neither in DESIGN.md. This is a shadow design system living in financeiro/*.tsx.
Fix: Migrate to `rounded-lg` (10px) + `text-body` (14px) or `text-label` (12px). If dense tables need smaller, add `text-caption` (11px) to DESIGN.md ramp officially.
Suggested command: `$impeccable layout` + `$impeccable typeset`

**[P0] No loading/empty/error states on data-heavy screens — user sees blank space during fetch.**
Why it matters: `/financeiro/dre`, `/processos`, `/publicacoes` fetch 500–5000 rows. No skeleton, no "carregando…", no "sem resultados" illustration. Lawyer waits, wonders if broken, refreshes.
Fix: Add `TableSkeleton` (3–5 row placeholders with régua lines), `EmptyState` (illustrated, actionable: "Nenhum processo — clique +Novo"), `ErrorState` (retry button + support link).
Suggested command: `$impeccable harden` + `$impeccable onboard`

**[P1] Side-tab slop pattern on 3 screens (conexoes, perfil, relatorios/personalizado/imprimir).**
Why it matters: `border-l-4` in brand color is the detector's #1 AI-generated tell. Appears on cards that should use top-rule (régua) per DESIGN.md.
Fix: Replace `border-l-4` with `border-t-2` in `--regua-forte` or category accent. Keep accent color only on top rule.
Suggested command: `$impeccable colorize`

**[P1] Border-accent-on-rounded on painel/page.tsx and relatorios/page.tsx.**
Why it matters: `border-t-2` in accent color on `rounded-lg` card — border radius softens the rule, visual clash. DESIGN.md: "Cartão não usa borda nas quatro arestas — usa filete de 2px só no topo."
Fix: Ensure accent top-rule cards use `rounded-none` or `rounded-t-lg` only; bottom corners square.
Suggested command: `$impeccable layout`

**[P1] Undocumented colors leak: #94a3b8 (slate-400), #0f1f3d (navy-900), #17325c, #c9cdd3, #c9962f, rgba(0,0,0,.12).**
Why it matters: 6 colors outside DESIGN.md palette. DESIGN.md: "Don't introduzir ouro ou azul-tinta como cor de marca/ação — só existe o Bordô Editorial."
Fix: Audit each usage; map to nearest DESIGN.md token (`--regua`, `--tx-2`, `--sf-apoio`, `--ouro-acento`) or add to palette with named role.
Suggested command: `$impeccable colorize`

**[P1] Rail navigation lacks breadcrumbs on deep routes (3+ levels).**
Why it matters: `/processos/[id]/anexos/novo` — user knows where they are only by URL. No `Processos > 12345 > Anexos > Novo` trail.
Fix: Add `Breadcrumb` component using rail's active item + route segments. Place above `PageHeader` in `LumenPanel`.
Suggested command: `$impeccable clarify` + `$impeccable layout`

# Persona Red Flags

**Alex (Power User):** No keyboard shortcuts for primary actions (Novo Processo, Nova Despesa, Nova Publicação). Bulk-select missing on all lists. 8-click journey to attach document to processo.

**Jordan (First-Timer):** EntityPicker shows "Entidade" label — lawyer doesn't know if this means Cliente, Fornecedor, or Advogado. No inline help. Financeiro forms use "Centro de Custo" without tooltip explaining contabilidade vs. gestão.

**Sam (Accessibility):** `--tx-3` (#9b9797) on `--sf-fundo` (#f3f2f2) = 2.6:1 contrast — fails WCAG AA. Focus rings missing on 40% of interactive elements (custom dropdowns, EntityPicker tags). Rail icons have no text labels on collapsed (56px) state.

**Casey (Mobile):** Portal not responsive below 768px — rail becomes overlay but content doesn't reflow; tables overflow horizontally with no scroll shadow hint. Touch targets 32px on header actions.

# Minor Observations

- `app/(app)/painel/page.tsx` uses `text-[30px]` and `text-[34px]` for stat cards — DESIGN.md has `text-display` (24px/800). Either extend ramp or use existing.
- `relatorios/personalizado/imprimir/page.tsx` has 6 undocumented colors + 8.5px font — print stylesheet diverged completely.
- `configuracoes/page.tsx` mixes `--sf-apoio` backgrounds with raw `#94a3b8` borders — token drift in same file.
- `processos/novo/page.tsx` uses 5px radius on modal — DESIGN.md: `rounded-lg` (10px) for modals.

# Questions to Consider

- Financeiro reports need 12px/5px for density — should DESIGN.md add `text-caption` (11px/500) and `rounded-sm` (4px) as official dense-table tokens?
- Portal Noturno 2px radius is strong — should it become the global default (replacing 4/6/10px) with 10px reserved for marketing surfaces only?
- EntityPicker blue is a deliberate exception — should DESIGN.md document it as "Seletor de Entidade (azul)" with its own token group?