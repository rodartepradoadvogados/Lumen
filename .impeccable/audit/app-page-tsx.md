---
target: Public Site (app/page.tsx, app/blog/*)
total_score: 14
max_score: 20
p0_count: 2
p1_count: 3
p2_count: 5
p3_count: 4
timestamp: 2026-09-15T23:45:00Z
slug: app-page-tsx
---

# Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | `--tx-3` 2.6:1 contrast fail; skipped headings (h1→h3); missing focus rings on CTA |
| 2 | Performance | 2 | 5 feature rows = 5 unstyled screenshot placeholders (layout shift); no image optimization |
| 3 | Responsive Design | 2 | Mobile nav hidden <md with no hamburger; pricing grid 5-col no mobile stack |
| 4 | Theming | 3 | Site theme works (Manhã/Noite); but blog uses Lora exception not in tokens |
| 5 | Implementation Integrity | 3 | 20 font-size advisories; "SUBSTITUIR" admin tag ships to production |
| **Total** | | **14/20** | **Acceptable** |

# Implementation Integrity Verdict

**FAIL** — The site ships admin copy ("SUBSTITUIR") to real visitors. 100% of feature imagery is placeholder text. Pricing grid shows dashed boxes for unpriced plans. This is not a coherent product-specific system; it's a template with real copy pasted in.

# Executive Summary

- **Audit Health Score: 14/20 (Acceptable)**
- **Total issues: 14** (P0: 2, P1: 3, P2: 5, P3: 4)
- **Top 3 critical:**
  1. Pricing section renders "SUBSTITUIR" tag on all 4 plans (P0)
  2. 5 feature rows show "Captura de tela — {description}" boxes, zero real imagery (P0)
  3. Mobile navigation completely missing below md breakpoint (P1)
- **Recommended next steps:** `harden` (fix pricing/placeholders), `adapt` (mobile nav), `layout` (pricing cognitive load), `colorize` (vinho misuse), `polish` (final)

# Detailed Findings by Severity

**[P0] Pricing: "SUBSTITUIR" admin instruction renders on live site**
- Location: `app/page.tsx` lines 400–500, `PricingCard` component
- Category: Implementation Integrity
- Impact: Trust destruction at conversion point; looks broken
- WCAG: N/A
- Recommendation: Hide unpriced plans or show "Fale conosco" CTA
- Suggested command: `/impeccable harden`

**[P0] Feature section: 5/5 rows are placeholder boxes, not product imagery**
- Location: `app/page.tsx` lines 200–350, `FeatureRow` components
- Category: Implementation Integrity
- Impact: Zero product demonstration at trust-building moment
- Recommendation: Replace with branded diagram system (régua + bordô visual language)
- Suggested command: `/impeccable adapt`

**[P1] Mobile: header nav `hidden md:flex` with no fallback**
- Location: `app/page.tsx` header component, `components/site/Header.tsx`
- Category: Responsive Design
- Impact: Mobile users cannot reach Preço, Blog, Entrar
- Recommendation: Add hamburger → overlay menu with same left-aligned ruled style
- Suggested command: `/impeccable adapt`

**[P1] Pricing: 5 simultaneous plans, no "recomendado" anchor, 4 unpriced**
- Location: `app/page.tsx` pricing grid
- Category: Implementation Integrity / Cognitive Load
- Impact: Decision paralysis at highest-friction moment
- Recommendation: Mark one plan "recomendado" using `--acao-light` treatment
- Suggested command: `/impeccable clarify`

**[P1] `vinho` (destructive-only token) used for "price pending" state**
- Location: `app/page.tsx` `placeholderBox`/`placeholderTag` components
- Category: Theming
- Impact: Second uncontrolled accent color on most scrutinized section
- Recommendation: Neutral treatment (`--regua-forte` border, no accent)
- Suggested command: `/impeccable colorize`

**[P2] Font-size ramp violations: 17 instances (9.5px–32px off DESIGN.md)**
- Location: `app/page.tsx` (17), `app/blog/[slug]/page.tsx` (2), `app/blog/page.tsx` (3)
- Category: Theming
- Impact: 13 different text sizes decode vs 5 defined
- Recommendation: Map all to DESIGN.md tokens; add `text-caption` (11px) if needed
- Suggested command: `/impeccable typeset`

**[P2] Blog Lora exception not in DESIGN.md tokens**
- Location: `app/blog/layout.tsx`, `app/blog/[slug]/page.tsx`
- Category: Theming
- Impact: Second typeface untracked by design system
- Recommendation: Add `font-display: "Lora, Georgia, serif"` to DESIGN.md frontmatter
- Suggested command: `/impeccable extract`

**[P2] Footer "Produto" column omits Blog link present in header**
- Location: `app/page.tsx` footer component
- Category: Consistency
- Recommendation: Sync footer nav with header nav
- Suggested command: `/impeccable layout`

**[P2] H1 `max-w-[15ch]` forces awkward 3-line wrap at 900–1100px**
- Location: `app/page.tsx` hero headline
- Category: Layout
- Recommendation: Use `max-w-3xl` or clamp-based fluid width
- Suggested command: `/impeccable layout`

**[P3] Comment rot: `app/page.tsx` claims accent is `#ec3013` but tokens use `#8a2f42`**
- Location: `app/page.tsx` line 15
- Category: Implementation Integrity
- Recommendation: Delete stale comment
- Suggested command: `/impeccable polish`

**[P3] `text-tx-3` contrast 2.6:1 on white — WCAG AA fail**
- Location: Global token `--tx-3` (#9b9797) on `--sf-fundo` (#f3f2f2)
- Category: Accessibility
- Recommendation: Raise to `#8a8686` (4.5:1) per PRODUCT.md authorization
- Suggested command: `/impeccable colorize` + `/impeccable harden`

**[P3] Blog empty state well-handled but not reusable**
- Location: `app/blog/page.tsx` empty state
- Category: Positive Finding
- Recommendation: Extract as `EmptyState` component for portal/PWA use
- Suggested command: `/impeccable extract`

**[P3] Cookie consent banner is genuine two-choice (LGPD-compliant)**
- Location: `components/site/CookieConsent.tsx`
- Category: Positive Finding
- Recommendation: Document as pattern in DESIGN.md Components
- Suggested command: `/impeccable document`

# Patterns & Systemic Issues

- **Off-ramp font sizes:** 20 total across site + blog — systemic, not one-off
- **Placeholder imagery:** 100% of feature demonstration is text-about-image
- **Mobile-first missing:** Desktop-down responsive only; no mobile nav pattern

# Positive Findings

- Cookie consent: genuine choice, not dark pattern
- Poster-close section: only deliberate full-bleed brand color use — follows "one accent" rule
- "Sigilo auditável" feature row: turns compliance into hard-to-copy selling point
- Blog Lora exception: reasoned voice split, documented

# Recommended Actions

1. **[P0] `/impeccable harden`**: Fix pricing "SUBSTITUIR", replace feature placeholders with branded diagrams
2. **[P0] `/impeccable adapt`**: Add mobile hamburger nav, stack pricing grid on mobile
3. **[P1] `/impeccable clarify`**: Add "recomendado" badge to one pricing plan; fix vinho misuse
4. **[P1] `/impeccable colorize`**: Raise `--tx-3` contrast; map undocumented colors
5. **[P2] `/impeccable typeset`**: Consolidate 13 text sizes → 5 DESIGN.md tokens (+ caption if needed)
6. **[P2] `/impeccable layout`**: Fix H1 clamp, sync footer/header nav, blog Lora in tokens
7. **[P3] `/impeccable extract`**: Document CookieConsent, EmptyState, FeatureDiagram as components
8. **[P3] `/impeccable document`**: Refresh `.impeccable/design.json` sidecar
9. **[P3] `/impeccable polish`**: Final comp-diff, finish review