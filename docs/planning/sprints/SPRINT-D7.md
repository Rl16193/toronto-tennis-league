# Sprint D7 — the shared component set

> **Collapse 83 card surfaces and 41 ways of drawing a person into one set of components.**
> The largest remaining bucket in the audit. [Sprint D6](SPRINT-D6.md) must land first.

|                   |                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Branch base**   | Sprint D6 merge                                                                                                                                                                                                                                                                                                                               |
| **Owner**         | **A4** almost alone. A3 supports on the pages, A5 on the visual baseline                                                                                                                                                                                                                                                                      |
| **Decisions**     | [DECISIONS-2026-08-29.md](../DECISIONS-2026-08-29.md) — rulings 2 (vocabulary) and 6 (stats)                                                                                                                                                                                                                                                  |
| **Source**        | [ACTION-REPORT.md](../../archive/planning-2026-08-23/ACTION-REPORT.md) CS rows · `ELEMENT-DESIGN-BRIEFS.md` (local only, not committed — 407KB) for per-element specs                                                                                                                                                                         |
| **Prior sprints** | [D1](../../archive/planning-2026-08-23/sprints/SPRINT-D1.md) · [D2](../../archive/planning-2026-08-23/sprints/SPRINT-D2.md) · [D3](../../archive/planning-2026-08-23/sprints/SPRINT-D3.md) · [D4](../../archive/planning-2026-08-23/sprints/SPRINT-D4.md) · [D5](../../archive/planning-2026-08-23/sprints/SPRINT-D5.md) · [D6](SPRINT-D6.md) |

**What already exists** from [D3](../../archive/planning-2026-08-23/sprints/SPRINT-D3.md) and [D5](../../archive/planning-2026-08-23/sprints/SPRINT-D5.md): the colour tokens, the focus ring, `Button`, `Sheet`, `Input`, `SegmentedControl`, and nine primitives — `Checkbox`, `EmptyState`, `ErrorScreen`, `FieldError`, `PersonRow`, `Pill`, `ProgressRing`, `StatTile`, `Switch`. This sprint builds the other thirteen and then uses all twenty-two.

---

## Board

| Group | Content                                                      | Rows |
| ----- | ------------------------------------------------------------ | ---: |
| **1** | Person components — `CS-1` first, it unblocks six others     |   10 |
| **2** | Cards, tiles and rows                                        |   11 |
| **3** | Overlays, forms and states                                   |   10 |
| **4** | The per-site sweeps                                          |  ~60 |
| **5** | Labels, copy and the remaining CS rows                       |  ~25 |
| **6** | One scoring rule — finish what [D6 C5](SPRINT-D6.md) started |    1 |
| **7** | Copy, 5.8-inch readability, and the leaderboard chart        |    3 |

**Binding rule for every row:** register the primitive in `.design-sync` **in the commit that creates it**, and consume it at one real call site in the same change. The build compiles CSS from `src/` only — a preview using a class no source file uses renders unstyled and looks broken.

---

## Group 1 · Person components

**[CS-1](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-1) is the prerequisite.** Six components depend on it; do it first.

| Row                                                                 | Build                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Retires                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **[CS-1](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-1)** | **`formatPersonName` already exists and is WRONG — [ruling 11](../DECISIONS-2026-08-29.md).** `PersonRow.tsx:4` trims and falls back but does **not** title-case, so building it added a _third_ formatter under the name meant to replace the other two. Make it title-case, **keep the `PLAYER_LOADING` / `BYE` / `Winner of …` guards that only `formatPlayerName` has** — without them the bracket renders `Bye` and `Winner Of Qf1` — then delete `toTitleCase` (`useStandings.ts:18`) and `formatPlayerName` (`utils.ts:155`). Live today: 6 members render `blake bell` on PersonRow and `Blake Bell` on the leaderboard | **three** formatters                        |
| [CS-3](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-3)     | Extend `PersonRow` (built in D5) to three densities; fold the Round Robin standings row in through an `editControls` slot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **41 ways of drawing a person**             |
| **CS-3b**                                                           | **A `seed` slot on `PersonRow`**, rendering `(1)` before the name. [Sprint D8](SPRINT-D8.md) computes the number; D7 only has to leave room for it. It counts against the two-stats-per-row budget in group 7                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                           |
| [CS-8](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-8)     | `PersonOption`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | nine picker surfaces                        |
| [CS-9](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-9)     | `PersonPairRow`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | seven copies of `{p1} vs {p2}`              |
| [CS-10](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-10)   | `PersonChip`, `PersonInline`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                           |
| [CS-17](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-17)   | `initialOf()`; avatars at two sizes — 24 and 96                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | three first-initial implementations         |
| [CS-20](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-20)   | Restore the fixed 78px action slot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | half the call sites defeat it with `w-auto` |
| [CS-21](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-21)   | Align expanded-row behaviour; stop the double own-row highlight                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                           |
| [AX-25](../../archive/planning-2026-08-23/ACTION-REPORT.md#AX-25)   | Confirm text and screen-reader labels use the formatted name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                           |

The partner pool panel from [D6 F1](SPRINT-D6.md) uses `PersonRow` — check it picks up the new densities rather than keeping a local variant.

---

## Group 2 · Cards, tiles and rows

| Row                                                               | Build                                                                               | Retires                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| [CS-2](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-2)   | `StatGrid` around the existing `StatTile`                                           | seven tile geometries                               |
| [CS-4](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-4)   | `ListRow` + `ListGroup`                                                             | eight copies of one skeleton                        |
| [CS-5](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-5)   | `EntityCard`                                                                        | five copies of one footer card                      |
| [CS-6](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-6)   | `ReviewPanel`                                                                       | five organizer queues, five chromes                 |
| [CS-7](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-7)   | One `ProfileCard` with `mode: 'own'                                                 | 'public'` ([ruling 13](../DECISIONS-2026-08-29.md)) | **Three components, 2,021 lines** — not the two this row names: `Profile.tsx` (651), `ProfileInfo.tsx` (983), `PlayerProfile.tsx` (387). The duplications sit on **different pairs** — streak is Profile↔PlayerProfile, the `Phone` (`ProfileInfo:393`) vs `Contact` (`PlayerProfile:256`) drift is the other — so collapsing only two moves the problem. **The streak, `pgWinPct` and `initialOf` duplications all end here for free** ([ruling 12](../DECISIONS-2026-08-29.md)). The safety boundary is the rules file, not the component |
| [CS-11](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-11) | `ApprovePair`                                                                       | six hand-written approve/reject pairs               |
| [CS-13](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-13) | Heading pattern `{Title} ({n})` on every queue                                      | —                                                   |
| [CS-14](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-14) | Fold four hand-rolled disclosures into `Accordion`                                  | —                                                   |
| [CS-15](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-15) | One expanded-drawer layout                                                          | —                                                   |
| [CS-16](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-16) | `PlaceCard`; the court-map popup becomes a **density**, not a rewrite               | —                                                   |
| [CS-43](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-43) | Widen the desktop bracket column or move it out of `max-w-xl`; add a `slot` variant | —                                                   |

---

## Group 3 · Overlays, forms and states

| Row                                                                                                                                                                                                       | Build                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [MF-8](../../archive/planning-2026-08-23/ACTION-REPORT.md#MF-8)                                                                                                                                           | Convert the 15 inline error paragraphs to the existing `FieldError`                                                                                                                                                                                                                                                                                                                                                                                                |
| [MF-9](../../archive/planning-2026-08-23/ACTION-REPORT.md#MF-9)                                                                                                                                           | `AlertMessage` becomes the **only** banner — **2 consumers** (`MatchCard.tsx`, `Tournament.tsx`; this row says 1, it has drifted) against 13 hand-rolled copies, 11 with no box at all and none announcing to a screen reader                                                                                                                                                                                                                                      |
| [MF-10](../../archive/planning-2026-08-23/ACTION-REPORT.md#MF-10)                                                                                                                                         | `ConfirmSheet` — **every browser `confirm()` becomes a modal form with yes and no** ([ruling 14](../DECISIONS-2026-08-29.md)). There are **five, not four**: `MarketplaceElements.tsx:114` · `ServicesElements.tsx:792` · `MatchCard.tsx:100` · `RRGroupCard.tsx:213` · `Tournament.tsx:535`. **Sequence after the withdrawal work** — `Tournament.tsx:535` is the withdrawal confirm and L12 rewrites it                                                          |
| [MF-11](../../archive/planning-2026-08-23/ACTION-REPORT.md#MF-11)                                                                                                                                         | `Popover` — surface plus 44px rows; make the three in-flow popovers absolutely positioned                                                                                                                                                                                                                                                                                                                                                                          |
| [MF-12](../../archive/planning-2026-08-23/ACTION-REPORT.md#MF-12)                                                                                                                                         | Convert the 11 raw checkboxes to the existing `Checkbox`                                                                                                                                                                                                                                                                                                                                                                                                           |
| [MF-13](../../archive/planning-2026-08-23/ACTION-REPORT.md#MF-13)                                                                                                                                         | Convert the three verbatim-duplicated toggles to the existing `Switch`                                                                                                                                                                                                                                                                                                                                                                                             |
| **MF-14** _(new)_                                                                                                                                                                                         | **Every dropdown becomes a modal form** ([ruling 14](../DECISIONS-2026-08-29.md)). 14 native `<select>` across 9 files: `RRGroupCard` (3) · `TournamentElements` (2) · `CourtMapElements` (2) · `EventsElements` (2) · `MatchCard` · `AddPlayerPanel` · `ServicesElements` · `MarketplaceElements` · `ClaimModal`. Also closes [AX-13](../../archive/planning-2026-08-23/ACTION-REPORT.md#AX-13) — nine unlabelled selects — since a modal carries its own heading |
| [MF-7](../../archive/planning-2026-08-23/ACTION-REPORT.md#MF-7)                                                                                                                                           | Standardise field chrome — label, asterisk, hint, error, spacing                                                                                                                                                                                                                                                                                                                                                                                                   |
| [CS-35](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-35)                                                                                                                                         | `Skeleton` that inherits the radius and height of what it replaces                                                                                                                                                                                                                                                                                                                                                                                                 |
| [CS-36](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-36)                                                                                                                                         | One `Spinner`; drop the second mechanism                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [CS-30](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-30) · [CS-31](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-31) · [CS-32](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-32) | Use the existing `ProgressRing` in the Tasks header, the Initiation accordion and the Round Robin group card                                                                                                                                                                                                                                                                                                                                                       |

`CS-32` was blocked on the knockout gate; [D6 C1](SPRINT-D6.md) unblocks it. A completion ring beside a permanently shut gate was the thing to avoid.

---

## Group 4 · The per-site sweeps

Everything below is applying what D3 built. No new decisions.

| Rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CT-3](../../archive/planning-2026-08-23/ACTION-REPORT.md#CT-3) · [CT-5](../../archive/planning-2026-08-23/ACTION-REPORT.md#CT-5) · [CT-7](../../archive/planning-2026-08-23/ACTION-REPORT.md#CT-7)                                                                                                                                                                                                                                                                           | 42 page-coloured backgrounds across 22 files · **12 row separators that vanish on light cards**, so eight list surfaces read as one block · **9 surfaces with no fill at all in light theme**, including the six Profile stat tiles                                                                                                                                                                                                                        |
| [CT-6](../../archive/planning-2026-08-23/ACTION-REPORT.md#CT-6) · [CT-8](../../archive/planning-2026-08-23/ACTION-REPORT.md#CT-8) · [CT-9](../../archive/planning-2026-08-23/ACTION-REPORT.md#CT-9) · [CT-10](../../archive/planning-2026-08-23/ACTION-REPORT.md#CT-10)                                                                                                                                                                                                       | Seven hairline opacities → one · 38 surface tints → five · every third text tier removed · nine unselected states that read as selected                                                                                                                                                                                                                                                                                                                    |
| **CT-31** _(new 2026-08-29)_                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Light-mode clay.** Add `--color-clay: #ff6b35` to the light block at `src/index.css:51`. One line — every `bg-clay`, `shadow-clay`, `clay-gradient`, `accent-clay` and `focus:ring-clay` inherits it. **`--color-clay-fg` stays `#9e2d12`**: it is text, and #ff6b35 on the light surface is 2.8:1, under both the 4.5:1 AA floor and the 3:1 UI floor. Dark mode keeps `#e84a27`                                                                        |
| **CT-32** _(new 2026-08-29)_                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Remove the clay border from buttons** — `Button.tsx:26` (`outline` variant), `ContactOpponentButton.tsx:31`, `CourtMap.tsx:862`. `Button.tsx:45` already sets `border border-transparent` on the base, so the box does not move. **Keep** `Input.tsx:12` `focus:border-clay` (focus indicator) and the spinner rings at `Layout.tsx:10` / `Leagues.tsx:161`. With the border gone, `outline` and `ghost` differ only in text colour — collapse them here |
| [CT-18](../../archive/planning-2026-08-23/ACTION-REPORT.md#CT-18)…[CT-30](../../archive/planning-2026-08-23/ACTION-REPORT.md#CT-30)                                                                                                                                                                                                                                                                                                                                           | The member-picker panel · the pending-score button · the match status dot · eight raw-hex badges in both court lists · the `PAST` badge contrast · the court map's 60 hex literals · chart colours · one shared marker colour · both deadline inputs · the bracket player select · elevation stripped from in-flow surfaces                                                                                                                                |
| [BT-17](../../archive/planning-2026-08-23/ACTION-REPORT.md#BT-17) **then** [BT-9](../../archive/planning-2026-08-23/ACTION-REPORT.md#BT-9)/[BT-10](../../archive/planning-2026-08-23/ACTION-REPORT.md#BT-10)                                                                                                                                                                                                                                                                  | **Order matters** — widen the gaps _before_ growing the targets, or the upper control silently steals the lower one's taps mid-sweep                                                                                                                                                                                                                                                                                                                       |
| [BT-16](../../archive/planning-2026-08-23/ACTION-REPORT.md#BT-16) · [BT-20](../../archive/planning-2026-08-23/ACTION-REPORT.md#BT-20)…[BT-28](../../archive/planning-2026-08-23/ACTION-REPORT.md#BT-28)                                                                                                                                                                                                                                                                       | 18 organizer micro-fields · four `!important` overrides · 13 "selected" treatments → one · the radius ladder · concentricity · bare transitions · five dead hover borders                                                                                                                                                                                                                                                                                  |
| [TY-1](../../archive/planning-2026-08-23/ACTION-REPORT.md#TY-1) · [TY-2](../../archive/planning-2026-08-23/ACTION-REPORT.md#TY-2) · [TY-4](../../archive/planning-2026-08-23/ACTION-REPORT.md#TY-4) · [TY-6](../../archive/planning-2026-08-23/ACTION-REPORT.md#TY-6) · [TY-7](../../archive/planning-2026-08-23/ACTION-REPORT.md#TY-7) · [TY-9](../../archive/planning-2026-08-23/ACTION-REPORT.md#TY-9) · [TY-10](../../archive/planning-2026-08-23/ACTION-REPORT.md#TY-10) | **161 sites below the 12px floor** · two heading sizes only · 12 label treatments → one · tracking · weights · break the contact email at the `@` · 12-hour times                                                                                                                                                                                                                                                                                          |
| [AX-3](../../archive/planning-2026-08-23/ACTION-REPORT.md#AX-3)…[AX-16](../../archive/planning-2026-08-23/ACTION-REPORT.md#AX-16) · [AX-20](../../archive/planning-2026-08-23/ACTION-REPORT.md#AX-20)…[AX-22](../../archive/planning-2026-08-23/ACTION-REPORT.md#AX-22) · [AX-26](../../archive/planning-2026-08-23/ACTION-REPORT.md#AX-26)                                                                                                                                   | Keyboard paths for the member picker, four court comboboxes and three password toggles · names for nine unlabelled selects and three X buttons · `role="alert"` on banners · Escape on map popups · **a consent banner before analytics fires**                                                                                                                                                                                                            |

> **[TY-3](../../archive/planning-2026-08-23/ACTION-REPORT.md#TY-3) is already written into `CLAUDE.md`.** Do not let the heading sweep eat the 16px control size — it re-opens the iOS zoom-on-focus bug on 58 fields.

---

## Group 5 · Labels, copy and the rest

### ⬛ One vocabulary _(ruling [2](../DECISIONS-2026-08-29.md), 2026-08-29)_

**Measured:** a member sees **"Completed", "Done" and "Score recorded" for the same fixture** — [CS-24](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-24) found four vocabularies across four files.

**On a match card there are two words and no others:**

| Word        | Means                      |
| ----------- | -------------------------- |
| **Pending** | not played yet             |
| **Done**    | a score has been submitted |

> **[CS-24](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-24)'s own proposal is void.** It proposed `Scheduled · Pending · Done · No show`. **`No show` was deleted** (DECISIONS_BRIEF §1) and **`Scheduled` was deleted** (WDR §3 — no dates are stored). Implement `Pending` / `Done` only.

**Files** · `MatchCard.tsx:130` (`Score recorded`/`Pending`) · `OpponentPanels.tsx:41-48` (`Win`/`Loss`/`Completed`/`Scheduled on …`) · `RRGroupCard.tsx:335` (`Done`) · `:241` (`W`/`L` — the viewer's glyph, keep).

**Stored words, one per idea:** `confirmed` for a settled match (retires `complete`, `used`) · `declined` for a turned-down invitation (retires `rejected`) · `withdrawn` for leaving a tournament (retires `removal`, `removed`, and `inactive` — there is no app-level inactive state) · `completed` for tasks and service jobs.

### ⬛ The stats a member sees _(ruling [6](../DECISIONS-2026-08-29.md))_

Nothing else is rendered on either surface.

| Surface                     | Shows                                                             |
| --------------------------- | ----------------------------------------------------------------- |
| **Leaderboard row**         | matches won · P/G won % · rank move · streak (`2W`, `2L`)         |
| **Round Robin group table** | matches won in that group · overall P/G won % · pending · contact |

**Streak is derived, not stored** ([ruling 6](../DECISIONS-2026-08-29.md)) — the same stat the profile page already shows: consecutive wins or losses from the most recent completed matches until the run breaks. `tasks.currentStreak` is a bare count with no W/L direction and cannot serve it.

> **This is CS-7, not a new helper.** The streak is derived twice today only because Profile and PlayerProfile are two separate 700-line components. [CS-7](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-7) in group 2 already collapses them into **one `ProfileCard` with `mode: 'own' | 'public'`** — the streak travels with the card and the duplication ends there. **Do CS-7 before the leaderboard row**, and there is nothing to extract.

This supersedes the open half of [CS-22](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-22)…[CS-29](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-29): the labels still need to be consistent, but **which** stats appear is now settled.

### ⬛ Download Draw _(ruling [8](../DECISIONS-2026-08-29.md))_ — new

One control giving the organizer the draw **and** their participants' contacts together. The only existing "Download the draw" is an error-boundary fallback at `TournamentElements.tsx:65`; this is a different, new control on the organizer view.

[CS-22](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-22)…[CS-29](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-29) — one label per stat, everywhere: `P/G Won %`, `Wins`, `Matches`, `Group Pts`, the skill band on the Leagues row, two distinct labels for the two draw counts, `{n} players`, and the rank move rendered once per row.

**`initialOf` at `ServicesElements.tsx:595`** — the one duplicate the profile consolidation does not reach. Point it at `PersonRow.tsx:5` ([ruling 12](../DECISIONS-2026-08-29.md)).

[CS-34](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-34) — the two fabricated loading percentages become indeterminate.
[CS-37](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-37) — **already retired** with the no-show concept in [D2](../../archive/planning-2026-08-23/sprints/SPRINT-D2.md).
[CS-38](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-38) — one rewards-available helper.
[CS-40](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-40) · [CS-41](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-41) — counts on Events, totals and links on History.
[CS-44](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-44)…[CS-68](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-68) — court map, services, marketplace, notifications and the remaining copy defects.

---

## Group 6 · One scoring rule

[Sprint D6 C5](SPRINT-D6.md) took three copies of the points table to two. The last two cross the server/browser boundary and cannot share a file — **so remove the need for the browser copy.**

**Build** · when the server applies a result, have it record the points it actually paid onto the match: `points_winner`, `points_loser`. Then `computeGroupStandings` reads those numbers instead of recalculating them, and `matchAward` can be deleted from the browser bundle entirely.

Two things this buys:

1. **One implementation of the scoring rules**, which is what was asked for.
2. **The group table shows what was actually paid**, not what the browser believes should have been paid. That divergence is the exact defect on record — the table kept adding a bonus nobody had received.

No extra database cost: the fields go into a record already being written in the same transaction.

**Done when** · `matchAward` is gone from `src/` · the group table reads stored figures · a rescore updates them · one payout table remains in the codebase.

---

---

## Group 7 · Copy, readability and the leaderboard chart

### ⬛ UI copy — write like a person

Sweep every user-facing string. The tell-tale signs of machine-written copy, and what to do instead:

| Avoid                                                                  | Use instead                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Em dashes** (—) standing in for a comma or a full stop               | A comma, or two sentences                                  |
| "Simply", "seamlessly", "effortlessly", "unlock", "elevate", "empower" | Delete the word. The sentence is usually better without it |
| Three-part lists written for rhythm rather than meaning                | Say the one thing that matters                             |
| "Please note that…", "In order to…"                                    | "Note:", "To…"                                             |
| Long sentences with a subordinate clause in the middle                 | Two short sentences                                        |

Examples from the current build:

- _"Choose the courts you can reach. This routes your event draw."_ → **"Pick the courts you can get to. We use these to put you in the right draw."**
- _"Unplayed matches become walkovers; played matches stay recorded."_ → **"Matches you have not played become walkovers. Played matches stay as they are."**
- _"No partner yet? Leave this blank to join the event's partner pool."_ → fine as is. Short, plain, asks a real question.

Apply this to buttons, empty states, error messages, confirmations and notification text. Keep it to what a person would actually say out loud.

### ⬛ Privacy Policy and Terms of Service — DEFERRED

**Owner ruling 2026-08-29: not this sprint, and not D8.** Tracked as [BLG0067](../../BACKLOG.md). The gaps found while scoping it are recorded there so the work does not have to be re-discovered: undisclosed EXIF GPS on court photos, the undisclosed contact-sharing model, no retention policy, no data-rights section, no named privacy contact, and no effective date. Two facts are still missing before it can be written — the accountable privacy contact and the legal entity name.

### ⬛ Player rows must fit a 5.8 inch screen

Every row built in groups 1 and 2 has to stay readable and **on one line** at 5.8 inches — roughly 360 to 375 CSS pixels wide.

| Rule             | Detail                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Name             | Truncates with an ellipsis. It never wraps to a second line                                     |
| Stats            | At most two numbers beside the name at this width. Anything else moves into the expanded drawer |
| Action slot      | Fixed width, and it never shrinks the name below about 40% of the row                           |
| Contact controls | Icon-only at this width, never icon plus label                                                  |
| Test             | Check every row type at **360px** before the row is considered done                             |

This applies to `PersonRow` and its three densities, `ListRow`, `PersonPairRow`, `PersonOption` and the Round Robin standings row. A row that only works on a desktop preview is not finished.

### ⬛ The leaderboard progress chart

Replace the current chart. What it shows:

| Aspect               | Rule                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Range                | **The member's last 5 matches.** Not their whole history                                                                           |
| Series 1             | **P/G won %**                                                                                                                      |
| Series 2             | **Rank**                                                                                                                           |
| Rank axis            | **Inverted**, so moving up the chart always means improving. Rank 1 sits at the top                                                |
| Axis labels          | **None.** No tick labels on either axis                                                                                            |
| Annotations          | Each point carries its own value, in the form **"48% P/G won"** and **"rank #23"**                                                 |
| If labels collide    | At 360px five labels per series will not fit. Label the **first and last** points only, and keep the middle three as plain markers |
| Fewer than 5 matches | Plot what exists. With one match, show the single point with its annotation and no line                                            |
| No matches           | Empty state, no axes drawn                                                                                                         |

The point of dropping the axis labels is that the annotations carry the numbers, so the chart reads at a glance on a phone without anyone decoding a scale.

## Verification

`tsc` cannot see a class string, so the grep suite built in [D3](../../archive/planning-2026-08-23/sprints/SPRINT-D3.md) (`scripts/verify-design-d3.mjs`) is the only automated check on this work. Extend it as rows land.

| Check                                 | Passes when                                                  |
| ------------------------------------- | ------------------------------------------------------------ |
| Sub-12px text                         | 161 → 0                                                      |
| Row separators that do not flip       | 12 → 0                                                       |
| Surfaces with no light-theme fill     | 9 → 0                                                        |
| Unselected states reading as selected | 9 → 0                                                        |
| Browser `confirm()`                   | 4 → 0                                                        |
| Hand-rolled banners                   | 13 → 0                                                       |
| `matchAward` in `src/`                | present → absent                                             |
| Design-sync diff                      | clean in **both** light and dark cells for all 22 components |
| Owner walk                            | Every screen in both themes on a real phone                  |

**Six of the eight original audit passes found light-theme-only defects.** A dark-only check proves nothing here.

---

## Sequencing that matters

| Order | Do this first                                                                                                                                                                                              | Why                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1     | [CS-1](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-1)                                                                                                                                            | Six person components depend on it                                               |
| 2     | [BT-17](../../archive/planning-2026-08-23/ACTION-REPORT.md#BT-17) before [BT-9](../../archive/planning-2026-08-23/ACTION-REPORT.md#BT-9)/[BT-10](../../archive/planning-2026-08-23/ACTION-REPORT.md#BT-10) | Widen gaps before growing targets, or controls steal each other's taps           |
| 3     | [D6 C1](SPRINT-D6.md) before [CS-32](../../archive/planning-2026-08-23/ACTION-REPORT.md#CS-32)                                                                                                             | Do not put a completion ring beside a gate that cannot open                      |
| 4     | Group 6 last                                                                                                                                                                                               | It touches the scoring path; keep it away from the visual sweeps                 |
| 5     | Group 7 copy sweep after groups 1-3                                                                                                                                                                        | Rewriting strings inside components that are about to be replaced is wasted work |
