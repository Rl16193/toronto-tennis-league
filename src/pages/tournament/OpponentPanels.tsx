import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { TournamentMatch, TournamentPlayer } from './types';
import type { ContactMethod } from '../../types';
import { formatPlayerName, formatScheduledDate, getScheduleState } from './utils';
import { ScheduleControls, type ScheduleApi } from './TournamentElements';
import { ContactOpponentButton, pillButtonCls } from '../../components/ContactOpponentButton';
import { sharesCourt } from '../../utils/courtOverlap';
import { NearbyPill } from '../../components/NearbyPill';
import { AvailabilityPills } from '../../components/AvailabilityPills';
import { skillBand } from './utils';

// ─── Bracket: your matches + potential next-round opponents ──────────────────────

export type OpponentRow = {
  round: string;
  name: string;
  userId: string;
  email: string;
  phone: string;
  whatsappContact: string;
  whatsappSameAsPhone: boolean;
  preferredContactMethods?: ContactMethod[];
  skill: number | null;
  wins: number;
  losses: number;
};

// Shared scheduling status badge for a match — used by both the bracket (Your Match) and the
// round-robin (Your Group) panels so they read identically. A completed match reads "Win"/"Loss"
// from the given viewer's perspective (falls back to "Completed" if no viewer/winner is known —
// shouldn't normally happen here, both call sites always pass the signed-in user). No badge at
// all once unscheduled — that's the default state, so showing it just crowds the row and
// squeezes the player's name.
const scheduleBadge = (m: TournamentMatch, viewerUid?: string): { text: string; cls: string } | null => {
  if (m.status === 'complete') {
    if (viewerUid && m.winner_uid) {
      const won = m.winner_uid === viewerUid;
      return won
        ? { text: 'Win', cls: 'bg-green-500/15 text-badge-win border-green-500/25' }
        : { text: 'Loss', cls: 'bg-red-500/15 text-badge-loss border-red-500/25' };
    }
    return { text: 'Completed', cls: 'bg-green-500/15 text-badge-win border-green-500/25' };
  }
  const st = getScheduleState(m);
  if (st?.status === 'scheduled') {
    return { text: `Scheduled on ${formatScheduledDate(st.date, st.slot ?? '')}`, cls: 'bg-green-500/15 text-badge-win border-green-500/25' };
  }
  return null;
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
  // Signed-in user, so the badge can read "Win"/"Loss" instead of a generic "Completed". The
  // full score is still visible in the draw itself — this card is just the quick-glance row.
  viewerUid?: string;
  // For the "Nearby" pill: the viewer's own preferred courts, and uid → preferred courts for
  // everyone in the event (both already loaded by useTournament for RR zone grouping).
  myCourts?: Set<string>;
  courtsMap?: Record<string, string[]>;
  availabilityMap?: Record<string, string[]>;
}> = ({ opponent, defaultOpen = false, currentMatch, schedule, isCreator, viewerUid, myCourts, courtsMap, availabilityMap }) => {
  const [open, setOpen] = useState(defaultOpen);
  const canSchedule = !!currentMatch && !!schedule && !currentMatch.id.startsWith('preview_');
  const isComplete = currentMatch?.status === 'complete';
  const badge = canSchedule ? scheduleBadge(currentMatch!, viewerUid) : null;
  const showAskInline = canSchedule && !isComplete && !getScheduleState(currentMatch!).requested;
  const showSubmitInline = canSchedule && !!schedule!.onSubmitScore && (
    isCreator || (!isComplete && !!schedule!.submittableMatchIds?.has(currentMatch!.id))
  );
  const submitLabel = isCreator ? 'Score' : 'Submit Score';

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <span className="text-xs uppercase tracking-widest text-fg/70 font-bold">Your Match</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-fg/70 group-hover:text-fg/70 transition-colors" />
          : <ChevronDown className="w-4 h-4 text-fg/70 group-hover:text-fg/70 transition-colors" />}
      </button>

      {open && (
        <div className="space-y-3">
          {opponent.round && (
            <p className="text-[10px] uppercase tracking-widest text-clay font-bold">{opponent.round}</p>
          )}

          {/* Two-column row: left is name/skill, tier, availability (3 lines); right is
              schedule/score actions, then Contact (2 lines) — matches the Round Robin "Your
              Group" panel and the Upcoming Matches list on the Profile page. The full score is
              still visible in the draw below this card; this row is just the quick-glance
              summary. Read-only (you can't edit another player's profile); phone first,
              email/WhatsApp as fallbacks. */}
          <div className="rounded-2xl overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {opponent.userId ? (
                    <Link to={`/players/${opponent.userId}`} className="text-sm font-semibold text-fg truncate hover:text-clay transition-colors">
                      {opponent.name}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-fg truncate">{opponent.name}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {opponent.skill != null && opponent.skill > 0 && (
                    <span className="text-[11px] text-fg/70">Skill {opponent.skill} · {skillBand(opponent.skill)}</span>
                  )}
                  <NearbyPill show={!!myCourts && sharesCourt(courtsMap?.[opponent.userId], myCourts)} />
                </div>
                <AvailabilityPills tags={availabilityMap?.[opponent.userId]} />
              </div>
              {/* min-w-0 + a truncating badge: "Scheduled on <long date>" used to set this
                  column's max-content width and force the whole row wider than a phone. */}
              <div className="min-w-0 flex flex-col items-end gap-1.5 shrink-0">
                <ContactOpponentButton
                  name={opponent.name}
                  phone={opponent.phone}
                  email={opponent.email}
                  whatsappContact={opponent.whatsappContact}
                  whatsappSameAsPhone={opponent.whatsappSameAsPhone}
                  preferred={opponent.preferredContactMethods}
                  variant="white"
                  size="sm"
                />
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {badge && (
                    <span className={`max-w-[9rem] truncate px-2 py-0.5 rounded-lg text-[9px] font-bold border ${badge.cls}`}>{badge.text}</span>
                  )}
                  {showAskInline && (
                    <button type="button" className={pillButtonCls('sm', 'clay')} onClick={() => schedule!.onAskOrganizer(currentMatch!)}>Schedule</button>
                  )}
                  {showSubmitInline && (
                    <button type="button" className={pillButtonCls('sm', 'clay')} onClick={() => schedule!.onSubmitScore!(currentMatch!)}>{submitLabel}</button>
                  )}
                </div>
              </div>
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
  contactMap?: Record<string, { phone?: string; email?: string; whatsapp_contact?: string; whatsapp_same_as_phone?: boolean; preferred_mode_of_contact?: ContactMethod[] }>;
  // For the "Nearby" pill: the viewer's own preferred courts, and uid → preferred courts.
  myCourts?: Set<string>;
  courtsMap?: Record<string, string[]>;
  availabilityMap?: Record<string, string[]>;
}> = ({ group, userId, isDoubles, defaultOpen = false, pairingMatches, schedule, isCreator, contactMap, myCourts, courtsMap, availabilityMap }) => {
  const others = group.filter((p) => p.uid !== userId);
  const [open, setOpen] = useState(defaultOpen);
  if (others.length === 0) return null;

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <span className="text-xs uppercase tracking-widest text-fg/70 font-bold">Your Group</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-fg/70 group-hover:text-fg/70 transition-colors" />
          : <ChevronDown className="w-4 h-4 text-fg/70 group-hover:text-fg/70 transition-colors" />}
      </button>

      {open && (
      <div className="space-y-3">
        {others.map((p) => {
          const c = contactMap?.[p.uid];
          const m = pairingMatches?.find((mm) => mm.player_1_uid === p.uid || mm.player_2_uid === p.uid);
          const canSchedule = !!schedule && !!m && !m.id.startsWith('preview_');
          const isComplete = m?.status === 'complete';
          const badge = canSchedule ? scheduleBadge(m!, userId) : null;
          const showAskInline = canSchedule && !isComplete && !getScheduleState(m!).requested;
          const showSubmitInline = canSchedule && !!schedule!.onSubmitScore && (
            isCreator || (!isComplete && !!schedule!.submittableMatchIds?.has(m!.id))
          );
          const submitLabel = isCreator ? 'Score' : 'Submit Score';

          return (
            <div key={p.uid} className="rounded-2xl overflow-hidden">
              {/* Two-column row: left is name/skill, tier, availability (3 lines); right is
                  schedule/score actions, then Contact (2 lines) — matches OpponentCard and the
                  Upcoming Matches list on the Profile page. */}
              <div className="flex items-start justify-between gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {p.uid ? (
                      <Link to={`/players/${p.uid}`} className="text-sm font-semibold text-fg truncate hover:text-clay transition-colors">
                        {formatPlayerName(p.name)}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-fg truncate">{formatPlayerName(p.name)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!!p.skillLevel && <span className="text-[11px] text-fg/70">Skill {p.skillLevel} · {skillBand(p.skillLevel)}</span>}
                    <NearbyPill show={!!myCourts && sharesCourt(courtsMap?.[p.uid], myCourts)} />
                  </div>
                  <AvailabilityPills tags={availabilityMap?.[p.uid]} />
                </div>
                {/* min-w-0 + a truncating badge: "Scheduled on <long date>" used to set this
                  column's max-content width and force the whole row wider than a phone. */}
              <div className="min-w-0 flex flex-col items-end gap-1.5 shrink-0">
                  <ContactOpponentButton
                    name={formatPlayerName(p.name)}
                    phone={c?.phone}
                    email={c?.email}
                    whatsappContact={c?.whatsapp_contact}
                    whatsappSameAsPhone={c?.whatsapp_same_as_phone}
                    preferred={c?.preferred_mode_of_contact}
                    variant="white"
                    size="sm"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {badge && (
                      <span className={`max-w-[9rem] truncate px-2 py-0.5 rounded-lg text-[9px] font-bold border ${badge.cls}`}>{badge.text}</span>
                    )}
                    {showAskInline && (
                      <button type="button" className={pillButtonCls('sm', 'clay')} onClick={() => schedule!.onAskOrganizer(m!)}>Schedule</button>
                    )}
                    {showSubmitInline && (
                      <button type="button" className={pillButtonCls('sm', 'clay')} onClick={() => schedule!.onSubmitScore!(m!)}>{submitLabel}</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* No-show rule — shown once for the whole group */}
        <p className="text-[11px] text-fg/70 leading-snug px-1">
          Matchdays. Schedule prepared by organizer based on your availability.
        </p>
      </div>
      )}
    </div>
  );
};
