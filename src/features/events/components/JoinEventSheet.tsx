import React, { useState } from 'react';
import { Button } from '../../../components/Button';
import { Sheet } from '../../../components/Sheet';
import { MemberSearchInput, type MemberPick } from '../../members/MemberSearchInput';
import { useAuth } from '../../../context/AuthContext';
import { DisplayEvent } from '../services/eventService';
import { isTournamentEvent } from '../../../utils/eventTypes';
import { JoinFormState, SlotResult } from '../types';
import { DOUBLES_DIVISIONS } from '../../../pages/tournament/types';

const SINGLES_DIVISIONS = ["Men's", "Women's"] as const;

type Props = {
  event: DisplayEvent;
  isLate: boolean;
  seniorsEligible: boolean; // profile age bracket is 55+
  joinForm: JoinFormState;
  setJoinForm: (form: JoinFormState) => void;
  joinError: string;
  slotStatus: SlotResult | null;
  loadingMatches?: boolean;
  slotFallbackConfirmed: boolean;
  setSlotFallbackConfirmed: (v: boolean) => void;
  joining: boolean;
  onSubmitJoin: () => void;
  onClose: () => void;
};

const chip = (active: boolean) =>
  `px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
    active ? 'bg-clay text-white border-clay' : 'bg-white text-ink border-fg hover:bg-white/90'
  }`;

// Join flow as a bottom sheet (wireframe 1g) — format chips, division chips, partner fields,
// notices, submit. Extracted from the old in-card expanding form so the events grid never
// reflows, and the flow matches every other sheet in the app.
export const JoinEventSheet: React.FC<Props> = ({
  event, isLate, seniorsEligible, joinForm, setJoinForm, joinError,
  slotStatus, loadingMatches, slotFallbackConfirmed, setSlotFallbackConfirmed,
  joining, onSubmitJoin, onClose,
}) => {
  const { user } = useAuth();
  const currentUserId = user?.uid;
  const isTournament = isTournamentEvent(event);
  const fixedChoice = event.tournament_choice; // set on new events; undefined on old events

  // ONE source of truth. This used to be `fixedChoice ?? joinForm.tournamentChoice` for display
  // while validation and the Firestore write both read `joinForm.tournamentChoice`, reconciled
  // only by an effect that wrote back a stale copy of the form — and the parent resets that same
  // form to Singles on every event change. When the two drifted apart a player filled in a
  // Doubles-looking form and Singles was saved, with the partner-name check (keyed on the other
  // value) never firing. That's how four Zephyr Open Doubles signups ended up invisible.
  // `useJoin` now seeds the form from the event, and the submit path re-derives it from the
  // event too, so a locked event cannot save the wrong format.
  const displayChoice = joinForm.tournamentChoice;
  const divisions = displayChoice === 'Doubles' ? DOUBLES_DIVISIONS : SINGLES_DIVISIONS;

  // The picked partner. Only the name and "is a member" reach Firestore (`doubles` /
  // `partner_in_app`), so the member id is transient and lives here rather than in joinForm.
  // The sheet remounts per event alongside the form reset, so the two can't drift.
  const [partnerPick, setPartnerPick] = useState<MemberPick | null>(null);

  // No visible title — the event name already reads on the card behind this sheet. ariaLabel keeps
  // the dialog named for screen readers now that no heading is drawn.
  return (
    <Sheet onClose={onClose} ariaLabel={`Join ${event.title}`} maxWidthClassName="max-w-md">
      <div className="p-6 pt-3 space-y-4">
        {isTournament ? (
          <>
            {/* Format — only for old events without a locked tournament_choice */}
            {!fixedChoice && (
              <div>
                <p className="text-xs font-bold text-fg/70 uppercase tracking-widest mb-2">Format</p>
                <div className="flex gap-2">
                  {(['Singles', 'Doubles'] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setJoinForm({ ...joinForm, tournamentChoice: choice, division: '', seniors: false })}
                      className={`flex-1 ${chip(joinForm.tournamentChoice === choice)}`}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Division */}
            <div>
              <p className="text-xs font-bold text-fg/70 uppercase tracking-widest mb-2">Division</p>
              <div className="flex flex-wrap gap-2">
                {divisions.map((div) => (
                  <button
                    key={div}
                    type="button"
                    onClick={() => setJoinForm({ ...joinForm, division: div as JoinFormState['division'] })}
                    className={chip(joinForm.division === div)}
                  >
                    {div}
                  </button>
                ))}
              </div>
            </div>

            {/* Retired Pro 55+ opt-in — singles only, shown only to eligible players */}
            {displayChoice === 'Singles' && seniorsEligible && (
              <button
                type="button"
                onClick={() => setJoinForm({ ...joinForm, seniors: !joinForm.seniors })}
                className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                  joinForm.seniors ? 'border-clay/50 bg-clay/10' : 'border-fg/10 bg-fg/5 hover:border-fg/30'
                }`}
                aria-pressed={joinForm.seniors}
              >
                <span>
                  <span className="block text-sm font-bold text-fg">Join the Retired Pro draw (55+)</span>
                  <span className="block text-xs text-fg/70 mt-0.5">Play in the age-based Retired Pro group instead of skill routing.</span>
                </span>
                <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                  joinForm.seniors ? 'bg-clay border-clay text-white text-xs' : 'border-fg/20'
                }`}>
                  {joinForm.seniors ? '✓' : ''}
                </span>
              </button>
            )}

            {/* Doubles-only fields */}
            {displayChoice === 'Doubles' && (
              <>
                {/* Autosearch instead of free text. A doubles team is only recognised when both
                    partners name each other exactly (deduplicateDoublesTeams), so a typo here
                    silently leaves two half-teams. Picking from the roster also answers "is your
                    partner in the app?" by itself, so that manual Yes/No question is gone. */}
                <MemberSearchInput
                  label="Partner"
                  value={partnerPick}
                  onChange={(pick) => {
                    setPartnerPick(pick);
                    setJoinForm({
                      ...joinForm,
                      partnerName: pick?.name ?? '',
                      partnerInApp: pick && pick.memberId ? 'yes' : 'no',
                      partnerUid: pick?.memberId ?? '',
                    });
                  }}
                  excludeId={currentUserId}
                  allowGuest
                  placeholder="Search for your partner…"
                  hint="Not on the app yet? Type their full name and pick “not on the app”."
                />
                <div>
                  <p className="text-xs font-bold text-fg/70 uppercase tracking-widest mb-2">Combined Skill (1–5)</p>
                  <input
                    type="number"
                    min={1} max={5} step={0.5}
                    value={joinForm.combinedSkill}
                    onChange={(e) => setJoinForm({ ...joinForm, combinedSkill: e.target.value })}
                    placeholder="e.g. 3.5"
                    className="border border-fg/25 w-full rounded-xl bg-tennis-dark/70 px-3 py-2.5 text-sm text-fg outline-none focus:border-clay"
                  />
                </div>
              </>
            )}

            {isLate && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                <p className="font-semibold">Late registration. Limited spots remaining.</p>
                <p className="mt-0.5 text-amber-300/70">You'll be placed directly into an open draw slot.</p>
              </div>
            )}

            {slotStatus?.status === 'fallback' && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                <p className="font-semibold mb-1">
                  {slotStatus.intendedGroup} draw is full — you'll be placed in the {slotStatus.actualGroup} draw.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={slotFallbackConfirmed}
                    onChange={(e) => setSlotFallbackConfirmed(e.target.checked)}
                    className="accent-clay"
                  />
                  I understand and wish to continue
                </label>
              </div>
            )}
            {slotStatus?.status === 'full' && (
              <p className="text-xs text-red-400 font-semibold">This draw is currently full.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-fg/70">Reserve your spot in this event.</p>
        )}

        {joinError && <p className="text-xs font-semibold text-red-400">{joinError}</p>}

        <Button
          onClick={onSubmitJoin}
          isLoading={joining || loadingMatches}
          disabled={joining || loadingMatches || slotStatus?.status === 'full' || (slotStatus?.status === 'fallback' && !slotFallbackConfirmed)}
          className="w-full"
        >
          {loadingMatches ? 'Loading draw…' : 'Join Event'}
        </Button>
      </div>
    </Sheet>
  );
};
