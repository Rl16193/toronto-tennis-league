import React, { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '../../components/Button';
import { ContactOpponentButton, contactChannels } from '../../components/ContactOpponentButton';
import { BOOKING_WORDS, type Booking, type BookingStage } from '../../features/services/useServices';
import { Empty, Group, Kicker, PlayerLink, RowError, focusRing, squareBtn } from './PlayerDashElements';
import type { ProviderJob, useProviderDash } from './useProviderDash';

/**
 * Presentation for the Provider Dash on /profile. Props in, callbacks out: every read and write is
 * in useProviderDash.ts. The layout follows the Claude Design "Provider Dashboard" mockup — 1a below
 * `xl`, 1b from `xl` — with the site's sizes: row actions are `Button size="sm"` beside the name,
 * nothing under text-xs, theme tokens for every colour. Unlike the mockup there are no category
 * chips (a provider has one role) and no Edit offers (that stays with the admin).
 */

export type ProviderDashData = ReturnType<typeof useProviderDash>;
type Identity = NonNullable<ProviderDashData['identity']>;

const money = (n: number | null | undefined) =>
  typeof n === 'number' ? `$${n % 1 === 0 ? n : n.toFixed(2)}` : '—';

/** "today" or "Sep 12". */
const dayLabel = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toDateString() === new Date().toDateString()
    ? 'today'
    : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
};

const initials = (name: string) =>
  name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

const STAGE: Record<BookingStage, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-clay text-white' },
  in_progress: { label: 'In progress', cls: 'bg-badge/15 text-badge' },
  confirming: { label: 'Confirming', cls: 'bg-fg/10 text-fg' },
  completed: { label: 'Done', cls: 'bg-badge-win/15 text-badge-win' },
  cancelled: { label: 'Cancelled', cls: 'bg-badge-loss/15 text-badge-loss' },
};

const StageBadge: React.FC<{ stage: BookingStage; extra?: string }> = ({ stage, extra }) => (
  <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${STAGE[stage].cls}`}>
    {STAGE[stage].label}{extra ? ` · ${extra}` : ''}
  </span>
);

/** "Premium Strings · $45 · 15 pts" */
const serviceLine = (b: Booking) =>
  [b.offer, money(b.price), b.points ? `${b.points} pts` : ''].filter(Boolean).join(' · ');

/** Who called it off, and where a redeemed booking's points stand. */
const cancelNote = (b: Booking) => {
  // A group lesson booking keeps its lesson_group, so a provider cancel there is a cancelled class.
  const who = b.cancelled_by !== 'provider' ? 'Member cancelled' : b.lesson_group ? 'Class cancelled' : 'Declined';
  if (!b.points) return who;
  const refund = b.refund === 'approved' ? `${b.points} pts refunded`
    : b.refund === 'declined' ? 'points kept' : 'refund under review';
  return `${who} · ${refund}`;
};

/** When the job reached the step it's on. */
const stepLine = (j: ProviderJob) => {
  const b = j.booking;
  if (j.stage === 'new') return `Requested ${dayLabel(b.created_at)}`;
  if (j.stage === 'in_progress') return `${BOOKING_WORDS[b.category].started} ${dayLabel(b.started_at)}`;
  if (j.stage === 'confirming') return `${b.category === 'coaching' ? 'Marked done' : 'Marked ready'} ${dayLabel(b.completion_requested_at)} · waiting on the member`;
  if (j.stage === 'completed') return `Done ${dayLabel(b.completed_at)}`;
  return cancelNote(b);
};

const hasChannels = (j: ProviderJob) => !!j.contact && contactChannels({
  phone: j.contact.phone,
  email: j.contact.email,
  whatsappContact: j.contact.whatsapp_contact,
  preferred: j.contact.preferred_mode_of_contact,
}).length > 0;

const JobContacts: React.FC<{ job: ProviderJob }> = ({ job }) =>
  job.contact && hasChannels(job) ? (
    <ContactOpponentButton
      name={job.member.name}
      phone={job.contact.phone}
      email={job.contact.email}
      whatsappContact={job.contact.whatsapp_contact}
      preferred={job.contact.preferred_mode_of_contact}
      size="sm"
      className="shrink-0 !flex-nowrap"
    />
  ) : null;

/** A second tap confirms: an X first, then the labelled button. */
const TwoTap: React.FC<{
  label: string; aria: string; disabled: boolean; loading?: boolean; onConfirm: () => void; onArm?: () => void;
}> = ({ label, aria, disabled, loading, onConfirm, onArm }) => {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <Button variant="outline" size="sm" className={`whitespace-nowrap ${focusRing}`} isLoading={loading} disabled={disabled} onClick={onConfirm}>
      {label}
    </Button>
  ) : (
    <Button variant="ghost" size="sm" className={squareBtn} disabled={disabled} onClick={() => { setArmed(true); onArm?.(); }} title={label} aria-label={aria}>
      <X className="w-4 h-4" />
    </Button>
  );
};

/** The job's next step. Decline takes a second tap. */
const JobActions: React.FC<{ data: ProviderDashData; job: ProviderJob }> = ({ data, job }) => {
  const b = job.booking;
  const words = BOOKING_WORDS[b.category];
  const busy = !!data.busyId;
  const loading = data.busyId === b.id;

  if (job.stage === 'new') {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        {!b.group_lesson && (
          <Button variant="clay" size="sm" className={focusRing} isLoading={loading} disabled={busy} onClick={() => data.start(b.id)}>
            {words.start}
          </Button>
        )}
        <TwoTap label="Decline" aria={`Decline ${job.member.name}'s booking`} disabled={busy} onConfirm={() => data.decline(b.id)} />
      </div>
    );
  }
  if (job.stage === 'in_progress') {
    return (
      <Button variant="white" size="sm" className={`shrink-0 ${focusRing}`} isLoading={loading} disabled={busy} onClick={() => data.finish(b.id)}>
        {words.finish}
      </Button>
    );
  }
  // Waiting on the member has no button: they were alerted when it was marked, and the provider
  // can contact them directly.
  return null;
};

const ActiveChip: React.FC<{ active: boolean }> = ({ active }) => (
  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${active ? 'bg-badge-win/15 text-badge-win' : 'bg-fg/10 text-fg/70'}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-badge-win' : 'bg-fg/70'}`} />
    {active ? 'Active' : 'No offers'}
  </span>
);

const identityLine = (id: Identity, wide: boolean) =>
  [
    id.category === 'coaching' ? 'Coaching' : 'Stringing',
    id.area,
    id.manager && (wide ? `managed by ${id.manager}` : id.manager),
    wide ? id.phone : '',
  ].filter(Boolean).join(' · ');

const TONE = {
  plain: 'bg-fg/5 text-fg',
  clay: 'bg-clay/10 text-clay',
  amber: 'bg-badge/10 text-badge',
  win: 'bg-badge-win/10 text-badge-win',
};

const Tile: React.FC<{ label: string; value: number; tone?: keyof typeof TONE; wide?: boolean }> = ({ label, value, tone = 'plain', wide }) => (
  <div className={`rounded-2xl ${wide ? 'px-4 py-3.5' : 'px-2 py-2.5 text-center'} ${TONE[tone]}`}>
    {wide && <p className="text-xs font-bold uppercase tracking-widest text-fg/70">{label}</p>}
    <p className={`font-black leading-none tracking-tight ${wide ? 'mt-1.5 text-3xl' : 'text-2xl'}`}>{value}</p>
    {!wide && <p className="mt-1 text-xs font-bold uppercase tracking-wide text-fg/70">{label}</p>}
  </div>
);

const Earnings: React.FC<{ data: ProviderDashData; wide?: boolean }> = ({ data, wide }) => {
  const s = data.stats;
  const settled = data.identity?.category === 'coaching' ? 'at the lesson' : 'at drop-off';
  return (
    <section className="rounded-3xl bg-fg/5 p-4">
      <div className={wide ? 'flex flex-col gap-3' : 'flex items-start justify-between gap-3'}>
        <div>
          <Kicker>Earned · {s.completed} completed</Kicker>
          <p className="mt-1 text-2xl font-black tracking-tight text-fg">{money(s.earned)}</p>
        </div>
        <div className={wide ? '' : 'text-right'}>
          <Kicker>Points burned</Kicker>
          <p className="mt-1 text-2xl font-black tracking-tight text-badge">{s.pointsBurned}</p>
        </div>
      </div>
      {wide && (
        <p className="mt-3 text-xs text-fg/70">
          Coupon value is settled with the player {settled}. The league only tracks the points.
        </p>
      )}
    </section>
  );
};

// ── 1a: phones ────────────────────────────────────────────────────────────────
const JobCard: React.FC<{ data: ProviderDashData; job: ProviderJob }> = ({ data, job }) => {
  const frame = job.stage === 'new' ? 'border border-clay/40 bg-clay/10'
    : job.stage === 'confirming' ? 'border border-dashed border-fg/20' : 'bg-fg/5';
  return (
    <div className={`rounded-2xl p-3 ${frame}`}>
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate text-sm font-bold text-fg"><PlayerLink uid={job.member.uid} name={job.member.name} /></p>
            <StageBadge stage={job.stage} />
          </div>
          <p className="mt-0.5 break-words text-xs text-fg/70">{serviceLine(job.booking)}</p>
          <p className="truncate text-xs text-fg/70">{stepLine(job)}</p>
        </div>
        <JobActions data={data} job={job} />
      </div>
      {hasChannels(job) && <div className="mt-2"><JobContacts job={job} /></div>}
      <RowError show={data.rowError?.id === job.booking.id} text={data.rowError?.text} />
    </div>
  );
};

const ClosedRow: React.FC<{ job: ProviderJob }> = ({ job }) => {
  const b = job.booking;
  const done = job.stage === 'completed';
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg"><PlayerLink uid={job.member.uid} name={job.member.name} /></p>
        <p className="break-words text-xs text-fg/70">
          {[b.offer, dayLabel(done ? b.completed_at : b.cancelled_at), done ? '' : cancelNote(b)].filter(Boolean).join(' · ')}
        </p>
      </div>
      <StageBadge stage={job.stage} extra={done ? money(b.price) : undefined} />
    </div>
  );
};

// ── Group lessons (both layouts) ─────────────────────────────────────────────
// One block for the players waiting to be grouped, then one per group. On desktop each block's
// header is a row of the leads table; on phones it is a card. Writes are lessonGroup (bookings.js).
type Lesson = ProviderDashData['lessons'][number];

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

const Tick: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
  <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className={`h-4 w-4 shrink-0 accent-clay ${focusRing}`} />
);

const MemberLine: React.FC<{ job: ProviderJob; wide: boolean; lead?: React.ReactNode; note?: string; action?: React.ReactNode }> = ({
  job, wide, lead, note, action,
}) => (
  <div className={`flex flex-wrap items-center gap-2.5 py-2 ${wide ? 'pl-10 pr-5' : 'px-1'}`}>
    {lead}
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-fg"><PlayerLink uid={job.member.uid} name={job.member.name} /></p>
      {note && <p className="text-xs text-fg/70">{note}</p>}
    </div>
    <JobContacts job={job} />
    {action}
  </div>
);

const LessonBlock: React.FC<{
  wide: boolean; label: string; lesson: Lesson; since?: string; stage: BookingStage; errorKey: string;
  data: ProviderDashData; actions: React.ReactNode; children: React.ReactNode;
}> = ({ wide, label, lesson, since, stage, errorKey, data, actions, children }) => {
  const [open, setOpen] = useState(false);
  const toggle = (
    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
      className={`flex min-w-0 items-center gap-1.5 rounded-lg text-left text-sm font-bold text-fg ${focusRing}`}>
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      {/* Wraps rather than truncates: the table's Player column is narrow. */}
      <span className="min-w-0 break-words">{label}</span>
    </button>
  );
  const error = <RowError show={data.rowError?.id === errorKey} text={data.rowError?.text} />;
  return wide ? (
    <div className="border-t border-fg/10">
      <div className={`${TABLE_COLS} py-3`}>
        {toggle}
        <span className="min-w-0 break-words text-xs text-fg">{lesson.offer}</span>
        <span className="text-xs text-fg/70 first-letter:uppercase">{dayLabel(since)}</span>
        <span className="text-sm font-bold text-fg">{money(lesson.price)}</span>
        <span><StageBadge stage={stage} /></span>
        <div className="flex min-w-0 items-center justify-end gap-1.5">{actions}</div>
      </div>
      {open && <div className="pb-2">{children}</div>}
      <div className="px-5">{error}</div>
    </div>
  ) : (
    <div className="rounded-2xl bg-fg/5 p-3">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">{toggle}<StageBadge stage={stage} /></div>
          <p className="mt-0.5 break-words text-xs text-fg/70">{[lesson.offer, money(lesson.price), since && `since ${dayLabel(since)}`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      </div>
      {open && <div className="mt-2 divide-y divide-fg/10">{children}</div>}
      {error}
    </div>
  );
};

/** "4 selected · fits up to 4": capacity is a guide to group size, never a limit. */
const fitsHint = (count: string, capacity: number) =>
  [count, capacity > 1 ? `fits up to ${capacity}` : ''].filter(Boolean).join(' · ');

const pickToggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

const WaitingBlock: React.FC<{ data: ProviderDashData; lesson: Lesson; wide: boolean }> = ({ data, lesson, wide }) => {
  const [picked, setPicked] = useState<string[]>([]);
  const key = `${lesson.serviceId}:0`;
  const busy = !!data.busyId;
  const latest = lesson.waiting.map((j) => j.booking.created_at).sort().pop();
  const create = (
    <Button variant="clay" size="sm" className={focusRing} isLoading={data.busyId === key} disabled={busy || picked.length === 0}
      onClick={() => data.lessonGroup(lesson.serviceId, 'create', 0, picked).then(() => setPicked([]))}>
      Create group
    </Button>
  );
  return (
    <LessonBlock wide={wide} label={`${plural(lesson.waiting.length, 'Player')} Joined`} lesson={lesson} since={latest}
      stage="new" errorKey={key} data={data} actions={create}>
      {lesson.waiting.map((j) => (
        <MemberLine key={j.booking.id} job={j} wide={wide}
          lead={<Tick checked={picked.includes(j.booking.id)} onChange={() => setPicked((p) => pickToggle(p, j.booking.id))} label={`Select ${j.member.name}`} />}
          action={<TwoTap label="Decline" aria={`Decline ${j.member.name}'s booking`} disabled={busy} onConfirm={() => data.decline(j.booking.id)} />} />
      ))}
      <p className={`py-2 text-xs text-fg/70 ${wide ? 'pl-10 pr-5' : 'px-1'}`}>{fitsHint(`${picked.length} selected`, lesson.capacity)}</p>
    </LessonBlock>
  );
};

const GroupBlock: React.FC<{ data: ProviderDashData; lesson: Lesson; group: Lesson['groups'][number]; wide: boolean }> = ({
  data, lesson, group, wide,
}) => {
  const [adding, setAdding] = useState<string[]>([]);
  // Same as a booking row: one button and the X. Arming the X swaps Mark done for Cancel class.
  const [cancelling, setCancelling] = useState(false);
  const key = `${lesson.serviceId}:${group.n}`;
  const busy = !!data.busyId;
  const run = (action: 'add' | 'remove' | 'done' | 'cancel', ids?: string[]) => data.lessonGroup(lesson.serviceId, action, group.n, ids);
  const pending = group.members.filter((j) => j.stage === 'in_progress');
  const since = group.members.map((j) => j.booking.started_at || '').filter(Boolean).sort()[0];
  const actions = (
    <>
      {pending.length > 0 && !cancelling && (
        <Button variant="white" size="sm" className={`whitespace-nowrap ${focusRing}`} isLoading={data.busyId === key} disabled={busy} onClick={() => run('done')}>
          Mark done
        </Button>
      )}
      <TwoTap label="Cancel class" aria={`Cancel Group ${group.n}`} disabled={busy} onConfirm={() => run('cancel')} onArm={() => setCancelling(true)} />
    </>
  );
  return (
    <LessonBlock wide={wide} label={`Group ${group.n} · ${plural(group.members.length, 'player')}`} lesson={lesson} since={since}
      stage={pending.length > 0 ? 'in_progress' : 'confirming'} errorKey={key} data={data} actions={actions}>
      {group.members.map((j) => (
        <MemberLine key={j.booking.id} job={j} wide={wide}
          note={j.stage === 'confirming' ? 'Asked if the lesson happened' : undefined}
          action={j.stage === 'in_progress' && (
            <TwoTap label="Remove" aria={`Remove ${j.member.name} from Group ${group.n}`} disabled={busy} onConfirm={() => run('remove', [j.booking.id])} />
          )} />
      ))}
      {/* Only before Mark done: once the lesson is marked done, the group is closing. */}
      {lesson.waiting.length > 0 && pending.length > 0 && (
        <div className={`py-2 ${wide ? 'pl-10 pr-5' : 'px-1'}`}>
          <p className="text-xs font-bold uppercase tracking-widest text-fg/70">Add players</p>
          {lesson.waiting.map((j) => (
            <label key={j.booking.id} className="mt-2 flex cursor-pointer items-center gap-2.5 text-sm text-fg">
              <Tick checked={adding.includes(j.booking.id)} onChange={() => setAdding((p) => pickToggle(p, j.booking.id))} label={`Add ${j.member.name}`} />
              {j.member.name}
            </label>
          ))}
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <Button variant="clay" size="sm" className={focusRing} disabled={busy || adding.length === 0}
              onClick={() => run('add', adding).then(() => setAdding([]))}>
              Add to Group {group.n}
            </Button>
            <span className="text-xs text-fg/70">{fitsHint(`${group.members.length + adding.length} in the group`, lesson.capacity)}</span>
          </div>
        </div>
      )}
    </LessonBlock>
  );
};

const LessonRows: React.FC<{ data: ProviderDashData; wide: boolean }> = ({ data, wide }) => (
  <>
    {data.lessons.map((l) => (
      <React.Fragment key={l.serviceId}>
        {l.waiting.length > 0 && <WaitingBlock data={data} lesson={l} wide={wide} />}
        {l.groups.map((g) => <GroupBlock key={g.n} data={data} lesson={l} group={g} wide={wide} />)}
      </React.Fragment>
    ))}
  </>
);

const CLOSED_SHOWN = 3;

const PhoneDash: React.FC<{ data: ProviderDashData }> = ({ data }) => {
  const [showAll, setShowAll] = useState(false);
  const s = data.stats;
  const id = data.identity;
  const closed = showAll ? data.closed : data.closed.slice(0, CLOSED_SHOWN);
  return (
    <div className="flex flex-col gap-4">
      {id && (
        <div className="flex items-center gap-3 px-1">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-clay/40 bg-clay/15 text-sm font-black text-clay">
            {initials(id.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black tracking-tight text-fg">{id.name}</p>
            <p className="truncate text-xs font-semibold text-fg/70">{identityLine(id, false)}</p>
          </div>
          <ActiveChip active={id.active} />
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <Tile label="Players" value={s.players} />
        <Tile label="Booked" value={s.total} />
        <Tile label="Open" value={s.open} tone="amber" />
        <Tile label="Done" value={s.completed} tone="win" />
      </div>

      <Group title="Leads" count={data.count} accent>
        {data.needsYou.length === 0 && data.lessons.length === 0
          ? <div className="rounded-2xl bg-fg/5 px-3 py-3"><Empty>Nothing waiting on you.</Empty></div>
          : (
            <>
              <LessonRows data={data} wide={false} />
              {data.needsYou.map((j) => <JobCard key={j.booking.id} data={data} job={j} />)}
            </>
          )}
      </Group>

      {data.waiting.length > 0 && (
        <Group title="Waiting on player" count={data.waiting.length}>
          {data.waiting.map((j) => <JobCard key={j.booking.id} data={data} job={j} />)}
        </Group>
      )}

      {data.closed.length > 0 && (
        <Group title="Closed" count={data.closed.length}>
          <div className="divide-y divide-fg/10 rounded-2xl bg-fg/5">
            {closed.map((j) => <ClosedRow key={j.booking.id} job={j} />)}
            {data.closed.length > CLOSED_SHOWN && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className={`w-full rounded-b-2xl px-3 py-2.5 text-center text-xs font-bold text-clay hover:underline ${focusRing}`}
              >
                {showAll ? 'Show fewer' : `Show all ${data.closed.length} closed`}
              </button>
            )}
          </div>
        </Group>
      )}

      <Earnings data={data} />
    </div>
  );
};

// ── 1b: desktop ───────────────────────────────────────────────────────────────
// minmax(0, …) keeps a long name or offer from widening the table past the rail.
const TABLE_COLS = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_72px_64px_128px_196px] items-center gap-2.5 px-5';
const DESK_CLOSED_SHOWN = 5;

const TableRow: React.FC<{ data: ProviderDashData; job: ProviderJob }> = ({ data, job }) => {
  const b = job.booking;
  const closed = job.stage === 'completed' || job.stage === 'cancelled';
  return (
    <div className={`border-t border-fg/10 ${job.stage === 'new' ? 'bg-clay/5' : ''}`}>
      <div className={`${TABLE_COLS} py-3`}>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-fg"><PlayerLink uid={job.member.uid} name={job.member.name} /></p>
          {!closed && hasChannels(job) && <div className="mt-1.5"><JobContacts job={job} /></div>}
        </div>
        <span className="min-w-0 break-words text-xs text-fg">{b.offer}</span>
        <span className="text-xs text-fg/70 first-letter:uppercase">{dayLabel(b.created_at)}</span>
        <span className={`text-sm font-bold ${job.stage === 'cancelled' ? 'text-fg/70 line-through' : 'text-fg'}`}>{money(b.price)}</span>
        <span><StageBadge stage={job.stage} /></span>
        <div className="flex min-w-0 justify-end">
          {closed
            ? <span className="truncate text-right text-xs text-fg/70">{job.stage === 'cancelled' ? cancelNote(b) : ''}</span>
            : <JobActions data={data} job={job} />}
        </div>
      </div>
      {data.rowError?.id === b.id && (
        <div className="px-5 pb-3"><RowError show text={data.rowError.text} /></div>
      )}
    </div>
  );
};

const ServiceRail: React.FC<{ data: ProviderDashData }> = ({ data }) => {
  const total = Math.max(1, data.stats.total);
  const fills = ['bg-clay', 'bg-clay/60', 'bg-badge'];
  return (
    <section className="rounded-3xl bg-fg/5 p-4">
      <Kicker>Bookings by service</Kicker>
      {data.services.length === 0 ? (
        <div className="mt-3"><Empty>No offers listed.</Empty></div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {data.services.map((sv, i) => (
            <div key={sv.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2.5">
                <span className="min-w-0 break-words text-sm font-bold text-fg">{sv.offer}</span>
                <span className="shrink-0 text-sm font-black text-fg">{sv.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-fg/10">
                <span
                  className={`block h-full rounded-full ${fills[i % fills.length]}`}
                  style={{ width: `${Math.round((sv.count / total) * 100)}%` }}
                />
              </div>
              <p className="mt-1 truncate text-xs text-fg/70">
                {[money(sv.price), `${sv.points} pts`, sv.brands].filter(Boolean).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const DeskDash: React.FC<{ data: ProviderDashData }> = ({ data }) => {
  const [showAll, setShowAll] = useState(false);
  const s = data.stats;
  const id = data.identity;
  const closed = showAll ? data.closed : data.closed.slice(0, DESK_CLOSED_SHOWN);
  return (
    <div className="space-y-5">
      {id && (
        <div className="flex items-end justify-between gap-5 px-1">
          <div className="min-w-0">
            <p className="truncate text-2xl font-black tracking-tight text-fg">{id.name}</p>
            <p className="mt-1 text-xs font-semibold text-fg/70">{identityLine(id, true)}</p>
          </div>
          <ActiveChip active={id.active} />
        </div>
      )}

      <div className="grid grid-cols-5 gap-3">
        <Tile wide label="Players served" value={s.players} />
        <Tile wide label="Total bookings" value={s.total} />
        <Tile wide label="New requests" value={s.fresh} tone="clay" />
        <Tile wide label="In progress" value={s.inProgress} tone="amber" />
        <Tile wide label="Completed" value={s.completed} tone="win" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_280px] items-start gap-5">
        <section className="overflow-hidden rounded-3xl bg-fg/5">
          <div className={`${TABLE_COLS} py-3 text-xs font-bold uppercase tracking-widest text-fg/70`}>
            <span>Player</span><span>Service</span><span>Booked</span><span>Price</span><span>Status</span><span />
          </div>
          {s.total === 0 && (
            <div className="border-t border-fg/10 px-5 py-4"><Empty>No bookings yet. Members book from Services.</Empty></div>
          )}
          <LessonRows data={data} wide />
          {[...data.needsYou, ...data.waiting, ...closed].map((j) => (
            <TableRow key={j.booking.id} data={data} job={j} />
          ))}
          {data.closed.length > DESK_CLOSED_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className={`w-full border-t border-fg/10 px-5 py-3 text-left text-xs font-bold text-clay hover:underline ${focusRing}`}
            >
              {showAll ? 'Show fewer' : `Show all ${s.total} bookings`}
            </button>
          )}
        </section>
        <div className="flex flex-col gap-4">
          <ServiceRail data={data} />
          <Earnings data={data} wide />
        </div>
      </div>
    </div>
  );
};

export const ProviderDash: React.FC<{ data: ProviderDashData; wide: boolean }> = ({ data, wide }) => {
  if (data.loading) return <div className="h-40 animate-pulse rounded-3xl bg-fg/5" />;
  return wide ? <DeskDash data={data} /> : <PhoneDash data={data} />;
};
