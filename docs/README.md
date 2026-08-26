# Documentation

This is the active documentation home for Racquets & Strings. Architecture, diagrams, domain
rules, engineering guidance, and operational runbooks live here because they are ongoing reference
material and must evolve with the code.

## Start here

- [Master backlog](BACKLOG.md) — the single sprint-planning queue for open, pending, and blocked
  work, with permanent `BLG####` identifiers.
- [Future work](FUTURE-WORK.md) — product work intentionally outside the closed D1-D5 program.
- [Sprint planning](planning/README.md) — the active D6–D7 planning package; planned work is not
  completion evidence.
- [Architecture](architecture/README.md) — system, data, authorization, environment, ADR, and
  Mermaid diagram references.
- [Domain rules](domain/README.md) — tournament, scoring, Round Robin, rewards, and contact-privacy
  behavior.
- [Engineering](engineering/README.md) — local development, maintainability, security, skills, and
  stabilization evidence.
- [Runbooks](runbooks/README.md) — approval-gated recovery and external-provider procedures.
- [Archive](archive/README.md) — dated planning packages and completed historical delivery evidence.

## Maintenance contract

- Update the relevant active document whenever architecture-sensitive source, Rules, Functions,
  migrations, or environment tooling changes.
- Keep diagrams as Mermaid Markdown under [`architecture/diagrams/`](architecture/diagrams/) so
  they render directly for readers and remain reviewable with the source.
- Run `npm run docs:verify` before closing a documentation or architecture-sensitive change.
- Archive only dated, completed, or superseded evidence. Any unfinished outcome must first have a
  permanent backlog entry.
