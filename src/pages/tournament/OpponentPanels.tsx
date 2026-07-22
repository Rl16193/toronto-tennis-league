import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TournamentMatch, TournamentPlayer } from './types';
import { formatPlayerName, formatScheduledDate, formatSetScores, getScheduleState } from './utils';
import { ScheduleControls, type ScheduleApi } from './ScheduleControls';
import { ContactOpponentButton } from './ContactOpponentButton';

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

const ProfileLink: React.FC<{ userId: string }> = ({ userId }) =>
  userId ? (
    <Link
      to={`/players/${userId}`}
      className="inline-flex items-center px-3 py-1.5 rounded-lg bg-clay text-white text-xs font-bold hover:bg-clay/80 transition-colors whitespace-nowrap"
    >
      View Profile
    </Link>
  ) : null;

// Shared scheduling status badge for a match — used by both the bracket (Your Match) and the
// round-robin (Your Group) panels so they read identically. A completed match is always
// "Completed" (and scheduling is locked wherever this is shown).
const scheduleBadge = (m: TournamentMatch): { text: string; cls: string } => {
  const isComplete = m.status === 'complete';
  const st = getScheduleState(m);
  const cls = isComplete || st?.status === 'scheduled'
    ? 'bg-green-500/15 text-green-300 border-green-500/25'
    : 'bg-white/5 text-white/60 border-white/10';
  const text = isComplete
    ? 'Completed'
    : st?.status === 'scheduled'
      ? `Scheduled on ${formatScheduledDate(st.date, st.slot ?? '')}`
      : 'Unscheduled';
  return { text, cls };
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
    <div className="rounded-2xl border border-white/10 bg-tennis-dark/50 overflow-hidden">
      {rows.map((r, i) => (
        <div key={i} className={`flex items-center justify-between gap-3 px-3.5 h-11 ${i === 1 ? 'border-t border-white/10' : ''}`}>
          <span className={`text-sm truncate ${r.won ? 'text-clay font-bold' : 'text-white/90'}`}>{formatPlayerName(r.name)}</span>
          {r.won && <span className="text-[10px] uppercase tracking-widest text-clay font-bold shrink-0">Won</span>}
        </div>
      ))}
      {done && score && (
        <div className="border-t border-white/10 px-3.5 py-1.5 text-[11px] font-mono tracking-wide text-white/50">{score}</div>
      )}
    </div>
  );
};

export const OpponentCard: React.FC<{
  opponent: OpponentRow;
  defaultOpen?: boolean;
  currentMatch?: TournamentMatch | null;
  schedule?: ScheduleApi;
}> = ({ opponent, defaultOpen = false, currentMatch, schedule }) => {
  const [open, setOpen] = useState(defaultOpen);
  const canSchedule = !!currentMatch && !!schedule && !currentMatch.id.startsWith('preview_');
  const isComplete = currentMatch?.status === 'complete';
  const badge = canSchedule ? scheduleBadge(currentMatch!) : null;

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <span className="text-xs uppercase tracking-widest text-white/50 font-bold">Your Match</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors" />
          : <ChevronDown className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors" />}
      </button>

      {open && (
        <div className="space-y-3">
          {opponent.round && (
            <p className="text-[10px] uppercase tracking-widest text-clay font-bold">{opponent.round}</p>
          )}
          {currentMatch && <CurrentMatchCell match={currentMatch} />}

          {/* RR-style card: status badge · opponent · contact · View Profile. Contact is read-only
              (you can't edit another player's profile). Phone first, email as a fallback. */}
          <div className="rounded-2xl border border-white/10 bg-tennis-surface/30 p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:gap-y-0">
              {badge && (
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border shrink-0 ${badge.cls}`}>{badge.text}</span>
              )}
              <div className="min-w-0">
                <p className="text-white font-bold">{opponent.name}</p>
                {opponent.phone || opponent.email
                  ? <p className="text-white/70 text-sm break-all">{opponent.phone || opponent.email}</p>
                  : <p className="text-white/40 text-sm">No contact on file</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ContactOpponentButton
                  name={opponent.name}
                  phone={opponent.phone}
                  email={opponent.email}
                  whatsappContact={opponent.whatsappContact}
                  whatsappSameAsPhone={opponent.whatsappSameAsPhone}
                />
                <ProfileLink userId={opponent.userId} />
              </div>
            </div>
          </div>

          {/* Scheduling is locked once the match is complete. */}
          {canSchedule && !isComplete && <ScheduleControls match={currentMatch!} api={schedule!} />}
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
  // uid → contact details, so we can show the phone number (email only when no phone).
  contactMap?: Record<string, { phone?: string; email?: string; whatsapp_contact?: string; whatsapp_same_as_phone?: boolean }>;
}> = ({ group, userId, isDoubles, defaultOpen = false, pairingMatches, schedule, contactMap }) => {
  const others = group.filter((p) => p.user_id !== userId);
  const [open, setOpen] = useState(defaultOpen);
  if (others.length === 0) return null;

  // Phone first, email only if no phone, then the match-snapshot contact as a last resort.
  const contactFor = (p: TournamentPlayer) => {
    const c = contactMap?.[p.user_id];
    return c?.phone || c?.email || p.contact || '';
  };

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <span className="text-xs uppercase tracking-widest text-white/50 font-bold">Your Group</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors" />
          : <ChevronDown className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors" />}
      </button>

      {open && (
      <div className="space-y-3">
        {others.map((p) => {
          const contact = contactFor(p);
          const c = contactMap?.[p.user_id];
          const m = pairingMatches?.find((mm) => mm.player_1_user_id === p.user_id || mm.player_2_user_id === p.user_id);
          const canSchedule = !!schedule && !!m && !m.id.startsWith('preview_');
          const isComplete = m?.status === 'complete';
          const badge = canSchedule ? scheduleBadge(m!) : null;

          return (
            <div key={p.user_id} className="rounded-2xl border border-white/10 bg-tennis-dark/40 p-4 space-y-2.5">
              {/* Row 1: status badge · name · contact · Contact/View Profile
                  Mobile: flex-wrap. Desktop: 4-col grid so items spread across the full card. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-x-4 sm:gap-y-0">
                {badge && (
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border shrink-0 ${badge.cls}`}>{badge.text}</span>
                )}
                <span className="text-white font-bold text-sm">{formatPlayerName(p.name)}</span>
                <span className="text-white/50 text-xs">{contact || '—'}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <ContactOpponentButton
                    name={formatPlayerName(p.name)}
                    phone={c?.phone}
                    email={c?.email}
                    whatsappContact={c?.whatsapp_contact}
                    whatsappSameAsPhone={c?.whatsapp_same_as_phone}
                    size="sm"
                  />
                  {p.user_id && (
                    <Link
                      to={`/players/${p.user_id}`}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg bg-clay text-white text-xs font-bold hover:bg-clay/80 transition-colors whitespace-nowrap"
                    >
                      View Profile
                    </Link>
                  )}
                </div>
              </div>
              {/* Row 2: Request Scheduling Assistance — locked once complete. */}
              {canSchedule && !isComplete && (
                <ScheduleControls match={m!} api={schedule!} hideRule hideBadge buttonLayout="grid-2" className="space-y-2" />
              )}
            </div>
          );
        })}

        {/* No-show rule — shown once for the whole group */}
        <p className="text-[11px] text-white/40 leading-snug px-1">
          Play on weekend matchdays — schedule set by the organizer. Both players must attend; if only one shows up, they advance.
        </p>
      </div>
      )}
    </div>
  );
};
