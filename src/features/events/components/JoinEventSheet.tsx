import React, { useEffect } from 'react';
import { Button } from '../../../components/Button';
import { Sheet } from '../../../components/Sheet';
import { DisplayEvent } from '../services/eventService';
import { isTournamentEvent } from '../../../utils/eventTypes';
import { JoinFormState, SlotResult } from '../types';

const SINGLES_DIVISIONS = ["Men's", "Women's"] as const;
const DOUBLES_DIVISIONS = ["Men's", "Women's", 'Mixed Doubles'] as const;

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
  const isTournament = isTournamentEvent(event);
  const fixedChoice = event.tournament_choice; // set on new events; undefined on old events
  const displayChoice = fixedChoice ?? joinForm.tournamentChoice;
  const divisions = displayChoice === 'Doubles' ? DOUBLES_DIVISIONS : SINGLES_DIVISIONS;

  // Events with a locked format must submit under it — the form state resets to Singles when
  // the sheet opens, so sync it to the event's fixed choice.
  useEffect(() => {
    if (fixedChoice && joinForm.tournamentChoice !== fixedChoice) {
      setJoinForm({ ...joinForm, tournamentChoice: fixedChoice, division: '', seniors: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedChoice, joinForm.tournamentChoice]);

  return (
    <Sheet onClose={onClose} title={`Join — ${event.title}`} maxWidthClassName="max-w-md">
      <div className="p-6 pt-3 space-y-4">
        {isTournament ? (
          <>
            {/* Format — only for old events without a locked tournament_choice */}
            {!fixedChoice && (
              <div>
                <p className="text-xs font-bold text-fg/50 uppercase tracking-widest mb-2">Format</p>
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
              <p className="text-xs font-bold text-fg/50 uppercase tracking-widest mb-2">Division</p>
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
                  <span className="block text-xs text-fg/50 mt-0.5">Play in the age-based Retired Pro group instead of skill routing.</span>
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
                <div>
                  <p className="text-xs font-bold text-fg/50 uppercase tracking-widest mb-2">Partner Name</p>
                  <input
                    value={joinForm.partnerName}
                    onChange={(e) => setJoinForm({ ...joinForm, partnerName: e.target.value })}
                    placeholder="Full name"
                    className="w-full rounded-xl bg-tennis-dark/70 border border-fg/10 px-3 py-2.5 text-sm text-fg outline-none focus:border-clay"
                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-fg/50 uppercase tracking-widest mb-2">Partner in app?</p>
                  <div className="flex gap-2">
                    {(['yes', 'no'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setJoinForm({ ...joinForm, partnerInApp: v })}
                        className={`flex-1 ${chip(joinForm.partnerInApp === v)}`}
                      >
                        {v === 'yes' ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-fg/50 uppercase tracking-widest mb-2">Combined Skill (1–5)</p>
                  <input
                    type="number"
                    min={1} max={5} step={0.5}
                    value={joinForm.combinedSkill}
                    onChange={(e) => setJoinForm({ ...joinForm, combinedSkill: e.target.value })}
                    placeholder="e.g. 3.5"
                    className="w-full rounded-xl bg-tennis-dark/70 border border-fg/10 px-3 py-2.5 text-sm text-fg outline-none focus:border-clay"
                  />
                </div>
              </>
            )}

            {isLate && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                <p className="font-semibold">Late registration — limited spots remaining.</p>
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
