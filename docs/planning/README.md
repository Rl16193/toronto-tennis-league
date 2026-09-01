# Sprint planning

This directory is the active planning package for the next delivery block on `dev-anuj`.
The product vision, roles, milestones, and glossary live in [VISION.md](VISION.md).
Nothing here is evidence of completed implementation, validation, staging, or production release.

## Planned sprints

- [Sprint D6 — corrections and the partner pool](sprints/SPRINT-D6.md) — phase M1
- [Sprint D7 — the shared component set](sprints/SPRINT-D7.md) — phase M2
- [Sprint D8 — seeding, the coaching pool, and the workflow record](sprints/SPRINT-D8.md) — phase M3
- [Sprint D9 — donations and the payment gateway](sprints/SPRINT-D9.md) — phase M4
- [Deferred work and future sprints](DEFERRED-AND-FUTURE.md) — everything ruled out of D6–D8.
- [D1–D5 implementation review](IMPLEMENTATION-REVIEW.md) — findings that informed D6 and D7.
- [The task queue](tasks/README.md) — how a job is broken into tasks and moves between the
  planning, coding (Codex), testing, and dual-review agents.
- [specs/](specs/) — per-milestone specs and the 2026-08-31 rulings.

## How the documents fit together

**[VISION.md](VISION.md)** says what the product is and sequences delivery as phases M0–M9.
Each phase carries acceptance criteria and an exit gate. **Rulings** — in
[DECISIONS-2026-08-29.md](DECISIONS-2026-08-29.md) and
[specs/2026-08-31-vision-gaps-design.md](specs/2026-08-31-vision-gaps-design.md) — say how
behaviour must work; a ruling outranks a sprint doc, and the later ruling wins where two
collide. **Sprints** hold the jobs, grouped by lane, each job tagged with the phase it serves.
**[tasks/](tasks/README.md)** is where a job becomes tasks, one file per job, and where the
agents record evidence.

Planning is on demand, per phase: `/queue plan M1` breaks down only what that phase needs,
verified against the code as it stands that day.

## Source and working contract

- **Code baseline: `dev-anuj` @ `ac4dfb1`** ("docs: add D6 and D7 sprint planning package", resolved as `tbtc/dev-anuj`). Every `file:line` reference in this package was read at that commit, and every document states it in those words.
- Document provenance, which is a different thing: this package was imported from `origin/docs/planning` at commit `3bd6b0e30143d70eb55a98abe578a1fcbfa40ed2`. That commit is **not** on `dev-anuj` and is not a line-number baseline.
- `dev-anuj` remains the golden working branch; implementation work closes there after review and validation.
- Open sprint-planning items remain visible in the master [backlog](../BACKLOG.md) and the shared sprint tracker.
- D6 and D7 must not be reported as complete until their acceptance and validation gates have passed.
