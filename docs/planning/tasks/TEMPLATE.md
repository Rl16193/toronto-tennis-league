# <JOB-ID> — <job title>

<!-- One file per job. Tasks live inside it. Filename = <SPRINT>-<JOB>.md, e.g. D6-C13.md -->

|             |                                                            |
| ----------- | ---------------------------------------------------------- |
| **Sprint**  | <D6 · lane A1>                                             |
| **Phase**   | <M1 — the five non-negotiables>                            |
| **Rulings** | <links to the rulings and vision sections this implements> |
| **Planned** | <date> · verified against the working tree at `<commit>`   |

> One paragraph, plain English: what this job changes and why the owner ruled it.
> The owner reads this and nothing else.

## Task board

| Task          | Title   | Blocked by    | State   | Round  |
| ------------- | ------- | ------------- | ------- | ------ |
| `<JOB-ID>-T1` | <title> | —             | planned | 0 of 2 |
| `<JOB-ID>-T2` | <title> | `<JOB-ID>-T1` | planned | 0 of 2 |

**Frontier:** any task whose blockers are all `done` can start now.

## Job exit gate

<!-- What is true only when every task is done. Usually: all tasks done, plus whatever
     the phase requires of this job as a whole (VISION.md §5). -->

- Every task above is `done`
- <phase criterion this job is responsible for>

---

## `<JOB-ID>-T1` — <task title>

**Delivers.** <the end-to-end behaviour this task makes work, from the member's or
organizer's side — not a layer-by-layer implementation list>

**Blocked by.** <task ids, or "None — can start immediately">

**Files.** <each file, with line numbers verified at planning time — re-check before editing>

**Constraints.** <what must not change; the layers that must move together>

**Out of scope.** <the nearest tempting adjacent change that is NOT this task>

**Acceptance criteria** — each must fail on today's code

- [ ] <criterion, with the test that proves it>
- [ ] <criterion>

**Commands:** <the exact commands the tester will run>

**Exit criteria**

- Acceptance criteria all pass, tests green
- Claude review PASS and OpenAI review PASS
- No findings outstanding

### Coder's report — T1

<!-- Codex fills this in, then sets this task's State to `coded` in the task board. -->

_Not started._

### Test evidence — T1

<!-- Tester fills in: GREEN or RED, commands run, pass/fail per criterion. -->

_Pending._

### Review — Claude — T1

<!-- PASS, or numbered findings: file:line · what is wrong · why it matters. -->

_Pending._

### Review — OpenAI — T1

**Review brief for Codex:** Review the changes made for task `<JOB-ID>-T1` against its
"Acceptance criteria" and "Delivers" sections in `docs/planning/tasks/<JOB-ID>.md`. Trace the
logic in the changed files — do not assume a change works because the right words are present.
Check that nothing outside the task's scope regressed, especially agreement between
`firestore.rules`, `functions/`, and the client. Report either PASS or a numbered list of
findings with file and line.

_Pending._

---

## `<JOB-ID>-T2` — <task title>

<!-- Same shape as T1. Repeat per task. -->

---

## History

<!-- One line per state change: date · task · from → to · by · note -->

- <date> · job planned · planner
