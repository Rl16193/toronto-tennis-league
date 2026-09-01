# Sprint D9 — donations and the payment gateway

> **The first money the app ever handles.**
> Everything here serves [phase M4](../VISION.md) and nothing else. No court-booking payments:
> those are a winter question, and the answer is not settled.

|                 |                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase**       | [M4 — payment gateway](../VISION.md)                                                                                                  |
| **Environment** | **emulator-first**, then Stripe **test mode**. No live key is used before [M6](../VISION.md); the live-money proof happens on staging |
| **Rulings**     | [VISION §4, §7](../VISION.md) — donations from beta, Contributor Badge, refunds tested                                                |
| **Prior**       | [D6](SPRINT-D6.md) · [D7](SPRINT-D7.md) · [D8](SPRINT-D8.md)                                                                          |
| **Blocking**    | Nothing in D9 blocks D6–D8, and none of them block D9. It can run in parallel once someone owns it                                    |

---

## Board

| Lane                     | Tasks | Theme                                            |
| ------------------------ | ----: | ------------------------------------------------ |
| **A1 Rules + Functions** |     4 | P1 server, P2 webhook, P4 refund, P5 rules       |
| **A2 Data**              |     1 | P1 collection shape                              |
| **A3 Client / Dev**      |     2 | P3 button, P6 badge                              |
| **A4 UI/UX**             |     2 | P3 donate surface, P6 badge on the profile card  |
| **A5 Verify**            |     3 | A donation, a refund, and the no-card-data check |

| #      | Item                        | Lane    | Why                                                                     |
| ------ | --------------------------- | ------- | ----------------------------------------------------------------------- |
| **P1** | The payments collection     | A1 + A2 | Nothing can be recorded until the shape exists                          |
| **P2** | Stripe checkout and webhook | A1      | The gateway itself; the webhook is what makes a payment real            |
| **P3** | "Support the league" button | A3 + A4 | The member-facing surface                                               |
| **P4** | Refunds                     | A1      | A donation that cannot be refunded is not a finished payment system     |
| **P5** | Payment security rules      | A1      | Payment records are server-authoritative; a client must never write one |
| **P6** | Contributor Badge           | A3 + A4 | The only acknowledgement a donor gets                                   |

---

## What this sprint is not

**No membership fee, ever.** The app is free for members ([VISION §7](../VISION.md)).

**No court-booking payments.** Winter courts are informational for this season — members book
with the venue. In-app booking and payment happens only if a partner's terms or API justify it,
and that is a later decision.

**No card data anywhere.** Stripe-hosted surfaces only. The app and the database never see a
card number, and keys live as server secrets — never in a `VITE_` variable.

---

## ⬛ P1 — The payments collection · A1 + A2

A new collection recording **payments and donors** ([VISION §4](../VISION.md)). It is the
source of truth for both the Contributor Badge and any refund.

Every record is written **server-side only**, carries the member, the amount, the currency, the
season, the Stripe identifiers needed to refund it, and its state.

**The seasons are fixed:** summer runs **May to November**, winter runs **December to April**.
Each runs its own campaign, and every payment records which one it belongs to.

**Done when** · a record is created only by a function · its shape covers a donation and its
refund · a client write is denied.

## ⬛ P2 — Stripe checkout and webhook · A1

Checkout through Stripe's hosted surface, supporting **cards, Google Pay, and Apple Pay**
([VISION §4](../VISION.md)).

The **webhook is what makes a payment real** — never the browser returning from checkout. A
member who closes the tab after paying must still get their record and their badge.

**Done when** · a test-mode donation completes and writes its record from the webhook · a
closed tab does not lose the payment · a replayed webhook does not double-record · the
signature is verified and an unsigned call is rejected.

## ⬛ P3 — "Support the league" button · A3 + A4

A **Support the league** button on the **profile card** opens it. It says where the money goes: **to help us organize more events, provide new
tennis balls for matches, get better prizes for winners, and an end of season awards ceremony.**
It names the current season and hands off to Stripe. It uses the shared element set from
[D7](SPRINT-D7.md), no bespoke controls.

**Done when** · the button reaches checkout · the page states the campaign · it renders in
both themes and on a phone.

## ⬛ P4 — Cancellations · A1

**A member requests, an organizer approves** (owner ruling 2026-08-31). From their payments list a
member requests cancellation of their own donation, within **90 days** of paying. The organizer
sees the request in a queue and approves or declines it. **Approval is what executes the Stripe
refund.** The queue reuses the shared review panel from [D7](SPRINT-D7.md) rather than inventing
another chrome.

A court booking payment has no cancellation path here. Booking gets its own tab, **Book My
Court**, built later.

**A cancelled donation is a refunded donation** (owner ruling 2026-08-31), and it drops out of the
badge calculation. A member keeps the badge while any donation of theirs is still unrefunded.

**Done when** · a test-mode refund processes · the record shows it · refunding a member only
donation removes their badge · a member with three donations who has one refunded keeps it.

## ⬛ P5 — Payment security rules · A1

`firestore.rules` has no payments block. Without one the collection falls through to deny,
which is safe but unverifiable, the same trap [C12](SPRINT-D6.md) fixed for `services`.

**A Payments entry joins the sidebar** (`src/components/HeaderMenu.tsx`, beside Notifications and
Leaderboard). It is the member own record of what they have paid: one list, one row per payment,
carrying amount, date, season, **type** and state. A donation inside 90 days offers **Request
cancellation**. A court booking row never does.

**Done when** · a member reads their own payment records and no one else records · every client
write is denied · the sidebar entry lists that member payments · rules tests cover both denials.

## ⬛ P6 — Contributor Badge · A3 + A4

A badge on the donor's profile, derived from the payments collection — never a separately
stored flag that can drift from the money.

**Done when** · the badge appears from a payment record · it disappears if that record is
refunded, per P4's ruling · it rides the shared profile card from [D7](SPRINT-D7.md).

---

## Exit gate

| Check          | Passes when                                                                             |
| -------------- | --------------------------------------------------------------------------------------- |
| CI             | `npm run verify` green                                                                  |
| P1 + P5        | Payment records are server-written only; a member reads their own and no other's        |
| P2             | A test-mode donation completes via webhook; replay does not double-record               |
| P4             | A test-mode refund processes and is reflected in the record                             |
| P6             | The badge derives from a payment record, in both themes                                 |
| **No leaks**   | No card data touches the app or database; no Stripe key appears in any `VITE_` variable |
| **Live money** | Deferred to [M6](../VISION.md) on staging — a real donation and a real refund           |
