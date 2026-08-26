# UI/UX Summary Report

> ⚠ **Branch note (2026-08-23).** This was written against `main`, which is **116 commits behind** `tbtc/dev-anuj` @ `9c81f00`. The design layer is unchanged between them, so every finding here still stands — but **line citations have moved** across 128 files. See `docs/UI-REMAINING.md` for the re-citation table and what is still outstanding.

> One row per kind of work. The 273 individual actions in `docs/ACTION-REPORT.md` are merged into
> **12 actions** below; every row lists the action-report IDs it covers so you can drill in.
> Detail: `ACTION-REPORT.md` (the items) · `ELEMENT-DESIGN-BRIEFS.md` (the specs) · `UI-UX-INVENTORY.md` (the evidence).

**Nothing here has been implemented.** `src/` is unchanged.

---

## 1. Actions

| #   | Action                                                                  | Pages it touches                                  | Workflow                       | Fixes                                                                                                                                         |   Items |       Days |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------: | ---------: |
| 1   | Fix the things that are actually broken for members right now           | App shell, Court Map, Docs / server, Events +13   | Fix functional bugs            | LB-1…50                                                                                                                                       |      50 |      27.50 |
| 2   | Collapse 83 card surfaces and their duplicates into one card set        | App shell, App-wide, Court Map, Events +13        | Consolidate cards & components | CS-4…9, CS-11, CS-13, CS-14, CS-16, CS-18, CS-20, CS-21, CS-23, CS-26, CS-30, CS-32, CS-35, CS-37, CS-38, CS-41, CS-43…49, CS-51…62, CS-64…68 |      45 |      42.25 |
| 3   | Move every colour onto a token that survives the light/dark flip        | App shell, App-wide, Court Map, Design tokens +12 | Fix colour tokens              | CT-1…32                                                                                                                                       |      32 |      14.75 |
| 4   | Put every button on one size, one shape, one focus state                | App shell, App-wide, Court Map, Design tokens +11 | Standardise buttons & controls | BT-1…29                                                                                                                                       |      29 |      23.75 |
| 5   | Remove dead variants, unused props, stale copy and unreachable paths    | App shell, App-wide, Court Map, Design tokens +12 | Delete dead code               | DC-1…27                                                                                                                                       |      27 |      12.75 |
| 6   | Add the focus ring, ARIA and keyboard paths the app has none of         | App shell, App-wide, Court Map, Design tokens +11 | Add focus & accessibility      | AX-1…26                                                                                                                                       |      26 |      13.25 |
| 7   | Make each stat mean one thing and carry one label everywhere            | App shell, App-wide, Court Map, Design tokens +10 | Unify stat definitions         | CS-1, CS-2, CS-12, CS-15, CS-22, CS-24, CS-25, CS-27…29, CS-31, CS-33, CS-34, CS-36, CS-39, CS-40, CS-42, CS-50, CS-63                        |      19 |      16.00 |
| 8   | One sheet shell and one field system for every modal, add and edit form | App-wide, Events, Marketplace, Profile +5         | Unify modals & forms           | MF-1…15                                                                                                                                       |      15 |      14.25 |
| 9   | Fix redirects, the catch-all URL and the links that drop their target   | App shell, Court Map, Events, Home +5             | Fix routes & navigation        | RT-1…13                                                                                                                                       |      13 |       4.00 |
| 10  | One heading size, one subheading, and nothing below the 12px floor      | App shell, App-wide, Events, Marketplace +6       | Fix text sizes & headings      | TY-1…10                                                                                                                                       |      10 |       4.75 |
| 11  | Collapse 41 ways of drawing a person into one row component             | App-wide, Leagues, Matches, Profile +3            | Unify player rows              | CS-3, CS-10, CS-17, CS-19                                                                                                                     |       4 |       7.25 |
| 12  | Hand the organizer full control; remove auto-seeding and fixed slots    | App-wide, Docs / server, Tournament               | Rework the knockout draw       | KO-1…3                                                                                                                                        |       3 |       2.25 |
|     | **Total**                                                               | **20 areas**                                      | **12 workflows**               |                                                                                                                                               | **273** | **182.75** |

Notes, one per action:

| #   | Workflow                       | Note                                                   |
| --- | ------------------------------ | ------------------------------------------------------ |
| 1   | Fix functional bugs            | Includes the live score-modal defect corrupting points |
| 2   | Consolidate cards & components | Largest bucket; unblocked by the card decision         |
| 3   | Fix colour tokens              | Mostly one file — the cheapest large win               |
| 4   | Standardise buttons & controls | 111 of 194 controls come from two functions            |
| 5   | Delete dead code               | Pure removal, no design decisions                      |
| 6   | Add focus & accessibility      | `focus-visible` appears 0 times in the app today       |
| 7   | Unify stat definitions         | Governed by the remodel process (R-6)                  |
| 8   | Unify modals & forms           | 0 of 19 sheets use the default width                   |
| 9   | Fix routes & navigation        | Two are one-line fixes                                 |
| 10  | Fix text sizes & headings      | 161 sites sit below the 12px floor                     |
| 11  | Unify player rows              | Prerequisite: merge the two name formatters            |
| 12  | Rework the knockout draw       | New behaviour from ruling R-4                          |

---

## 2. Page stats

An action touching several pages is counted once per page, so the column sums above 273.

| Page              | Items |  Days | Heaviest workflow              | Share of that workflow |
| ----------------- | ----: | ----: | ------------------------------ | ---------------------: |
| Tournament        |    65 | 53.25 | Consolidate cards & components |                  13/45 |
| Profile           |    41 | 34.00 | Fix functional bugs            |                  10/50 |
| Shared components |    41 | 31.50 | Standardise buttons & controls |                  13/29 |
| Tasks             |    32 | 26.75 | Consolidate cards & components |                   9/45 |
| Matches           |    31 | 28.25 | Consolidate cards & components |                  10/45 |
| Court Map         |    29 | 17.00 | Fix colour tokens              |                  11/32 |
| App-wide          |    27 | 26.25 | Consolidate cards & components |                   5/45 |
| Other             |    21 | 14.25 | Consolidate cards & components |                   5/45 |
| Signup            |    19 | 11.50 | Fix functional bugs            |                   5/50 |
| App shell         |    19 |  8.50 | Fix routes & navigation        |                   6/13 |
| Services          |    19 | 12.25 | Consolidate cards & components |                   6/45 |
| Leagues           |    18 | 13.00 | Fix functional bugs            |                   5/50 |
| Events            |    17 | 12.50 | Fix colour tokens              |                   3/32 |
| Marketplace       |     9 |  6.00 | Fix functional bugs            |                   2/50 |
| Design tokens     |     9 |  2.25 | Fix colour tokens              |                   5/32 |
| Static pages      |     8 |  2.00 | Fix routes & navigation        |                   4/13 |
| Home              |     6 |  3.75 | Fix functional bugs            |                   3/50 |
| Notifications     |     6 |  5.25 | Fix functional bugs            |                   2/50 |
| History           |     5 |  8.75 | Fix functional bugs            |                   2/50 |
| Docs / server     |     4 |  1.75 | Delete dead code               |                   2/27 |

---

## 3. Workflow stats

| Workflow                       |   Items | Pages |       Days | Heaviest page     |       S |      M |      L |    XL |
| ------------------------------ | ------: | ----: | ---------: | ----------------- | ------: | -----: | -----: | ----: |
| Fix functional bugs            |      50 |    17 |      27.50 | Profile           |      34 |     14 |      2 |     0 |
| Consolidate cards & components |      45 |    17 |      42.25 | Tournament        |      19 |     20 |      5 |     1 |
| Fix colour tokens              |      32 |    16 |      14.75 | Court Map         |      25 |      6 |      1 |     0 |
| Standardise buttons & controls |      29 |    15 |      23.75 | Shared components |      17 |      7 |      5 |     0 |
| Delete dead code               |      27 |    16 |      12.75 | App-wide          |      21 |      5 |      1 |     0 |
| Add focus & accessibility      |      26 |    15 |      13.25 | Shared components |      17 |      9 |      0 |     0 |
| Unify stat definitions         |      19 |    14 |      16.00 | Tournament        |      10 |      6 |      3 |     0 |
| Unify modals & forms           |      15 |     9 |      14.25 | Shared components |       5 |      8 |      2 |     0 |
| Fix routes & navigation        |      13 |     9 |       4.00 | App shell         |      12 |      1 |      0 |     0 |
| Fix text sizes & headings      |      10 |    10 |       4.75 | App-wide          |       7 |      3 |      0 |     0 |
| Unify player rows              |       4 |     7 |       7.25 | Profile           |       1 |      2 |      0 |     1 |
| Rework the knockout draw       |       3 |     3 |       2.25 | Tournament        |       1 |      2 |      0 |     0 |
| **Total**                      | **273** |       | **182.75** |                   | **169** | **83** | **19** | **2** |

---

## 4. How to read the effort column

| Size | Meaning           | Days used |
| ---- | ----------------- | --------: |
| S    | under half a day  |      0.25 |
| M    | about a day       |         1 |
| L    | two to three days |       2.5 |
| XL   | a week or more    |         5 |

Days are the sum of those weights, not a schedule. They exclude review, and several actions overlap — doing action 3 first makes parts of 4 and 6 cheaper.
