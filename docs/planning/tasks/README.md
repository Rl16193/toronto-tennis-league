# The task queue — how work moves between the agents

**One file per job. Tasks live inside it. The file carries its own state.**

This is the working contract for the multi-agent delivery loop.

- **Planner (Claude)** — takes one job, breaks it into tasks, and writes one job file here.
- **Coder (OpenAI Codex)** — a person hands the job file to Codex, naming a task. Codex
  implements exactly that task and fills in its report. No Codex CLI runs on this machine; the
  job file **is** the handoff.
- **Tester (Claude)** — runs the task's acceptance commands plus the gates the change touches,
  against the local emulator, and records evidence.
- **Reviewers (both)** — a Claude reviewer traces the diff against the rulings and the vision;
  each task also carries a ready-made brief to paste into Codex for an independent OpenAI
  opinion. Two different models, so blind spots don't overlap.

## What governs the work

| Document                                                                            | Holds                                           |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| [VISION.md](../VISION.md)                                                           | Platform model, roles, phases M0–M9, vocabulary |
| [DECISIONS-2026-08-29.md](../DECISIONS-2026-08-29.md)                               | Behaviour rulings                               |
| [specs/2026-08-31-vision-gaps-design.md](../specs/2026-08-31-vision-gaps-design.md) | The seven later rulings                         |
| [specs/](../specs/)                                                                 | Per-milestone specs                             |
| [sprints/](../sprints/)                                                             | The jobs themselves, grouped by sprint and lane |

A ruling outranks a sprint doc; the vision outranks a sprint doc on vocabulary, roles, and
scope; the later ruling wins where two collide.

## Ids

`<SPRINT>-<JOB>-T<n>` — e.g. `D6-C13-T2` is task 2 of job C13 in sprint D6. The job file is
named for the job: `D6-C13.md`. Work with no sprint (operations, staging) uses
`M<n>-J<n>-T<n>`.

## How a job is broken into tasks

Tasks are **tracer bullets**: each one cuts a narrow but complete path through every layer it
touches (rules, functions, client, tests), is verifiable on its own, and fits a single fresh
context window. Each task declares the tasks that **block** it; anything whose blockers are
all done can start now — that set is the frontier.

**Wide refactors are the exception.** A mechanical change whose blast radius fans across the
codebase (renaming `friendly` to `rally`, adding `location`) cannot land green as one vertical
slice. Those are sequenced **expand → migrate → contract**: add the new form beside the old so
nothing breaks, move the call sites in batches that each keep the suite green, then delete the
old form once no caller remains.

## The states a task moves through

| State                    | Meaning                                                             | Who moves it next   |
| ------------------------ | ------------------------------------------------------------------- | ------------------- |
| `planned`                | Written, waiting to be run through Codex                            | A person, via Codex |
| `coded`                  | Codex has implemented and reported                                  | `/queue check`      |
| `awaiting-openai-review` | Tests pass, Claude review done, waiting for the pasted Codex review | A person, via Codex |
| `needs-fixes`            | Tests failed or a review found problems — the evidence goes back    | A person, via Codex |
| `done`                   | Tests green and both reviews clean                                  | —                   |
| `blocked`                | Two repair rounds used, or the reviewers genuinely disagree         | The owner           |

**The repair loop is capped at 2 rounds.** After that the task blocks and waits for a human
decision instead of thrashing.

## Driving it

From Claude Code:

- `/queue plan M1` — break the jobs that phase needs into tasks, on demand. Also accepts a
  sprint item (`C13`) or a lane (`D6 A1`).
- `/queue check` — advance every task as far as its evidence allows: test what's `coded`,
  review what's tested, merge verdicts where both reviews are in, and finish with one status
  report. Re-runnable; it never repeats work already recorded.
- `/queue status` — the board, one line per task, with what each is waiting on.

From the Codex side, nothing new to learn: `AGENTS.md` tells it how to treat a job file. A
person only has to say _"do task D6-C13-T2"_ or _"review task D6-C13-T2"_.

## Ground rules

- Everything runs **emulator-first**. No task ever targets a cloud Firebase project.
- No agent commits or pushes. The owner commits.
- **One agent at a time per job file** — two agents editing the same file collide. Different
  job files run in parallel.
- Line numbers are verified when the job is planned, and re-checked by whoever edits.
- A task's brief is its whole scope. Widening it needs a new task.
