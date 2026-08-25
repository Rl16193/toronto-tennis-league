# Sprint D5 — Friday 28 August 2026

> **Component system, roles, bookings, and release.** The largest UI bucket in the audit, the
> `providers` cutover, the bookings lifecycle, and the week's regression.

| | |
| --- | --- |
| **Branch base** | [Sprint D4](SPRINT-D4.md) merge |
| **Blocking** | A2's `providers` collection lands **before 10:00** or A1's cutover cannot start |
| **Ship** | Functions → rules → hosting. **Then the full release runbook on a preview channel before anything reaches live** |

---

## Board

| Lane | Tasks | Rows |
| --- | --: | --- |
| **A4 UI/UX** | 6 groups | [CS-2](../ACTION-REPORT.md#CS-2)…[CS-68](../ACTION-REPORT.md#CS-68), [CT-3](../ACTION-REPORT.md#CT-3)…[CT-11](../ACTION-REPORT.md#CT-11), [CT-18](../ACTION-REPORT.md#CT-18)…[CT-30](../ACTION-REPORT.md#CT-30), [BT-9](../ACTION-REPORT.md#BT-9)…[BT-28](../ACTION-REPORT.md#BT-28), [TY-1](../ACTION-REPORT.md#TY-1)…[TY-10](../ACTION-REPORT.md#TY-10), [AX-3](../ACTION-REPORT.md#AX-3)…[AX-26](../ACTION-REPORT.md#AX-26), [MF-7](../ACTION-REPORT.md#MF-7)…[MF-13](../ACTION-REPORT.md#MF-13), [RT-1](../ACTION-REPORT.md#RT-1) (real 404), [DC-17](../ACTION-REPORT.md#DC-17), [DC-20](../ACTION-REPORT.md#DC-20), [DC-21](../ACTION-REPORT.md#DC-21) |
| **A1 Rules + Functions** | 5 | [PD5](../notes/DECISIONS_BRIEF.md#PD5), [PD6](../notes/DECISIONS_BRIEF.md#PD6), [S6](../notes/HARMONIZATION_REPORT.md#S6), bookings callables, claim review |
| **A2 Data** | 5 | `providers`, [L11](../notes/HARMONIZATION_REPORT.md#L11) bookings, [N1](../notes/HARMONIZATION_REPORT.md#N1) `services`, [L8](../notes/HARMONIZATION_REPORT.md#L8) · [PD2](../notes/DECISIONS_BRIEF.md#PD2) group lessons, [PD10](../notes/DECISIONS_BRIEF.md#PD10) awards |
| **A3 Client / Dev** | 3 | event-scoped organizer, checklist flag, RT-1 wiring |
| **A5 Verify** | 5 | full regression, reconciliation, deployed-rules diff, release runbook, handover |

---

## A4 · UI/UX — `ui-ux` · the component system

**45 CS rows, 42 estimated days, the largest single bucket in the audit.** Everything here was blocked on Wednesday's primitives and is now unblocked.

**[DC-17](../ACTION-REPORT.md#DC-17) is binding on every row below: register the primitive in `.design-sync` in the commit that creates it, and consume it at one real call site in the same PR.** Tailwind compiles classes from `src/` only, so a preview using a class no `src/` file uses renders unstyled and looks broken.

### Group 1 — Person components · **CS-1 first, it is the prerequisite**

**Sequencing rule 3: `CS-1` before [CS-3](../ACTION-REPORT.md#CS-3), [CS-8](../ACTION-REPORT.md#CS-8), [CS-9](../ACTION-REPORT.md#CS-9), [CS-10](../ACTION-REPORT.md#CS-10) and [AX-25](../ACTION-REPORT.md#AX-25).** The cheapest prerequisite in the audit — all seven person components depend on it.

| Row | Build | Retires |
| --- | --- | --- |
| **[CS-1](../ACTION-REPORT.md#CS-1)** | `formatPersonName` — collapse `formatPlayerName` and `toTitleCase` | two formatters |
| CS-3 | `PersonRow`, three densities; fold the RR standings row in via a ~10-line `editControls` slot | **41 ways of drawing a person** |
| CS-8 | `PersonOption` | nine picker surfaces |
| CS-9 | `PersonPairRow` | seven `{p1} vs {p2}` copies |
| CS-10 | `PersonChip`, `PersonInline` | — |
| [CS-17](../ACTION-REPORT.md#CS-17) | `initialOf()` | three first-initial implementations. Avatar scale: `sm` 24 / `lg` 96 |
| [CS-19](../ACTION-REPORT.md#CS-19) | A `zone` slot on the standard person row | — |
| [CS-20](../ACTION-REPORT.md#CS-20) | Restore the fixed 78px action slot | half the call sites defeat it with `w-auto` |
| [CS-21](../ACTION-REPORT.md#CS-21) | Align `expandedUid`; stop the double own-row highlight | — |
| AX-25 | `aria-label` and confirm text use the formatted name | — |

### Group 2 — Cards, tiles and rows

| Row | Build | Retires |
| --- | --- | --- |
| [CS-2](../ACTION-REPORT.md#CS-2) | `StatTile` + `StatGrid` | seven tile geometries |
| [CS-4](../ACTION-REPORT.md#CS-4) | `ListRow` + `ListGroup` | eight copies of one skeleton |
| [CS-5](../ACTION-REPORT.md#CS-5) | `EntityCard` | five copies of one footer card |
| [CS-6](../ACTION-REPORT.md#CS-6) | `ReviewPanel` | five organizer queues → one chrome |
| [CS-7](../ACTION-REPORT.md#CS-7) | One `ProfileCard`, `mode: 'own' \| 'public'` | **two 700-line components already drifting** — `Phone` vs `Contact` for the same field. The safety boundary is `firestore.rules`, not the component |
| [CS-12](../ACTION-REPORT.md#CS-12) | `EmptyState` / `EmptyCard` | every hand-rolled empty state |
| [CS-14](../ACTION-REPORT.md#CS-14) | Absorb four hand-rolled disclosures into `Accordion` | — |
| [CS-16](../ACTION-REPORT.md#CS-16) | `PlaceCard` — the map popup becomes a **density**, not a rewrite | — |
| [CS-18](../ACTION-REPORT.md#CS-18) | One `Pill` atom; then `Pill` / `Chip` properly | `NearbyPill`, `AvailabilityPills` |
| [CS-43](../ACTION-REPORT.md#CS-43) | Widen the desktop bracket column or move it out of `max-w-xl`; add a `slot` variant | — |
| **[CT-32](../ACTION-REPORT.md#CT-32)** | Confirm Wednesday's border removal held on every new card | — |

### Group 3 — Overlays, forms and states

| Row | Build |
| --- | --- |
| [MF-8](../ACTION-REPORT.md#MF-8) | `FieldError`; convert the 15 inline error paragraphs |
| [MF-9](../ACTION-REPORT.md#MF-9) | `AlertMessage` becomes the **only** banner — **1 consumer today against 13 hand-rolled copies, 11 with no box at all and none carrying `role="alert"`** |
| [MF-10](../ACTION-REPORT.md#MF-10) | `ConfirmSheet`; replace the remaining **4** `window.confirm` calls (was 6; `useTournament.ts` lost two on `dev-anuj`) |
| [MF-11](../ACTION-REPORT.md#MF-11) | `Popover` — surface + 44px row; make the 3 in-flow popovers absolutely positioned |
| [MF-12](../ACTION-REPORT.md#MF-12) | `Checkbox`; convert the 11 `accent-clay` checkboxes |
| [MF-13](../ACTION-REPORT.md#MF-13) | `Switch` — extract the three verbatim-duplicated `w-10 h-6` switches |
| [MF-7](../ACTION-REPORT.md#MF-7) | Standardise field chrome: label, asterisk, hint, error, 16px rhythm |
| [CS-35](../ACTION-REPORT.md#CS-35) / [CS-36](../ACTION-REPORT.md#CS-36) | `Skeleton` inherits the radius and height of what it replaces; one `Spinner`, drop the second `Loader2` mechanism |
| [CS-30](../ACTION-REPORT.md#CS-30) / [CS-31](../ACTION-REPORT.md#CS-31) / [CS-32](../ACTION-REPORT.md#CS-32) | `ProgressRing`; rings in the Tasks category header, the Initiation accordion and the RR group-card header. **CS-32 ships with [LB-2](../ACTION-REPORT.md#LB-2)** or a 100% ring sits beside a permanently closed Knockout gate |
| [DC-21](../ACTION-REPORT.md#DC-21) | One `ErrorScreen`; convert the three failure screens |
| **[RT-1](../ACTION-REPORT.md#RT-1)** | The **real 404 page** (reading b). Wednesday shipped the `replace` stopgap |

### Group 4 — The per-site sweeps

| Rows | Content |
| --- | --- |
| [CT-3](../ACTION-REPORT.md#CT-3), [CT-5](../ACTION-REPORT.md#CT-5), [CT-6](../ACTION-REPORT.md#CT-6), [CT-7](../ACTION-REPORT.md#CT-7), [CT-8](../ACTION-REPORT.md#CT-8), [CT-9](../ACTION-REPORT.md#CT-9), [CT-10](../ACTION-REPORT.md#CT-10), [CT-11](../ACTION-REPORT.md#CT-11) | 42 `bg-tennis-dark` occurrences across 22 files · 12 `divide-white/5` (row separators vanish on light cards — eight list surfaces read as one block) · 7 hairline opacities → `border-fg/10` · 9 `bg-white/[0.0x]` (the six Profile stat tiles have **no surface at all** in light theme) · 38 surface tints → five · every third text tier · 9 `bg-white text-ink` unselected states |
| [CT-18](../ACTION-REPORT.md#CT-18)…[CT-30](../ACTION-REPORT.md#CT-30) | The `#1a1a2e` member-picker panel · the pending-score Confirm button · the match status dot · 8 raw-hex `Badge` pairs in both court result lists · the `PAST` badge contrast · the Court Map's 60 hex literals · the one-off green loading bar · chart colours · one shared marker-colour constant · `[color-scheme:dark]` on both deadline inputs · `[&>option]:text-black` on the bracket player select · elevation stripped from every in-flow surface |
| [BT-9](../ACTION-REPORT.md#BT-9), [BT-10](../ACTION-REPORT.md#BT-10), [BT-16](../ACTION-REPORT.md#BT-16), [BT-17](../ACTION-REPORT.md#BT-17), [BT-20](../ACTION-REPORT.md#BT-20)…[BT-28](../ACTION-REPORT.md#BT-28) | **BT-17 before BT-9 and BT-10** (sequencing rule 4) — widen the gap before the targets grow, or the upper control silently steals the lower one's taps during the sweep. Then: 16 dense in-row actions 24px → 44px · icon-only 44×44 · 18 tournament organizer micro-fields · four `!important` geometry overrides · 13 "selected" treatments → one idiom · the 5-step radius ladder, delete `rounded-lg` · concentricity · ban bare `transition` · gap/rhythm/padding to canon steps · 5 dead `hover:border-*` with no border width |
| [TY-1](../ACTION-REPORT.md#TY-1), [TY-2](../ACTION-REPORT.md#TY-2), [TY-4](../ACTION-REPORT.md#TY-4), [TY-6](../ACTION-REPORT.md#TY-6), [TY-7](../ACTION-REPORT.md#TY-7), [TY-9](../ACTION-REPORT.md#TY-9), [TY-10](../ACTION-REPORT.md#TY-10) | **161 sub-12px sites** → `text-xs` · two heading sizes only · 12 uppercase-label treatments → one `label` role · tracking collapsed · `font-medium` retired · break the contact email at the `@` · 12-hour local program times. **[TY-3](../ACTION-REPORT.md#TY-3) is already written into `CLAUDE.md` — do not let the heading sweep eat the 16px control size** |
| [AX-3](../ACTION-REPORT.md#AX-3)…[AX-16](../ACTION-REPORT.md#AX-16), [AX-20](../ACTION-REPORT.md#AX-20)…[AX-22](../ACTION-REPORT.md#AX-22), [AX-26](../ACTION-REPORT.md#AX-26) | Member picker keyboard-operable · four court comboboxes `onMouseDown` → `onClick` + arrows · three password reveal toggles focusable and named · combobox semantics on `MemberSearchInput` · arrow keys on the ScoreModal winner radiogroup · `aria-expanded`/`aria-controls` on collapsible rows · `aria-label` on 9 unlabelled selects and 3 unnamed X buttons · Email Notifications switch named · join sheet Combined Skill labelled · `aria-pressed`/`role="radio"` on selection chips across four screens · `role="alert"` on banners · Tasks checkboxes in `<label>` · Escape and focus on map popups · zone Approve/Reject `aria-label` reconciled · the "certified" `BadgeCheck` named · a consent banner before GA4 fires |

### Group 5 — Copy, content and the remaining CS rows

[CS-13](../ACTION-REPORT.md#CS-13) heading pattern `{Title} ({n})` · [CS-15](../ACTION-REPORT.md#CS-15) one expanded-drawer layout · [CS-22](../ACTION-REPORT.md#CS-22)…[CS-29](../ACTION-REPORT.md#CS-29) one label per stat (`P/G Won %`, `Wins`, `Matches`, `Group Pts`, skill band in the Leagues subtitle, two different labels for the two draw counts, `{n} players`, `RankMove` once per row) · [CS-34](../ACTION-REPORT.md#CS-34) indeterminate loading where the percentage was fabricated · [CS-37](../ACTION-REPORT.md#CS-37) **deleted with the no-show concept** · [CS-38](../ACTION-REPORT.md#CS-38) one rewards-available helper · [CS-40](../ACTION-REPORT.md#CS-40), [CS-41](../ACTION-REPORT.md#CS-41) counts and links on Events and History · [CS-44](../ACTION-REPORT.md#CS-44)…[CS-68](../ACTION-REPORT.md#CS-68) the Court Map, Services, Marketplace, notifications and copy rows.

### Group 6 — Delete, do not restyle

| Surface | Retires |
| --- | --- |
| The Services **Dispute** and **Cancel** controls and their six status strings | `flagged` and `cancel_requested` are removed |
| The ReviewQueue coupon section — **in both `ServicesElements.tsx` and `Tasks.tsx`** | a one-sided delete strands orphan copy. **Delete both in one change** |
| `GroupLessonCard` and its four callable error strings | retires **[LB-38](../ACTION-REPORT.md#LB-38)**; it is hardcoded to one provider id anyway |
| `OPEN_STATUSES` and the open-coupon list gate | the status set is replaced wholesale |
| The super-admin `AddServiceForm` | retires **[AX-12](../ACTION-REPORT.md#AX-12)** and **[CS-58](../ACTION-REPORT.md#CS-58)** |

### ⬛ DC-20 — `scripts/lint-design.mjs`

Report mode only. **Fold it into `npm run lint` only after the sweeps land**, or it fails the build on 400 known sites.

**A4 verification** · `npm run typecheck` · the grep suite · `.design-sync` diff across all 16+ components, **both cells**

---

## A2 · Data — `dev-data`

### ⬛ `providers`

Role and provider fields move off `preferences`, which became public on Tuesday (**[R7](../notes/HARMONIZATION_REPORT.md#R7)**). `providers` rows carry **roles, not assignments** — per-event assignment is `organizer_ids` ([L4](../notes/HARMONIZATION_REPORT.md#L4), landed Tuesday). That distinction is the whole model.

### ⬛ L11 — Bookings lifecycle

```text
lead ──"Racquet dropped" (player)──▶ in_progress ──"Completed" (stringer)──▶ [completion_requested_at]
                                                                                    │
  │                                                            "Got your racquet back?"
  └──"Cancel" (player, lead only)──▶ cancelled                    ├── Yes ──▶ completed
       points refunded                                            └── No  ──▶ back to in_progress,
                                                                              stringer sees "Completed" again,
                                                                              super-admin notified
```

- **`cancelled` is reachable from `lead` only.** Points refunded.
- **`completion_requested_at`** marks the wait. **There is no fourth status.**
- **`flagged` and `cancel_requested` are removed.** So is `redemption_locks`.
- Super-admin notice on "No": *"{Name} (Player) cancelled job completion"*.

### ⬛ N1 — The catalog is `services`; `offers` retires

Edited through an **owner-gated callable**. Note the existing id convention: `tasks` rows with `type: 'offer'` use **bare doc ids** — `redemptions.reward_id` and `functions/rewards.js` resolve `tasks/{rewardId}` directly, so never prefix them.

### ⬛ L8 · PD2 — `group_lessons` retires

A lesson becomes an **add-on block on an upcoming or ongoing social event**. The collection and its join/leave callables go.

### ⬛ PD10 — Group-award storage kept

One `awards` document per award, carrying the winners' receipt.

### ⬛ PD1 — The public-field contract, confirmed

Every collection is publicly readable **except `contacts` and `mailing_list`**. `preferences` is public. `tasks/{uid}` stays public — no UI exposes another member's task list, and task points must be readable by all. `site_stats` is public. **Only `points_spent` is stored;** totals and balances derive at read.

**A2 verification** · dry-run diffs · `npm test` · the reconciliation pass below

---

## A1 · Rules + Functions — `rules-functions`

### ⬛ PD6 · S6 — `event_creator` ends at the `providers` cutover

Not at lockdown — **at the cutover**. The global privilege moves to the organizer and admin roles. Today it is granted by a `preferences` flag settable only by one hardcoded super-admin uid; that path goes.

### ⬛ PD5 — Admin bootstrap and recovery

The admin `providers` row is issued and re-issued **only by an Admin-SDK script run with the service account**. **No in-app path.** Write the script and the runbook entry.

### ⬛ Bookings callables

`book` · `racquet-dropped` · `request-completion` · `confirm yes/no` · `cancel-lead`. Transition table in `functions/lib/redemptionState.js` rewritten to the [L11](../notes/HARMONIZATION_REPORT.md#L11) lifecycle. Notices: the provider on booking, the member on each step, the super-admin on a "No".

### ⬛ Claim review · P6b

Volunteer and host claims are approved by **the event's organizer**; **ambassador claims auto-approve**. Claims use a **deterministic id** so a repeat is a no-op. Reports need no location proof; **check-ins keep the ≤400 m rule**. Court reports stay a collected, paid, **undisplayed** data feed.

### ⬛ The role test that matters

A user who flips the role flag in devtools must be able to write **nothing**. That is the whole point of the cutover — the UI toggle is cosmetic, `firestore.rules` is the boundary.

**A1 verification** · `npm run test:rules` · `npm run test:storage` · `cd functions && npm test` · `npm run test:functions:integration`

---

## A3 · Client / Dev — `dev-client`

- Event-scoped organizers honoured everywhere `isCreator` is used — the `isEventManager` helper from Thursday, applied.
- The task checklist writes **only the flag**; `category` retires with [P6b](../notes/WORKFLOW_DESIGN_REPORT.md#P6b).
- **Checklist create must not be rejected for new members** — a new member currently cannot tick their first task.
- Wire the real 404 (A4 builds the page).

> `useTasks` **never retries a failed task write.** Clearing `written` in `.catch()` turned a rules-rejected write into an endless render→write→reject spin — the Profile page flicker. Do not reintroduce it.

---

## A5 · Verify — `dev-verify`

### ⬛ Full regression

Every layer, clean: `npm run typecheck` · `npm run lint` · `npm test` · `cd functions && npm test` · `npm run test:rules` · `npm run test:storage` · `npm run test:functions:integration` · `npm run test:fixtures` · `npm run test:e2e` · the grep suite · `npm run verify`.

### ⬛ The seven journeys

| # | Journey |
| --- | --- |
| 1 | Sign up → complete profile → join with no courts → "Enter A Zone" → seated in the right zone's draw |
| 2 | Organizer records a result → re-edits it twice → stats equal a fresh recompute, `completed_at` unchanged |
| 3 | **Player submits → applied immediately, both notified. Opponent submits a different score, same winner → lower margin records, points unchanged. Opponent submits a different winner → first result stays applied and displayed, match flags, organizer notified once** |
| 4 | Walkover: RR group **1 to each player**; knockout advances the winner and pays R32 **1** · R16 **2** · QF **3** · SF **5** · F **10** |
| 5 | Withdrawal after draws → unplayed become walkovers, played untouched, organizer and opponents notified, player stays in Unplaced |
| 6 | Ladder challenge → **+3 / −3 floored at 0** → a double-tap pays once |
| 7 | Contact access: opponent yes, organizer for their own participants yes, **nobody else** — and access ends on withdrawal |

### ⬛ Reconciliation — the recompute-and-diff harness

Replay every match through `matchAward` and diff against the stored `stats` docs.

**`R6` must still hold: all 204 `stats` docs satisfy `loses = matchesPlayed − wins`.** Baseline from Monday's export and the archived counter snapshot, **never** from matches — counters are authoritative for pre-2026 history, and all live match docs are 2026.

This is the only defence against the class of bug that has bitten this project three times: points paid twice, points reversed that were never paid, a display table drifting from the writer.

### ⬛ Deployed-rules diff

Compare the repo `firestore.rules` and `storage.rules` against the deployed console copies, one final time. Deployment is manual; the repo file is not necessarily what is enforcing anything.

### ⬛ Release runbook, executed on a preview channel

```text
1. Firebase console: reCAPTCHA Enterprise key registered
2. firebase deploy --only functions
3. firebase deploy --only firestore:rules[,storage]
4. hosting build with VITE_FIREBASE_APP_CHECK_SITE_KEY, then deploy
```

Union whitelists throughout. Functions deploy individually. `tbtc` is the **test** environment — the `storage.rules` "deploying replaces the console copy" warning applies when promoting to the **live** project.

**Strip legacy names only after functions and hosting are both out:** `claimed_winner_*`, `score_line`, `zone_change_requested*`, `score_pending`, `rr_group_bonus_v2`, `no_show`.

### ⬛ Handover

| Deliverable | Content |
| --- | --- |
| Burn-down | `uisummary_report.md`'s counts and `DEV_ANUJ_CONFLICTS.md`'s Summary flipped for every closed row. The line *"Nothing here has been implemented"* is the burn-down — update it |
| Amendments | `HARMONIZATION_REPORT.md` [D4](../notes/HARMONIZATION_REPORT.md#D4), `WORKFLOW_DESIGN_REPORT.md` §1 and `DECISIONS_BRIEF.md` §1 carry the dated auto-approval amendment |
| `CLAUDE.md` | Design canon, the corrected walkover payout, the organizer-controlled knockout ([KO-3](../ACTION-REPORT.md#KO-3)), the test commands, and the removal of *"There are no automated tests"* |
| Open | Everything still unscheduled is in `docs/FUTURE-WORK.md`, including the 15 design questions in §8 that block specific rows |

### ⬛ Exit gate — the week

| Check | Passes when |
| --- | --- |
| Conflicts | All five `RESOLVED` |
| Live bugs | [LB-1](../ACTION-REPORT.md#LB-1) through [LB-50](../ACTION-REPORT.md#LB-50) closed or explicitly carried, with a test each |
| No-show | `grep -rn 'no_show\|NO_SHOW_POINTS\|is_walkover' src/ functions/` → **0** |
| Design | Every grep assertion at its stated value; `.design-sync` clean in both cells |
| Data | Every migration diff read and approved; `R6` holds |
| Rules | Deployed matches repo; a devtools role flip writes nothing |
| Release | Runbook executed clean on a preview channel |

---

## What is deliberately not finished

`docs/FUTURE-WORK.md`, in full. The two largest: the **mobile app vs PWA decision ([PD9](../notes/DECISIONS_BRIEF.md#PD9))** with push notifications behind it, and the **backup and restore policy ([PD8](../notes/DECISIONS_BRIEF.md#PD8))** — both deferred by you, and PD8 in particular still means every destructive pass this week ran against the only copy of the data.
