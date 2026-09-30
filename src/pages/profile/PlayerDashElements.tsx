import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { ArrowDown, ArrowUp, Calendar, ChevronDown, HistoryIcon, Pencil, Sparkles, Trophy, X } from 'lucide-react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { ContactOpponentButton, contactChannels } from '../../components/ContactOpponentButton';
import { RankMove, SourceLetter } from '../../components/PlayerCard';
import { RacquetIcon } from '../../components/RacquetIcon';
import { AvailabilityModal } from '../../features/profile/components/AvailabilityModal';
import { CourtsEditor } from '../../features/profile/components/CourtsEditor';
import { ZonePickerSheet } from '../../features/profile/components/ProfileInfo';
import { LeagueEditor, SkillEditor } from '../../features/profile/components/SkillLeagueEditor';
import type { useProfileActions } from '../../features/profile/hooks/useProfileActions';
import type { UserProfile } from '../../types';
import { leagueAgeCategory, leagueDivision } from '../../utils/skillLevels';
import type {
  BookingAskRow, DashEventRow, HeadToHeadRow, NeedsYouRow, PastMatchRow, ScheduleAskRow, TaskGroupRow, ToPlayRow,
  usePlayerDash,
} from './usePlayerDash';

/**
 * Presentation for the Player Dash on /profile. Props in, callbacks out: every read and write is in
 * usePlayerDash.ts. The layout follows the Claude Design "Player Overview" mockup — 1a below `xl`,
 * 1c from `xl` — while controls and type keep the site's sizes: `Button size="sm"` (the size of
 * Court and Report), nothing under text-xs, and theme tokens for every colour.
 */

export type PlayerDashData = ReturnType<typeof usePlayerDash>;
type ProfileActions = ReturnType<typeof useProfileActions>['actions'];
type Source = 'tournament' | 'challenge' | 'rally';

// `xl`, not `lg`: 1c was drawn at 1180px, and at 1024px its three columns cut names short.
const WIDE_QUERY = '(min-width: 1280px)';

/** True from `xl` up, where the dash uses the three-column layout. Watched, so a resize flips it. */
export const useWideLayout = () => {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
};

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay';
/** Icon-only square beside a `size="sm"` button, at the same 32px height. */
export const squareBtn = `w-8 h-8 !px-0 !py-0 shrink-0 border border-fg/20 text-fg/70 ${focusRing}`;
/** Task groups shown, closest to done first (usePlayerDash sorts them). */
const TASK_GROUPS_SHOWN = 2;

const sourceOf = (kind: ToPlayRow['kind']): Source => kind;
const ago = (age: string) => (!age ? '' : age === 'now' ? 'just now' : `${age} ago`);
const requestMeta = (r: NeedsYouRow) => [r.line, ago(r.age)].filter(Boolean).join(' · ');
const streakTone = (streak: string | null) =>
  streak?.endsWith('W') ? 'text-badge-win' : streak ? 'text-badge-loss' : 'text-fg';
const hasContact = (r: ToPlayRow) => !!r.contact && contactChannels({
  phone: r.contact.phone,
  email: r.contact.email,
  whatsappContact: r.contact.whatsapp_contact,
  preferred: r.contact.preferred_mode_of_contact,
}).length > 0;

export const CountBadge: React.FC<{ n: number; strong?: boolean }> = ({ n, strong = true }) => (
  <span
    className={`min-w-5 h-5 px-1.5 rounded-full text-xs font-black flex items-center justify-center ${strong ? 'bg-clay text-white' : 'bg-fg/10 text-fg'}`}
  >
    {n > 9 ? '9+' : n}
  </span>
);

// ── The switch ────────────────────────────────────────────────────────────────
// Styled like the Email Notifications row on the profile card. The count is what the dash has
// waiting. Profile shows one for the Player Dash and, for providers, one for the Provider Dash.
export const PlayerDashSwitch: React.FC<{
  on: boolean;
  count: number;
  onChange: (on: boolean) => void;
  label?: string;
  hint?: string;
}> = ({ on, count, onChange, label = 'Player Dash', hint = 'Your season in one place.' }) => (
  // `h-full` so side-by-side switches share a height, and the hint truncates rather than wrapping:
  // a hint that wrapped on one card and not the other made the row change height as you toggled.
  <div className="h-full rounded-3xl bg-fg/5 px-5 py-3 flex items-center justify-between gap-3">
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-widest text-fg/70 flex items-center gap-2">
        {label}
        {count > 0 && (
          <span aria-label={`${count} waiting`}>
            <CountBadge n={count} />
          </span>
        )}
      </p>
      <p className="text-xs text-fg/70 mt-0.5 truncate">{hint}</p>
    </div>
    <label className="relative inline-flex items-center justify-center cursor-pointer shrink-0 min-w-11 min-h-11">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="block w-10 h-6 bg-fg/15 peer-checked:bg-clay rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-clay" />
      <span className="absolute left-1/2 top-1/2 -translate-y-1/2 -ml-4 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
    </label>
  </div>
);

// ── Shared pieces (ProviderDashElements.tsx uses these too) ───────────────────
export const Kicker: React.FC<{ accent?: boolean; children: React.ReactNode }> = ({ accent, children }) => (
  <h3 className={`text-xs font-bold uppercase tracking-widest ${accent ? 'text-clay' : 'text-fg/70'}`}>{children}</h3>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-fg">{children}</p>
);

/** A titled section with an optional count badge. Shared by the Provider and Organizer dashes. */
export const Group: React.FC<{ title: string; count: number; accent?: boolean; children: React.ReactNode }> = ({ title, count, accent, children }) => (
  <section className="flex flex-col gap-2">
    <div className="flex items-center gap-2 px-1">
      <Kicker accent={accent}>{title}</Kicker>
      {count > 0 && <CountBadge n={count} strong={!!accent} />}
    </div>
    {children}
  </section>
);

const InlineLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className={`rounded font-bold text-clay hover:underline ${focusRing}`}>{children}</Link>
);

export const PlayerLink: React.FC<{ uid: string; name: string }> = ({ uid, name }) =>
  uid ? (
    <Link to={`/players/${uid}`} className={`rounded hover:text-clay transition-colors ${focusRing}`}>{name}</Link>
  ) : (
    <>{name}</>
  );

export const RowError: React.FC<{ show: boolean; text?: string }> = ({ show, text }) =>
  show ? <p role="alert" className="mt-1.5 text-xs text-badge-loss">{text}</p> : null;

const Chevron: React.FC<{ open: boolean; label: string; onClick: () => void }> = ({ open, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-expanded={open}
    aria-label={label}
    className={`shrink-0 p-1 -mr-1 rounded-lg text-fg/70 hover:text-fg transition-colors ${focusRing}`}
  >
    <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
  </button>
);

// Progress ring: the filled arc is the dash length, the rest of the circumference is the gap.
const Ring: React.FC<{ pct: number; stroke: number; className: string; children: React.ReactNode }> = ({ pct, stroke, className, children }) => {
  const R = 18;
  const CIRC = 2 * Math.PI * R;
  return (
    <span className={`relative shrink-0 flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={R} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-fg/10" />
        <circle
          cx="22" cy="22" r={R} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(CIRC * pct) / 100} ${CIRC}`} className="text-clay"
        />
      </svg>
      <span className="relative text-xs font-black text-fg tabular-nums">{children}</span>
    </span>
  );
};

const Contacts: React.FC<{ r: Pick<ToPlayRow, 'opponent' | 'contact'> }> = ({ r }) =>
  r.contact ? (
    <ContactOpponentButton
      name={r.opponent.name}
      phone={r.contact.phone}
      email={r.contact.email}
      whatsappContact={r.contact.whatsapp_contact}
      preferred={r.contact.preferred_mode_of_contact}
      size="md"
      className="shrink-0 !flex-nowrap"
    />
  ) : null;

const RequestButtons: React.FC<{ data: PlayerDashData; r: NeedsYouRow; whiteRally?: boolean }> = ({ data, r, whiteRally }) => (
  <>
    <Button
      variant={whiteRally && r.category === 'rally' ? 'white' : 'clay'}
      size="sm"
      className={`shrink-0 ${focusRing}`}
      isLoading={data.busyId === r.id}
      disabled={!!data.busyId}
      onClick={() => data.respond(r, true)}
    >
      Accept
    </Button>
    <Button
      variant="ghost"
      size="sm"
      className={squareBtn}
      disabled={!!data.busyId}
      onClick={() => data.respond(r, false)}
      title="Decline"
      aria-label={`Decline ${r.from.name}`}
    >
      <X className="w-4 h-4" />
    </Button>
  </>
);

// Score and Cancel share one width so they line up on a row.
const ROW_BTN_W = 'w-20 justify-center';

const CancelButton: React.FC<{ data: PlayerDashData; id: string; category: 'rally' | 'challenge' }> = ({ data, id, category }) => (
  <Button
    variant="outline"
    size="sm"
    className={`shrink-0 ${ROW_BTN_W} ${focusRing}`}
    isLoading={data.busyId === id}
    disabled={!!data.busyId}
    onClick={() => data.cancel(id, category)}
  >
    Cancel
  </Button>
);

const DoneSchedulingButton: React.FC<{ data: PlayerDashData; r: ScheduleAskRow }> = ({ data, r }) => (
  <Button
    variant="clay"
    size="sm"
    className={`shrink-0 ${focusRing}`}
    isLoading={data.busyId === r.id}
    disabled={!!data.busyId}
    onClick={() => data.doneScheduling(r.id)}
  >
    Done
  </Button>
);

/** The provider's contacts, on every step of a live job — arranging it is the whole point. */
const BookingContacts: React.FC<{ r: BookingAskRow }> = ({ r }) =>
  r.contact ? (
    <div className="mt-2.5">
      <ContactOpponentButton
        name={r.provider}
        phone={r.contact.phone}
        email={r.contact.email}
        whatsappContact={r.contact.whatsapp_contact}
        preferred={r.contact.preferred_mode_of_contact}
        size="md"
        className="shrink-0 !flex-nowrap"
      />
    </div>
  ) : null;

const BookingAnswerButtons: React.FC<{ data: PlayerDashData; r: BookingAskRow }> = ({ data, r }) => (
  <>
    <Button
      variant="clay"
      size="sm"
      className={`shrink-0 ${focusRing}`}
      isLoading={data.busyId === r.id}
      disabled={!!data.busyId}
      onClick={() => data.answerBooking(r.id, true)}
    >
      Yes
    </Button>
    <Button
      variant="outline"
      size="sm"
      className={`shrink-0 ${focusRing}`}
      disabled={!!data.busyId}
      onClick={() => data.answerBooking(r.id, false)}
    >
      No
    </Button>
  </>
);

/** A still-New booking: Cancel, then "Yes, cancel" / "Keep", the same two taps as Services. */
const BookingCancel: React.FC<{ data: PlayerDashData; r: BookingAskRow }> = ({ data, r }) => {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button variant="outline" size="sm" className={`shrink-0 ${ROW_BTN_W} ${focusRing}`} disabled={!!data.busyId} onClick={() => setConfirming(true)}>
        Cancel
      </Button>
    );
  }
  return (
    <div className="flex shrink-0 gap-1.5">
      <Button variant="outline" size="sm" className={`shrink-0 ${focusRing}`} isLoading={data.busyId === r.id} disabled={!!data.busyId} onClick={() => data.cancelBooking(r.id)}>
        Yes, cancel
      </Button>
      <Button variant="ghost" size="sm" className={`shrink-0 ${focusRing}`} disabled={!!data.busyId} onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </div>
  );
};


const ScoreButton: React.FC<{ onClick: () => void; icon?: boolean; className?: string }> = ({ onClick, icon, className = ROW_BTN_W }) => (
  <Button variant="clay" size="sm" className={`shrink-0 ${focusRing} ${className}`} onClick={onClick}>
    {icon && <RacquetIcon className="w-4 h-4 mr-1.5" />}Score
  </Button>
);

/** Contact buttons and Cancel, behind a row's chevron. */
const ToPlayMore: React.FC<{ data: PlayerDashData; r: ToPlayRow }> = ({ data, r }) => (
  <div className="mt-2.5 flex items-center gap-2">
    <Contacts r={r} />
    <span className="flex-1" />
    {r.canCancel && <CancelButton data={data} id={r.id} category={data.requestCategoryOf(r.kind)} />}
    {/* The chevron's width, so Cancel lines up under Score. */}
    <span className="w-5 shrink-0" aria-hidden="true" />
  </div>
);

// ── Identity (1a) and scoreboard (1c) ─────────────────────────────────────────
const Identity: React.FC<{ data: PlayerDashData }> = ({ data }) => (
  <div className="flex items-start justify-between gap-3 px-1">
    <div className="min-w-0">
      <p className="truncate text-2xl font-black leading-tight tracking-tight text-fg">{data.identity?.name}</p>
      {data.identity?.line && <p className="mt-1 text-xs font-semibold text-fg/70">{data.identity.line}</p>}
    </div>
    {!!data.season.rankPosition && (
      <div className="shrink-0 text-right">
        <p className="text-2xl font-black leading-tight text-fg">#{data.season.rankPosition}</p>
        <p className="mt-0.5 flex items-center justify-end gap-1 text-xs font-bold uppercase tracking-widest text-fg/70">
          <RankMove t={data.season.rankTrend} move={data.season.rankMove} />Rank
        </p>
      </div>
    )}
  </div>
);

const Scoreboard: React.FC<{ data: PlayerDashData }> = ({ data }) => {
  const s = data.season;
  const cell = 'w-24 xl:w-28 text-center';
  const value = 'text-3xl font-black leading-none tracking-tight';
  const label = 'mt-1.5 text-xs font-bold uppercase tracking-widest text-fg/70';
  return (
    <section className="flex items-stretch rounded-3xl bg-tennis-deep px-7 py-6">
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="text-xs font-black uppercase tracking-widest text-clay">Player Dash</p>
        <p className="mt-1.5 truncate text-3xl font-black leading-none tracking-tight text-fg">{data.identity?.name}</p>
        {data.identity?.line && <p className="mt-2 text-xs font-semibold text-fg/70">{data.identity.line}</p>}
      </div>
      <div className="ml-8 flex shrink-0 items-center divide-x divide-fg/10 border-l border-fg/10 pl-4">
        {!!s.rankPosition && (
          <div className={cell}>
            <p className={`${value} text-fg`}>#{s.rankPosition}</p>
            <p className={`${label} flex items-center justify-center gap-1`}><RankMove t={s.rankTrend} move={s.rankMove} />Rank</p>
          </div>
        )}
        <div className={cell}>
          <p className={`${value} text-fg`}>{s.wins}<span className="text-lg">–{s.losses}</span></p>
          <p className={label}>Record</p>
        </div>
        <div className={cell}>
          <p className={`${value} text-fg`}>{s.pgWon === null ? '—' : <>{s.pgWon}<span className="text-lg">%</span></>}</p>
          <p className={label}>P/G Won</p>
        </div>
        <div className={cell}>
          <p className={`${value} text-clay`}>{s.rsPoints}</p>
          <p className={label}>RS Points</p>
        </div>
        <div className={cell}>
          <p className={`${value} ${streakTone(s.streak)}`}>{s.streak ?? '—'}</p>
          <p className={label}>Streak</p>
        </div>
        <Link to="/history" className={`group block rounded-2xl ${cell} ${focusRing}`}>
          <span className="flex h-[30px] items-center justify-center"><HistoryIcon className="w-6 h-6 text-clay" /></span>
          <span className={`${label} block transition-colors group-hover:text-fg`}>History</span>
        </Link>
      </div>
    </section>
  );
};

// ── Needs you ─────────────────────────────────────────────────────────────────
const NeedsYouList: React.FC<{ data: PlayerDashData }> = ({ data }) => (
  <section className="rounded-3xl bg-fg/5 pt-4 pb-1">
    <div className="flex items-center gap-2 px-4 pb-2.5">
      <Kicker accent>Needs you</Kicker>
      {data.needsYouCount > 0 && <CountBadge n={data.needsYouCount} />}
      <span className="flex-1" />
      {data.needsYou.length > 0 && <span className="text-xs font-semibold text-fg/70">Accept or decline here</span>}
    </div>
    {data.needsYouCount === 0 && data.outgoing.length === 0 && (
      <div className="border-t border-fg/10 px-4 py-3"><Empty>Nothing waiting on you.</Empty></div>
    )}
    {data.needsYou.map((r) => (
      <div key={r.id} className="border-t border-fg/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <SourceLetter source={r.category} />
              <p className="min-w-0 truncate text-sm font-semibold text-fg"><PlayerLink uid={r.from.uid} name={r.from.name} /></p>
            </div>
            <p className="mt-0.5 truncate text-xs text-fg/70">{requestMeta(r)}</p>
          </div>
          <RequestButtons data={data} r={r} />
        </div>
        <RowError show={data.rowError?.id === r.id} text={data.rowError?.text} />
      </div>
    ))}
    {data.scheduleAsks.map((r) => (
      <div key={r.id} className="border-t border-fg/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <SourceLetter source="tournament" />
              <p className="min-w-0 truncate text-sm font-semibold text-fg"><PlayerLink uid={r.opponent.uid} name={r.opponent.name} /></p>
            </div>
            <p className="mt-0.5 truncate text-xs text-fg/70">{r.line}</p>
          </div>
          <DoneSchedulingButton data={data} r={r} />
        </div>
        {r.contact && <div className="mt-2.5"><Contacts r={r} /></div>}
        <RowError show={data.rowError?.id === r.id} text={data.rowError?.text} />
      </div>
    ))}
    {data.bookingAsks.map((r) => (
      <div key={r.id} className="border-t border-fg/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{r.title}</p>
            <p className="mt-0.5 truncate text-xs text-fg/70">{r.line}</p>
          </div>
          {r.ask && <BookingAnswerButtons data={data} r={r} />}
          {r.cancellable && <BookingCancel data={data} r={r} />}
        </div>
        <BookingContacts r={r} />
        <RowError show={data.rowError?.id === r.id} text={data.rowError?.text} />
      </div>
    ))}
    {data.outgoing.map((r) => (
      <div key={r.id} className="border-t border-fg/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <SourceLetter source={r.category} />
              <p className="min-w-0 truncate text-sm font-semibold text-fg"><PlayerLink uid={r.to.uid} name={r.to.name} /></p>
            </div>
            <p className="mt-0.5 truncate text-xs text-fg/70">{r.line}</p>
          </div>
          <CancelButton data={data} id={r.id} category={r.category} />
        </div>
        <RowError show={data.rowError?.id === r.id} text={data.rowError?.text} />
      </div>
    ))}
  </section>
);

const NeedsYouCards: React.FC<{ data: PlayerDashData }> = ({ data }) => (
  <section className="rounded-3xl bg-fg/5 p-[18px]">
    <div className="mb-3.5 flex items-center gap-2">
      <Kicker accent>Needs you</Kicker>
      {data.needsYouCount > 0 && <CountBadge n={data.needsYouCount} />}
    </div>
    {data.needsYouCount === 0 && data.outgoing.length === 0 ? (
      <Empty>Nothing waiting on you.</Empty>
    ) : (
      <div className="flex flex-col gap-2">
        {data.needsYou.map((r) => (
          <div
            key={r.id}
            className={`rounded-2xl p-3 ${r.category === 'challenge' ? 'border border-clay/30 bg-clay/10' : 'bg-fg/5'}`}
          >
            <div className="flex items-center justify-between gap-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-fg"><PlayerLink uid={r.from.uid} name={r.from.name} /></p>
                <p className="mt-0.5 truncate text-xs text-fg/70">{requestMeta(r)}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <RequestButtons data={data} r={r} whiteRally />
              </div>
            </div>
            <RowError show={data.rowError?.id === r.id} text={data.rowError?.text} />
          </div>
        ))}
        {data.scheduleAsks.map((r) => (
          <div key={r.id} className="rounded-2xl bg-fg/5 p-3">
            <div className="flex items-center justify-between gap-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-fg"><PlayerLink uid={r.opponent.uid} name={r.opponent.name} /></p>
                <p className="mt-0.5 truncate text-xs text-fg/70">{r.line}</p>
              </div>
              <DoneSchedulingButton data={data} r={r} />
            </div>
            {r.contact && <div className="mt-2.5"><Contacts r={r} /></div>}
            <RowError show={data.rowError?.id === r.id} text={data.rowError?.text} />
          </div>
        ))}
        {data.bookingAsks.map((r) => (
          <div key={r.id} className="rounded-2xl bg-fg/5 p-3">
            <div className="flex items-center justify-between gap-2.5">
              <div className="min-w-0">
                <p className="text-sm font-bold text-fg">{r.title}</p>
                <p className="mt-0.5 truncate text-xs text-fg/70">{r.line}</p>
              </div>
              {r.ask && (
                <div className="flex shrink-0 gap-1.5">
                  <BookingAnswerButtons data={data} r={r} />
                </div>
              )}
              {r.cancellable && <BookingCancel data={data} r={r} />}
            </div>
            <BookingContacts r={r} />
            <RowError show={data.rowError?.id === r.id} text={data.rowError?.text} />
          </div>
        ))}
        {data.outgoing.map((r) => (
          <div key={r.id} className="rounded-2xl bg-fg/5 p-3">
            <div className="flex items-center justify-between gap-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-fg"><PlayerLink uid={r.to.uid} name={r.to.name} /></p>
                <p className="mt-0.5 truncate text-xs text-fg/70">{r.line}</p>
              </div>
              <CancelButton data={data} id={r.id} category={r.category} />
            </div>
            <RowError show={data.rowError?.id === r.id} text={data.rowError?.text} />
          </div>
        ))}
      </div>
    )}
  </section>
);

// ── Matches to play ───────────────────────────────────────────────────────────
const nothingToPlay = (
  <Empty>Nothing to play yet. Send a challenge or a rally from <InlineLink to="/matches">Matches</InlineLink>.</Empty>
);

const ToPlayList: React.FC<{ data: PlayerDashData }> = ({ data }) => {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="rounded-3xl bg-fg/5 pt-4 pb-1">
      <div className="flex items-center gap-2 px-4 pb-2.5">
        <Kicker>Matches to play</Kicker>
        {data.toPlay.length > 0 && <CountBadge n={data.toPlay.length} strong={false} />}
      </div>
      {data.toPlay.length === 0 && <div className="border-t border-fg/10 px-4 py-3">{nothingToPlay}</div>}
      {data.toPlay.map((r) => {
        const isOpen = open === r.id;
        const more = hasContact(r) || r.canCancel;
        return (
          <div key={r.id} className={`border-t border-fg/10 px-4 py-3 ${r.nextUp ? 'bg-clay/5' : ''}`}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <SourceLetter source={sourceOf(r.kind)} />
                  <p className="min-w-0 truncate text-sm font-semibold text-fg"><PlayerLink uid={r.opponent.uid} name={r.opponent.name} /></p>
                  {r.nextUp && (
                    <span className="shrink-0 self-center rounded-full bg-clay px-2 py-0.5 text-xs font-black uppercase tracking-wide text-white">Next up</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-fg/70">{r.subtitle}</p>
              </div>
              {!r.nextUp && <ScoreButton onClick={() => data.score(r)} />}
              {!r.nextUp && more && (
                <Chevron open={isOpen} label={`${isOpen ? 'Hide' : 'Show'} options for ${r.opponent.name}`} onClick={() => setOpen(isOpen ? null : r.id)} />
              )}
            </div>
            {r.nextUp ? (
              <div className="mt-2.5 flex items-center gap-2">
                <Contacts r={r} />
                <ScoreButton icon className="flex-1" onClick={() => data.score(r)} />
                {r.canCancel && <CancelButton data={data} id={r.id} category={data.requestCategoryOf(r.kind)} />}
              </div>
            ) : (
              isOpen && <ToPlayMore data={data} r={r} />
            )}
            <RowError show={data.rowError?.id === r.id} text={data.rowError?.text} />
          </div>
        );
      })}
    </section>
  );
};

const ToPlayCards: React.FC<{ data: PlayerDashData }> = ({ data }) => {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="rounded-3xl bg-fg/5 p-[18px]">
      <div className="mb-3.5 flex items-center gap-2">
        <Kicker>Matches to play</Kicker>
        {data.toPlay.length > 0 && <CountBadge n={data.toPlay.length} strong={false} />}
      </div>
      {data.toPlay.length === 0 ? nothingToPlay : (
        <div className="flex flex-col gap-2">
          {data.toPlay.map((r) => {
            const isOpen = open === r.id;
            const more = hasContact(r) || r.canCancel;
            return (
              <div key={r.id} className={`rounded-2xl bg-fg/5 p-3 ${r.nextUp ? 'border-l-[3px] border-clay' : ''}`}>
                <div className="flex items-center justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-fg">
                      <PlayerLink uid={r.opponent.uid} name={r.opponent.name} />
                      {r.nextUp && <span className="text-xs font-black uppercase tracking-wide text-clay"> · Next up</span>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-fg/70">{r.subtitle}</p>
                  </div>
                  <ScoreButton onClick={() => data.score(r)} />
                  {more && (
                    <Chevron open={isOpen} label={`${isOpen ? 'Hide' : 'Show'} options for ${r.opponent.name}`} onClick={() => setOpen(isOpen ? null : r.id)} />
                  )}
                </div>
                {isOpen && <ToPlayMore data={data} r={r} />}
                <RowError show={data.rowError?.id === r.id} text={data.rowError?.text} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

// ── Season (1a) and form ──────────────────────────────────────────────────────
const Tile: React.FC<{ label: string; to?: string; children: React.ReactNode }> = ({ label, to, children }) => {
  const body = (
    <>
      <span className="flex h-7 items-center justify-center gap-1 text-lg font-black text-fg">{children}</span>
      <span className="mt-0.5 block text-xs font-bold uppercase tracking-wider text-fg/70">{label}</span>
    </>
  );
  return to ? (
    <Link to={to} className={`block rounded-2xl bg-fg/5 py-3 transition-colors hover:bg-fg/10 ${focusRing}`}>{body}</Link>
  ) : (
    <div className="rounded-2xl bg-fg/5 py-3">{body}</div>
  );
};

const SeasonCard: React.FC<{ data: PlayerDashData }> = ({ data }) => {
  const s = data.season;
  return (
    <section className="rounded-3xl bg-fg/5 p-5">
      <div className="mb-3"><Kicker>Season</Kicker></div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile label="Streak">{s.streak ?? '—'}</Tile>
        <Tile label="RS Points" to="/marketplace"><Sparkles className="w-3.5 h-3.5 text-clay" /><span className="text-clay">{s.rsPoints}</span></Tile>
        <Tile label="P/G Won">{s.pgWon === null ? '—' : `${s.pgWon}%`}</Tile>
        <Tile label="Matches">{s.matches}</Tile>
        <Tile label="Rank Move">
          {s.rankTrend === 'up' ? (
            <span className="flex items-center gap-0.5 text-badge-win"><ArrowUp className="w-4 h-4" />{s.rankMove || ''}</span>
          ) : s.rankTrend === 'down' ? (
            <span className="flex items-center gap-0.5 text-badge-loss"><ArrowDown className="w-4 h-4" />{s.rankMove || ''}</span>
          ) : (
            '—'
          )}
        </Tile>
        <Tile label="History" to="/history"><HistoryIcon className="w-4 h-4 text-clay" /></Tile>
      </div>
      {data.recent.length > 0 && (
        <div className="mt-3 divide-y divide-fg/10">
          {data.recent.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className={`w-5 shrink-0 text-xs font-black ${m.won ? 'text-badge-win' : 'text-badge-loss'}`}>{m.won ? 'W' : 'L'}</span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg"><PlayerLink uid={m.match.opponentId} name={m.match.opponentName} /></p>
              <span className="shrink-0 text-xs font-bold text-fg tabular-nums">{m.scoreLine}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const FormCard: React.FC<{ data: PlayerDashData }> = ({ data }) => {
  if (data.form.length === 0) return null;
  const s = data.season;
  return (
    <section className="rounded-3xl bg-fg/5 p-[18px]">
      <div className="mb-3.5"><Kicker>Form</Kicker></div>
      <div className="flex gap-1.5">
        {data.form.map((won, i) => (
          <span
            key={i}
            className={`flex h-9 flex-1 items-center justify-center rounded-lg text-sm font-black ${won ? 'bg-badge-win/20 text-badge-win' : 'bg-badge-loss/20 text-badge-loss'}`}
          >
            {won ? 'W' : 'L'}
          </span>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-fg/70">
        Newest first · best streak {s.bestStreak} · {s.activeMonths} active month{s.activeMonths === 1 ? '' : 's'}
      </p>
    </section>
  );
};

// ── Task groups: two tiles (1a), two rows (1c) ────────────────────────────────
const noTasks = <Empty>Nothing in progress. See what earns points on <InlineLink to="/tasks">Tasks</InlineLink>.</Empty>;

const TaskTiles: React.FC<{ groups: TaskGroupRow[] }> = ({ groups }) => (
  <section className="rounded-3xl bg-fg/5 p-5">
    <div className="mb-3.5 flex items-center justify-between gap-2">
      <Kicker>Task groups in progress</Kicker>
      {groups.length > 0 && (
        <Link to="/tasks" className={`shrink-0 rounded text-xs font-bold text-clay hover:underline ${focusRing}`}>
          {Math.min(groups.length, TASK_GROUPS_SHOWN)} of {groups.length}
        </Link>
      )}
    </div>
    {groups.length === 0 ? noTasks : (
      <div className="grid grid-cols-2 gap-2.5">
        {groups.slice(0, TASK_GROUPS_SHOWN).map((g) => (
          <Link
            key={g.id}
            to={g.href}
            className={`flex flex-col items-center gap-2 rounded-2xl bg-fg/5 p-3.5 text-center transition-colors hover:bg-fg/10 ${focusRing}`}
          >
            <Ring pct={g.pct} stroke={4} className="h-16 w-16">{g.have}/{g.need}</Ring>
            <span className="text-xs font-bold text-fg">{g.title}</span>
            <span className="text-xs text-fg/70">
              {g.earned} of {g.tiers} done · next <span className="font-semibold text-fg">{g.nextTitle}</span>
            </span>
            <span className="rounded-full bg-clay/15 px-2 py-0.5 text-xs font-bold text-clay">+{g.nextPoints} pts</span>
          </Link>
        ))}
      </div>
    )}
  </section>
);

const TaskRows: React.FC<{ groups: TaskGroupRow[] }> = ({ groups }) => (
  <section className="rounded-3xl bg-fg/5 p-[18px]">
    <div className="mb-3.5 flex items-center justify-between gap-2">
      <Kicker>Task groups</Kicker>
      {groups.length > 0 && (
        <Link to="/tasks" className={`shrink-0 rounded text-xs font-bold text-clay hover:underline ${focusRing}`}>
          {groups.length} in progress
        </Link>
      )}
    </div>
    {groups.length === 0 ? noTasks : (
      <div className="divide-y divide-fg/10">
        {groups.slice(0, TASK_GROUPS_SHOWN).map((g) => (
          <Link key={g.id} to={g.href} className={`flex items-center gap-3.5 py-3.5 first:pt-0 last:pb-0 hover:opacity-90 ${focusRing}`}>
            <Ring pct={g.pct} stroke={5} className="h-[60px] w-[60px]">{g.pct}%</Ring>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-fg">{g.title}</span>
              <span className="mt-0.5 block text-xs text-fg/70">{g.earned} of {g.tiers} tiers · {g.remainingLine}</span>
              <span className="mt-1 block text-xs font-semibold text-fg">
                Next: {g.nextTitle} <span className="font-black text-clay">+{g.nextPoints}</span>
              </span>
            </span>
          </Link>
        ))}
      </div>
    )}
  </section>
);

// ── Head to head: list (1a), table (1c) ───────────────────────────────────────
/** Every match against one opponent, with Edit on the ones that may still be corrected. */
const MatchList: React.FC<{ matches: PastMatchRow[]; opponent: string; onEdit: (m: PastMatchRow) => void }> = ({ matches, opponent, onEdit }) => (
  <div className="mt-2 divide-y divide-fg/10 border-t border-fg/10">
    {matches.map((m) => (
      <div key={m.id} className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-fg">{m.context}</p>
          {m.when && <p className="text-xs text-fg/70">{m.when}</p>}
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={`text-xs font-bold tabular-nums ${m.won ? 'text-badge-win' : 'text-badge-loss'}`}>{m.scoreLine}</span>
          {m.editable && (
            <button
              type="button"
              onClick={() => onEdit(m)}
              title="Edit score"
              aria-label={`Edit the score against ${opponent}`}
              className={`rounded p-1 text-fg/70 transition-colors hover:text-fg ${focusRing}`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </div>
    ))}
  </div>
);

const useHeadToHeadState = (limit: number, total: number) => {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  return {
    open,
    toggle: (key: string) => setOpen((cur) => (cur === key ? null : key)),
    limit: showAll ? total : limit,
    moreLabel: total > limit ? (showAll ? 'Show fewer' : `Show ${total - limit} more`) : '',
    flip: () => setShowAll((v) => !v),
  };
};

const wlTone = (h: HeadToHeadRow) => (h.wins >= h.losses ? 'text-badge-win' : 'text-badge-loss');

const HeadToHeadList: React.FC<{ rows: HeadToHeadRow[]; onEdit: (m: PastMatchRow) => void }> = ({ rows, onEdit }) => {
  const st = useHeadToHeadState(4, rows.length);
  return (
    <section className="rounded-3xl bg-fg/5 pt-4 pb-1">
      <div className="flex items-center justify-between gap-2 px-4 pb-2.5">
        <Kicker>Head to head</Kicker>
        {rows.length > 0 && <span className="text-xs font-semibold text-fg/70">{rows.length} opponent{rows.length === 1 ? '' : 's'}</span>}
      </div>
      {rows.length === 0 && <div className="border-t border-fg/10 px-4 py-3"><Empty>No matches played yet.</Empty></div>}
      {rows.slice(0, st.limit).map((h) => {
        const key = h.opponent.uid || h.opponent.name;
        const isOpen = st.open === key;
        return (
          <div key={key} className="border-t border-fg/10 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg"><PlayerLink uid={h.opponent.uid} name={h.opponent.name} /></p>
              <span className={`shrink-0 text-sm font-black tabular-nums ${wlTone(h)}`}>{h.wins}–{h.losses}</span>
              <Chevron open={isOpen} label={`${isOpen ? 'Hide' : 'Show'} matches against ${h.opponent.name}`} onClick={() => st.toggle(key)} />
            </div>
            {isOpen && <MatchList matches={h.matches} opponent={h.opponent.name} onEdit={onEdit} />}
          </div>
        );
      })}
      {st.moreLabel && (
        <div className="border-t border-fg/10 px-4 py-2 text-center">
          <button type="button" onClick={st.flip} className={`rounded text-xs font-bold text-clay hover:underline ${focusRing}`}>{st.moreLabel}</button>
        </div>
      )}
    </section>
  );
};

const HeadToHeadTable: React.FC<{ rows: HeadToHeadRow[]; onEdit: (m: PastMatchRow) => void }> = ({ rows, onEdit }) => {
  const st = useHeadToHeadState(8, rows.length);
  return (
    <section className="rounded-3xl bg-fg/5 p-[18px]">
      <div className="mb-3.5"><Kicker>Head to head</Kicker></div>
      {rows.length === 0 ? <Empty>No matches played yet.</Empty> : (
        <>
          <div className="flex items-center gap-2 pb-2 text-xs font-bold uppercase tracking-widest text-fg/70">
            <span className="flex-1">Opponent</span>
            <span className="w-10 text-center">W–L</span>
            <span className="w-24 text-right">Last</span>
            <span className="w-5" />
          </div>
          <div className="divide-y divide-fg/10 border-t border-fg/10">
            {rows.slice(0, st.limit).map((h) => {
              const key = h.opponent.uid || h.opponent.name;
              const isOpen = st.open === key;
              return (
                <div key={key} className="py-2">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-fg"><PlayerLink uid={h.opponent.uid} name={h.opponent.name} /></p>
                    <span className={`w-10 text-center text-sm font-black tabular-nums ${wlTone(h)}`}>{h.wins}–{h.losses}</span>
                    <span className="w-24 truncate text-right text-xs font-semibold text-fg tabular-nums">{h.lastScore}</span>
                    <Chevron open={isOpen} label={`${isOpen ? 'Hide' : 'Show'} matches against ${h.opponent.name}`} onClick={() => st.toggle(key)} />
                  </div>
                  {isOpen && <MatchList matches={h.matches} opponent={h.opponent.name} onEdit={onEdit} />}
                </div>
              );
            })}
          </div>
          {st.moreLabel && (
            <button type="button" onClick={st.flip} className={`mt-2 w-full rounded text-center text-xs font-bold text-clay hover:underline ${focusRing}`}>
              {st.moreLabel}
            </button>
          )}
        </>
      )}
    </section>
  );
};

// ── Events: list (1a), cards (1c) ─────────────────────────────────────────────
const noEvents = <Empty>No events yet. Find one on <InlineLink to="/events">Events</InlineLink>.</Empty>;

const LivePill: React.FC<{ solid?: boolean }> = ({ solid }) => (
  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-black uppercase tracking-wide ${solid ? 'bg-clay text-white' : 'bg-clay/15 text-clay'}`}>Live</span>
);

const EventsList: React.FC<{ events: DashEventRow[] }> = ({ events }) => (
  <section className="rounded-3xl bg-fg/5 pt-4 pb-1">
    <div className="px-4 pb-2.5"><Kicker>Your events</Kicker></div>
    {events.length === 0 && <div className="border-t border-fg/10 px-4 py-3">{noEvents}</div>}
    {events.map((e) => (
      <Link key={e.id} to={e.href} className={`flex items-center gap-3 border-t border-fg/10 px-4 py-3 transition-colors hover:bg-fg/5 ${focusRing}`}>
        {e.champion
          ? <Trophy className="h-[18px] w-[18px] shrink-0 text-badge" />
          : <Calendar className={`h-[18px] w-[18px] shrink-0 ${e.live ? 'text-clay' : 'text-fg/70'}`} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">{e.title}</span>
          <span className={`block truncate text-xs ${e.champion ? 'text-badge' : 'text-fg/70'}`}>
            {[e.detail, e.played && `${e.played.done} of ${e.played.total} played`].filter(Boolean).join(' · ')}
          </span>
        </span>
        {e.live && <LivePill />}
      </Link>
    ))}
  </section>
);

const PlayedBar: React.FC<{ done: number; total: number }> = ({ done, total }) => (
  <>
    {total <= 12 ? (
      <span className="mt-2 flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < done ? 'bg-badge-win' : 'bg-fg/10'}`} />
        ))}
      </span>
    ) : (
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-fg/10">
        <span className="block h-full rounded-full bg-badge-win" style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </span>
    )}
    <span className="mt-1.5 block text-xs font-bold text-fg/70">
      {done} of {total} played{total > done ? ` · ${total - done} to go` : ''}
    </span>
  </>
);

const EventCards: React.FC<{ events: DashEventRow[] }> = ({ events }) => (
  <section className="rounded-3xl bg-fg/5 p-[18px]">
    <div className="mb-3.5"><Kicker>Events</Kicker></div>
    {events.length === 0 ? noEvents : (
      <div className="flex flex-col gap-2.5">
        {events.map((e) => (
          <Link
            key={e.id}
            to={e.href}
            className={`block rounded-2xl p-3 transition-colors ${focusRing} ${e.live ? 'bg-clay/10 hover:bg-clay/15' : e.champion ? 'bg-badge/10 hover:bg-badge/15' : 'bg-fg/5 hover:bg-fg/10'}`}
          >
            <span className="flex items-center gap-2">
              {e.champion && <Trophy className="h-4 w-4 shrink-0 text-badge" />}
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{e.title}</span>
              {e.live && <LivePill solid />}
            </span>
            {e.detail && <span className={`mt-1 block truncate text-xs ${e.champion ? 'font-bold text-badge' : 'text-fg/70'}`}>{e.detail}</span>}
            {e.played && <PlayedBar done={e.played.done} total={e.played.total} />}
          </Link>
        ))}
      </div>
    )}
  </section>
);

// ── Playing preferences ───────────────────────────────────────────────────────
// Chips until Edit is pressed; Edit swaps them for one row per preference, each opening the same
// editor the profile card uses.
type Editor = null | 'courts' | 'zone' | 'availability' | 'skill' | 'league';

const PrefRow: React.FC<{ label: string; value: string; onEdit: () => void }> = ({ label, value, onEdit }) => (
  <div className="flex items-start gap-3 py-2.5">
    <div className="min-w-0 flex-1">
      <p className="text-xs font-bold uppercase tracking-widest text-fg/70">{label}</p>
      <p className="mt-0.5 break-words text-sm text-fg">{value}</p>
    </div>
    <button
      type="button"
      onClick={onEdit}
      title={`Edit ${label.toLowerCase()}`}
      aria-label={`Edit ${label.toLowerCase()}`}
      className={`mt-0.5 shrink-0 rounded p-1 text-fg/70 transition-colors hover:text-fg ${focusRing}`}
    >
      <Pencil className="w-3.5 h-3.5" />
    </button>
  </div>
);

const PreferencesCard: React.FC<{ profile: UserProfile; actions: ProfileActions; saving: boolean }> = ({ profile, actions, saving }) => {
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const { preferences, stats, user } = profile;
  const close = () => setEditor(null);
  const save = async (fn: () => Promise<boolean>) => { if (await fn()) close(); };
  const league = [leagueDivision(stats.league), leagueAgeCategory(stats.league)].filter(Boolean).join(' · ');
  const chips = [
    ...(preferences.preferred_courts ?? []),
    preferences.preferred_zone,
    ...(preferences.availability_tags ?? []),
  ].filter(Boolean);

  return (
    <section className="rounded-3xl bg-fg/5 p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <Kicker>Playing preferences</Kicker>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          className={`inline-flex shrink-0 items-center gap-1 rounded text-xs font-bold text-clay hover:underline ${focusRing}`}
        >
          {editing ? 'Done' : <><Pencil className="w-3.5 h-3.5" />Edit</>}
        </button>
      </div>

      {editing ? (
        <div className="mt-1.5 divide-y divide-fg/10">
          <PrefRow label="Courts" value={(preferences.preferred_courts ?? []).join(', ') || 'None set'} onEdit={() => setEditor('courts')} />
          <PrefRow label="Zone" value={preferences.preferred_zone || 'None set'} onEdit={() => setEditor('zone')} />
          <PrefRow label="Availability" value={(preferences.availability_tags ?? []).join(' · ') || 'None set'} onEdit={() => setEditor('availability')} />
          <PrefRow label="Skill level" value={stats.skill_level ? `NTRP ${stats.skill_level}` : 'Not set'} onEdit={() => setEditor('skill')} />
          <PrefRow label="League" value={league || 'Not set'} onEdit={() => setEditor('league')} />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.length === 0
            ? <Empty>None set yet.</Empty>
            : chips.map((c, i) => (
              <span key={`${c}-${i}`} className="rounded-full bg-fg/10 px-3 py-1 text-xs font-bold text-fg">{c}</span>
            ))}
        </div>
      )}

      <AnimatePresence>
        {editor === 'courts' && (
          <Sheet key="courts" onClose={close} title="Your Courts" maxWidthClassName="max-w-md">
            <div className="p-6 pt-3">
              <CourtsEditor preferences={preferences} saving={saving} onSave={(c, z) => save(() => actions.updatePreferredCourts(c, z))} />
            </div>
          </Sheet>
        )}
        {editor === 'zone' && (
          <ZonePickerSheet
            key="zone"
            currentZone={preferences.preferred_zone}
            saving={saving}
            onClose={close}
            onPick={(z) => save(() => actions.updatePreferredZone(z))}
          />
        )}
        {editor === 'skill' && (
          <Sheet key="skill" onClose={close} title="Skill Level" maxWidthClassName="max-w-md">
            <div className="p-6 pt-3">
              <SkillEditor initial={stats.skill_level} saving={saving} onSave={(s, b) => save(() => actions.updateSkills(s, b))} />
            </div>
          </Sheet>
        )}
        {editor === 'league' && (
          <Sheet key="league" onClose={close} title="League" maxWidthClassName="max-w-md">
            <div className="p-6 pt-3">
              <LeagueEditor
                league={stats.league}
                visible={!!user.profile_details_visible}
                saving={saving}
                onSave={(l, a, v) => save(() => actions.updateLeagueAgeCategory(l, a, v))}
              />
            </div>
          </Sheet>
        )}
      </AnimatePresence>
      {editor === 'availability' && <AvailabilityModal onClose={close} />}
    </section>
  );
};

// ── The dash ──────────────────────────────────────────────────────────────────
export const PlayerDash: React.FC<{
  data: PlayerDashData;
  profile: UserProfile;
  actions: ProfileActions;
  saving: boolean;
  wide: boolean;
}> = ({ data, profile, actions, saving, wide }) => {
  const prefs = <PreferencesCard profile={profile} actions={actions} saving={saving} />;

  if (wide) {
    return (
      <div className="space-y-5">
        <Scoreboard data={data} />
        {/* minmax(0, …) is load-bearing: a bare `fr` track grows to fit its longest unbreakable
            row, which pushed the third column out past the page. */}
        <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-5">
          <div className="flex flex-col gap-4">
            <NeedsYouCards data={data} />
            <ToPlayCards data={data} />
          </div>
          <div className="flex flex-col gap-4">
            <HeadToHeadTable rows={data.headToHead} onEdit={data.edit} />
            <FormCard data={data} />
          </div>
          <div className="flex flex-col gap-4">
            <TaskRows groups={data.taskGroups} />
            <EventCards events={data.events} />
            {prefs}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Identity data={data} />
      <NeedsYouList data={data} />
      <ToPlayList data={data} />
      <SeasonCard data={data} />
      <FormCard data={data} />
      <TaskTiles groups={data.taskGroups} />
      <HeadToHeadList rows={data.headToHead} onEdit={data.edit} />
      <EventsList events={data.events} />
      {prefs}
    </div>
  );
};
