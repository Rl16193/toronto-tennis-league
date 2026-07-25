import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TournamentMatch, TournamentPlayer } from './types';
import { formatPlayerName, formatScheduledDate, formatSetScores, getScheduleState } from './utils';
import { ScheduleControls, type ScheduleApi } from './ScheduleControls';
import { ContactOpponentButton, pillButtonCls } from './ContactOpponentButton';

// ─── Bracket: your matches + potential next-round opponents ──────────────────────

export type OpponentRow = {
  round: string;
  name: string;
  userId: string;
  email: string;
  phone: string;
  whatsappContact: string;
  whatsappSameAsPhone: boolean;
  skill: number | null;
  wins: number;
  losses: number;
};

// Shared scheduling status badge for a match — used by both the bracket (Your Match) and the
// round-robin (Your Group) panels so they read identically. A completed match is always
// "Completed" (and scheduling is locked wherever this is shown). No badge at all once unscheduled
// — that's the default state, so showing it just crowds the row and squeezes the player's name.
const scheduleBadge = (m: TournamentMatch): { text: string; cls: string } | null => {
  if (m.status === 'complete') return { text: 'Completed', cls: 'bg-green-500/15 text-green-300 border-green-500/25' };
  const st = getScheduleState(m);
  if (st?.status === 'scheduled') {
    return { text: `Scheduled on ${formatScheduledDate(st.date, st.slot ?? '')}`, cls: 'bg-green-500/15 text-green-300 border-green-500/25' };
  }
  return null;
};

/** Compact bracket-style cell for the viewer's current match — dark, blended with the site. */
const CurrentMatchCell: React.FC<{ match: TournamentMatch }> = ({ match }) => {
  const done = match.status === 'complete';
  const score = done ? formatSetScores(match) : '';
  const rows = [
    { name: match.player_1_name, won: done && match.winner_user_id === match.player_1_user_id },
    { name: match.player_2_name, won: done && match.winner_user_id === match.player_2_user_id },
  ];
  return (
    <div className="rounded-2xl border border-fg/10 bg-tennis-dark/50 overflow-hidden">
      {rows.map((r, i) => (
        <div key={i} className={`flex items-center justify-between gap-3 px-3.5 h-11 ${i === 1 ? 'border-t border-fg/10' : ''}`}>
          <span className={`text-sm truncate ${r.won ? 'text-clay font-bold' : 'text-fg/90'}`}>{formatPlayerName(r.name)}</span>
          {r.won && <span className="text-[10px] uppercase tracking-widest text-clay font-bold shrink-0">Won</span>}
        </div>
      ))}
      {done && score && (
        <div className="border-t border-fg/10 px-3.5 py-1.5 text-[11px] font-mono tracking-wide text-fg/50">{score}</div>
      )}
    </div>
  );
};

export const OpponentCard: React.FC<{
  opponent: OpponentRow;
  defaultOpen?: boolean;
  currentMatch?: TournamentMatch | null;
  schedule?: ScheduleApi;
  // A creator who's also playing uses the same Enter/Edit Score flow they have in the Match List
  // (RRGroupCard) — unlike a participant's one-time Submit Score, it stays available after the
  // match is scored (to edit) and isn't limited to an allow-list.
  isCreator?: boolean;
}> = ({ opponent, defaultOpen = false, currentMatch, schedule, isCreator }) => {
  const [open, setOpen] = useState(defaultOpen);
  const canSchedule = !!currentMatch && !!schedule && !currentMatch.id.startsWith('preview_');
  const isComplete = currentMatch?.status === 'complete';
  const badge = canSchedule ? scheduleBadge(currentMatch!) : null;
  const showAskInline = canSchedule && !isComplete && !getScheduleState(currentMatch!).requested;
  const showSubmitInline = canSchedule && !!schedule!.onSubmitScore && (
    isCreator || (!isComplete && !!schedule!.submittableMatchIds?.has(currentMatch!.id))
  );
  const submitLabel = isCreator ? (isComplete ? 'Edit Score' : 'Enter Score') : 'Submit Score';

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <span className="text-xs uppercase tracking-widest text-fg/50 font-bold">Your Match</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-fg/40 group-hover:text-fg/70 transition-colors" />
          : <ChevronDown className="w-4 h-4 text-fg/40 group-hover:text-fg/70 transition-colors" />}
      </button>

      {open && (
        <div className="space-y-3">
          {opponent.round && (
            <p className="text-[10px] uppercase tracking-widest text-clay font-bold">{opponent.round}</p>
          )}
          {currentMatch && <CurrentMatchCell match={currentMatch} />}

          {/* Sleek single row — matches the Upcoming Matches list on the Profile page: name
              (links to their profile) · status badge · Contact. Read-only (you can't edit
              another player's profile); phone first, email/WhatsApp as fallbacks. */}
          <div className="rounded-2xl border border-fg/5 overflow-hidden">
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 min-h-[44px] flex-wrap">
              {opponent.userId ? (
                <Link to={`/players/${opponent.userId}`} className="flex-1 min-w-[4.5rem] text-sm font-semibold text-fg truncate hover:text-clay transition-colors">
                  {opponent.name}
                </Link>
              ) : (
                <span className="flex-1 min-w-[4.5rem] text-sm font-semibold text-fg truncate">{opponent.name}</span>
              )}
              {badge && (
                <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[9px] font-bold border ${badge.cls}`}>{badge.text}</span>
              )}
              {showAskInline && (
                <button type="button" className={pillButtonCls('sm', 'clay')} onClick={() => schedule!.onAskOrganizer(currentMatch!)}>Schedule</button>
              )}
              {showSubmitInline && (
                <button type="button" className={pillButtonCls('sm', 'clay')} onClick={() => schedule!.onSubmitScore!(currentMatch!)}>{submitLabel}</button>
              )}
              <ContactOpponentButton
                name={opponent.name}
                phone={opponent.phone}
                email={opponent.email}
                whatsappContact={opponent.whatsappContact}
                whatsappSameAsPhone={opponent.whatsappSameAsPhone}
                variant="white"
                size="sm"
              />
            </div>
          </div>

          {/* Scheduling is locked once the match is complete. Ask-organizer + Submit Score live inline above. */}
          {canSchedule && !isComplete && <ScheduleControls match={currentMatch!} api={schedule!} hideBadge hideAskButton hideSubmitButton />}
        </div>
      )}
    </div>
  );
};

// ─── Round Robin: your group ─────────────────────────────────────────────────────

export const RROpponentPanel: React.FC<{
  group: TournamentPlayer[];
  userId: string;
  isDoubles: boolean;
  defaultOpen?: boolean;
  pairingMatches?: TournamentMatch[];
  schedule?: ScheduleApi;
  // A creator who's also playing uses the same Enter/Edit Score flow as the Match List (RRGroupCard).
  isCreator?: boolean;
  // uid → contact details, so we can show the phone number (email only when no phone).
  contactMap?: Record<string, { phone?: string; email?: string; whatsapp_contact?: string; whatsapp_same_as_phone?: boolean }>;
}> = ({ group, userId, isDoubles, defaultOpen = false, pairingMatches, schedule, isCreator, contactMap }) => {
  const others = group.filter((p) => p.user_id !== userId);
  const [open, setOpen] = useState(defaultOpen);
  if (others.length === 0) return null;

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <span className="text-xs uppercase tracking-widest text-fg/50 font-bold">Your Group</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-fg/40 group-hover:text-fg/70 transition-colors" />
          : <ChevronDown className="w-4 h-4 text-fg/40 group-hover:text-fg/70 transition-colors" />}
      </button>

      {open && (
      <div className="space-y-3">
        {others.map((p) => {
          const c = contactMap?.[p.user_id];
          const m = pairingMatches?.find((mm) => mm.player_1_user_id === p.user_id || mm.player_2_user_id === p.user_id);
          const canSchedule = !!schedule && !!m && !m.id.startsWith('preview_');
          const isComplete = m?.status === 'complete';
          const badge = canSchedule ? scheduleBadge(m!) : null;
          const showAskInline = canSchedule && !isComplete && !getScheduleState(m!).requested;
          const showSubmitInline = canSchedule && !!schedule!.onSubmitScore && (
            isCreator || (!isComplete && !!schedule!.submittableMatchIds?.has(m!.id))
          );
          const submitLabel = isCreator ? (isComplete ? 'Edit Score' : 'Enter Score') : 'Submit Score';

          return (
            <div key={p.user_id} className="rounded-2xl border border-fg/5 overflow-hidden">
              {/* Sleek single row — matches the Upcoming Matches list on the Profile page. */}
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 min-h-[44px] flex-wrap">
                {p.user_id ? (
                  <Link to={`/players/${p.user_id}`} className="flex-1 min-w-[4.5rem] text-sm font-semibold text-fg truncate hover:text-clay transition-colors">
                    {formatPlayerName(p.name)}
                  </Link>
                ) : (
                  <span className="flex-1 min-w-[4.5rem] text-sm font-semibold text-fg truncate">{formatPlayerName(p.name)}</span>
                )}
                {badge && (
                  <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[9px] font-bold border ${badge.cls}`}>{badge.text}</span>
                )}
                {showAskInline && (
                  <button type="button" className={pillButtonCls('sm', 'clay')} onClick={() => schedule!.onAskOrganizer(m!)}>Schedule</button>
                )}
                {showSubmitInline && (
                  <button type="button" className={pillButtonCls('sm', 'clay')} onClick={() => schedule!.onSubmitScore!(m!)}>{submitLabel}</button>
                )}
                <ContactOpponentButton
                  name={formatPlayerName(p.name)}
                  phone={c?.phone}
                  email={c?.email}
                  whatsappContact={c?.whatsapp_contact}
                  whatsappSameAsPhone={c?.whatsapp_same_as_phone}
                  variant="white"
                  size="sm"
                />
              </div>
            </div>
          );
        })}

        {/* No-show rule — shown once for the whole group */}
        <p className="text-[11px] text-fg/40 leading-snug px-1">
          Play on weekend matchdays — schedule set by the organizer. Both players must attend; if only one shows up, they advance.
        </p>
      </div>
      )}
    </div>
  );
};
