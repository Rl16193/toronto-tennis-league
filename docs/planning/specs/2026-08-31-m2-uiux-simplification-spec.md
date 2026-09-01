# Spec — M2 / Phase 2: UI/UX simplification

> Produced by the `to-spec` skill on 2026-08-31 from the Racquets & Strings Vision
> (§4 Block 1, §5 M2) and Sprint D7. Synthesis only — no new decisions are made here.
> Rulings live in [DECISIONS-2026-08-29.md](../DECISIONS-2026-08-29.md); vocabulary in
> [VISION.md](../VISION.md) §8.

**Status:** draft, awaiting owner review of the seams (see Testing Decisions).

---

## Problem Statement

A member using the app today sees the same idea drawn several different ways, and
sometimes drawn wrongly.

The same fixture is described as "Completed" on one screen, "Done" on another and
"Score recorded" on a third. The same person is drawn 41 different ways across the app,
and six members currently render as `blake bell` in a player row but `Blake Bell` on the
leaderboard, because three different name formatters exist and only one of them
title-cases. Eighty-three card surfaces repeat the same handful of layouts with small
unexplained differences between them.

Underneath the inconsistency sit defects that only appear in one theme. Twelve row
separators vanish on light cards, so eight list surfaces read as one undifferentiated
block. Nine surfaces have no fill at all in light theme, including six of the stat tiles
on the profile page. Nine unselected controls read as selected. Six of the eight original
audit passes found light-theme-only defects, so any check that only looks at dark mode
proves nothing.

Two interaction patterns break the app's own conventions outright: browser `confirm()`
dialogs and native `<select>` dropdowns, neither of which can be styled, both of which
behave differently on every device, and nine of the selects carry no accessible label at
all.

The cost is not only cosmetic. Every new screen starts by someone choosing which of the
existing variants to copy, so the inconsistency compounds with each sprint, and the
beta cohort will be forming their first impression of the product on exactly these
surfaces.

## Solution

One shared element set, applied to every surface the September beta touches.

A member sees the same component drawn the same way wherever it appears: one way to draw
a person, one card, one list row, one banner, one set of loading and empty states. Every
destructive or ambiguous action is confirmed through an in-app modal form with an
explicit yes and no, never a browser dialog. Every choice is made through a modal form
that carries its own heading, never a native dropdown. A person's name renders as
_Blake Bell_ everywhere, while bracket placeholders such as `BYE` and `Winner of …`
survive untouched.

Every row a member reads stays legible and on one line at 5.8 inches. Both themes are
treated as first-class: a surface is not finished until it has been checked in light and
in dark.

The phase closes when the shared set is genuinely the only set in use on beta surfaces —
not when it merely exists alongside the old variants.

## User Stories

1. As a member, I want the same match to use the same word on every screen, so that I am
   not left wondering whether "Completed" and "Done" mean two different things.
2. As a member, I want my own name to render the same way on every screen, so that the
   app does not look broken the first time I open it.
3. As a member, I want other players' names title-cased consistently, so that a player
   row and a leaderboard row are obviously about the same person.
4. As a member reading a bracket, I want placeholders like `BYE` and `Winner of QF1` to
   stay exactly as written, so that the draw remains readable.
5. As a member on a 5.8-inch phone, I want a player row to fit on one line, so that I can
   scan a list without horizontal scrolling.
6. As a member on a small phone, I want long names to truncate rather than wrap, so that
   rows stay a predictable height.
7. As a member on a small phone, I want at most two numbers beside a name, so that the
   row stays readable and the rest moves into the expanded drawer.
8. As a member, I want contact controls to be icon-only on a narrow screen, so that they
   do not squeeze the name out.
9. As a member in light theme, I want list rows to be visually separated, so that eight
   list surfaces do not read as one block.
10. As a member in light theme, I want every card and tile to have a fill, so that
    content does not float on the page background.
11. As a member, I want an unselected control to look unselected, so that I can tell what
    I have actually chosen.
12. As a member, I want confirmation of a destructive action to appear as an in-app modal
    with a clear yes and no, so that I am never surprised by a browser dialog.
13. As a member, I want to pick from a list using an in-app form with a visible heading,
    so that I always know what I am choosing.
14. As a member using a screen reader, I want every choice control to be labelled, so
    that I know what the control is for.
15. As a member using a screen reader, I want error and status banners announced, so that
    I do not miss a failure.
16. As a member using a keyboard, I want to reach the member picker, the court
    comboboxes and the password toggles, so that I can complete a task without a mouse.
17. As a member, I want error messages drawn the same way in the same place on every
    form, so that I know where to look when something goes wrong.
18. As a member, I want one loading treatment, so that the app does not appear to be two
    applications stitched together.
19. As a member, I want loading indicators to be honest, so that a fabricated percentage
    does not tell me a job is 60% done when nothing knows that.
20. As a member, I want the app's writing to sound like a person, so that instructions
    are quick to read and easy to act on.
21. As a member viewing my leaderboard progress, I want my last five matches plotted with
    each point carrying its own value, so that I can read the trend at a glance on a
    phone without decoding an axis.
22. As a member viewing that chart, I want rank plotted so that up always means
    improvement, so that I do not misread a rise as a fall.
23. As a member with fewer than five matches, I want the chart to plot what exists, so
    that a new account still shows something meaningful.
24. As an organizer, I want every queue I work through to use the same panel and the same
    approve/reject pair, so that I can move quickly without re-learning each screen.
25. As an organizer, I want each queue heading to state its count, so that I can see how
    much work is waiting.
26. As an organizer on a desktop, I want the bracket column wide enough to read, so that I
    am not scrolling a narrow strip.
27. As an owner, I want one component set registered and consumed, so that the next
    feature starts by using a component rather than copying a variant.
28. As an owner, I want the group table to show the points actually paid, so that the
    table cannot drift from what the server awarded.
29. As an owner, I want a single automated check that fails when a retired pattern
    reappears, so that the simplification does not quietly erode.
30. As an owner, I want to walk every beta screen in both themes on a real phone before
    the phase closes, so that sign-off is based on the product, not a report.

## Implementation Decisions

**One element set, registered as it is built.** Each primitive is registered in the
design-sync manifest in the same change that creates it, and consumed at one real call
site in that same change. The CSS build compiles from source only, so a component that
exists but is used nowhere renders unstyled and reads as broken. This rule is what keeps
the set from becoming a parallel library nobody adopts.

**Person rendering collapses to one path.** A single name formatter title-cases and
retains the bracket-placeholder guards; the two other formatters are deleted rather than
left deprecated. One person row supports three densities and an edit-controls slot, so
the Round Robin standings row folds into it rather than remaining a variant. A seed slot
is added to the row now, rendering the seed number before the name; Sprint D8 computes
the number, this phase only reserves the space. The person components — option, pair
row, chip, inline — all build on that one row, so the row is the prerequisite for the
rest of the group.

**The profile surfaces collapse into one card with an own/public mode.** Three
components carry the profile today, and the duplications sit on different pairs of them,
so collapsing only two would move the problem rather than end it. Consolidating all three
also ends the duplicated streak derivation, the duplicated P/G-won-percentage
calculation and two of the three first-initial helpers as a by-product. The safety
boundary for what a viewer may see remains the Firestore rules file, never the component.

**Streak stays derived, never stored.** It is read from the most recent completed
matches until the run breaks. The existing task-level streak counter is a bare count with
no win/loss direction and is not a substitute.

**Browser-native interaction is removed, not restyled.** Every `confirm()` becomes a
modal form with explicit yes and no; every native dropdown becomes a modal form that
carries its own heading, which also closes the unlabelled-select accessibility findings
because the heading is the label. One banner component replaces the hand-rolled copies,
and it announces to screen readers.

**Theme correctness is part of the definition of done.** Colour work is done as token
changes rather than per-site overrides, so that a single token edit propagates to every
consumer. Text tokens and surface tokens are treated separately where contrast requires
it: a surface colour that passes as a fill can still fail as text, and in that case the
text token keeps its own darker value.

**Ordering constraints that are real.** The name formatter comes first, because six
person components depend on it. Tap-target gaps are widened before targets are grown, or
an enlarged control silently steals the tap of the one below it mid-sweep. The knockout
gate work in the prior sprint precedes putting a completion ring beside that gate. The
scoring-rule change is sequenced last, away from the visual sweeps, because it touches
the points path. The copy sweep runs after the component groups, so that strings are not
rewritten inside components about to be replaced.

**One payout table.** The server records the points it actually paid onto the match when
it applies a result, and the group standings read those stored figures instead of
recomputing them. This deletes the browser-side award calculation entirely and ends the
divergence where the table added a bonus nobody had received. The fields are written into
a record already being saved in the same transaction, so there is no additional write.

## Testing Decisions

**What makes a good test here.** These tests assert what a member can observe — the text
on a card, whether a row separator is visible in light theme, whether a control is
reachable by keyboard — not which component rendered it. A test that asserts a particular
component was used will fail the next time the set is refactored, which is the opposite of
what this phase is for.

**The seams.** Three, and this is the part that most needs the owner's confirmation
before work starts:

1. **The static source sweep** (existing design-verification script). The type checker
   cannot see a class string, so a grep-based suite over source is the only automated
   check that can prove a retired pattern is gone. This is the primary seam for every
   "N → 0" count: sub-12px text, non-flipping row separators, surfaces with no
   light-theme fill, unselected states reading as selected, browser confirms, hand-rolled
   banners, and the removal of the browser-side award calculation. Extended as rows land.
2. **The existing unit suite**, for the pure functions this phase changes — the name
   formatter (including the placeholder guards), the first-initial helper, the streak
   derivation, and the group-standings read path once it reads stored points.
3. **The existing browser end-to-end suite**, for the interaction changes that only exist
   at runtime: that a destructive action opens an in-app modal rather than a browser
   dialog, that a choice opens a modal form, and that the affected flows still complete.

Prior art for all three already exists in the repository, so no new test infrastructure
is introduced by this phase.

**Two checks that stay manual, by design.** The design-sync visual diff must be clean in
both the light and dark cell for every component in the set; and the owner walks every
beta screen in both themes on a real phone. Neither is automatable today, and the second
is the phase's actual sign-off.

**Viewport.** Every row type is checked at 360px before it is considered done. A row that
only works on a desktop preview is not finished.

## Out of Scope

- Everything in Phases 2, 3 and 4 — the five non-negotiables, service booking, challenges
  and rallies, tasks and rewards, marketplace, partner pool, and the payment gateway.
- Privacy Policy and Terms of Service. Deferred by owner ruling; tracked in the backlog,
  along with the gaps found while scoping it, so the work does not have to be
  re-discovered. Two facts are still missing before it can be written: the accountable
  privacy contact and the legal entity name.
- The seed number itself. This phase reserves the slot; the computation is Sprint D8.
- Any cloud project. This phase is emulator-first; staging is separate infrastructure
  (M5) and can be stood up in parallel.
- Native app, season dashboard, location tags, transactional winter booking, production
  cutover.

## Further Notes

**Two things in the source material do not reconcile, and want an owner ruling before
the tickets are cut.** They are recorded here rather than resolved, because resolving
them is not this skill's job:

1. **The component count.** Sprint D7 states that thirteen components already exist and
   that it builds "the other thirteen", then refers to "all twenty-two". Thirteen plus
   thirteen is twenty-six. The board itself lists roughly eighteen components to build.
   The target number is genuinely unclear.
2. **The confirm() count.** The verification table records four browser confirms going to
   zero; the row that specifies the work states there are five, not four, and names all
   five. The acceptance criterion in the vision says zero, which is unambiguous — but the
   check that proves it is calibrated to the wrong starting number.

**Resolved since this spec was drafted.** A third contradiction was recorded here — that
the vision made UI/UX simplification Phase 1 while the sprints run D6 (corrections)
before D7 (the component set), with several D7 rows depending on D6 rows by name. The
owner swapped the phases on 2026-08-31: the five non-negotiables became M1 and UI/UX
simplification became M2, which is why this spec is now numbered M2. Ruling 14's warning
about building the withdrawal dialog twice no longer applies.

**Two counts in the source have already drifted once** — the banner component's consumer
count and the confirm count were both corrected in place during the sprint's own review.
Treat every "N → 0" figure as needing re-measurement at the commit the work starts from,
rather than trusted from the document.

**On the M2 acceptance criteria as written.** The vision's four criteria are testable as
stated, with one exception: "no one-off variants of buttons, inputs, rows, or modals
remain on those screens" has no automated check behind it today. The source sweep can
prove the absence of specific retired patterns, but not the general absence of variants.
Either the criterion needs a defined list of retired patterns to check, or it needs to be
explicitly an owner-walk judgement.
