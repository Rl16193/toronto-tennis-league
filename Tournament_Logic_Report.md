# Tournament Logic Report — Generation, Moving, Adding, Deleting

Scope: `src/pages/tournament/useTournament.ts` (2,348 lines), `rrGeneration.ts`, `utils.ts`,
`RRGroupCard.tsx`, `BracketView.tsx`.

Goal: understand what "Generate Matches" does, find where bracket and Round-Robin behave
differently for the same conceptual action, and identify what can be unified.

---

## 1. What "Generate Matches" actually does

There is no single generate. There are **three separate generators**, and they share almost nothing.

### A. Bracket — `generateDraw` (line 1060), triggered by `handleGenerateAll` (1405)

1. Filter participants to this draw (`filterParticipantsForDraw`).
2. Order them (`buildPlayerList`) — **alphabetical by name** for a normal draw; skill-band or
   division order for a merged draw.
3. Draw size = next power of two: ≤8 → 8, ≤16 → 16, else 32 (`getDrawSize`).
4. `players.slice(0, drawsize)` — **overflow is silently discarded**.
5. Assign slot 1..n in that order into a fixed seeding template (`fallbackTemplate`), so 1v8/4v5 etc.
6. Apply any `previewSlotOverrides` on top.
7. Write one `matches` doc per template match with `merge: true`.
8. Walk the first round and **auto-advance anyone facing an empty slot** (bye) into round 2.

### B. RR groups — `handleGenerateRR` (1803)

1. Take `previewRRGroups` / `previewRRLabels` — the draft the creator sees.
2. **Delete every existing `format === 'rr'` match in this draw first.**
3. For each group, build round-robin pairings and write group match docs.

### C. RR knockout — `handleGenerateRRKnockout` (2220)

1. Refuse if any knockout match is already complete.
2. `selectGroupWinners` — group winners ordered by points, then games won.
3. `buildRRKnockoutDocs(… manualFill: true)` — remaining slots are `PLAYER_LOADING`,
   **and first-round bye auto-advancement is skipped**.
4. Delete existing knockout docs, write new ones.

**Key takeaway:** A and B differ in ordering, in overflow handling, in whether stale docs are
cleaned up, and in bye behaviour. C differs again.

---

## 2. The core problem

Bracket and RR are **two parallel implementations of the same four verbs**. Nothing is shared
except the `matches` collection and the `{eventId}_{drawKey}_…` doc-ID prefix.

| Verb | Bracket path | RR path |
|---|---|---|
| Generate | `generateDraw` (1060) | `handleGenerateRR` (1803) + `handleGenerateRRKnockout` (2220) |
| Add player | `handleAddPlayer` (1702) | same, plus withdrawal clearing |
| Move / place | `handleEditPlayer` (1516) | `handleSaveGroupEdit` (1844), `handleCreateRRGroup` (2020) |
| Remove | `handleEditPlayer(…, null)` | replace with `PLAYER_LOADING` → withdrawal subsystem |
| Reset | `handleResetDraw` (1481) | `handleResetRR` (2186) |
| Draft state | `previewSlotOverrides` (client-only) | `rr_drafts` subcollection (server) |

---

## 3. Discrepancies, in priority order

### 3.1 Placing a player self-heals in brackets but not in RR ⚠️

`handleEditPlayer` (1523–1552) contains this invariant:

> *"Any player placed into a real bracket slot MUST have a matching `event_participants` entry…
> Otherwise they appear in the draw but are invisible to engagement reports."*

So it looks up their skill, picks a division default, and creates the participant doc inline.

**`handleSaveGroupEdit` and `handleCreateRRGroup` do none of this.** They only rewrite match docs.
The same invariant is equally true for RR — a player seated in a group with no participant row is
just as invisible to reporting — but it is only enforced on one of the two paths.

*This is a real behavioural gap, not just duplication.*

### 3.2 The participant-creation block is written twice

`handleAddPlayer` (1725–1741) and `handleEditPlayer` (1536–1551) both do: read skill from
`statsMap`, fall back to a `stats` query, default the division, `addDoc` to `event_participants`.
Near-identical code, two places, already drifting (`handleAddPlayer` also handles the
`PLAYER_LOADING_SENTINEL` case and doubles `partner_in_app`).

### 3.3 "Remove" means two completely different things

- **Bracket:** `handleEditPlayer(matchId, slot, null)` sets the slot to `BYE` with an empty uid.
  Nothing else. No record kept; the player can be re-placed freely.
- **RR:** replacing with `PLAYER_LOADING` triggers a withdrawal subsystem — the uid is added to
  `manuallyUnplacedIdsRef` (in-memory) *and* to `rr_drafts.withdrawn` (persisted), *and* cascaded
  to sibling draws via `extraWithdrawnByDrawKey`.

RR needs all that because of §3.4. Bracket doesn't. But the two are conceptually the same verb.

### 3.4 Auto-placement exists only for RR

An effect (835–900) re-reads all RR matches and **auto-seats late joiners** into the smallest
unplayed group, spilling into new groups via `splitEvenly`. Brackets have no equivalent — a late
joiner simply sits unplaced until the creator moves them.

This single asymmetry is the **root cause** of the withdrawal machinery, the `manuallyUnplacedIdsRef`
guard, the `placedIds` "no uid may ever be seated twice" set, and the cross-draw withdrawal cascade.

### 3.5 Duplicate-placement protection exists only for RR ⚠️

RR's auto-placement builds `written = new Set(placedIds)` and explicitly guards that no uid is
seated twice.

`handleEditPlayer` has **no such guard**. Placing player A into slot X while A is still in slot Y
leaves A in the bracket twice. Moving in a bracket is "write the destination" with no source
reconciliation — whereas `handleSaveGroupEdit` reconciles source and target atomically in one batch.

### 3.6 Played-match protection is inconsistent — three different rules

| Path | Rule |
|---|---|
| RR group edit | Moving a player *out* of a group with a completed match is refused… |
| RR group edit | …but **removing them outright always proceeds, even if they've played** (documented as deliberate) |
| RR knockout rebuild | Refused entirely if any knockout match is complete |
| Bracket `handleEditPlayer` | **No check at all** — a slot in a completed match can be overwritten |

The bracket gap is the concerning one: overwriting a player in a completed match leaves the
recorded result pointing at someone who didn't play it, and the stats already awarded are not
reversed.

### 3.7 Regeneration cleanup differs

`handleGenerateRR` deletes existing RR docs first, with a comment explaining why:

> *"deterministic doc IDs only overwrite a matching group+match index; fewer/smaller groups would
> otherwise strand the old docs"*

`generateDraw` does **not** delete — it writes with `merge: true`. The identical stranding risk
applies if a bracket shrinks (32 → 16 leaves orphaned docs).

Currently masked because the UI only offers **Generate** when `hasMatches` is false
(`TournamentHeader.tsx:102`). So the function is unguarded; only the button placement saves it.

### 3.8 Draft state is persisted for RR, ephemeral for brackets

- RR: `events/{id}/rr_drafts/{drawKey}` — survives refresh, visible across devices.
- Bracket: `previewSlotOverrides` + `previewDrawSize` are plain `useState` — **a refresh silently
  discards a half-arranged bracket.**

### 3.9 The two reset handlers are ~90% identical

`handleResetDraw` (1481) and `handleResetRR` (2186) both: confirm with a count-aware warning,
reverse stats for completed matches via `reverseMatchStatsInto`, delete every match, exit edit mode.

Differences are small and additive:
- RR also calls `reverseRRBonusesInto`.
- Bracket also clears preview state and the merge toggles.

### 3.10 Four different ordering rules

| Context | Ordering |
|---|---|
| Bracket, normal | Alphabetical by name |
| Bracket, merged | Strongest skill band first (or Women's/Mixed before Men's) |
| RR groups | Skill band × zone, balanced by `splitEvenly` |
| RR knockout | Points, then games won |

Alphabetical seeding on normal draws is worth questioning independently — it means two of the
strongest players can meet in round one.

### 3.11 Three doc-ID schemes

```
{eventId}_{drawKey}_{matchId}                    bracket
{eventId}_{drawKey}_rr_g{groupIndex}_m{pos}      RR group
{eventId}_{drawKey}_rr_ko_{matchId}              RR knockout
```

Consistent prefix, divergent suffix — so every delete/lookup path needs format-specific knowledge.

---

## 4. Where the size actually is

`useTournament.ts` is 2,348 lines holding subscriptions, derived state, and ~23 handlers. The
mutation handlers alone are roughly 900 lines. The biggest single function is
`handleSaveGroupEdit` (1844–2019, ~175 lines) which does group rewrite + withdrawal persistence +
cross-draw cascade + stats reversal in one body.

---

## 5. Simplification proposal

Ordered by value-to-risk. Each stands alone.

### Step 1 — Extract `ensureParticipant(uid, name, draw)` *(low risk, fixes a real gap)*

One helper: skill lookup → division default → create `event_participants` if absent.
Call it from `handleAddPlayer`, `handleEditPlayer`, **and the RR seat paths**.
Removes the §3.2 duplication and closes the §3.1 gap in one move.

### Step 2 — Unify the two reset handlers *(low risk, ~60 lines out)*

One `resetDraw(format)`: shared confirm + stats reversal + delete, with the RR-bonus reversal and
the bracket preview-clearing as conditional tails.

### Step 3 — Give `generateDraw` the same delete-first cleanup as `handleGenerateRR` *(low risk)*

Makes the two generators structurally identical and removes the reliance on UI gating.

### Step 4 — Add source reconciliation + a played-match guard to `handleEditPlayer` *(medium risk)*

Bring bracket moves up to RR's standard: clear the player's previous slot, refuse to overwrite a
slot in a completed match. Closes §3.5 and §3.6.

### Step 5 — Persist bracket drafts to `rr_drafts`-style storage *(medium risk)*

Rename the subcollection to `draw_drafts` and store bracket slot overrides there too. One draft
mechanism instead of two; brackets stop losing work on refresh.

### Step 6 — A single `placePlayer({ drawFormat, target, player })` seam *(higher risk, biggest win)*

The real unification: one entry point for "put this player here", dispatching to bracket-slot or
RR-group placement, with the shared concerns — ensure participant, reconcile source, guard played
matches, record withdrawal — handled once in the wrapper rather than per path.

Worth doing **only after steps 1–4**, which remove most of the behavioural differences that would
otherwise have to be encoded as special cases inside it.

---

## 6. What should *not* be unified

- **Seeding rules.** Four contexts genuinely want different orderings. Unify the *plumbing*, keep
  the strategies separate.
- **Auto-placement.** It suits RR (groups absorb an extra player) and does not suit brackets (a
  fixed-size bracket has no free slot). Don't extend it to brackets to make them symmetrical.
- **Bye auto-advancement.** Skipping it for RR knockout is deliberate, because slots are filled
  manually afterwards.

---

## 7. Open questions

1. **Bracket overflow is silently dropped** (`slice(0, drawsize)`). Should the creator be warned,
   or should the draw size step up automatically?
2. **Should alphabetical seeding stay?** Seeding by `leaguePoints26` or skill is a small change to
   `buildPlayerList` and would materially change draw quality.
3. **Two sources of truth for RR withdrawal** — `manuallyUnplacedIdsRef` (in-memory) and
   `rr_drafts.withdrawn` (persisted). Is the in-memory ref still needed now that the persisted list
   exists, or can it be dropped?
