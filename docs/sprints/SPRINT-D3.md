# Sprint D3 — Wednesday 26 August 2026

> **Design foundation.** Tokens first — they are free at the call sites and they change the most —
> then the primitives. Plus the stat definitions and the routing fixes.

|                      |                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------- |
| **Branch base**      | [Sprint D2](SPRINT-D2.md) merge                                                    |
| **Owner of the day** | **A4.** 67 action rows from ~20 shared files, almost all with zero call-site edits |
| **Blocking**         | Steps run **in order**. Step 4 in particular is load-bearing on step 1             |
| **Ship**             | Hosting only. No functions or rules change today except A1's notification work     |

### Implementation status

Implemented on isolated branch `codex/sprint-3-d3` from the Sprint D2 merge. The reviewed slice
covers the token split, shared control geometry and accessibility behavior, legacy route preservation,
stat-definition cleanup, notification deduplication/digests, and the D3 grep assertion suite.
Validation is local-only (`design:verify`, typecheck, lint, unit tests, Functions tests, syntax, and
build); no production deployment or data mutation was performed. Staging remains deferred until an
authorized isolated project and verified recovery path exist.

**Line numbers are `dev-anuj`, verified 2026-08-23.**

---

## The one fact behind four separate bug reports

```css
/* src/index.css */
:17   --color-tennis-dark:    #143d34;   /* the page */
:18   --color-tennis-surface: #143d34;   /* the card */
```

**Page and card are the same colour.** Every card is invisible against the page, and every `shadow-*` in the app renders nothing. The invisible sign-in buttons, the dead sheet backdrop, the see-through bracket headers and "shadows do nothing" are all this one line pair.

Fix it first and everything downstream becomes a real visual change instead of a no-op.

---

## Board

| Lane                     |    Tasks | Rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | -------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A4 UI/UX**             | 16 steps | [CT-1](../ACTION-REPORT.md#CT-1), [CT-2](../ACTION-REPORT.md#CT-2), [CT-4](../ACTION-REPORT.md#CT-4), [CT-14](../ACTION-REPORT.md#CT-14), [CT-15](../ACTION-REPORT.md#CT-15), [CT-16](../ACTION-REPORT.md#CT-16), [CT-17](../ACTION-REPORT.md#CT-17), [CT-24](../ACTION-REPORT.md#CT-24), [CT-31](../ACTION-REPORT.md#CT-31), [CT-32](../ACTION-REPORT.md#CT-32), [BT-1](../ACTION-REPORT.md#BT-1)…[BT-8](../ACTION-REPORT.md#BT-8), [BT-11](../ACTION-REPORT.md#BT-11)…[BT-15](../ACTION-REPORT.md#BT-15), [BT-24](../ACTION-REPORT.md#BT-24), [BT-29](../ACTION-REPORT.md#BT-29), [MF-1](../ACTION-REPORT.md#MF-1)…[MF-6](../ACTION-REPORT.md#MF-6), [MF-14](../ACTION-REPORT.md#MF-14), [MF-15](../ACTION-REPORT.md#MF-15), [TY-3](../ACTION-REPORT.md#TY-3), [TY-5](../ACTION-REPORT.md#TY-5), [AX-1](../ACTION-REPORT.md#AX-1), [AX-2](../ACTION-REPORT.md#AX-2), [AX-7](../ACTION-REPORT.md#AX-7), [AX-17](../ACTION-REPORT.md#AX-17), [AX-18](../ACTION-REPORT.md#AX-18), [AX-19](../ACTION-REPORT.md#AX-19), [AX-23](../ACTION-REPORT.md#AX-23), [AX-24](../ACTION-REPORT.md#AX-24), [CS-45](../ACTION-REPORT.md#CS-45), [CS-63](../ACTION-REPORT.md#CS-63), [CS-65](../ACTION-REPORT.md#CS-65), [DC-1](../ACTION-REPORT.md#DC-1), [DC-9](../ACTION-REPORT.md#DC-9), [DC-10](../ACTION-REPORT.md#DC-10), [DC-15](../ACTION-REPORT.md#DC-15), [DC-16](../ACTION-REPORT.md#DC-16), [DC-22](../ACTION-REPORT.md#DC-22)…[DC-27](../ACTION-REPORT.md#DC-27) |
| **A3 Client / Dev**      |        2 | [RT-1](../ACTION-REPORT.md#RT-1)…[RT-6](../ACTION-REPORT.md#RT-6), [DC-2](../ACTION-REPORT.md#DC-2)…[DC-8](../ACTION-REPORT.md#DC-8), [DC-13](../ACTION-REPORT.md#DC-13), [DC-14](../ACTION-REPORT.md#DC-14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **A2 Data**              |        2 | [LB-7](../ACTION-REPORT.md#LB-7)…[LB-15](../ACTION-REPORT.md#LB-15), [DC-11](../ACTION-REPORT.md#DC-11), [DC-12](../ACTION-REPORT.md#DC-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **A1 Rules + Functions** |        1 | [P3](../notes/WORKFLOW_DESIGN_REPORT.md#P3) notification noise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **A5 Verify**            |        2 | grep-assertion suite, design-sync diffs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## A4 · UI/UX — `ui-ux` · the sixteen steps

Run them in this order. The ordering is not stylistic; four of the dependencies are hard.

### Step 1 — `src/index.css`, tokens only · CT-1, CT-2, CT-15, CT-17, DC-15

**Zero call sites.** One commit, including the five literals the token cannot reach.

| Line         | Now                                              | After                                                                     |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `:15`        | `--color-clay: #ff6b35`                          | `#E84A27`                                                                 |
| `:16`        | `--color-clay-dark: #e84a27`                     | **delete**; add `--color-clay-press: #D6401F`                             |
| `:17`        | `--color-tennis-dark: #143d34`                   | `#0B3027` — **the page**                                                  |
| `:18`        | `--color-tennis-surface: #143d34`                | unchanged — **the card**. R-7 forbids touching it                         |
| `:19`        | `--color-tennis-deep: #0b3027`                   | `#06211B` — **recessed**: field fills, popovers, chip off-states          |
| `:22`, `:49` | `--color-nav`                                    | **delete both** (pairs with step 2)                                       |
| `:46`        | light `--color-tennis-dark: #edede7`             | `#DEDED5`                                                                 |
| `:47`        | light surface `#ffffff`                          | unchanged                                                                 |
| `:48`        | light `--color-tennis-deep: #deded5`             | `#D2D2C7`                                                                 |
| `:52`        | light `--color-badge-win: #15803d`               | `#166534` — 3.71 → 5.27 on the new light page                             |
| new          | —                                                | `--color-clay-fg: #FF8A65` dark / `#9E2D12` light — **clay as text only** |
| `:88`        | native `select` popup `var(--color-tennis-dark)` | `var(--color-tennis-deep)`                                                |
| `:108`       | intl-tel search field `var(--color-tennis-dark)` | `var(--color-tennis-deep)`                                                |

**The five literals a token revalue cannot reach** — same commit or the accent ships in two colours:

| File        | Line     | Now                                             |
| ----------- | -------- | ----------------------------------------------- |
| `index.css` | `:110`   | `rgba(255, 107, 53, 0.18)`                      |
| `index.css` | `:155`   | `box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.4)` |
| `index.css` | `:163`   | same                                            |
| `Fab.tsx`   | `:17`    | `shadow-[0_8px_24px_rgba(255,107,53,0.4)]`      |
| `index.css` | gradient | `clay → clay-dark` → `clay → clay-press`        |

**Why `--color-clay-fg` exists:** `text-clay` measures **2.53–3.86:1** on every surface in the app. 156 sites, one `sed`, the largest single text-legibility win in the sweep.

**Final values, every ratio computed:**

| Token                    | Dark      | Light     | Job                                           |
| ------------------------ | --------- | --------- | --------------------------------------------- |
| `--color-clay`           | `#E84A27` | `#E84A27` | the one accent — fills, borders, rings, icons |
| `--color-clay-press`     | `#D6401F` | `#D6401F` | pressed/hover; 4.55:1 under a white label     |
| `--color-clay-fg`        | `#FF8A65` | `#9E2D12` | clay as **text only**                         |
| `--color-tennis-dark`    | `#0B3027` | `#DEDED5` | **page**                                      |
| `--color-tennis-surface` | `#143D34` | `#FFFFFF` | **card**                                      |
| `--color-tennis-deep`    | `#06211B` | `#D2D2C7` | **recessed**                                  |
| `--color-fg`             | `#ffffff` | `#143D34` | content; `/70` is the only other tier         |
| `--color-ink`            | `#143D34` | `#143D34` | fixed dark text on always-light fills         |
| `--color-badge`          | `#fcd34d` | `#92400e` | unchanged                                     |
| `--color-badge-win`      | `#86efac` | `#166534` | light revalued                                |
| `--color-badge-loss`     | `#fca5a5` | `#b91c1c` | unchanged                                     |

> **One pair accepted rather than fixed.** Card on page, dark theme, is 1.19:1. `#143D34` carries 1.60× the luminance of `#0B3027` — the standard dark-theme elevation step; the ratio formula compresses hard at these absolute levels. Lightening the card to `#17453B` would raise separation to 1.33 and drop clay fills on it to **2.79** — a worse trade, and R-7 forbids it.

### Step 2 — `BottomNav.tsx:29` · CT-16, CT-6

`bg-nav/95` → `bg-tennis-dark/95`; `border-fg/8` → `border-fg/10`. **Same commit as step 1's `--color-nav` deletion**, or `bg-nav` compiles to nothing and the bottom bar loses its fill entirely. Visually a no-op today — `--color-nav` and `--color-tennis-dark` hold the same value — but it unblocks [DEC-3](../ACTION-REPORT.md#DEC-3).

### Step 3 — The `clay-dark` hovers · CT-4, CT-31

`Button.tsx:25,30` · `ContactOpponentButton.tsx:32` · `Fab.tsx:18` → `hover:bg-clay-press`. Plus `Fab.tsx:17`'s hardcoded glow → `shadow-lg shadow-clay/40`. These become **no-op hovers** the moment step 1 lands, so they ship in the same change or immediately after. `Fab.tsx:17`'s `w-14 h-14 rounded-full` is **unchanged** — [BT-19](../ACTION-REPORT.md#BT-19) formalises the 56px exemption rather than editing it.

### Step 4 — The border removal · CT-32, R-2 · **load-bearing**

[R-2](../ACTION-REPORT.md#R-2) says card boundaries are invisible: cards separate by fill alone, no border. But **page and card are the same colour today**, so removing a border first leaves a card with _no_ boundary of any kind. Conversely, splitting the fills while the hairlines stay leaves a doubled edge on every card.

**Ship the fill split (step 1) first, then the border removal, and verify the second before merging.** Delete the border from card-level surfaces; keep hairlines only as _row dividers inside_ a card.

### Step 5 — Behaviour rules in `index.css` · AX-2, AX-24, BT-11, BT-12

| Rule                                                                                        | Why                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One `focus-visible` `@utility`: `outline: 2px solid var(--color-clay); outline-offset: 2px` | **`focus-visible` appears 0 times in `src/`.** 194 controls, no visible keyboard focus. **Not** `ring-offset-tennis-surface` — that is a 2px white halo on the light page                                             |
| One `prefers-reduced-motion` block covering `animate-spin` (14) and `animate-pulse` (16)    | `motion-reduce` appears 0 times. `MotionConfig reducedMotion="user"` in `App.tsx` **does not reach CSS animations**                                                                                                   |
| One base-layer `:disabled, [aria-disabled="true"]` rule → `text-fg/70` + `opacity-50`       | 21 off-scale sites (`/25` `/30` `/35` `/40` `/50`). The 16 overrides **win on specificity until deleted** — delete them in the same commit                                                                            |
| `.card-shadow` / `.featured-shadow`, light-theme only                                       | Plain classes reading plain custom properties. Sidesteps any question about Tailwind v4 re-reading a `--shadow-*` theme key inside a `[data-theme]` block                                                             |
| `--nav-clearance: calc(4.5rem + env(safe-area-inset-bottom))`                               | [CS-63](../ACTION-REPORT.md#CS-63). The maplibre `bottom: 52px` at `:7-9` is hand-copied against `Layout.tsx`'s `pb-16` — the only duplicate in the audit that crosses a language boundary and cannot be type-checked |

### Step 6 — `Button.tsx` · BT-1, BT-3…BT-8, CT-13, DC-16 · **the highest-fanout edit in the audit**

**91 call sites, 47% of all action controls, zero call-site edits.** Measured variant use: `outline` 27 · `clay` 18 · `white` 14 · `secondary` 4 · `ghost` 3 · `primary` **1** · `danger` **0** · defaulted 24.

| Line  | Now                                           | After                                                                                                                                                    | Row                                                                |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `:45` | base string                                   | add `border border-transparent`; radius stays `rounded-2xl`                                                                                              | [BT-1](../ACTION-REPORT.md#BT-1)                                   |
| `:36` | `md: 'px-6 py-2.5'`                           | `h-11 px-6 rounded-2xl text-base`                                                                                                                        | BT-1                                                               |
| `:35` | `sm: 'px-3 py-1.5 text-sm'`                   | **alias to `md`'s string.** Deleting the union member breaks 41 call sites at `tsc`; aliasing the _value_ delivers the geometry today at zero call sites | [BT-4](../ACTION-REPORT.md#BT-4)                                   |
| `:37` | `lg: 'px-8 py-3.5 text-lg'`                   | alias to `md`; the one caller adds `w-full`                                                                                                              | [BT-5](../ACTION-REPORT.md#BT-5)                                   |
| `:29` | `danger: 'bg-red-500 …'`                      | **delete** — 0 call sites, and it hardcodes `bg-red-500` where `--color-badge-loss` exists                                                               | [BT-6](../ACTION-REPORT.md#BT-6)                                   |
| `:25` | `primary`, byte-identical to `clay` at `:30`  | **delete**; the 1 caller moves to `clay`. Keep the 18                                                                                                    | BT-6                                                               |
| `:26` | `secondary: 'bg-tennis-surface …'`            | add `border border-fg/10` — the Google and Apple sign-in buttons are `#143d34` on a `#143d34` page                                                       | [CT-13](../ACTION-REPORT.md#CT-13)                                 |
| `:27` | `outline: 'border-2 border-clay text-clay …'` | `border border-clay text-clay-fg …` — `border-2` renders 48px against filled's 44px, so every two-button footer is uneven                                | [BT-7](../ACTION-REPORT.md#BT-7), [CT-2](../ACTION-REPORT.md#CT-2) |
| `:54` | `border-2 border-white border-t-transparent`  | `border-current border-t-transparent` + `aria-busy` — on `outline`/`ghost` in light theme this is white on a white card and loading looks frozen         | [BT-8](../ACTION-REPORT.md#BT-8)                                   |
| `:17` | destructure has no `type`                     | add `type = 'button'` and pass it through — **77 of 91 call sites inherit `submit`**                                                                     | [BT-3](../ACTION-REPORT.md#BT-3)                                   |
| —     | no focus ring                                 | apply the step-5 utility — 91 controls from one line                                                                                                     | [AX-2](../ACTION-REPORT.md#AX-2)                                   |

**Ship `.design-sync/previews/Button.tsx` in the same commit** (`:10` `variant="danger"`, `:19` `size="lg"`) or `tsc` breaks — the preview is inside the project tsconfig.

### Step 7 — `src/App.tsx` · **A3 writes this** · RT-1, RT-2, RT-4, RT-5, RT-6

See the A3 section. Independent of everything above.

### Step 8 — The eight one-row files

| File                 | Line             | Change                                                                                                                                                                                                 | Row                                |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `main.tsx`           | `:40`            | `text-clay` → `text-clay-fg` (the `text-white` half shipped in [D1](../notes/HARMONIZATION_REPORT.md#D1))                                                                                              | [CT-12](../ACTION-REPORT.md#CT-12) |
| `Navbar.tsx`         | `:72`            | move the theme toggle **outside** the `!isAuthPage` guard — a first-time visitor cannot leave the default dark theme until after signup                                                                | [CS-65](../ACTION-REPORT.md#CS-65) |
| `HeaderMenu.tsx`     | `:111`           | `<Menu />` → `<X />`; delete the dead `sr-only` span, which loses to the `aria-label` anyway. The close control currently shows the _same hamburger_ that opened it                                    | [AX-19](../ACTION-REPORT.md#AX-19) |
| `FooterElements.tsx` | —                | add `/terms`, `/privacy`, `/contact` to the drawer and a public footer. **`/privacy` has no public path at all** and `/contact` no inbound link — both legal pages are typed-URL-only while logged out | [RT-9](../ACTION-REPORT.md#RT-9)   |
| `Toast.tsx`          | `:21`            | pause on hover/focus; `duration` 5000 → 8000. `aria-live="polite"` announces, but the timer removes the toast before a screen-reader user reaches the X                                                | [AX-18](../ACTION-REPORT.md#AX-18) |
| `lib/motion.ts`      | `:11`            | delete `whileHover: { scale: 1.02 }` — unused, and it invites the hover-scale the motion principle forbids                                                                                             | [BT-29](../ACTION-REPORT.md#BT-29) |
| `taskCatalog.ts`     | `:237`           | delete `TOTAL_AVAILABLE` — **verified zero importers**; numerator and denominator disagree and it re-bases whenever the catalogue changes                                                              | [DC-9](../ACTION-REPORT.md#DC-9)   |
| `useStandings.ts`    | `:90-91`, `:104` | delete `activePlayers` / `matchesOrganized` — **verified zero consumers**; a second silent definition of the Home headline numbers                                                                     | [DC-10](../ACTION-REPORT.md#DC-10) |

### Step 9 — `Input.tsx` + the three page constants · MF-5, MF-6, TY-5

**4 edits move ~47 of the 95 field instances.**

`Input.tsx:21` is the field chrome. Export it as `field`; add `min-h-11`, `text-base`, `placeholder-fg/70`, error border on `--color-badge-loss` (raw palette does not flip), and `startAdornment` / `endAdornment` slots — the missing right slot is exactly why `Signup.tsx` hand-rolls three password fields.

Point all three page `fieldCls` constants at it: `EventsElements.tsx`, `MarketplaceElements.tsx`, `ServicesElements.tsx`. **All three must leave `bg-tennis-dark/70`** or every field in Events, Marketplace and Services renders **page-coloured** after step 1 — a whole form that looks like a background.

The three `labelCls` constants are **byte-identical**: `block text-[11px] font-bold uppercase tracking-widest text-fg/70 mb-1.5`. Export `fieldLabelCls` from `Input.tsx` and import in all three — reaches 21 copies today and is the landing point for [TY-4](../ACTION-REPORT.md#TY-4)'s 96 and [TY-6](../ACTION-REPORT.md#TY-6)'s 22 later.

> **[Q-1](../ACTION-REPORT.md#Q-1) is settled: `min-h-11` on the control itself.** The inventory's `.hit-44` pseudo-element **never renders on `<input>` / `<select>`** — that mechanism is undeliverable as written.

### Step 10 — `Sheet.tsx`, behaviour · MF-1, MF-14, MF-15, CT-14, AX-1, LB-30

| Line              | Now                                                          | After                                                                                                                                                                                                                        | Row                                       |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `:25`             | `maxWidthClassName = 'max-w-lg'`                             | `'max-w-md'` — **0 of 19 mounts use the default**; 18 pass `max-w-md`, 1 passes `max-w-xl`. A default nobody picks is a trap                                                                                                 | [MF-1](../ACTION-REPORT.md#MF-1)          |
| `:69`             | `bg-tennis-dark/80 backdrop-blur-md`                         | unchanged — the **token revalue** makes the scrim actually dim. Free after step 1                                                                                                                                            | [CT-14](../ACTION-REPORT.md#CT-14)        |
| `:110`            | `bg-tennis-dark/50 hover:bg-tennis-dark`                     | `bg-fg/10 hover:bg-fg/20`, 44×44                                                                                                                                                                                             | CT-14, [BT-10](../ACTION-REPORT.md#BT-10) |
| `:92` vs `:100`   | handle `sticky top-0` **and** header `sticky top-0 sm:top-0` | one sticky block, or offset the header by the handle height. Two elements pinned to the same offset means the opaque handle covers the top 20px of the title once the body scrolls. The `sm:top-0` is redundant with `top-0` | [MF-14](../ACTION-REPORT.md#MF-14)        |
| `:23` doc comment | requires `<AnimatePresence>` at the call site                | move `<AnimatePresence>` **inside** `Sheet`. **14 of 26 render sites are missing it** and pop out instantly; the 12 existing outer wrappers become harmless                                                                  | [MF-15](../ACTION-REPORT.md#MF-15)        |
| `:54-60`          | `aria-modal="true"`, no trap                                 | focus the panel on mount, cycle Tab, restore to the opener. Same helper serves `HeaderMenu.tsx`                                                                                                                              | [AX-1](../ACTION-REPORT.md#AX-1)          |
| `:43`             | binds `window` `keydown`                                     | the overlay stack A4 built on Monday                                                                                                                                                                                         | [LB-30](../ACTION-REPORT.md#LB-30)        |

### Step 11 — `Sheet.tsx`, absorption · MF-2, MF-3, MF-4 · **the only rows with a real tail**

Body padding `p-6 pt-3 space-y-4` inside `Sheet`, plus one dense preset for row-list sheets. A sticky footer `px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-3` — the primary action currently scrolls off the bottom of long form sheets. Every mount passes `title`; eyebrow = `label text-clay-fg`.

**Then prune the 19 mounts in the same commit**, deleting their own padding — otherwise every sheet double-insets.

### Step 12 — `SegmentedControl.tsx` · BT-13, BT-24, AX-7

| Line     | Now                                                             | After                                                                                                                                                                                                                  |
| -------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:30`    | `active ? 'text-white' : 'bg-white text-ink hover:bg-white/90'` | off-state `bg-tennis-deep text-fg`. **[R-3](../ACTION-REPORT.md#R-3): unselected is DARKER.** `bg-white` does not flip, so in dark theme the unselected segment is the brightest thing on screen and reads as selected |
| `:29`    | `rounded-lg px-3 py-2 text-xs`                                  | `rounded-xl py-3` → 44px                                                                                                                                                                                               |
| track    | `flex bg-fg/5 rounded-xl p-1`                                   | `rounded-2xl` — concentricity: a child inset ≤8px takes parent radius − inset                                                                                                                                          |
| `:14-22` | `role="tablist"`, no arrows, no `aria-controls`                 | roving `tabIndex` + Left/Right; `aria-controls` on each tab. It announces as a tab list a screen-reader user cannot operate                                                                                            |

### Step 13 — `ContactOpponentButton.tsx` · BT-2, CS-45, DC-1 · **High risk**

**27 `pillButtonCls` references across 13 files.** With step 6 that is 111 of 194 action controls from two functions.

| Line   | Now                                                                  | After                                                                                                                                                                       |
| ------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:28`  | `rounded-lg` + `sm: px-2.5 py-1 text-xs` / `md: px-3 py-1.5 text-xs` | `h-11 px-6 rounded-2xl text-base`                                                                                                                                           |
| `:104` | `${pillButtonCls(size, variant)} !px-1.5`                            | **delete the override** — an `!important` fighting the primitive is how 43 button treatments happened. Icon-only becomes 44×44                                              |
| `:32`  | `hover:bg-clay-dark`                                                 | `hover:bg-clay-press`                                                                                                                                                       |
| `:33`  | `border-2 border-clay text-clay …`                                   | `border border-clay text-clay-fg …`                                                                                                                                         |
| new    | —                                                                    | an `icon-dense` variant. Canon `icon` ×3 is 136px inside the ~58px cell on the RR group card and wraps to three rows in a 78px tile                                         |
| `:81`  | `whatsappSameAsPhone?: boolean` — declared, **never destructured**   | delete, plus its 7 pass-throughs. Seven call sites read Firestore and compute a value the component ignores; the link already resolves via `whatsappContact \|\| phoneE164` |

**Rows get ~20px taller.** State that cost before merging — this is the app's most-tapped control.

### Step 14 — `Accordion.tsx`, `Tree.tsx`, `PlayerCard.tsx` · BT-15, AX-17 · **last, and on its own**

| File             | Line          | Change                                                                                                                                                                                                                                           |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Accordion.tsx`  | `:14`, `:25`  | `locked` dims at `:46` but the header button has no `disabled` — a "locked" section still opens on tap. Add `disabled={locked}`                                                                                                                  |
| `Accordion.tsx`  | `:32`         | `rounded-3xl border p-5` — the padding is on the **card**, not the header button. Move the inset **inside** the `<button>`: `min-h-11 flex items-center gap-3 px-4 py-3`. Without moving it the tap row stays ~20px however tall the card is     |
| `Tree.tsx`       | rows          | same 44px spec. **Preserve the `ml-5 w-[calc(100%-1.25rem)]` / `ml-10 w-[calc(100%-2.5rem)]` trick** — the indent is margin + padding, not one padding, and flattening it runs the selected row's background back under the parent group's label |
| `Tree.tsx`       | selected      | `active ? 'bg-white text-clay'` is the **selected** state, not the unselected one. `bg-white` still does not flip; the fix is the on-state idiom: `bg-clay/15 border-clay/50 text-fg`                                                            |
| `Tree.tsx`       | disabled      | delete `opacity-40` — the step-5 base rule owns it                                                                                                                                                                                               |
| `PlayerCard.tsx` | row           | `px-3 py-2.5` drops to 40px when `subtitle` is absent → `min-h-11`. Seven row objects at 11 heights, 28–82px                                                                                                                                     |
| `PlayerCard.tsx` | drawer button | already sets `aria-expanded`; add `aria-controls`                                                                                                                                                                                                |

### Step 15 — `LoadingBar.tsx` · AX-23, CT-24

`:11-12` delete `barColorClassName`; add `role="progressbar"` + `aria-valuemin/max/now/text`. `role="progressbar"`, `aria-valuenow` and `strokeDasharray` each appear **0 times in `src/`**. Deleting the prop forces the one override at `CourtMap.tsx:596` (`bg-[#4ade80]`) — the app's only progress fill that is not clay and does not flip. **`tsc` catches this one**; it is the only row today that cannot fail silently.

### Step 16 — The canon into `CLAUDE.md` · **A5 writes it, A4 supplies the text**

**[TY-3](../ACTION-REPORT.md#TY-3) must be written down before anyone starts [TY-2](../ACTION-REPORT.md#TY-2)**, or the heading sweep eats the 16px control size and re-opens the iOS focus-zoom bug on 58 of 76 fields.

| Row                                                                    | Content                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TY-3                                                                   | `text-base` is the **control** size for field values and button labels — not a heading tier                                                                                                                                                                                                                                                                                            |
| [CS-33](../ACTION-REPORT.md#CS-33)                                     | The four ring refusals: Tasks headline tiles, draw fill, win rate, RR Group Bonus. A ring implies a ceiling; RS and League Points are unbounded, draw fill's denominator derives from its numerator, the Group Bonus is a switch                                                                                                                                                       |
| [DC-22](../ACTION-REPORT.md#DC-22)                                     | A "Design canon" section. The two-tier text rule **is** in `CLAUDE.md` and has 4 breaches; the radius ladder is **not** and has 391 sites across 14 steps. That difference is the whole argument                                                                                                                                                                                       |
| [DC-23](../ACTION-REPORT.md#DC-23)                                     | `CLAUDE.md` says `Leagues.tsx` renders no challenge UI. A live Challenge button sits in it                                                                                                                                                                                                                                                                                             |
| [KO-3](../ACTION-REPORT.md#KO-3)                                       | Replace the `selectGroupWinners` auto-seeding paragraph with the organizer-controlled rule ([R-4](../ACTION-REPORT.md#R-4))                                                                                                                                                                                                                                                            |
| **walkover**                                                           | `CLAUDE.md` states an RR walkover pays the normal 3/1 and that "the walkover penalty was deliberately removed". **The settled rule is 1 to each player** in a group ([D6](../notes/HARMONIZATION_REPORT.md#D6) · [L10](../notes/HARMONIZATION_REPORT.md#L10) · Q-4); a _played_ group match still pays 3/1. Correct the Round Robin and Stats sections, and the `matchAward` paragraph |
| **scoring**                                                            | Replace the "organizer confirms" description with the auto-approval rule: applies on submission · lower aggregate margin wins on a score disagreement · only different winners flag · walkovers organizer-only                                                                                                                                                                         |
| **tests**                                                              | Delete _"There are no automated tests"_ — false on this branch. Write in the eleven commands                                                                                                                                                                                                                                                                                           |
| [DC-24](../ACTION-REPORT.md#DC-24), [DC-27](../ACTION-REPORT.md#DC-27) | Correct five stale inventory claims; move the four smuggled colour decisions out of the geometry canon                                                                                                                                                                                                                                                                                 |

**Blocked and not to be worked around:** nothing. `Stepper.tsx` was deleted in [Sprint D2](SPRINT-D2.md).

---

## A3 · Client / Dev — `dev-client`

### ⬛ Routing · RT-1, RT-2, RT-4, RT-5, RT-6

| Line                    | Now                                                                                | After                                                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `App.tsx:150-151`       | `<Navigate to="/matches" replace />` for `/friendlies` and `/challenges`           | `to="/matches?mode=friendlies"` / `?mode=challenges`. They keep `replace` but **drop their `mode`**, so both land the member on the Tournament tab they did not ask for. Two characters of query string each |
| `App.tsx:177`           | `<Route path="*" element={<Navigate to="/" />} />` — **no `replace`**              | add `replace` today; a real `NotFound` element is [Sprint D5](SPRINT-D5.md)                                                                                                                                  |
| `App.tsx:91`            | `<Navigate to="/login" />`                                                         | add `replace` — Back from `/login` re-enters the guarded route and bounces again                                                                                                                             |
| `App.tsx` `/tournament` | inside `<PrivateRoute>`                                                            | move `TournamentRedirect` outside it. A signed-out visitor on `/tournament?event=X` loses the event id at the bounce. `/matches` still guards                                                                |
| `App.tsx` ScrollToTop   | one effect keyed `[location.pathname, location.search]`, scrolling **and** logging | split: scroll on `pathname`, log `page_view` on both. Switching the Matches mode or a Marketplace tab currently jumps the viewport to the top even though `<main>` never remounts                            |

`App.tsx:85`'s `bg-tennis-dark` splash is **correct after the revalue** — a genuine full-screen page state. 0 edits.

### ⬛ Dead code · DC-2…DC-8, DC-13, DC-14

Four `prose prose-invert prose-clay` classes on static pages · the dead `locked` path in Tasks and the dead `disabled` path on `FilterSelect` · `RROpponentPanel`, the unused `RRGroupCard` props, `BracketView`'s `drawTitle` · the `organizerPlaceholder` prop threading · the unused image-resolution pipeline on the Events list · Signup's dead fields and imports · `Leagues.tsx`'s unused destructure · the unused `myRankIdx` and its stale comment · the never-shown stat fields.

All verified-zero-consumer deletions. If `tsc` passes, they are done.

---

## A2 · Data — `dev-data`

### ⬛ Stat definitions · LB-7…LB-15, DC-11, DC-12

One definition each, everywhere.

| Row                                                                     | Defect                                                                                                                                                                                              | Fix                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [LB-7](../ACTION-REPORT.md#LB-7)                                        | A member with friendlies sees a **bigger match count on their own profile** than anyone else sees on it                                                                                             | `stats.matchesPlayed` everywhere                                                                                                                                                         |
| [LB-8](../ACTION-REPORT.md#LB-8)                                        | Two inline re-implementations of `pgWinPct` — the same member reads `—` on the leaderboard and `62%` on their own profile                                                                           | Import the one helper at both sites                                                                                                                                                      |
| [LB-9](../ACTION-REPORT.md#LB-9)                                        | The Profile games-won fallback mixes populations: games-from-matches against points-from-stats                                                                                                      | **Delete the fallback.** `—` is the honest answer                                                                                                                                        |
| [LB-10](../ACTION-REPORT.md#LB-10)                                      | Three streak definitions. `status === 'complete'` silently excludes challenges and rallies, which are `'confirmed'`                                                                                 | One `isComplete` predicate covering both; all three call it                                                                                                                              |
| [LB-11](../ACTION-REPORT.md#LB-11)                                      | A walkover inflates Matches and Wins, leaves P/G alone, is invisible to Tasks, and pays full 3/1 in the group table when the settled rule is **1 to each player**                                   | One rule via `matchAward`. **`matchAward` and `computeGroupStandings` change in the same commit** — [Sprint D2](SPRINT-D2.md) set the payout, this row makes all three consumers read it |
| [LB-12](../ACTION-REPORT.md#LB-12)                                      | The same player reads "Challenger" and "Challengers" two taps apart                                                                                                                                 | `skillBand()` is the sole source; delete `skillTier`, `SKILL_LEVEL_TIERS` and the `TOURNAMENT_OPTIONS` labels                                                                            |
| [LB-13](../ACTION-REPORT.md#LB-13)                                      | `COMMUNITY_BASELINE` at `Home.tsx:79` advertises **100 players / 170 matches / 42 courts** as fact when `site_stats/summary` is missing, and a genuine zero is indistinguishable from a failed read | Remove the baselines; skeleton while loading, `0` for zero, nothing on failure                                                                                                           |
| [LB-14](../ACTION-REPORT.md#LB-14)                                      | The court-count aggregate has no recency rule, so the same court shows a different count depending on whether the 6-hourly doc exists                                                               | Apply the client's 90-day / 0-points filter server-side too. **Needs an A1 functions deploy**                                                                                            |
| [LB-15](../ACTION-REPORT.md#LB-15)                                      | "#12" means a different thing on two pages, and neither reads the stored rank                                                                                                                       | Pick one pool; then read `stats.rankPosition` or delete it                                                                                                                               |
| [DC-11](../ACTION-REPORT.md#DC-11) / [DC-12](../ACTION-REPORT.md#DC-12) | `loses`, `tournamentsPlayed` and `rankPosition` are written and rendered nowhere                                                                                                                    | Surface **Losses**; delete the other two and their writers                                                                                                                               |

> **`matchAward` is the single source of truth for match scoring.** The writer and the display used to be two implementations of the same rules and **did drift** — the group table kept adding a +5 completion bonus long after the payout became the organizer's manual switch, so players were shown points nobody had given them. Never re-fork it.

`R6` check must still hold: all 204 `stats` docs satisfy `loses = matchesPlayed − wins`.

---

## A1 · Rules + Functions — `rules-functions`

### ⬛ P3 — Notification noise

| Change                                                                                     | Why                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One "draw is out" notice per player per draw** — no per-match fan-out, no bye notices    | Members currently get one per match                                                                                                                                                                                         |
| Notify a player when their next-round opponent is ready, and when their RR group is out    | Two notices that do not exist                                                                                                                                                                                               |
| **Joins reach the organizer as one "N joined today" digest**                               | Not one notice per join                                                                                                                                                                                                     |
| The weekly reminder counts only **real pending matches** and carries the nearest deadline  | _"You have 3 matches to play — earliest deadline 14 Sept"_. RR group matches have no deadline ([L17](../notes/HARMONIZATION_REPORT.md#L17)), so with no dated match it falls back to _"Arrange a time with your opponent."_ |
| Delete the false "ladder reset" notice                                                     | It fires on nothing                                                                                                                                                                                                         |
| `eventOrganizerUids` — every organizer notice goes to `creator_id` **and** `organizer_ids` | Assigned organizers currently get nothing                                                                                                                                                                                   |
| The server 30-day prune is the only purge; mark-read happens on tap                        | —                                                                                                                                                                                                                           |

Also: **Board Freshness must be `onDocumentCreated`, not `onDocumentUpdated`.** Reports auto-approve and `firestore.rules` forbids updates, so the old trigger waits for a transition that can never happen — those bonuses have never once been paid.

---

## A5 · Verify — `dev-verify`

### ⬛ The grep-assertion suite

`tsc` cannot see a class string. These are the **only** automated check on the entire colour and geometry sweep. One runnable script:

| Check                                                                                                                                                       | Passes when                                                                                                      | Fails as                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `grep -c 'FF6B35\|ff6b35\|255, *107, *53' src/`                                                                                                             | **0** — all 8 literal copies gone                                                                                | The accent ships in two colours; the FAB glow, the range slider and the PNG bracket export keep the old one. Invisible in a dark screenshot |
| `grep -rn 'bg-nav\|--color-nav' src/`                                                                                                                       | **0**                                                                                                            | `bg-nav` compiles to nothing and the bottom bar loses its fill                                                                              |
| Read the six background values                                                                                                                              | Page `#0B3027`, card `#143D34`, recess `#06211B`; light `#DEDED5` / `#FFFFFF` / `#D2D2C7` — **all six distinct** | Page and card share a value again. Presents as "shadows do nothing", not as "wrong colour"                                                  |
| `grep -c 'focus-visible' src/index.css`                                                                                                                     | **≥1** (0 today across all of `src/`)                                                                            | 194 controls with no visible keyboard focus                                                                                                 |
| `grep -c 'prefers-reduced-motion' src/index.css`                                                                                                            | **≥1**, covering both class names (14 + 16 = 30 elements)                                                        | Spinners keep spinning under an OS reduced-motion setting                                                                                   |
| `grep -rnE 'disabled:opacity-(25\|30\|35\|40)' src/`                                                                                                        | **0**                                                                                                            | The 16 overrides win on specificity, so the new base rule does nothing at exactly the 16 worst sites                                        |
| `grep -rc 'variant="danger"\|variant="primary"' src/`                                                                                                       | **0**                                                                                                            | Two names for one variant survive and re-split future call sites                                                                            |
| `grep -rc 'placeholder-gray-500' src/`                                                                                                                      | 12 → **0**                                                                                                       | A third text tier the two-tier rule exists to prevent                                                                                       |
| `grep -rn "bg-tennis-dark/70" src/features/events/EventsElements.tsx src/pages/marketplace/MarketplaceElements.tsx src/pages/services/ServicesElements.tsx` | **0**                                                                                                            | Every field in three sections renders page-coloured                                                                                         |
| `grep -c 'max-w-lg' src/components/Sheet.tsx`                                                                                                               | **0**                                                                                                            | The default nobody picks stays a trap                                                                                                       |
| `grep -c '!px-1.5' src/components/ContactOpponentButton.tsx`                                                                                                | **0**                                                                                                            | Icon-only pills stay under 44px while labelled ones grow                                                                                    |
| `grep -n 'w-\[calc(100%-' src/components/Tree.tsx`                                                                                                          | **2 hits survive**                                                                                               | The indent trick was flattened and the selected row's background runs under the parent label                                                |
| `grep -rc 'barColorClassName' src/`                                                                                                                         | **0**                                                                                                            | `tsc` catches it                                                                                                                            |
| `grep -rc 'min-h-11\|min-h-\[44px\]' src/components/`                                                                                                       | rises from **2**                                                                                                 | The `p-5` stayed on the Accordion card instead of moving inside the header button — the card grew and the tap row did not                   |

### ⬛ Design-sync diffs

Every step against Monday's grade, **both cells**. Specifically: the card visibly separates from the page in both themes; every button is 44px and `outline` is the same height as filled; the spinner is visible on `outline` in light; the unselected segment is **darker** than the track.

### ⬛ Owner walk

`/matches` (score modal) · `/events` (join sheet) · `/tasks` (three sheets) · `/marketplace` (post form) · `/profile` (avatar + courts) · `/leagues`. Then: type `/friendlies`, `/challenges`, `/nonsense`, `/tournament?event=X` signed out; switch the Matches mode and press Back. Then open the drawer, open a sheet over it, press Escape — **only the sheet should close**.

### ⬛ Exit gate

Every grep returns its stated value · `tsc` clean · design-sync clean in both cells · `R6` still holds on 204 docs.

---

## Handoffs into Sprint D4

| From | To  | What                                                                                |
| ---- | --- | ----------------------------------------------------------------------------------- |
| A4   | A4  | The primitives now exist — Thursday's zone/withdrawal UI is assembly, not invention |
| A2   | A1  | The `LB-14` server-side recency rule needs a functions deploy                       |
| A5   | all | The grep suite is now part of `npm run verify`                                      |
