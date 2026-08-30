# What UI Work Remains

> Compared the UI documents against **`tbtc/dev-anuj`**, the live branch. This does not review or
> validate Anuj's build — only what it means for the outstanding UI work.

|                      |                                                                      |
| -------------------- | -------------------------------------------------------------------- |
| **Live branch**      | `tbtc/dev-anuj` @ `9c81f00`, 2026-08-23                              |
| **Audited branch**   | `main` — **116 commits behind**, 0 ahead                             |
| **Code gap**         | 128 files in `src/`, +11,744 / −5,590 lines, 20 new files, 0 deleted |
| **Design-layer gap** | **Effectively none** — see below                                     |
| **Status**           | Nothing implemented. `src/` unchanged by this audit.                 |

---

## 1. Bottom line

**Anuj's 116 commits did not touch the design layer.** They are security, architecture and QA work —
a domain/service layer extracted out of `useTournament.ts`, Firestore boundary hardening, and tests.

So **essentially all of the outstanding UI work still stands.** Of 273 action rows, exactly **two**
are resolved as a side effect, and both by accident rather than intent.

---

## 2. The evidence

Every design signal counted on both branches with `git grep`, same patterns, same scope (`src/**`).

| Signal                 | `main` | `dev-anuj` | Δ      |
| ---------------------- | -----: | ---------: | ------ |
| `focus-visible`        |      0 |      **0** | —      |
| `min-h-[44px]`         |      2 |      **2** | —      |
| `text-[9px]`           |     15 |     **15** | —      |
| `text-[10px]`          |     57 |     **57** | —      |
| `text-[11px]`          |     89 |     **89** | —      |
| `text-white`           |     54 |     **54** | —      |
| `divide-white`         |     12 |     **12** | —      |
| `bg-white`             |     35 |     **35** | —      |
| `placeholder-gray-500` |     12 |     **12** | —      |
| `text-clay`            |    156 |    **156** | —      |
| `clay-dark`            |     10 |     **10** | —      |
| `bg-tennis-dark`       |     42 |     **42** | —      |
| `bg-tennis-surface`    |    104 |    **105** | +1     |
| `window.confirm`       |      6 |      **4** | **−2** |

Two notes on the reading:

- **Tailwind's `dark:` variant is still used 0 times.** A raw grep for `dark:` returns 3, but all
  three are the variable _names_ `--color-clay-dark:` and `--color-tennis-dark:` in `index.css`.
  The audit's claim was correct and remains correct.
- The `bg-tennis-surface` +1 is a single new usage, not a pattern change.

---

## 3. What actually changed

| Row       | Was                        | Now          | Effect                                                                                                                 |
| --------- | -------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **MF-10** | replace 6 `window.confirm` | **4 remain** | `useTournament.ts` lost two of its four; `MatchCard` and `RRGroupCard` still have theirs. Row shrinks, does not close. |

That is the complete list. No other action row is resolved by `dev-anuj`.

---

## 4. Re-citations — the rows worth fixing first

The findings hold; the line numbers moved. Verified individually on `dev-anuj`.

| Row      | Finding                                               | `main`                         | `dev-anuj`                     |
| -------- | ----------------------------------------------------- | ------------------------------ | ------------------------------ |
| **LB-1** | Score modal seeds player 1 as winner — **still live** | `useTournament.ts:1984`        | **`useTournament.ts:1826`**    |
| CT-12    | Crash screen `text-white`, invisible in light theme   | `main.tsx:34`                  | `main.tsx:33`                  |
| BT-4     | `Button variant="secondary"` invisible in dark        | `Button.tsx:23`                | `Button.tsx:26`                |
| CT-1     | Page background `@apply bg-tennis-dark`               | `index.css:71`                 | `index.css:72`                 |
| RT-1     | Catch-all route has no `replace`                      | `App.tsx:117`                  | `App.tsx:177`                  |
| RT-2     | `/friendlies` and `/challenges` drop their `mode`     | `App.tsx:104-105`              | `App.tsx:150-151`              |
| DC-1     | Dead `whatsappSameAsPhone` prop                       | `ContactOpponentButton.tsx:72` | `ContactOpponentButton.tsx:81` |
| —        | `"Submitted ✓ awaiting confirmation"`                 | `MatchCard.tsx:173`            | `MatchCard.tsx:203`            |
| LB-13    | `COMMUNITY_BASELINE` invented stats                   | `Home.tsx:77`                  | `Home.tsx:79`                  |
| LB-2     | `rrKnockoutReady` placeholder gate                    | `useTournament.ts:1170`        | `useTournament.ts:1344`        |
| —        | ScoreModal winner-card selection                      | `ScoreModal.tsx:105`           | `ScoreModal.tsx:121`           |

**LB-1 is the one to act on.** Open the score modal and submit: it records a 0–0 result the engine
pays out as a real 3/1, against a production database with no backups and no PITR. It survived the
refactor. Note that score submission now also flows through the new
`features/tournament/domain/scoreSubmission.ts`, so the fix has two places to check rather than one.

---

## 5. What remains — the 12 actions

Unchanged from `uisummary_report.md` except MF-10 shrinking by two.

|   # | Action                                      | Workflow                       |   Items |       Days |
| --: | ------------------------------------------- | ------------------------------ | ------: | ---------: |
|   1 | Fix what's actually broken for members      | Fix functional bugs            |      50 |      27.50 |
|   2 | Collapse 83 card surfaces into one card set | Consolidate cards & components |      45 |      42.25 |
|   3 | Move every colour onto a theme-safe token   | Fix colour tokens              |      32 |      14.75 |
|   4 | One button size, shape and focus state      | Standardise buttons & controls |      29 |      23.75 |
|   5 | Remove dead variants, props, stale copy     | Delete dead code               |      27 |      12.75 |
|   6 | Add the focus ring, ARIA and keyboard paths | Add focus & accessibility      |      26 |      13.25 |
|   7 | One meaning and one label per stat          | Unify stat definitions         |      19 |      16.00 |
|   8 | One sheet shell, one field system           | Unify modals & forms           |      15 |      14.25 |
|   9 | Fix redirects and the catch-all URL         | Fix routes & navigation        |      13 |       4.00 |
|  10 | One heading, one subheading, 12px floor     | Fix text sizes & headings      |      10 |       4.75 |
|  11 | Collapse 41 ways of drawing a person        | Unify player rows              |       4 |       7.25 |
|  12 | Organizer controls the knockout draw        | Rework the knockout draw       |       3 |       2.25 |
|     | **Total**                                   |                                | **273** | **182.75** |

---

## 6. Document validity against `dev-anuj`

| Document                     | Findings                            | Citations          | Verdict                   |
| ---------------------------- | ----------------------------------- | ------------------ | ------------------------- |
| `uisummary_report.md`        | Valid                               | n/a — cites IDs    | **Use as-is**             |
| `ACTION-REPORT.md`           | Valid                               | Moved in 128 files | **Use, re-cite on touch** |
| `ELEMENT-DESIGN-BRIEFS.md`   | Valid — every census figure matched | Moved              | **Use, re-cite on touch** |
| `FIX-TODAY.md`               | Valid                               | Moved              | **Use, re-cite on touch** |
| `UI-UX-INVENTORY.md` §12–§20 | Valid                               | Mostly stable      | **Use**                   |
| `UI-UX-INVENTORY.md` §01–§11 | Element inventories not re-derived  | Moved              | **Treat as indicative**   |

### What was and was not checked

**Checked:** every countable design signal (the § 2 table), the eleven re-citations in § 4, the
branch topology, and the file-level diff shape.

**Not checked:** the 1,024 individual elements in §01–§11 were not re-walked against `dev-anuj`.
Their _labels, structures and behaviours_ are very unlikely to have moved — the census shows the
design layer is untouched — but their line numbers have. Re-deriving them properly is a separate
pass of the same size as the original.

**Deliberately out of scope:** reviewing or validating Anuj's build. Not assessed here.

---

## 7. Recommendation

Nothing in the plan needs rewriting. Three practical consequences:

1. **Re-cite when you touch a row, not before.** A bulk re-citation of 273 rows would cost more than
   it saves, and the files will move again.
2. **Work against `dev-anuj`, not `main`.** `main` is 116 commits behind with nothing of its own.
3. **Ship LB-1 now.** One line, independent of every design decision, and it is corrupting points today.
