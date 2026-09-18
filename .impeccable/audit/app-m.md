---
target: Mobile PWA (app/m/*)
total_score: 12
max_score: 20
p0_count: 2
p1_count: 3
p2_count: 5
p3_count: 4
timestamp: 2026-09-15T23:55:00Z
slug: app-m
---

# Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | Touch targets 32px/36px (need 44px); 121 font-size hits 9–11px; no offline state |
| 2 | Performance | 2 | No lazy loading on publication images; bundle includes full desktop financeiro |
| 3 | Responsive Design | 2 | 5-tab shell correct; but 3 screens (relatorios/config/contatos) should be removed per spec |
| 4 | Theming | 2 | 130 font-size hits; 8 radius hits; side-tab slop on publicacoes |
| 5 | Implementation Integrity | 2 | Spec says 5 screens + 3-field attendance; reality: full desktop complexity in PWA |
| **Total** | | **12/20** | **Poor** |

# Implementation Integrity Verdict

**FAIL** — The PWA spec (`08-pwa.md`) explicitly calls for 5 screens and a 3-field attendance form with dictation. Reality: `/m/financeiro` is a 6-link hub (spec says remove), `/m/atendimento/novo` is 10+ fields (spec says 3), `relatorios/configuracoes/contatos` fully reachable (spec says remove). Code comments admit "deliberate owner decision" but nav chrome was updated as if leaner shell shipped.

# Executive Summary

- **Audit Health Score: 12/20 (Poor)**
- **Total issues: 14** (P0: 2, P1: 3, P2: 5, P3: 4)
- **Top 3 critical:**
  1. `/m/financeiro` is the sprawling hub spec explicitly says to remove (P0)
  2. Attendance form is 10+ fields, no dictation — spec's "reason PWA exists" (P0)
  3. Systemic touch-target violations against spec's own 44px minimum (P1)
- **Recommended next steps:** `distill`, `harden`, `typeset`, `adapt`, `clarify`, `polish`

# Detailed Findings by Severity

**[P0] `/m/financeiro` = 6-sub-route hub (spec: "peso morto", acceptance: 3-number summary)**
- Location: `app/m/financeiro/page.tsx`, `app/m/financeiro/menu/page.tsx`
- Category: Implementation Integrity
- Impact: Primary "R$" tab reproduces exact problem redesign exists to fix
- Recommendation: Build 3-number summary (caixa saldo, vencendo hoje, atrasadas) as landing; 6 sub-routes one "ver detalhes" tap away
- Suggested command: `/impeccable distill`

**[P0] Attendance form = 10+ fields, no dictation (spec: 3 fields + mic, "tela que justifica o PWA")**
- Location: `components/mobile/MobileNewAttendanceForm.tsx`, `app/m/atendimento/novo/page.tsx`
- Category: Implementation Integrity
- Impact: Lawyer in courthouse hallway cannot log lead in seconds
- Recommendation: Default view = Nome + Telefone (mic) + Assunto (mic) + Salvar; fee/pendências/anexos behind "mais detalhes"
- Suggested command: `/impeccable distill`

**[P1] Touch targets violate spec's 44px: agenda arrows 36px, header icons 32px**
- Location: `app/m/agenda/page.tsx` (paging), `components/mobile/MobileBottomNav.tsx` (bell/menu)
- Category: Accessibility / Responsive Design
- Impact: One-handed courthouse use — miss taps, frustration
- Recommendation: `h-11 w-11` (44px) minimum; keep glyph visually same
- Suggested command: `/impeccable harden`

**[P1] Body text 9–11px systemic (121 hits) — spec floor is 13px**
- Location: PWA-wide (bottom-nav labels 10px, "99+" badge 9px, office name 10px, metadata 11px)
- Category: Theming / Accessibility
- Impact: Glare conditions + thumb scrolling = unreadable
- Recommendation: Floor 13px for info-carrying text; smaller only for pure decoration
- Suggested command: `/impeccable typeset`

**[P1] Decision points exceed 4-option cognitive limit: "+" sheet 9 options, pendency checklist 6**
- Location: `components/mobile/MobileNewEntitySheet.tsx` (9 options), attendance pendency checklist (6)
- Category: Implementation Integrity
- Impact: Slower, error-prone selection where speed matters most
- Recommendation: Promote "Atendimento" to large first tile; collapse pendency behind toggle
- Suggested command: `/impeccable clarify`

**[P2] 3 screens should not exist per spec: relatorios, configuracoes, contatos**
- Location: `app/m/relatorios`, `app/m/configuracoes`, `app/m/contatos` — all fully rendered
- Category: Implementation Integrity
- Recommendation: Remove routes or guard behind avatar menu; update `08-pwa.md` to match reality
- Suggested command: `/impeccable distill`

**[P2] Publications undo-toast adds 1.5s dead time per item in triage queue**
- Location: `components/mobile/MobilePublicationCard.tsx`
- Category: Performance
- Recommendation: Batch undo (queue 5, single toast) or instant with swipe-undo
- Suggested command: `/impeccable optimize`

**[P2] No offline/sync state anywhere — PWA but no service worker strategy visible**
- Location: `app/m/layout.tsx`, `public/sw.js` (if exists)
- Category: Accessibility / Performance
- Recommendation: Add `SyncStatus` indicator; cache last 50 publications; background sync on reconnect
- Suggested command: `/impeccable harden` + `/impeccable optimize`

**[P2] `MobileNewEntitySheet` grid-cols-4 for 5 items → last row single centered icon**
- Location: `components/mobile/MobileNewEntitySheet.tsx`
- Category: Layout
- Recommendation: `grid-cols-3` or `auto-fit minmax(80px)`; or promote primary to full-width
- Suggested command: `/impeccable layout`

**[P2] Dark-glow false positive (#ffba00 on body) — not in codebase**
- Location: Detector finding on `/m/financeiro`
- Category: Implementation Integrity
- Recommendation: Investigate browser extension interference; ignore if false
- Suggested command: `/impeccable polish`

**[P3] `app/m/layout.tsx` `<main>` no max-width — full-bleed on tablet/desktop resize**
- Location: `app/m/layout.tsx`
- Category: Responsive Design
- Recommendation: `max-w-screen-xl mx-auto` on main
- Suggested command: `/impeccable adapt`

**[P3] Financeiro contas-a-pagar → despesas redirect — good pattern, extend elsewhere**
- Location: `app/m/financeiro/contas-a-pagar/page.tsx`
- Category: Positive Finding
- Recommendation: Apply same redirect pattern to all renamed routes
- Suggested command: `/impeccable polish`

**[P3] Bottom nav shell correct: 76px bar, 2px top rule, 52px central "+" in brand color**
- Location: `components/mobile/MobileBottomNav.tsx`
- Category: Positive Finding
- Recommendation: Document as PWA shell pattern in DESIGN.md
- Suggested command: `/impeccable document`

**[P3] Agenda merges tasks + finance due-dates in one day view with left-border colors**
- Location: `app/m/agenda/page.tsx`
- Category: Positive Finding
- Recommendation: Clone pattern for portal dashboard "hoje" view
- Suggested command: `/impeccable extract`

**[P3] Icon→emoji on pending (bell, calendar) — owner-validated delight moment**
- Location: `app/m/layout.tsx` (bell), `components/mobile/MobileBottomNav.tsx` (calendar)
- Category: Positive Finding
- Recommendation: Document conditional emoji pattern in DESIGN.md Components
- Suggested command: `/impeccable delight` + `/impeccable document`

# Patterns & Systemic Issues

- **Spec vs reality gap:** Nav chrome updated for lean shell; 3/5 target screens not actually cut
- **Touch target systemic:** 32px/36px across shell — not one-off
- **Font size systemic:** 121 hits 9–11px — spec says 13px floor
- **Financeiro hub:** Most egregious spec violation — primary tab, full desktop complexity

# Positive Findings

- Bottom nav shell: faithful `08-pwa.md` implementation
- `MobilePublicationCard`: progressive disclosure done right
- `app/m/agenda`: merges domains intelligently
- Icon→emoji on pending: deliberate, validated, scoped

# Recommended Actions

1. **[P0] `/impeccable distill`**: `/m/financeiro` → 3-number summary; attendance → 3 fields + dictation
2. **[P0] `/impeccable harden`**: Touch targets 44px; offline/sync state; loading skeletons
3. **[P1] `/impeccable typeset`**: Floor 13px info text; reserve smaller for decoration only
4. **[P1] `/impeccable clarify`**: "+" sheet → promote primary; collapse pendency checklist
5. **[P1] `/impeccable adapt`**: Remove/guard relatorios/config/contatos; max-width on main
6. **[P2] `/impeccable optimize`**: Batch undo toast; lazy load images; bundle split PWA
7. **[P2] `/impeccable layout`**: EntitySheet grid fix; scroll shadows on tables
8. **[P3] `/impeccable document`**: PWA shell, PublicationCard, conditional emoji patterns
9. **[P3] `/impeccable polish`**: Final comp-diff, finish review