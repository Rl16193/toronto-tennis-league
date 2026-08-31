---
name: queue
description: Drive the multi-agent task queue — break a phase or sprint job into tasks, check coded work through tests and dual (Claude + OpenAI) review, and show queue status. Use for "/queue plan <phase, item, or lane>", "/queue check", "/queue status", or any request to advance the task queue.
---

# /queue — the dynamic delivery loop

You are driving the workflow described in `docs/planning/tasks/README.md`. **One file per job;
tasks live inside it.** Job files are `docs/planning/tasks/<SPRINT>-<JOB>.md` (TEMPLATE.md and
README.md are not job files). Each job file's **task board** — one row per task, with State,
Round, and Blocked by — is the source of truth.

Work is organized by the delivery phases in `docs/planning/VISION.md` §5 (M0–M9). A phase
closes only when its acceptance criteria pass and its exit gate is met, so every job file names
its phase. Rulings live in `docs/planning/DECISIONS-2026-08-29.md` and
`docs/planning/specs/2026-08-31-vision-gaps-design.md`; per-milestone specs live in
`docs/planning/specs/`.

Task states: `planned → coded → awaiting-openai-review → done`, with detours `needs-fixes`
(back to the coder, max 2 rounds) and `blocked` (escalated to the owner). Coding and OpenAI
reviews happen OFF this machine — a person relays job files through Codex. Your job is to
advance every task as far as its recorded evidence allows, and never repeat recorded work.

**The frontier.** A task is workable only when every task in its "Blocked by" is `done`. Never
present a blocked-by-dependency task as ready; say what it waits on.

## Subcommands

Parse the argument: `plan <phase, ids, or lane>`, `check`, `status`. No argument → `status`.

### /queue status

Read every job file's task board and print one board: task id · title · state · round · what
it is waiting on and from whom ("waiting on Codex run", "waiting on pasted OpenAI review",
"blocked by D6-C13-T1", "waiting on owner"). Group by job. End with counts per state, and name
the frontier — what could start right now. Read-only.

### /queue plan <phase, ids, or lane>

Planning is **on demand, per phase** — do not pre-plan phases that are not being worked.

1. Resolve the argument to jobs. A **phase** (`M1`, "phase 1") means: read that phase in
   VISION.md §5 plus its spec in `docs/planning/specs/` if one exists, then list the sprint
   jobs it needs. A **sprint item** (`C13`) is one job. A **lane** (`D6 A1`) means that lane's
   jobs from the sprint board. Skip jobs that already have a file — report them as skipped,
   never overwrite.
2. For each job, launch the `planner` agent (Agent tool, subagent_type `planner`) with the job
   id, its sprint, and its phase. Run up to 3 in parallel; they write disjoint files.
3. If a planner reports a conflict (spec vs ruling vs code), leave that task `blocked` and put
   the conflict in your report — do not resolve it yourself.
4. Report: job files created with their task breakdown (id, title, blockers), jobs skipped,
   anything blocked, and the handoff instruction: "Run the frontier tasks through Codex — say
   'do task D6-C13-T1'. Then run /queue check."

### /queue check

Work through ALL job files, advancing each task by state. Queue mode: do not stop between
tasks; deliver one report at the end. **Run agents one at a time within a job file** — two
agents editing the same file collide. Different job files may run in parallel.

**`planned`** — nothing to do (waiting on a Codex run). Note it, and whether its blockers are
clear. If the working tree shows the task's files changed but the Coder's report is empty,
flag it: someone coded without filling the report — ask rather than guess.

**`coded`** — run the pipeline for that task:

1. **Test.** Launch the `tester` agent on the job file, naming the task. Tests RED → fix loop.
2. **Claude review.** Tests green → launch the `reviewer` agent on the job file, naming the
   task. FINDINGS → fix loop.
3. **OpenAI review.** Claude review PASS → check that task's "Review — OpenAI" section. Empty
   → set the task's State to `awaiting-openai-review`, add a History line, and note in the
   report that a person must paste that task's review brief into Codex.

**`awaiting-openai-review`** — if still pending, note it and move on. If findings (or PASS)
have been pasted in:

- Both reviews PASS → State `done`, History line. Then re-check the frontier: tasks this one
  was blocking may now be workable, and the job exit gate may now be satisfiable.
- One reviewer found what the other did not → verify each disputed finding yourself in the
  code before acting. Real findings → fix loop. A finding you can demonstrate is wrong →
  record why in the file beside it. If after verification the two reviews still genuinely
  contradict each other on whether the work is correct → State `blocked`, both opinions and
  your verification notes side by side for the owner.

**`needs-fixes`** — waiting on a Codex repair run. If the Coder's report shows a new
"Round N" entry, treat as `coded` and re-run the pipeline.

**`blocked` / `done`** — report only.

**Job exit gate.** When every task in a job file is `done`, check the job's exit gate. If it is
met, say so in the report; if something in it is not (for example a phase criterion needing the
owner's visual walkthrough), name exactly what is outstanding and who owns it.

**Fix loop (owner ruling: capped at 2 rounds).** On red tests or real review findings:
increment that task's Round. Round ≤ 2 → append a "Fix round N" block under the task listing
exactly what to fix (from the evidence and findings — self-contained for Codex), set State
`needs-fixes`, add a History line. Round > 2 → State `blocked` with a plain-English summary of
what kept failing, for the owner.

**Final report (owner-facing, plain English):** the board as in `status`, what advanced this
run, what is waiting on a person and the exact next action for each ("paste D6-C13-T1's review
brief into Codex", "run task D6-C13-T2 through Codex", "D6-C15-T3 is blocked — your call: …").
Lead with the single most important item.

## Ground rules

- Never commit or push — the owner commits.
- Emulator-first; nothing targets a cloud Firebase project.
- Task state changes happen only here (agents record evidence; you move states).
- Never overwrite a section that contains recorded work; append.
- One agent at a time per job file.
