# UI/UX audit — 2026-10-30

Measured against the homepage spec (CLAUDE.md, "The homepage is the design-system reference") and the
ui-ux-pro-max checklist (accessibility, touch, layout, type). Brand kept: #143D34, clay, lime, the two
text tiers. No code changed. Counts are from `src/**/*.tsx`.

**Already right:** one icon set (lucide), `SelectField` everywhere (no native `<select>`), no raw
palette text colours, text tiers held, 92 `aria-label`s.

## 1. Shared components (fix once, every page follows)

| # | Where | Finding | Proposed fix |
|---|---|---|---|
| S1 | `Button.tsx` | No focus ring. Sizes set padding, not height: `sm` ≈ 32px (51 uses), below the 44px rule | Add the homepage focus classes; `md` = `h-11`, `sm` = fixed height (see decision B) |
| S2 | `Button.tsx` | `primary` and `clay` are identical; `secondary` fills `bg-tennis-surface`, which is the page colour in dark, so it has no visible fill | Merge `primary` into `clay`; `secondary` → `bg-fg/5` |
| S3 | `Button.tsx` | Loading spinner is `border-white`, so it can't be seen on `white`/`lime` buttons | Spinner uses `currentColor` |
| S4 | `ContactOpponentButton.tsx` | A second button system, `pillButtonCls` (11 uses, 6 files), plus 53 raw `<button>`s in 20 files and 4 `!px/!text` overrides of `Button` (e.g. Leagues' challenge button forced to 11px) | Move them onto `Button`; hotspots: Newsletter 8, Matches 6, Services 5, Marketplace 5, Signup 5 |
| S5 | `SegmentedControl.tsx` | Inactive segment is hardcoded `bg-white text-ink` (ignores theme); `rounded-xl/lg`; ~32px tall | `bg-fg/5 text-fg`, `rounded-2xl`, `min-h-11` |
| S6 | `Input.tsx` | `<label>` not tied to the input (`htmlFor`/`id`); error not linked (`aria-invalid`, `aria-describedby`) | Generate an id with `useId` |
| S7 | `AlertMessage.tsx` | No `role="alert"` / `aria-live`: screen readers miss errors | `role` by tone (error → alert, else status) |

## 2. Colour contrast (WCAG AA needs 4.5:1 for normal text)

| Pair | Ratio | |
|---|---|---|
| White label on clay `#FF6B35` (every primary button) | **2.84** | fails |
| White on clay-dark `#E84A27` (hover) | 3.86 | fails |
| `text-clay` on light-theme card (required asterisks, hints) | **2.84** | fails |
| `text-clay` on dark `#143D34` | 4.24 | just under |
| `text-fg/70` light / dark | 4.86 / 6.77 | pass |
| Ink on lime (light) | 5.52 | pass |

See decision A.

## 3. Text

- **105 sizes under 12px**: `text-[11px]` ×52, `text-[10px]` ×46, `text-[9px]` ×7. Hotspots:
  TournamentElements 14, RRGroupCard 11, Tasks 8, Services 7, Marketplace 6, PlayerCard 6,
  CourtMapElements 5. Fix → `text-xs`.
- **Headings drift**: `h2` is set at 2xl / xl / lg / base / sm; `h1` at 3xl / 2xl / 5xl. Spec: section
  `text-2xl`, sub `text-lg`, hero `text-3xl` only.

## 4. Layout and surfaces

- **Radius**: 7 values. `rounded-2xl` 144, `rounded-xl` 72, `rounded-lg` 54, `rounded-3xl` 49
  (PlayerDash 15), bare `rounded` 32. Spec is `rounded-2xl` for controls and cards; keep
  `rounded-full` for pills and avatars.
- **Card fills**: `bg-fg/5` 129, `bg-fg/10` 50, plus `/15`, `/20`, `/30`, `/70`, `bg-fg/[0.04]`, and
  `bg-tennis-surface/30` (Leagues rows and skeletons, which disappear in dark for the same reason as S2).
  Borders on cards in ~10 files; 53 `shadow-*` in 17 files. Spec: `bg-fg/5` fill, no border, no shadow.
  `bg-fg/10` is still kept for "played" rows (the Tournament match card).
- **Focus rings** exist in only 16 files; most pages have none.
- **Page widths**: `max-w-md` 31, `xl` 15, `2xl`, `3xl`, `4xl`, `6xl`, `7xl`. Each page picks its own.
- **Loading**: 12 files hand-roll spinners at different sizes (Leagues uses a 56px one); `LoadingBar`
  is used in 3.

## 5. Tables

No shared table or row. The data-heavy views each build their own: the Leagues leaderboard rows, the RR
group stat tiles (`text-[9px]` uppercase labels), the Provider Dash desktop `TABLE_COLS` grid, and
the Player Dash stat grids. Headers, label size, padding and row separators all differ, and only
Newsletter uses a real `<table>`. Numbers already use `tabular-nums` in places; apply it to every
numeric column. See decision C.

## Proposed order

1. Shared components S1–S7 (one small diff each).
2. Text floor (§3) and heading sizes.
3. Radius, card fill and border/shadow sweep (§4), page by page.
4. Tables (§5).
5. Per-page sweep, mobile first: Events → Matches → Tournament → Courts → Marketplace → Services →
   the three dashes.

## Decisions needed

- **A. Clay contrast.** Darken clay for text and fills (e.g. ≈ `#D4501E` gives ~4.5:1 with white),
  keep the current clay for large and decorative uses only, or accept the current clay as it is.
- **B. Small button height.** `sm` at 44px everywhere (the spec), or 36px for in-row actions (Score,
  Accept), which still passes WCAG 2.2 AA (24px).
- **C. Table primitive.** Add one shared row/stat-tile component (a new file), or align the four
  hand-built tables in place.
- **D. One page width**, e.g. `max-w-xl` for content pages and the dashes' own wide layout from `xl`.

## Status — swept 2026-10-30

Done: S1–S7; sizes under 12px (0 left); headings; radii (0 `rounded-xl/lg/3xl` left); card fills,
card shadows and `bg-tennis-surface/*` cards; tables via `tableHeadCls` / `statTileCls` / `numCls`;
page widths; `cursor: pointer` and a fallback focus ring in `index.css`; ✓/✕ glyphs → lucide icons;
disabled opacity → 50; 12px icons → 14px. Rules are recorded in CLAUDE.md ("The homepage is the
design-system reference").

Decisions: A, clay kept as is; B, `sm` = 36px in rows, 44px elsewhere; C, shared class strings;
D, `max-w-xl` content pages.

Not done: the 12 hand-rolled loading spinners; heading weights left as on the homepage (`font-black`).
