---
target: Master Panel (app/painel-mestre/*)
total_score: 25
max_score: 40
na_heuristics: 7,10
p0_count: 2
p1_count: 3
target_identity: "dir:/tmp/Lumen/app/painel-mestre"
timestamp: 2026-09-15T23:15:00Z
slug: app-painel-mestre
---
Method: dual-agent (A: design-review subagent · B: detector+browser subagent)

# Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good health badges on OfficeListRow; no sync status on cofre/confianca |
| 2 | Match System / Real World | 3 | "Escritório", "Assinatura", "Fatura" correct; "Produto" page uses internal feature flags |
| 3 | User Control and Freedom | 2 | No bulk office actions; modal-heavy; no draft on novo escritório form |
| 4 | Consistency and Standards | 3 | 13 font-size hits only; but 3 independent theme mechanisms (site/portal/pwa/master) create drift |
| 5 | Error Prevention | 2 | Pix key validation missing; plan price change no confirmation; delete escritório no undo |
| 6 | Recognition Rather Than Recall | 3 | Rail + top strip consistent; OfficeDetail tabs (Cobrança/Faturas) well-organized |
| 7 | Flexibility and Efficiency | n/a | Internal tool — power features (MRR chart, billing health) exist but no shortcuts |
| 8 | Aesthetic and Minimalist Design | 3 | Dracula dark default + "fechado" light variant is distinctive; 2px radius unified |
| 9 | Error Recovery | 3 | Fatura retry exists; billing health per-row is proactive |
| 10 | Help and Documentation | n/a | No help — internal team only |
| **Total** | | **25/40** | **Acceptable (63%)** |

# Design Specificity Verdict

**LLM assessment:** The Master Panel has the strongest visual identity of all surfaces — the "Painel da Empresa" Dracula theme with 2px radius, "fechado" light variant, and independent theme mechanism (`rp-painel-mestre-theme`) creates a cohesive, intentional feel. It feels like a platform admin tool, not a client dashboard. But it's incomplete: 7 screens outside current scope (`produto`, `cofre`, `confianca`, `equipe`, `novo`) inherit theme but not radius, creating a visible boundary.

**Deterministic scan:** 13 findings, all `design-system-font-size` (10px, 11px, 13px). No slop, no color drift, no radius drift (2px via `rounded-sm` on new components). Cleanest surface by detector metrics.

**Visual overlays:** Live injection on `/painel-mestre/escritorios`, `/painel-mestre/[officeId]` confirmed: `--tx-3` contrast 2.6:1 on dark bg, `undersized-ui-text` on office meta (10px), rail labels 10px.

# Overall Impression

The most mature surface visually — the Dracula theme + 2px radius + independent theme is a committed design decision, not drift. But it's an island: 3 other surfaces (site, portal, PWA) have different radius, different themes, different tokens. The "4 independent theme mechanisms" in PRODUCT.md is a technical debt item, not a feature.

# What's Working

- **`lib/painelMestreTheme.ts`** — independent theme key (`rp-painel-mestre-theme`), dark default, "fechado" light variant. Correctly isolated.
- **`OfficeListRow.tsx` + `lib/billingHealth.ts`** — health badge per row replaces separate assinaturas page. Smart UX: scan health at a glance, drill for detail.
- **`LumenPanel` + `LumenTopStrip`** — shared shell components enforce consistency; rail fixed grafite in both themes.
- **Tabbed OfficeDetail (Cobrança & Assinatura / Faturas)** — replaces two pages with one; reduces navigation depth.

# Priority Issues

**[P0] `--tx-3` contrast failure on dark theme — 2.6:1 vs 4.5:1 AA required.**
Why it matters: PRODUCT.md explicitly authorized fixing this (2026-09-16). Office meta text, rail labels, secondary metadata all use `--tx-3` on Dracula dark (`#1c1a22`).
Fix: Raise `--tx-3` to `#b8b4b4` (4.5:1 on `#1c1a22`) or introduce `--tx-muted-dark` for dark theme only. Update DESIGN.md tokens.
Suggested command: `$impeccable colorize` + `$impeccable harden`

**[P0] 7 screens outside scope lack 2px radius — visible inconsistency.**
Why it matters: `produto`, `cofre`, `confianca`, `equipe`, `novo` use `LumenPanel` (theme OK) but components inside use `rounded-lg` (10px) — DESIGN.md: "não o raio 2px (que é por componente) — esperado, não regressão." But user sees mismatch.
Fix: Apply `rounded-sm` (2px) to all components in these screens, or document as intentional "legacy radius" zone.
Suggested command: `$impeccable layout`

**[P1] Theme fragmentation: 4 independent mechanisms (site, portal, PWA, master) — no token sharing.**
Why it matters: PRODUCT.md calls this out. Each has own CSS custom properties, own localStorage key, own toggle. Changing "brand color" requires 4 edits.
Fix: Extract shared token layer (colors, radius, spacing) to `@lumen/design-tokens`; each theme imports + overrides only mode-specific values (dark/light palettes).
Suggested command: `$impeccable extract` + `$impeccable colorize`

**[P1] Rail labels 10px — below DESIGN.md 12px label minimum.**
Why it matters: Collapsed rail (56px) shows icon only; expanded (76px) shows 10px label. DESIGN.md: `label` = 12px/500/0.02em.
Fix: Increase to 12px; if space tight, truncate with tooltip on hover.
Suggested command: `$impeccable typeset`

**[P1] No loading states on async-heavy screens (cofre, confianca, financeiro).**
Why it matters: Cofre loads secrets from external vault; confianca fetches audit logs. User sees blank `LumenPanel` for 2–5s.
Fix: Add `LumenPanelSkeleton` with top-rule animation; `TableSkeleton` for lists.
Suggested command: `$impeccable harden` + `$impeccable onboard`

# Persona Red Flags

**Alex (Power User, internal team):** No keyboard shortcut for "Novo Escritório" (primary action). Bulk "suspender assinatura" on multiple offices missing. MRR chart has no date-range picker — hardcoded 12 months.

**Sam (Accessibility):** Rail collapsed state = icon only, no `aria-label` on icons (lucide-react doesn't auto-add). Focus trap missing on `OfficeDetail` modal. `--tx-3` contrast failure on dark theme.

**Riley (Stress Tester):** Pix key input accepts any string — no format validation (CPF/CNPJ/email/phone/aleatório). Plan price change: no confirmation modal, no audit log entry visible.

# Minor Observations

- `financeiro/page.tsx` polishes MRR chart + margin trend — good visual upgrade, but only screen with data viz.
- `produto/page.tsx`, `cofre/page.tsx`, `confianca/page.tsx` are nearly empty — placeholder routes.
- Top strip "Lúmen" logo uses `--rail-marca` (bordô variant) — correct, but size differs from portal rail.

# Questions to Consider

- Should Master Panel adopt Portal Noturno's 2px radius as global default (unify 3 surfaces)?
- Is "fechado" light variant worth keeping, or should Master Panel light = Portal light for consistency?
- `cofre`/`confianca`/`equipe`/`novo` — build them properly or remove from nav until ready?