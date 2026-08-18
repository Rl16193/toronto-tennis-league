# Product Journey — Racquets & Strings

**A case study in building a real community platform with a human product owner and an AI coding agent.**

Live at [racquetsandstrings.ca](https://www.racquetsandstrings.ca) · March 19 – August 14, 2026 (148 days) ·
223 commits · ~22,800 lines of TypeScript across 125 files · 45 Cloud Function exports ·
189 registered players, 328 recorded matches at the August snapshot.

Built by **Rahul Lal** (product, QA, data, community) with **Claude** (Anthropic's coding agent)
as the implementation partner — first through cloud sessions and GitHub PRs, later through
59 recorded local sessions containing **1,457 typed instructions and 292 mid-flight corrections**.

---

## 1. What the product is

A community tennis platform for Toronto. Players find public courts on a live map, join events,
play knockout and round-robin tournaments, challenge each other on a ladder, arrange friendlies,
earn community points, and redeem those points against real coaching and stringing services.
There is deliberately **no in-app messaging** — the platform's job is to get two strangers onto a
court, so it shares phone/WhatsApp contact between people who are *actually arranging a game*, and
nobody else.

The stack is intentionally serverless: React 19 + Vite + Tailwind v4 on Firebase Hosting, with
Firestore security rules as the entire API boundary and Cloud Functions for anything privileged.
There is no staging environment and there are no automated tests — **production is the only
environment**, which shaped the entire engineering culture recorded below.

---

## 2. Timeline at a glance

| Phase | Period | What happened |
|---|---|---|
| **0 · Foundations** | Mar 19 – Apr 26 | Initial front-end; full redesign (`d01fd91`); "Version 2.0" deploy prep and a 30-commit repo-hygiene purge of stray images |
| **1 · Tournament sprint** | Apr 29 – May 18 | Tournament pages born (`5321261`); rebrand *TorontoTennisLeague → Racquets & Strings* (`decf8cc`); draw editor reworked five times in ten days; LL/reserves draw saga begins; scoring pivots to creator-only (`368f8df`) |
| **2 · Points & leagues** | May 19 – Jun 5 | Leagues page + league points (`52c4dc1`); backfill made idempotent after a triple-counting bug (`d1daf66`); security hardening; **CLAUDE.md born** (`c4160e1`) |
| **3 · Two fronts** | Jun 7 – Jun 27 | Round Robin format (`d425dbc`) and the `/courts` map (`5f99a3b`) land the *same day* from parallel sessions; courts page hits "round 4" within 24 hours; auth overhaul + RR engine rebuild (`f0c78ea`) |
| **4 · Launch & local era** | Jul 5 – Jul 25 | "App Version 0" launch tag (`559b3fd`); development moves to local Claude Code sessions; welcome-email pipeline; landing page rebuilt around real community photos; Friendlies/Matches hub; the working agreements are forged |
| **5 · Hardening & scale-out** | Aug 1 – Aug 12 | Walkover points ruling; Apple sign-in; database consolidated 13 → 4 collections with archives; zone-based draws; Marketplace + Services; points move server-side (`11ce4c8`); Elements refactor (`08d60cd`) |
| **6 · Handover** | Aug 11 – | Full documentation suite generated for the incoming technical lead: technical handover (3 revisions), security & mobile readiness audit, workflow map, function inventory, test-case gap workbook — and this document |

---

## 3. The features that were reworked — and reworked again

These are the arcs the git history and session transcripts show being rebuilt multiple times.
Each one ends with a rule now codified in `CLAUDE.md`, which is how this project turns pain into
institutional memory.

### 3.1 The tournament draw engine — 60 of 223 commits

`useTournament.ts` (~2,300 lines) was touched in **27% of every commit ever made**. The arc:

- **Apr 29 – May 8:** "edit draw functionality" changed five times in ten days (`58d847f`,
  `df2a193`, `8fb7572`, `45e79bc`, `012200a` → "part II" `f90e42d`). The creator needed to move
  players between slots after generation; each attempt surfaced a new invariant.
- **May – Jun:** winner advancement — the logic that carries a winner into the next round — was
  fixed at least four separate times (`57f099c`, `d3251af`, `8a8fc39`, `ce8b48c`), including a
  semifinal→final rollback bug.
- **Jul 11:** full draw resets replaced piecemeal repair, at the creator's own suggestion:
  *"instead can you just allow me to cancel matches and re-create the draw… This would be simpler."*
- **Aug 12:** zone-based draws split every draw by city geography — and every destructive
  operation (reset, cancel, regenerate) had to learn to filter on `zone`, because template match
  IDs are identical across zones and one zone's reset silently deleted the other zone's matches
  during testing.

**Lesson recorded:** every destructive path must filter on the *full* draw identity, and winner
advancement must normalize every dimension of it. The one automation that could unseat a player
with nobody acting (cross-draw dedupe) is permanently disabled by constant.

### 3.2 Scoring & points — from honor system to transaction-grade ledger

Points started as bragging rights and became **currency** — redeemable against real coaching and
stringing offers. The integrity bar rose accordingly, one defect at a time:

1. **May 10:** players submit scores; creator confirms.
2. **May 18:** player-side submission *removed entirely* — creator-only scoring (`368f8df`).
3. **May 19:** league points awarded on confirmation (`52c4dc1`).
4. **May 20-21:** the xlsx backfill triple-counted players → rewritten to be idempotent
   (`d1daf66`, `9c7d8f5`).
5. **Jul – Aug:** `completed_at` pinned to first scoring (edits stamp `score_edited_at` instead);
   score submission split into three isolated steps so a stats failure can never roll back a
   recorded score; ladder confirmation moved into a Firestore *transaction* after realizing a
   mobile double-tap could double-apply ±3 points; the RR group-completion bonus stamps every
   match it pays (`rr_group_bonus_v2`) so reversal can't deduct points never received.
6. **Aug 2:** the walkover ruling — asked *"are points awarded for a walkover?"*, the answer
   became product policy: an RR win pays **3/1 whether or not it was a walkover**, because the old
   rule penalised the player who showed up.
7. **Aug 12:** the whole tier catalogue and redeemable-balance computation moved **server-side**
   (`functions/lib/points.js`) — the client can no longer be the authority on money-like state.

**Lesson recorded:** every points write is either idempotent, stamped, or transactional. "The
group is complete" is *not* proof the bonus was paid — only the stamp is.

### 3.3 The Lucky Loser draw — built, rebuilt five times, deleted

The clearest "kill your darlings" story in the codebase:

- **May 8:** reserves/LL draw feature ships (`11169ff`).
- **May 12:** reshaped **five times in one day** — separate tab, minimum slots, no bleed into the
  main draw, always-visible empty bracket, reset button (`2f9164d` → `ed8cb33`).
- **May 20:** LL wins halved in points value.
- **Jul 6:** the order, verbatim from the transcript: *"remove LL draw from all tournament
  brackets as well"* — players simply never used it.
- **Aug:** the last generation code deleted as dead code; nothing reads `bracket: 'reserves'`
  anymore.

It was replaced by something structurally better: Round Robin events just **accept late joiners
after the draw exists** and place them by script overnight — dissolving the problem the LL draw
was invented to solve.

### 3.4 Round Robin — three generations of a group-formation algorithm

- **Gen 1 (Jun 7):** simple groups, merged in from a cloud session the same day the courts map
  landed (`d425dbc`, `cc18fbc`).
- **Gen 2 (Jul):** the overhaul — group edits persist as server-side drafts before generation,
  withdrawals became durable ("Player Loading" placeholders that survive refresh), three-level
  tab navigation, and the +5/+3 completion-bonus scoring designed live in conversation.
- **Gen 3 (Aug 12):** groups auto-form by **skill band × city zone**, sized 3–5 by a balanced
  `splitEvenly` algorithm; a nightly Admin-SDK script places late joiners into unlocked groups;
  knockout seeding takes group winners automatically and leaves the rest to the creator's manual
  fill — the automatic runner-up fill was *removed* because the creator wanted the judgment call.

**Lesson recorded:** the size algorithm is authoritative and is never overridden by band
boundaries — the rule that prevents the old 3+2 unbalanced-group bug from ever recurring.

### 3.5 The courts map — a data product wearing a map

The `/courts` page hit **"round 4" within 24 hours of existing** (`0af149e`). Its whole history is
reality correcting assumptions:

- Marker semantics iterated: green/blue split markers for active-players vs public-hours, then
  public-hours restricted to actual clubs, then **court deduplication removed entirely**
  (`6f2ce0d`) — co-located courts are genuinely separate places.
- Ground-truth fixes shipped as commits: Ramsden has 8 courts not 12; High Park's coordinates
  were wrong (`06a2b2b`, `874bb68`).
- The City of Toronto's 9 MB programs export is filtered at build time to the ~435 tennis rows
  actually shipped (~0.15 MB).
- Per-court player counts moved to a 6-hour server aggregation so the public page stopped doing
  three full-collection reads per visit.
- Zone geometry was hand-built from the Toronto Centreline dataset — the DVP and Highway 404
  spliced into one polyline after North York and its neighbours both claimed the same wedge, and
  Steeles Avenue standing in for the 407, which isn't in the dataset at all.

### 3.6 Auth — added provider by provider, and one feature un-shipped

Signup race condition fixed (May 9) → email-existence pre-check and password reset (May 14) → iOS
popup fix (Jun 1) → full overhaul (Jun 27) → **email verification gate shipped (Jul 10)… and later
removed** — it gated real players out of events for little benefit, so it became a one-shot
welcome email via Resend instead. Apple sign-in (Aug 3) forced the right abstraction: one shared
OAuth flow (`useOAuthSignIn.ts`) with thin per-provider wrappers, each filtering its own redirect
results. New providers are now added by writing a wrapper, never by copying the hook.

### 3.7 Contact privacy — from "phone on the profile" to a connections model

Phone numbers appeared on opponent profiles in May (`90e98dc`). By August this had matured into
the platform's most deliberate architecture: PII lives in a `contacts` collection readable only by
the owner, organizers, people you hold a server-written **connection** with (created only when a
match is actually arranged — an unanswered challenge earns nothing, so nobody can harvest a number
by spamming requests), and marketplace posters who *opted into* being contactable. `users` stays
world-readable and therefore must never carry contact fields again — a rule now enforced by
whitelist-style security rules and written in bold in CLAUDE.md.

### 3.8 The codebase shape — a pendulum, then a rule

Monolithic pages → split into hooks/components (May 19) → over-split into dozens of tiny
single-consumer files → **consolidated back** into one `*Elements.tsx` presentational module per
page (Aug 12, `08d60cd`), with hard rules about what may and may not live there. The database made
the same journey: 13 legacy collections consolidated into 4, discriminated by `type` fields, every
owner reference standardised to `uid`, with pre-deletion archives — a live production migration
run through dry-runs, with three security-rule regressions caught and fixed in the same pass.

---

## 4. How a human and an AI actually built this

### The tooling eras

1. **GitHub-PR era (Apr–Jun):** Claude worked in cloud sessions on `claude/…` branches; Rahul
   reviewed and merged 27 pull requests, often several per day, alongside a parallel
   `tournamentpage` branch of his own edits.
2. **Local era (Jul onward):** development moved into local Claude Code sessions — 59 recorded
   transcripts, 1,457 typed instructions. Faster loop, tighter steering: **292 of those messages
   are mid-task interruptions**, the creator redirecting work in flight rather than after.
3. **Docs-as-product era (Aug):** the agent's output shifted from code to institutional knowledge
   — migration reports, workflow maps, a security audit, spreadsheet workbooks, and a technical
   handover for the incoming lead, revised three times as the code kept moving underneath it.

### The specs

Instructions came as product manager briefs, not code requests — plain-language behaviour specs
with edge cases, often ending with a signature invitation that appears **110 times** in the
transcripts: *"Is that clear? Any questions?"* Design happened conversationally: the RR bonus
scoring, the zone system, and the walkover policy were all reasoned out in dialogue before a line
was written. Other AI tools had walk-on parts — the welcome-email HTML came out of a template
editor and *"regular chat or Gemini"* — with Claude wiring the result into the codebase.

### The working agreements — friction, then law

The defining pattern of this collaboration: **every correction became a standing rule**, written
into CLAUDE.md or the agent's persistent memory, so no lesson had to be taught twice — eventually.

| Moment (verbatim from transcripts) | The rule it became |
|---|---|
| *"removing old rules. Did I ask for that? Why did you do that?"* (Jul 14) | **Change discipline:** fix exactly what is asked; adjacent problems get one sentence at the end, not a bundled fix |
| *"when i ask you to re-factor and remove dead code, i need fewer lines of code added and more lines of code removed… give me a summary stat"* (Jul 16) | **Lean refactoring:** refactors must be net-negative on lines, reported added-vs-removed per effort |
| *"why do i have to tell you everytime that white background and white text become invisible… told you thrice already"* (Jul 16) | **The two-tier text-colour system:** every piece of text is `text-fg` or `text-fg/70`, never a dimmer tier, never a hardcoded colour — checked in both themes |
| *"please do not review the work done, i will review it on my end. just make this simple fix without using too many tools"* (Jul 24) | **Division of labour:** the agent implements and type-checks; the human is QA on the live product. No dev-server verification, no test suite — `tsc --noEmit` is the gate |
| *"run as few agents as possible… ask questions to clarify instead of checking everything"* (Jul 24) | **Ask, don't verify:** ambiguity is resolved by asking the product owner, not by burning credits investigating |

CLAUDE.md itself — created Jun 3, revised 9 times — became the project's real innovation: a
**defect ledger written for the next AI session**. Every entry compresses a production incident
into a constraint ("`currentMatches` MUST filter on `zone`", "a denied `contacts` read is normal,
not an error", "never introduce a dimmer text tier"). The agent reads it at the start of every
session; the human never has to re-explain a scar.

### The risk profile — and how it was managed

Everything ran against **production**: no staging, no emulators, no backups, real players'
points. The compensating controls were procedural — `--dry-run` flags on every admin script,
pre-deletion archive collections before the database consolidation, batch writes that isolate
best-effort steps from must-succeed steps, and a human who tested every change live and could
describe any regression within hours. It is not a textbook setup; it is an honest one, and it is
exactly why the codebase's rules read like they were paid for.

---

## 5. Shipped by subtraction

Features built, then deliberately killed — each deletion a product decision, not a failure:

- **Calendar feature** (Apr 26 → removed Jun 5)
- **Player-submitted scores** (May 10 → creator-only May 18)
- **Lucky Loser / reserves draw** (May 8 → removed Jul 6, code deleted Aug)
- **Email verification gate** (Jul 10 → replaced by welcome email)
- **Automatic RR runner-up seeding** (→ manual creator fill, by request)
- **Cross-draw auto-dedupe** (→ permanently disabled; it could unseat a player with nobody acting)
- **9 legacy Firestore collections** (→ consolidated, archived, deleted)
- **Profile avatar box, tab headers, join-delay warnings, snake_case stats fields, dead LL
  points logic** — swept in recurring dead-code passes whose success metric was *lines removed*.

---

## 6. By the numbers

| Metric | Value |
|---|---|
| Duration | 148 days (Mar 19 – Aug 14, 2026) |
| Commits | 223 · peak of 12+ in a single day (May 19) |
| Pull requests in the GitHub era | 27 |
| Source | ~22,800 lines of TS/TSX across 125 files |
| Cloud Functions | 45 exports across 9 files |
| `useTournament.ts` churn | touched in 60 commits — 27% of all history |
| Recorded local sessions | 59 (Jul 5 – Aug 14) · 241 MB of transcripts |
| Typed instructions | 1,457 · 292 interruptions (20%) · "Any questions?" ×110 |
| Community at snapshot | 189 players · 328 matches · 714 notifications · 74 court check-ins/reports |
| Database consolidation | 13 legacy collections → 4, with archives |
| CLAUDE.md | born Jun 3 · 9 revisions · ~30 KB of institutional memory |
| Handover suite | 8 markdown documents + 4 spreadsheet workbooks |

---

## 7. What this journey demonstrates

1. **An AI agent doesn't remove the product owner's job — it concentrates it.** Every rework in
   §3 was resolved by a human judgment call (walkover policy, manual knockout fill, killing the
   LL draw), executed at AI speed.
2. **Institutional memory is the multiplier.** The same agent that repeated a white-on-white bug
   three times in July never repeated it again once the rule entered CLAUDE.md. Teach the file,
   not the session.
3. **Deletion is a feature.** Roughly a third of the milestones in this history are removals, and
   the product got clearer with each one.
4. **Correctness debt migrates toward the server.** Everything that started as a client-side
   convenience — points, contact access, redemptions, court counts — ended as rules-enforced or
   server-computed the moment it carried real value.
5. **Friction, written down, becomes velocity.** The five working agreements in §4 were all born
   as complaints. They are why sessions in August were faster than sessions in July.

---

## 8. Sources & method

Reconstructed on Aug 14, 2026 from: the full git history (223 commits), `CLAUDE.md` and its
defect ledger, the August documentation suite (`TECHNICAL_HANDOVER.md`, `WORKFLOWS.md`,
`Tournament_Logic_Report.md`, `DATA_MIGRATION_REPORT.md`, `SECURITY_AND_MOBILE_READINESS.md`),
the agent's persistent memory files, and 59 local session transcripts (Jul 5 – Aug 14) mined for
the creator's verbatim instructions. Cloud-session conversations from the April–June GitHub-PR era
are not retained locally; that period is reconstructed from commit and PR history. Quotes are
verbatim, typos included.
