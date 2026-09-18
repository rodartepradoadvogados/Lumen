# LÚMEN — IMPECCABLE MASTER EXECUTION PLAN
## All 24 Commands Across 5 Surfaces | Progress Tracker for Any Future Agent

> **Created:** 2026-09-15 | **Project:** `/tmp/Lumen` (GitHub: rodartepradoadvogados/Lumen)  
> **Author:** Hermes Agent (impeccable skill) | **For:** Jairo Rodarte (Rodarte Prado Advogados)  
> **Status:** Phase 1 Complete (Diagnosis) → Phase 2 Ready (Foundation)

---

## 📋 PROJECT SNAPSHOT (Read This First)

| Item | Value |
|------|-------|
| **Product** | Lúmen — SaaS multi-tenant gestão jurídica (processos, financeiro, assessoria, publicações, blog, painel mestre) |
| **Platform** | Web (Next.js 14 App Router, Tailwind, Prisma/Neon, Vercel) |
| **Surfaces (5)** | 1. **Public Site** (`app/page.tsx`, `app/blog/*`) — Persuade<br>2. **SaaS Portal** (`app/(app)/*`) — Operate<br>3. **Mobile PWA** (`app/m/*`) — Operate<br>4. **Master Panel** (`app/painel-mestre/*`) — Operate<br>5. **Meeting Mode** (`app/reuniao/*`) — Read |
| **Scale** | 99 routes, ~98 sub-screens, ~60 modals/drawers, 4 print sheets |
| **Themes** | 4 independent: Site (Manhã/Noite), Portal (Noite default), PWA (Manhã default), Painel Mestre (Escuro default) |
| **PRODUCT.md** | ✅ Exists (2026-09-16) — comprehensive, authorized full redesign |
| **DESIGN.md** | ✅ Exists (Modernist + 4 documented exceptions) — tokens, rules, components |
| **.impeccable/design.json** | ⚠️ **STALE** — needs refresh via `document` |
| **Existing critiques** | ✅ Public Site (19/32), ✅ Mobile PWA (23/40) — both Acceptable |
| **Detector findings** | Font-size off-ramp (advisory, ~170+ hits all surfaces), 1 side-tab slop (warning) |

---

## 🎯 USER'S STATED PROBLEMS (The "Why")

> "O site não tem layout, hierarquia, navegabilidade, fonte de escrita, modo claro, animações, detalhes coloridos que me agradem"

**Translation to impeccable commands:**
| Complaint | Primary Command(s) |
|-----------|-------------------|
| No layout / hierarchy | `layout`, `typeset` |
| No navigability | `adapt`, `clarify`, `onboard` |
| Font doesn't please | `typeset` (replace Inter) |
| Light mode issues | `colorize`, `adapt` |
| No animations | `animate` |
| Color details displeasing | `colorize`, `bolder` |
| Wants "modelo mais sofisticado" | `overdrive`, `delight`, `bolder` |

---

## 🔄 EXECUTION PHASES (24 Commands in Logical Order)

### PHASE 1: DIAGNOSE — Complete Baseline Across All Surfaces ✅ **DONE**

| # | Command | Target | Status | Output Location |
|---|---------|--------|--------|-----------------|
| 1 | `init` | Project root | ✅ Done (2026-09-16) | `PRODUCT.md` |
| 2 | `document` | Project root | ✅ Done (stale sidecar) | `DESIGN.md`, `.impeccable/design.json` |
| 3 | `critique` | Public Site | ✅ Done (19/32) | `.impeccable/critique/app-page-tsx.md` |
| 4 | `critique` | Mobile PWA | ✅ Done (23/40) | `.impeccable/critique/app-m.md` |
| 5 | `critique` | **SaaS Portal** | ⬜ **TODO** | `.impeccable/critique/app-(app).md` |
| 6 | `critique` | **Master Panel** | ⬜ **TODO** | `.impeccable/critique/app-painel-mestre.md` |
| 7 | `critique` | **Meeting Mode** | ⬜ **TODO** | `.impeccable/critique/app-reuniao.md` |
| 8 | `audit` | **All 5 surfaces** | ⬜ **TODO** | `.impeccable/audit/*.md` |

> **Next Action:** Run `critique` on remaining 3 surfaces + `audit` on all 5.

---

### PHASE 2: FOUNDATION — Design System Integrity

| # | Command | Target | Purpose | Dependencies |
|---|---------|--------|---------|--------------|
| 9 | `document` | Project root | Refresh stale `.impeccable/design.json` sidecar with current DESIGN.md tokens, ramps, components | Phase 1 complete |
| 10 | `extract` | `components/`, `app/globals.css`, `tailwind.config.ts` | Pull reusable tokens → design system library | `document` refreshed |
| 11 | `typeset` | **All surfaces** | Replace Inter with sophisticated type pairing (serif display + UI sans); fix 170+ off-ramp sizes | `extract` done |
| 12 | `colorize` | **All surfaces** | Strategic color overhaul: new brand palette, semantic state colors, dark-mode harmony | `typeset` done |
| 13 | `layout` | **All surfaces** | Fix spacing rhythm, visual hierarchy, 4px baseline grid, container system | `colorize` done |

---

### PHASE 3: STRUCTURE & NAVIGATION — IA & UX Copy

| # | Command | Target | Purpose | Dependencies |
|---|---------|--------|---------|--------------|
| 14 | `adapt` | **All surfaces** | Responsive fixes: mobile nav (hamburger), touch targets ≥44px, breakpoint harmony | `layout` done |
| 15 | `clarify` | **All surfaces** | UX copy overhaul: labels, errors, empty states, "Substituir" → customer copy | `adapt` done |
| 16 | `onboard` | Portal, PWA, Master Panel | First-run flows, empty states, progressive disclosure for 99 routes | `clarify` done |

---

### PHASE 4: POLISH & ENHANCE — Craft Quality

| # | Command | Target | Purpose | Dependencies |
|---|---------|--------|---------|--------------|
| 17 | `animate` | **All surfaces** | Purposeful motion: 120-200ms, named reasons, reduced-motion respect | `onboard` done |
| 18 | `bolder` | Public Site, Portal | Amplify safe/bland: hero, pricing, dashboard density, data viz | `animate` done |
| 19 | `delight` | Public Site, Portal | Micro-interactions, branded illustrations, easter eggs, personality | `bolder` done |
| 20 | `distill` | Portal, PWA, Master Panel | Strip complexity: 3-field attendance, 3-number finance, single-tab config | `delight` done |
| 21 | `harden` | **All surfaces** | Production-ready: i18n, edge cases, error boundaries, WCAG AA | `distill` done |
| 22 | `polish` | **All surfaces** | Final quality pass: diff vs comps, micro-fixes, finish review | `harden` done |

---

### PHASE 5: ADVANCED — Push Past Conventional

| # | Command | Target | Purpose | Dependencies |
|---|---------|--------|---------|--------------|
| 23 | `overdrive` | Public Site, Portal | Break conventions: scale, structure, input model, state transitions | `polish` done |
| 24 | `optimize` | **All surfaces** | UI performance: bundle, render, animations, images | `overdrive` done |
| — | `live` + `generate` | Portal hero, pricing, dashboard | Browser iteration on key elements (continuous) | Any time after `layout` |
| — | `shape` | New features only | Pre-build UX planning (not for redesign) | As needed |

---

## 📊 PROGRESS TRACKER (Update This After Every Command)

### Surface-Level Progress

| Surface | Critique | Audit | Typeset | Colorize | Layout | Adapt | Clarify | Onboard | Animate | Bolder | Delight | Distill | Harden | Polish | Overdrive | Optimize |
|---------|----------|-------|---------|----------|--------|-------|---------|---------|---------|--------|---------|---------|--------|--------|-----------|----------|
| **Public Site** | ✅ 19/32 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | N/A | ⬜ | ⬜ | ⬜ | N/A | ⬜ | ⬜ | ⬜ | ⬜ |
| **Blog** | ✅ (w/ site) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | N/A | ⬜ | ⬜ | ⬜ | N/A | ⬜ | ⬜ | ⬜ | ⬜ |
| **SaaS Portal** | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Mobile PWA** | ✅ 23/40 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Master Panel** | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Meeting Mode** | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | N/A | ⬜ | N/A | N/A | N/A | ⬜ | ⬜ | N/A | ⬜ |

**Legend:** ✅ Done | ⬜ Not Started | 🔄 In Progress | ⚠️ Blocked

### Command-Level Progress (Global)

| Phase | Command | Status | Started | Completed | Notes |
|-------|---------|--------|---------|-----------|-------|
| 1 | init | ✅ | 2026-09-16 | 2026-09-16 | PRODUCT.md created |
| 1 | document | ✅ | 2026-09-11 | 2026-09-11 | DESIGN.md created; sidecar stale |
| 1 | critique (site) | ✅ | 2026-09-10 | 2026-09-10 | 19/32 Acceptable |
| 1 | critique (PWA) | ✅ | 2026-09-10 | 2026-09-10 | 23/40 Acceptable |
| 1 | critique (portal) | ⬜ | — | — | **NEXT** |
| 1 | critique (master) | ⬜ | — | — | |
| 1 | critique (meeting) | ⬜ | — | — | |
| 1 | audit (all) | ⬜ | — | — | |
| 2 | document (refresh) | ⬜ | — | — | Fix design.json |
| 2 | extract | ⬜ | — | — | |
| 2 | typeset | ⬜ | — | — | Replace Inter |
| 2 | colorize | ⬜ | — | — | New palette |
| 2 | layout | ⬜ | — | — | Rhythm, hierarchy |
| 3 | adapt | ⬜ | — | — | Mobile nav, touch |
| 3 | clarify | ⬜ | — | — | Copy, "Substituir" |
| 3 | onboard | ⬜ | — | — | First-run flows |
| 4 | animate | ⬜ | — | — | 120-200ms motion |
| 4 | bolder | ⬜ | — | — | Amplify |
| 4 | delight | ⬜ | — | — | Personality |
| 4 | distill | ⬜ | — | — | Reduce complexity |
| 4 | harden | ⬜ | — | — | WCAG AA, i18n |
| 4 | polish | ⬜ | — | — | Final diff |
| 5 | overdrive | ⬜ | — | — | Break conventions |
| 5 | optimize | ⬜ | — | — | Perf |

---

## 🛠️ HOW TO RUN EACH COMMAND (For Future Agents)

### Prerequisites (Run Once Per Session)
```bash
cd /tmp/Lumen
/root/.hermes/skills/creative/impeccable/scripts/impeccable context
# Loads PRODUCT.md, DESIGN.md, surface briefs, config
```

### Critique (Design Review + Detector)
```bash
# Assessment A: Design review (spawn subagent)
# Assessment B: Detector + browser (spawn subagent)
# Synthesize → persist → trend → ask user

# Example for SaaS Portal:
.impeccable critique "app/(app)"
# Or specific route:
.impeccable critique "app/(app)/financeiro/dre/page.tsx"
```

### Audit (Technical Quality)
```bash
.impeccable audit "app/(app)"
# Scores: A11y, Performance, Theming, Responsive, Implementation Integrity (0-4 each)
```

### Document (Refresh Sidecar)
```bash
.impeccable document
# Regenerates .impeccable/design.json from DESIGN.md
```

### Extract (Design System)
```bash
.impeccable extract "components/"
# Outputs tokens, components to design system
```

### Typeset (Typography)
```bash
.impeccable typeset "app/(app)"
# Loads typeset.md reference, follows its process
```

### Colorize (Color Strategy)
```bash
.impeccable colorize "app/(app)"
# Strategy: Restrained/Committed/Full/Drenched per surface
```

### Layout (Spacing & Hierarchy)
```bash
.impeccable layout "app/(app)"
# Fixes rhythm, grid, container, visual hierarchy
```

### Adapt (Responsive)
```bash
.impeccable adapt "app/(app)"
# Mobile-first, touch targets, breakpoints
```

### Clarify (UX Copy)
```bash
.impeccable clarify "app/(app)"
# Labels, errors, empty states, "Substituir" fix
```

### Onboard (First-Run)
```bash
.impeccable onboard "app/(app)"
# Empty states, activation, progressive disclosure
```

### Animate (Motion)
```bash
.impeccable animate "app/(app)"
# Orchestrated motion grammar, not scattered hovers
```

### Bolder (Amplify)
```bash
.impeccable bolder "app/page.tsx"
# Safe → bold: scale, saturation, structure
```

### Delight (Personality)
```bash
.impeccable delight "app/page.tsx"
# Micro-interactions, illustrations, easter eggs
```

### Distill (Simplify)
```bash
.impeccable distill "app/m/financeiro/page.tsx"
# Remove excess: visual noise, redundant content, nested structure
```

### Harden (Production)
```bash
.impeccable harden "app/(app)"
# Errors, i18n, edge cases, WCAG AA
```

### Polish (Final Pass)
```bash
.impeccable polish "app/(app)"
# Batched screenshot round, comp-diff, finish reviewer
```

### Overdrive (Beyond Convention)
```bash
.impeccable overdrive "app/page.tsx"
# Skip propose/ask; push scale/structure/motion/input model
```

### Optimize (Performance)
```bash
.impeccable optimize "app/(app)"
# Bundle, render, animation, image optimization
```

### Live + Generate (Iteration)
```bash
# Start dev server first: npm run dev
.impeccable live --target "app/(app)/financeiro/dre/page.tsx"
# Then in browser: select element → action (bolder, typeset, etc.) → generate 3 variants
```

---

## 🎯 GRILL-ME CHECKPOINTS (Critical Decisions)

Before running these commands, **confirm with user** (grill-me):

### 1. Typeface Replacement (typeset)
- [ ] **Display face:** Serif with POV (Fraunces, Playfair, Cormorant, Lora, Crimson, Newsreader, Syne)?
- [ ] **Body face:** UI sans (Inter-as-display, DM Sans, Outfit, Plus Jakarta, Instrument Sans)?
- [ ] **Mono/Label:** Space Mono, IBM Plex Mono, DM Mono?
- [ ] **Constraint:** Must support Portuguese diacritics, tabular-nums for finance

### 2. Color Strategy (colorize)
- [ ] **Public Site:** Persuade → Committed/Full/Drenched (bolder allowed)
- [ ] **Portal:** Operate → Restrained/Committed (task clarity > expression)
- [ ] **PWA:** Operate → Restrained (thumb zone, glare conditions)
- [ ] **Master Panel:** Operate → Restrained (internal tool density)
- [ ] **Keep Bordô Editorial (#8a2f42) as anchor?** Or full replacement?

### 3. Motion Grammar (animate)
- [ ] **Portal default:** 150ms ease-standard, cascade stagger for lists
- [ ] **PWA:** 120ms, clip-wipe for bottom sheet, scale-and-focus for "+" action
- [ ] **Reduced-motion:** Must preserve state change + hierarchy (no 0.01ms kill)

### 4. Scope Decisions
- [ ] **Distill targets:** Which screens get 3-field attendance / 3-number finance?
- [ ] **Overdrive targets:** Only Public Site + Portal hero/pricing? Or full dashboard?
- [ ] **Live iteration:** Run on dev server continuously or per-sprint?

---

## 📁 KEY FILES & PATHS (Reference)

```
Lumen/
├── PRODUCT.md                    # Product truth (source of truth)
├── DESIGN.md                     # Design system (tokens + prose)
├── .impeccable/
│   ├── config.json               # buildPath: "code"
│   ├── design.json               # ⚠️ STALE - refresh via document
│   ├── critique/                 # Critique snapshots
│   │   ├── app-page-tsx.md       # ✅ Public site (19/32)
│   │   ├── app-m.md              # ✅ Mobile PWA (23/40)
│   │   └── [future].md           # Portal, Master, Meeting
│   ├── audit/                    # Audit snapshots (to create)
│   ├── live/                     # Live session config
│   ├── plano-portal/             # Existing portal plan
│   ├── plano-painel-mestre/      # Existing master panel plan
│   ├── plano-pwa/                # Existing PWA plan
│   ├── plano-site-publico/       # Existing public site plan
│   └── plano-redesign/           # Discarded "pulso" proposal
├── app/
│   ├── page.tsx                  # Public home (hero, pricing, features)
│   ├── blog/                     # Blog (Lora serif exception)
│   ├── (app)/                    # SaaS Portal (99 routes)
│   ├── m/                        # Mobile PWA (5-tab shell)
│   ├── painel-mestre/            # Master Panel (platform admin)
│   └── reuniao/                  # Meeting mode
├── components/
│   ├── site/                     # Public site components
│   ├── mobile/                   # PWA components
│   ├── ui/                       # Shared UI primitives
│   └── [domain]/                 # Feature components
├── lib/
│   ├── theme.ts                  # Site theme (Manhã/Noite)
│   ├── portalTheme.ts            # Portal theme (Noite default)
│   ├── mobileTheme.ts            # PWA theme (Manhã default)
│   └── painelMestreTheme.ts      # Master Panel theme
├── tailwind.config.ts            # Tokens (colors, fonts, spacing, radius)
└── app/globals.css               # CSS custom properties, theme scopes
```

---

## 🔄 HOW TO RESUME (For Any Future Agent)

1. **Read this file** — it contains full context
2. **Run context** — `/root/.hermes/skills/creative/impeccable/scripts/impeccable context`
3. **Check progress table** — find first ⬜ in Phase 1→5 order
4. **Run that command** — follow its reference file exactly
5. **Update this file** — mark ✅, add date, notes, any decisions
6. **Persist critique/audit** — they auto-write to `.impeccable/`
7. **Commit** — `git add -A && git commit -m "impeccable: <command> <surface>"`

### If Session Was Interrupted
```bash
# Check live session
/root/.hermes/skills/creative/impeccable/scripts/impeccable live-status
/root/.hermes/skills/creative/impeccable/scripts/impeccable live-resume --id <SESSION_ID>

# Check detector drift
/root/.hermes/skills/creative/impeccable/scripts/impeccable doctor
```

---

## 📝 DECISION LOG (Append Here)

| Date | Command | Surface | Decision | Rationale |
|------|---------|---------|----------|-----------|
| 2026-09-10 | critique | Public Site | Score 19/32 | Pricing shows "SUBSTITUIR", no screenshots, mobile nav broken |
| 2026-09-10 | critique | Mobile PWA | Score 23/40 | Finance hub not distilled, attendance form not 3-field, touch targets small |
| 2026-09-15 | context | All | Plan created | Full 24-command sequence documented |

---

## ⚡ QUICK START FOR NEXT SESSION

```bash
# 1. Enter project
cd /tmp/Lumen

# 2. Load context
/root/.hermes/skills/creative/impeccable/scripts/impeccable context

# 3. Run NEXT command (Phase 1 completion)
# SaaS Portal critique - largest surface, most impact
/root/.hermes/skills/creative/impeccable/scripts/impeccable critique "app/(app)"

# 4. Then Master Panel critique
/root/.hermes/skills/creative/impeccable/scripts/impeccable critique "app/painel-mestre"

# 5. Then audit all surfaces
/root/.hermes/skills/creative/impeccable/scripts/impeccable audit "app/(app)"
/root/.hermes/skills/creative/impeccable/scripts/impeccable audit "app/m"
/root/.hermes/skills/creative/impeccable/scripts/impeccable audit "app/painel-mestre"
/root/.hermes/skills/creative/impeccable/scripts/impeccable audit "app/page.tsx"
/root/.hermes/skills/creative/impeccable/scripts/impeccable audit "app/reuniao"
```

---

## 🎯 SUCCESS CRITERIA (Definition of Done)

- [ ] All 5 surfaces critiqued ≥ 28/40 (Good) or 36/40 (Excellent)
- [ ] All 5 surfaces audited ≥ 14/20 (Good)
- [ ] Zero P0/P1 issues remaining across all surfaces
- [ ] DESIGN.md + `.impeccable/design.json` in sync
- [ ] Typeface replaced, color palette sophisticated, motion grammar defined
- [ ] Mobile nav works, touch targets ≥44px, WCAG AA contrast everywhere
- [ ] "Substituir" and all admin copy replaced with customer-facing language
- [ ] PWA attendance = 3 fields + dictation; finance = 3 numbers
- [ ] Public site shows real product imagery (branded diagrams until photography)
- [ ] Finish reviewer disposition = "ship" on all surfaces

---

**This document is the single source of truth for the Lúmen impeccable redesign.**  
Any agent reading this has full context to continue from exactly where the last agent stopped.

> **Update rule:** After every command completion, edit this file — mark ✅, add timestamp, note key decisions/findings. Commit the change.