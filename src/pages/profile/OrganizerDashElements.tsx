import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { Button } from '../../components/Button';
import { ReviewQueue } from '../../features/tasks/ReviewQueue';
import { CountBadge, Empty, Group, PlayerLink, RowError, focusRing, squareBtn } from './PlayerDashElements';
import {
  REMOVAL_REASONS, type CourtReportRow, type RecordedRow, type RemovalReason, type SignupRow, type EventStatRow,
  type useOrganizerDash,
} from './useOrganizerDash';
import type { UnplacedEntry } from '../tournament/types';
import type { DisputeRow } from '../../features/matches/scoring';
import { type FirestoreDateLike, toDate } from '../../utils/eventDates';

/**
 * Presentation for the Organizer Dash on /profile. Props in, callbacks out: every read and write is
 * in useOrganizerDash.ts.
 *
 * There is no Claude Design mockup for this dash, so it follows the Provider Dash's idiom exactly —
 * same card and row recipes, same `Group` headers, `Button size="sm"` row actions, nothing under
 * text-xs, theme tokens for every colour. Queues that need an organizer come first; the things that
 * are only there to be glanced at come last.
 */

export type OrganizerDashData = ReturnType<typeof useOrganizerDash>;

const CARD = 'rounded-2xl bg-fg/5 p-3';
const TITLE = 'min-w-0 truncate text-sm font-bold text-fg';
const META = 'mt-0.5 truncate text-xs text-fg/70';

/** Empty state inside a Group, matching the Provider Dash. */
const Nothing: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-2xl bg-fg/5 px-3 py-3"><Empty>{children}</Empty></div>
);

// ── Disputed results ──────────────────────────────────────────────────────────
// Deliberately NOT DisputedResultsPanel: that component is shaped for the older page idiom and
// ships its own heading, so inside a Group it would read as a double heading. Same data, same
// server call — only the markup differs.
const DisputeCard: React.FC<{ data: OrganizerDashData; row: DisputeRow }> = ({ data, row }) => {
  const busy = !!data.busyId;
  return (
    <div className={`rounded-2xl border border-clay/40 bg-clay/10 p-3`}>
      <p className={TITLE}>{row.players}</p>
      <p className={META}>Recorded: {row.standing}</p>
      <p className="truncate text-xs text-fg/70">{row.disputing}</p>
      <div className="mt-2.5 flex gap-1.5">
        <Button
          variant="clay" size="sm" className={focusRing}
          isLoading={data.busyId === row.id} disabled={busy}
          onClick={() => data.settle(row.id, true)}
        >
          Approve
        </Button>
        <Button variant="outline" size="sm" className={focusRing} disabled={busy} onClick={() => data.settle(row.id, false)}>
          Reject
        </Button>
      </div>
      <RowError show={data.rowError?.id === row.id} text={data.rowError?.text} />
    </div>
  );
};

// ── Unplaced players ──────────────────────────────────────────────────────────
// Seating needs the draw open, so this row links through rather than trying to rebuild the slot
// picker. Remove is a real withdrawal from the event, so it asks for a reason and says so.
const UnplacedCard: React.FC<{ data: OrganizerDashData; row: UnplacedEntry }> = ({ data, row }) => {
  const [asking, setAsking] = useState(false);
  const busy = !!data.busyId;
  const line = [row.eventTitle, row.tournamentChoice, row.division, row.zone || 'Unassigned']
    .filter(Boolean).join(' · ');
  return (
    <div className={CARD}>
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className={TITLE}><PlayerLink uid={row.uid} name={row.name} /></p>
          <p className={META}>{line}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            to={`/tournament?event=${row.eventId}`}
            className={`inline-flex h-8 items-center rounded-2xl border border-fg/20 px-3 text-xs font-bold text-fg ${focusRing}`}
          >
            Place
          </Link>
          {!asking && (
            <Button variant="ghost" size="sm" className={squareBtn} disabled={busy}
              onClick={() => setAsking(true)} title="Remove from the event"
              aria-label={`Remove ${row.name} from ${row.eventTitle}`}
            >
              &times;
            </Button>
          )}
        </div>
      </div>

      {asking && (
        <div className="mt-2.5 rounded-2xl bg-fg/5 p-2.5">
          <p className="text-xs text-fg">
            Take <span className="font-bold">{row.name}</span> off {row.eventTitle || 'this event'}? Why?
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REMOVAL_REASONS.map((reason: RemovalReason) => (
              <Button
                key={reason} variant="outline" size="sm" className={focusRing}
                isLoading={data.busyId === row.participantId} disabled={busy}
                onClick={() => data.removeUnplaced(row, reason)}
              >
                {reason}
              </Button>
            ))}
            <Button variant="ghost" size="sm" className={focusRing} disabled={busy} onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-fg/70">They come off the event and would have to be added back.</p>
        </div>
      )}
      <RowError show={data.rowError?.id === row.participantId} text={data.rowError?.text} />
    </div>
  );
};

// ── Court issue reports ───────────────────────────────────────────────────────
// Read-only: a report needs no approval, and there is nothing to tick off. `line-clamp-2` rather
// than truncate — a note is prose, and one line of it says nothing useful.
const CourtIssueCard: React.FC<{ row: CourtReportRow }> = ({ row }) => (
  <div className={CARD}>
    <p className={TITLE}>{row.court_name}</p>
    <p className="mt-0.5 text-xs text-fg/70 line-clamp-2">{row.note}</p>
    <p className="mt-1 truncate text-xs text-fg/70">
      {[row.uid === 'not_a_member' ? 'Anonymous' : row.user_name, agoLabel(row.created_at)].filter(Boolean).join(' · ')}
    </p>
  </div>
);

const agoLabel = (at?: FirestoreDateLike) => toDate(at)?.toLocaleDateString('en-CA', { day: 'numeric', month: 'short' }) ?? '';

// ── Recently recorded ─────────────────────────────────────────────────────────
// Undo is two taps, the way the Provider Dash's Decline is — never window.confirm.
const RecordedCard: React.FC<{ data: OrganizerDashData; row: RecordedRow }> = ({ data, row }) => {
  const [confirming, setConfirming] = useState(false);
  const busy = !!data.busyId;
  return (
    <div className={CARD}>
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className={TITLE}>{row.players}</p>
          <p className={META}>{row.result}</p>
          <p className="truncate text-xs text-fg/70">{[row.context, row.when].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {confirming ? (
            <Button
              variant="outline" size="sm" className={focusRing}
              isLoading={data.busyId === row.id} disabled={busy}
              onClick={() => data.undo(row.id)}
            >
              Undo score
            </Button>
          ) : (
            <Button
              variant="ghost" size="sm" className={squareBtn} disabled={busy}
              onClick={() => setConfirming(true)} title="Undo this score"
              aria-label={`Undo the score for ${row.players}`}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      {confirming && (
        <p className="mt-1.5 text-xs text-fg/70">The result and the points it paid are removed, and the match goes back to unplayed.</p>
      )}
      <RowError show={data.rowError?.id === row.id} text={data.rowError?.text} />
    </div>
  );
};

// ── New signups ───────────────────────────────────────────────────────────────
const SignupCard: React.FC<{ row: SignupRow }> = ({ row }) => (
  <div className={CARD}>
    <div className="flex items-center gap-2.5">
      <div className="min-w-0 flex-1">
        <p className={TITLE}><PlayerLink uid={row.uid} name={row.name} /></p>
        <p className={META}>{['joined ' + row.when, row.activity].filter(Boolean).join(' · ')}</p>
      </div>
      {row.idle && (
        <span className="shrink-0 rounded-full bg-badge/15 px-2 py-0.5 text-xs font-bold text-badge">Quiet</span>
      )}
    </div>
  </div>
);

// ── Your events ───────────────────────────────────────────────────────────────
const EventStatCard: React.FC<{ row: EventStatRow }> = ({ row }) => (
  <Link to={row.href} className={`block ${CARD} ${focusRing}`}>
    <div className="flex items-center gap-2.5">
      <div className="min-w-0 flex-1">
        <p className={TITLE}>{row.title}</p>
        <p className={META}>
          {[`${row.registered} registered`,
            `${row.played} played`,
            row.outstanding > 0 ? `${row.outstanding} to play` : '',
            row.finished ? 'final done' : ''].filter(Boolean).join(' · ')}
        </p>
      </div>
      {row.outstanding > 0 && <CountBadge n={row.outstanding} strong={false} />}
    </div>
  </Link>
);

// ── The dash ──────────────────────────────────────────────────────────────────
// One column of sections, in priority order. Both layouts render the same sections; the wide one
// splits them into a queue column and an awareness rail.
/**
 * One queue, the way the Player Dash has one. Disputes, claims and refunds, unplaced players and
 * court reports are all "something an organizer has to do", and splitting them into four headed
 * sections meant four empty boxes on a quiet day. Order is most-urgent first.
 */
const Queues: React.FC<{ data: OrganizerDashData }> = ({ data }) => (
  <Group title="Needs you" count={data.count} accent>
    {data.count === 0 ? (
      <Nothing>Nothing waiting on you.</Nothing>
    ) : (
      <>
        {data.disputes.map((r) => <DisputeCard key={r.id} data={data} row={r} />)}
        <ReviewQueue claims={data.claims} coupons={data.coupons} />
        {data.unplaced.map((r) => <UnplacedCard key={`${r.eventId}_${r.uid}`} data={data} row={r} />)}
        {data.courtIssues.map((r) => <CourtIssueCard key={r.id} row={r} />)}
      </>
    )}
  </Group>
);

/** Rows shown before "Show N more", the Services pattern. */
const RECORDED_SHOWN = 10;

const Recorded: React.FC<{ data: OrganizerDashData }> = ({ data }) => {
  const [all, setAll] = useState(false);
  const extra = data.recorded.length - RECORDED_SHOWN;
  return (
    <Group title="Recently recorded" count={0}>
      {data.recorded.length === 0
        ? <Nothing>Nothing recorded yet.</Nothing>
        : (all ? data.recorded : data.recorded.slice(0, RECORDED_SHOWN)).map((r) => <RecordedCard key={r.id} data={data} row={r} />)}
      {extra > 0 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="w-full min-h-11 rounded-2xl bg-fg/[0.03] text-xs font-bold text-clay hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
        >
          {all ? 'Show less' : `Show ${extra} more`}
        </button>
      )}
    </Group>
  );
};

const Awareness: React.FC<{ data: OrganizerDashData }> = ({ data }) => (
  <>
    <Group title="New signups" count={0}>
      {data.signups.length === 0
        ? <Nothing>Nobody new this week.</Nothing>
        : data.signups.map((r) => <SignupCard key={r.uid} row={r} />)}
    </Group>

    <Group title="Your events" count={0}>
      {data.eventStats.length === 0
        ? <Nothing>You aren&apos;t running a tournament right now.</Nothing>
        : data.eventStats.map((r) => <EventStatCard key={r.id} row={r} />)}
    </Group>
  </>
);

const PhoneDash: React.FC<{ data: OrganizerDashData }> = ({ data }) => (
  <div className="flex flex-col gap-4">
    <Queues data={data} />
    <Recorded data={data} />
    <Awareness data={data} />
  </div>
);

/**
 * Two columns: everything with a button on the left, everything read-only on the right.
 *
 * Recently recorded sits on the LEFT despite being awareness, because it carries Undo and because
 * it is the longest list — in the rail it left the working column empty for most of the page.
 * minmax(0, …) so a long event title can't widen its column past the page.
 */
const DeskDash: React.FC<{ data: OrganizerDashData }> = ({ data }) => (
  <div className="grid gap-5 items-start" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 340px)' }}>
    <div className="flex flex-col gap-4">
      <Queues data={data} />
      <Recorded data={data} />
    </div>
    <div className="flex flex-col gap-4"><Awareness data={data} /></div>
  </div>
);

export const OrganizerDash: React.FC<{ data: OrganizerDashData; wide: boolean }> = ({ data, wide }) => {
  if (data.loading) return <div className="h-40 animate-pulse rounded-3xl bg-fg/5" />;
  return wide ? <DeskDash data={data} /> : <PhoneDash data={data} />;
};
