# Future work

| | |
| --- | --- |
| **Date** | 2026-08-23 |
| **Scope** | Everything agreed in direction but **deliberately not scheduled**. Nothing here is in the Mon 24 – Fri 28 sprint week. |
| **Collected from** | `DECISIONS_BRIEF.md` · `DEV_ANUJ_CONFLICTS.md` · `HARMONIZATION_REPORT.md` · `WORKFLOW_DESIGN_REPORT.md` · `ACTION-REPORT.md` |
| **Rule** | An item leaves this file only by being written into a sprint. Nothing here is "do it if there's time". |

---

## 1 · Tournament and draws

| # | Item | Why it is not scheduled | Source |
| --- | --- | --- | --- |
| T1 | **Generate every populated draw in one click.** Today each draw and level is generated separately, and that stays. | Convenience, not correctness. Wants the organizer-controlled knockout (KO-1/KO-2) settled and used first | WDR §4 |
| T2 | **Tournament-display link to a co-member's profile.** Members can already open the profiles of people in their tournament from the Profiles page; the link *from the draw* is the missing half. | Needs the profile access model live first | DECISIONS_BRIEF §4, PD3 |
| T3 | **Organizer overview contact button.** | The `onParticipantJoin` connections trigger that makes it possible ships in Sprint 2; the button is the UI half | Conflicts §5 |
| T4 | **Bracket-image contact column.** The exported PNG carries no contacts. | Same trigger, same reason. `bracketImage.ts` needs no change — only the column | Conflicts §5 |
| T5 | **Remove Player-Loading placeholder participants.** | They are load-bearing today: a one-player group keeps a placeholder match so the lone player stays visible and movable | WDR backlog |
| T6 | **"Joined" links to the draw.** | Small, and it wants the draw-visibility rules stable | WDR backlog |
| T7 | **Itemise the weekly reminder** by opponent name and date, instead of the aggregate line plus the nearest deadline. | Costed and possible at the same read cost — one `users/{uid}` read per distinct opponent, batched. Deliberately left as the aggregate for now | WDR §"Weekly reminder" |

---

## 2 · Matches, challenges and rallies

| # | Item | Why it is not scheduled | Source |
| --- | --- | --- | --- |
| M1 | **Challenge and rally reporting routed through the result callable.** | Sprint 2 gives challenges and friendlies auto-approval and the margin reconcile; unifying all three onto one callable path is the follow-up | WDR §2 |
| M2 | **Reject/cancel semantics.** A rejected request or challenge disappears from the rejecting player's tab and stays gone; reappearing after a refresh is a defect. Cancel after acceptance succeeds with a notice to the other player. | Ships with M1 | WDR §2 |
| M3 | **Challenge notification parity with rallies** — declined, confirmed, denied. | Ships with M1 | WDR §2 |
| M4 | **One Challenge entry point**, in the Challenges tab, with the block reason shown. | Today the action exists in more than one place. Needs a decision on which one survives | WDR §2 |

---

## 3 · Zones, courts and the map

| # | Item | Why it is not scheduled | Source |
| --- | --- | --- | --- |
| Z1 | **Runtime-editable courts map.** A custom court that resolves to no zone notifies the super-admin and the organizer; a human then adds it to the courts dataset and the zone resolves from there. | Map additions ship as data updates to the courts dataset. An in-app editor is a separate build | DECISIONS_BRIEF §2; HARMONIZATION future works |
| Z2 | **One authoritative court roster generated from the shipped CSV.** Three hand-maintained lists drift today: the CSV (174 rows), `ZONE_COURT_COUNTS` (174), `functions/courts.json` (173 keys, North Scarborough 23 vs 24). | Open question Q-12 — which list is authoritative, and does a build script generate the other two | ACTION-REPORT Q-12, CS-39 |

---

## 4 · Profiles, access and auth

| # | Item | Why it is not scheduled | Source |
| --- | --- | --- | --- |
| P1 | **`next=` return path after login.** Login returns to the page the member started from, or the profile page if that was the landing page. | Backlog. `RT-7` | WDR §7 |
| P2 | **Change-email for OAuth-only accounts.** | No path exists today | WDR §7 |
| P3 | **Availability editor on the Profile card.** | The `available_to_play` toggle and Away pill ship in Sprint 4; the full editor does not | WDR §7 |
| P4 | **Organizer-assignment audit trail** over `organizer_ids`. The assignment UI itself is in Sprint 5. | The trail is a second build on top | HARMONIZATION future works |

---

## 5 · Services and bookings

| # | Item | Why it is not scheduled | Source |
| --- | --- | --- | --- |
| S1 | **Past-bookings section**, listed under the open ones. | There is exactly one booking in the system — a test, cancelled. Nothing to list yet | WDR §8 |

---

## 6 · Events

| # | Item | Why it is not scheduled | Source |
| --- | --- | --- | --- |
| E1 | **Event types and the creation modal simplified.** | Needs a detail pass with you before anyone builds it | WDR §6 |

---

## 7 · Platform, mobile and operations

| # | Item | Status | Source |
| --- | --- | --- | --- |
| X1 | **Mobile app vs PWA.** A mobile app is preferred; a PWA if the effort is too high — decided after an estimate. Offline: none, every action is online-only. | **PD9 — deferred by you**, pending the estimate | DECISIONS_BRIEF PD9 |
| X2 | **Push notifications.** Notifications (in-app, later push) are the primary update channel, to reduce email. | Ships with the mobile decision | WDR §10, PD9 |
| X3 | **Staging tier.** | **PD7 — deferred by you** | DECISIONS_BRIEF PD7 |
| X4 | **Backup and restore policy.** Required before the first destructive data pass; details to be agreed. | **PD8 — deferred by you, no commitment yet.** Until it lands, treat every destructive one-off as unrecoverable | DECISIONS_BRIEF PD8 |
| X5 | **Recompute-and-diff reconciliation folded into the migrations framework.** A5 builds the harness in the sprint week; making it a first-class step of every migration is the follow-up | HARMONIZATION future works |
| X6 | **Uniform null-filled schemas.** Sparse documents stay for now; enforce uniform schemas only if and when the data moves to a different database. | Deferred standard | HARMONIZATION future works |

---

## 8 · Design system — the rows that need a decision before they can be built

Not deferred by choice. Each is blocked on an unsettled question, not a missing edit. The recommendation column is the audit's own; taking it turns the row from blocked into scheduled.

| Q | Question | Blocks | Recommended |
| --- | --- | --- | --- |
| Q-2 | What clearance does a hit-expanded control need? The licence permits 30px chips at `gap-2`; their expanded targets overlap by 6px and steal each other's taps | BT-9, BT-10, BT-17 | State it as an equation: gap ≥ (44 − painted height) on the expanded axis |
| Q-3 | Does hit expansion apply to bracket and RR rows at all? Both licensed examples are zero-gap stacks whose vertical neighbours are themselves tappable — the case the same table forbids | BT-15 | Re-scope the licence to horizontally adjacent controls only |
| Q-5 | DEC-4's "rounded edges" — 16px or a full pill? | BT-22 | **16px.** A pill collides with BT-22, which reserves `rounded-full` for non-tappable |
| Q-7 | What happens to the four hero type sizes? DEC-5 allows two; the marketing pages use `text-3xl`/`4xl`/`5xl`/`6xl` | TY-2 | Name one `display` exception at `text-3xl` for marketing |
| Q-11 | The BottomNav label. At `text-xs` + `tracking-widest`, "Marketplace" is ~78–92px in a 73px column at 375px, with no `truncate` | TY-8 | Drop the tracking and add `truncate` — an exception in the one place it will keep being breached is not an exception |
| Q-12 | Which court roster is authoritative? | CS-39, Z2 | The CSV; generate the other two in a build script |
| Q-13 | What is an "active player" at a court? The client applies a 90-day / 0-points filter; the Cloud Function does not, so the same court shows a different count depending on whether the aggregate doc exists | LB-14, CS-28 | Teach the function the client's rule — that is the number members have been reading |
| Q-14 | Keep or drop the Home baselines? "42 courts" never changes and is shown as fact; a genuine zero is indistinguishable from a failed read | LB-13 | Remove them. A fabricated stat is not a stat |
| Q-15 | Does the Court Map join the design system? 60 hardcoded hex literals plus `system-ui` in one route | CT-23, CT-27, CS-16, CS-44 | Full token sweep for the app-chrome half; a written fixed-light contract for the MapLibre half |
| Q-17 | Keep the fixed 78px action slot? Half the call sites already defeat it with `w-auto` | CS-20 | Keep it and trim the action clusters |
| Q-18 | Avatar scale. 20px Navbar against 24px `ProviderAvatar` is an accident, not a decision | CS-17 | Two sizes: `sm` 24 / `lg` 96 |
| Q-20 | Ring denominators for the three Tasks headline tiles. RS Points and League Points are unbounded; Rewards is a bare count. A ring cannot be drawn without a denominator | CS-33 | No rings there — keep numerals |
| Q-21 | Remove two of the three Contact Method switches? | CS-48 | Keep all three — or remove two **and** ship a migration clearing `preferred_mode_of_contact`, or members whose stored preference names a removed channel become uncontactable |
| Q-23 | Prose column width: 576px or 768px? Two published answers 192px apart for the same one-line commit | — | 768px for prose, and the canon gains a second `page-shell` width |
| Q-25 | Does signup collect the fields that later lock a member out? It accepts empty `preferred_courts` and `league` — exactly the state that blocks `/matches`. `skillLevel` defaults to 2, so "never answered" and "I am a 2.0" are indistinguishable | — | Collect them, and make the skill default absent rather than 2 |

---

## 9 · What is **not** here

Two things people expect to find in a future-work list and will not:

- **The 273 UI action rows.** They are scheduled — Sprint 3 for the foundation, Sprint 5 for the component system. Only the rows blocked on §8's questions are unscheduled, and they are listed by their blocking question, not individually.
- **Anything on the freeze list.** `CompleteProfileModal`, the day-toggle grid, the scheduling trio, the no-show cluster, the Services Dispute/Cancel controls, `GroupLessonCard`, `OPEN_STATUSES`, the super-admin `AddServiceForm`. These are **deleted**, not deferred. See `PROJECT-PLAN.md` §8.
