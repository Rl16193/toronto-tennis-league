import React, { useEffect, useMemo, useState } from 'react';
import { Shuffle, Swords, Check, Lock, X } from 'lucide-react';
import { TennisEvent } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ContactOpponentButton } from '../../pages/tournament/ContactOpponentButton';
import { DIV_TABS, DivTab, LeagueRow, inDivision, useStandings } from './useStandings';
import { useLadder } from './useLadder';
import { useCrossEventConflicts } from './useCrossEventConflicts';
import {
  LADDER_CHALLENGES_PER_WEEK,
  LADDER_COOLDOWN_DAYS,
  LadderChallenge,
  LadderDivision,
  cancelChallenge,
  confirmChallenge,
  createChallenge,
  rejectChallenge,
  reportChallenge,
} from './ladderService';

// Ladders run for singles gender divisions only.
const LADDER_DIVS = DIV_TABS.filter((t) => t.id !== 'doubles');

// Rank ordering: points desc, then matches played desc, then name — deterministic so the ±5
// window is stable even when many players are level on points.
const sortRows = (a: LeagueRow, b: LeagueRow) =>
  b.leaguePoints26 - a.leaguePoints26 ||
  b.matchesPlayed - a.matchesPlayed ||
  a.name.localeCompare(b.name);

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// "Generate new Opponent" is limited to twice per day (per player, per device — a soft
// guardrail so people engage with their ±5 window instead of re-rolling all day).
const RANDOM_USES_PER_DAY = 2;
const randomUsesKey = (uid: string) => {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `ladder_random_${uid}_${day}`;
};
const getRandomUses = (uid: string): number => {
  try { return Number(localStorage.getItem(randomUsesKey(uid))) || 0; } catch { return 0; }
};
const bumpRandomUses = (uid: string): number => {
  const next = getRandomUses(uid) + 1;
  try { localStorage.setItem(randomUsesKey(uid), String(next)); } catch { /* storage unavailable */ }
  return next;
};

export const LadderView: React.FC<{ event: TennisEvent; isCreator: boolean }> = ({ event, isCreator }) => {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const myName = profile?.user?.name || profile?.stats?.name || 'You';

  const { rows, loading } = useStandings();
  const { challengesReady, myChallenges, incoming, reported, contactMap, stateWith, weeklyChallengesLeft } = useLadder(event.id, uid);
  const conflicts = useCrossEventConflicts(uid, event.id);
  const weeklyLimitReached = weeklyChallengesLeft === 0;

  const myDivision: LadderDivision | null = useMemo(() => {
    const league = profile?.stats?.league || '';
    if (inDivision(league, 'mens')) return 'mens';
    if (inDivision(league, 'womens')) return 'womens';
    return null;
  }, [profile?.stats?.league]);

  const [activeTab, setActiveTab] = useState<DivTab>(myDivision ?? 'mens');
  // Land on the player's own division once the profile resolves.
  useEffect(() => { if (myDivision) setActiveTab(myDivision); }, [myDivision]);
  const [randomPick, setRandomPick] = useState<LeagueRow | null>(null);
  const [randomUses, setRandomUses] = useState(0);
  // Locks the button the instant a challenge is sent, without waiting on the Firestore snapshot.
  const [justChallenged, setJustChallenged] = useState<Set<string>>(new Set());
  const [reportFor, setReportFor] = useState<LadderChallenge | null>(null);
  const [busy, setBusy] = useState(false);

  // Restore today's generate count (resets daily via the date-stamped key).
  useEffect(() => { if (uid) setRandomUses(getRandomUses(uid)); }, [uid]);

  const divisionRows = useMemo(
    () => rows.filter((r) => inDivision(r.league, activeTab)).sort(sortRows),
    [rows, activeTab],
  );

  const myIndex = uid ? divisionRows.findIndex((r) => r.user_id === uid) : -1;
  const iAmRanked = myIndex >= 0;
  const iAmUnranked = !!uid && myDivision === activeTab && !iAmRanked;
  const canPlay = !!uid && myDivision === activeTab;

  // The ±5 window (5 above, 5 below): 11 rows centered on me, clamped at the edges. An unranked
  // player sees the bottom 10 ranked players — their challenge targets to break into the table.
  const { windowRows, windowStart } = useMemo(() => {
    const n = divisionRows.length;
    if (iAmRanked) {
      const start = clamp(myIndex - 5, 0, Math.max(0, n - 11));
      return { windowRows: divisionRows.slice(start, start + 11), windowStart: start };
    }
    const start = Math.max(0, n - 10);
    return { windowRows: divisionRows.slice(start), windowStart: start };
  }, [divisionRows, myIndex, iAmRanked]);

  const windowIds = useMemo(() => new Set(windowRows.map((r) => r.user_id)), [windowRows]);

  const randomLimitReached = randomUses >= RANDOM_USES_PER_DAY;

  const rollRandom = () => {
    if (!uid || randomLimitReached) return;
    const pool = divisionRows.filter((r) => r.user_id !== uid && !windowIds.has(r.user_id));
    setRandomPick(pool.length ? pool[Math.floor(Math.random() * pool.length)] : null);
    setRandomUses(bumpRandomUses(uid));
  };

  const challenge = async (row: LeagueRow) => {
    if (!uid || !canPlay || busy || weeklyLimitReached) return;
    if (challengeState(row.user_id) !== 'available') return; // already challenged / in cooldown
    setBusy(true);
    try {
      await createChallenge({
        eventId: event.id,
        division: activeTab as LadderDivision,
        challenger: { id: uid, name: myName },
        opponent: { id: row.user_id, name: row.name },
      });
      setJustChallenged((prev) => new Set(prev).add(row.user_id));
      setRandomPick(null);
    } finally {
      setBusy(false);
    }
  };

  // A player you've just challenged is locked immediately; the live snapshot then keeps it
  // locked ('pending') until the challenge resolves, after which the 7-day cooldown applies.
  // 'conflict' hard-blocks anyone you already have an active match with in another event
  // (prevents reporting the same physical match for both tournament and ladder points).
  const challengeState = (opponentId: string): 'available' | 'pending' | 'cooldown' | 'conflict' =>
    conflicts.has(opponentId) ? 'conflict'
      : justChallenged.has(opponentId) ? 'pending'
        : stateWith(opponentId);

  const rankOf = (idx: number) => windowStart + idx + 1;

  if (loading || !challengesReady) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-clay border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-5">
      {/* Division tabs */}
      <div className="flex gap-2">
        {LADDER_DIVS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id); setRandomPick(null); }}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold border transition-all ${
              activeTab === t.id ? 'bg-clay text-white border-clay' : 'bg-tennis-surface/40 text-white border-white/10 hover:border-white/30'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Organizer confirm queue */}
      {isCreator && reported.length > 0 && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
          <h3 className="text-sm font-bold text-amber-300 uppercase tracking-widest mb-3">Ladder results to confirm</h3>
          <div className="space-y-2">
            {reported.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-tennis-surface/40 px-3 py-2">
                <div className="text-sm text-white">
                  <span className="font-semibold">{c.challenger_name}</span> vs <span className="font-semibold">{c.opponent_name}</span>
                  <span className="text-white/60"> — winner <span className="text-tennis-lime font-semibold">{c.claimed_winner_name}</span>{c.score_line ? ` (${c.score_line})` : ''}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={async () => { setBusy(true); try { await confirmChallenge(c); } finally { setBusy(false); } }}
                    className="inline-flex items-center gap-1 rounded-lg bg-tennis-lime/90 hover:bg-tennis-lime text-tennis-dark px-3 py-1 text-xs font-bold"
                  >
                    <Check className="w-3.5 h-3.5" />Confirm
                  </button>
                  <button
                    disabled={busy}
                    onClick={async () => { setBusy(true); try { await rejectChallenge(c.id); } finally { setBusy(false); } }}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 px-3 py-1 text-xs font-bold"
                  >
                    <X className="w-3.5 h-3.5" />Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incoming challenges (someone challenged me) */}
      {incoming.map((c) => {
        const contact = contactMap[c.challenger_id];
        return (
          <div key={c.id} className="rounded-2xl border border-clay/40 bg-clay/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-white">
                <Swords className="inline w-4 h-4 text-clay mr-1.5" />
                <span className="font-bold">{c.challenger_name}</span> challenged you
                {c.status === 'reported' && <span className="text-white/60"> — result reported, awaiting organizer</span>}
              </div>
              <div className="flex items-center gap-2">
                <ContactOpponentButton
                  name={c.challenger_name}
                  phone={contact?.phone}
                  email={contact?.email}
                  whatsappContact={contact?.whatsapp_contact}
                  whatsappSameAsPhone={contact?.whatsapp_same_as_phone}
                  size="sm"
                />
                {c.status === 'open' && (
                  <button onClick={() => setReportFor(c)} className="rounded-lg bg-clay hover:bg-clay/90 text-white px-3 py-1 text-xs font-bold">
                    Report score
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* My outgoing challenges */}
      {myChallenges.map((c) => {
        const contact = contactMap[c.opponent_id];
        return (
          <div key={c.id} className="rounded-2xl border border-white/10 bg-tennis-surface/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-white">
                <Swords className="inline w-4 h-4 text-tennis-lime mr-1.5" />
                You challenged <span className="font-bold">{c.opponent_name}</span>
                {c.status === 'reported' && <span className="text-white/60"> — result reported, awaiting organizer</span>}
              </div>
              <div className="flex items-center gap-2">
                <ContactOpponentButton
                  name={c.opponent_name}
                  phone={contact?.phone}
                  email={contact?.email}
                  whatsappContact={contact?.whatsapp_contact}
                  whatsappSameAsPhone={contact?.whatsapp_same_as_phone}
                  size="sm"
                />
                {c.status === 'open' && (
                  <>
                    <button onClick={() => setReportFor(c)} className="rounded-lg bg-clay hover:bg-clay/90 text-white px-3 py-1 text-xs font-bold">
                      Report score
                    </button>
                    <button
                      disabled={busy}
                      onClick={async () => { setBusy(true); try { await cancelChallenge(c.id); } finally { setBusy(false); } }}
                      className="rounded-lg border border-white/20 text-white/70 hover:bg-white/10 px-3 py-1 text-xs font-bold"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Randomizer — limited to twice a day */}
      {canPlay && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={rollRandom}
              disabled={randomLimitReached}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-clay text-clay hover:bg-clay hover:text-white transition-colors px-4 py-2 text-sm font-bold disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-clay disabled:cursor-not-allowed"
            >
              <Shuffle className="w-4 h-4" />Generate new Opponent
            </button>
            {randomPick && (
              <div className="inline-flex items-center gap-3 rounded-xl bg-tennis-surface/40 border border-white/10 px-3 py-2">
                <span className="text-sm text-white font-semibold">{randomPick.name}</span>
                <span className="text-xs text-white/50">{randomPick.leaguePoints26} pts</span>
                <ChallengeButton state={challengeState(randomPick.user_id)} busy={busy} disabled={weeklyLimitReached} onClick={() => challenge(randomPick)} />
              </div>
            )}
          </div>
          {/* Usage indicators: weekly challenge allowance + daily generate allowance */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50">
            <span className="inline-flex items-center gap-1">
              <Swords className="w-3 h-3 text-clay" />
              Challenges left this week:{' '}
              <span className={`font-bold ${weeklyLimitReached ? 'text-amber-300' : 'text-white'}`}>
                {weeklyChallengesLeft} of {LADDER_CHALLENGES_PER_WEEK}
              </span>
              {weeklyLimitReached && <span className="text-amber-300/80">— resets Monday</span>}
            </span>
            <span className="inline-flex items-center gap-1">
              <Shuffle className="w-3 h-3 text-clay" />
              Generates left today:{' '}
              <span className={`font-bold ${randomLimitReached ? 'text-amber-300' : 'text-white'}`}>
                {Math.max(0, RANDOM_USES_PER_DAY - randomUses)} of {RANDOM_USES_PER_DAY}
              </span>
              {randomLimitReached && <span className="text-amber-300/80">— resets tomorrow</span>}
            </span>
          </div>
        </div>
      )}

      {/* The ladder window */}
      {divisionRows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-tennis-surface/20 p-8 text-center text-sm text-white/60">
          No ranked players in this division yet — win a match to get on the board.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-tennis-surface/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/50 text-xs uppercase tracking-widest">
                <th className="text-left font-semibold px-4 py-3 w-14">Rank</th>
                <th className="text-left font-semibold px-2 py-3">Player</th>
                <th className="text-right font-semibold px-2 py-3 w-16">Skill</th>
                <th className="text-right font-semibold px-2 py-3 w-16">Pts</th>
                <th className="px-4 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {windowRows.map((r, i) => {
                const isMe = r.user_id === uid;
                return (
                  <tr key={r.user_id} className={`border-t border-white/5 ${isMe ? 'bg-clay/10' : ''}`}>
                    <td className="px-4 py-3 font-bold text-white/80">{rankOf(i)}</td>
                    <td className="px-2 py-3 text-white font-semibold">
                      {r.name}{isMe && <span className="ml-2 text-xs text-clay font-bold">YOU</span>}
                    </td>
                    <td className="px-2 py-3 text-right text-white/70">{r.skill_level || '—'}</td>
                    <td className="px-2 py-3 text-right text-white/70">{r.leaguePoints26}</td>
                    <td className="px-4 py-3 text-right">
                      {canPlay && !isMe && (
                        <ChallengeButton state={challengeState(r.user_id)} busy={busy} disabled={weeklyLimitReached} onClick={() => challenge(r)} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {iAmUnranked && (
                <tr className="border-t border-white/5 bg-clay/10">
                  <td className="px-4 py-3 font-bold text-white/80">{divisionRows.length + 1}</td>
                  <td className="px-2 py-3 text-white font-semibold">{myName}<span className="ml-2 text-xs text-clay font-bold">YOU</span></td>
                  <td className="px-2 py-3 text-right text-white/70">{profile?.stats?.skill_level || '—'}</td>
                  <td className="px-2 py-3 text-right text-white/70">0</td>
                  <td className="px-4 py-3 text-right text-xs text-white/40">unranked</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {iAmUnranked && (
        <p className="text-xs text-white/50">
          You're not on the board yet — challenge a ranked player above and win to earn your first points.
        </p>
      )}
      {!canPlay && myDivision && myDivision !== activeTab && (
        <p className="text-xs text-white/50">Viewing the {LADDER_DIVS.find((t) => t.id === activeTab)?.label} ladder (read-only). Switch to your division to challenge.</p>
      )}

      {reportFor && (
        <ReportModal
          challenge={reportFor}
          busy={busy}
          onClose={() => setReportFor(null)}
          onSubmit={async (winner, scoreLine) => {
            setBusy(true);
            try {
              await reportChallenge(reportFor.id, winner, scoreLine);
              setReportFor(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
};

const ChallengeButton: React.FC<{
  state: 'available' | 'pending' | 'cooldown' | 'conflict';
  busy: boolean;
  /** Weekly allowance exhausted — button stays visible but inert (the indicator row explains). */
  disabled?: boolean;
  onClick: () => void;
}> = ({ state, busy, disabled, onClick }) => {
  // Locked: a live challenge already exists, you're in the 7-day rematch cooldown, or you
  // already have an active match with this player in another event (conflict). Rendered as an
  // inert pill so it's clearly "locked", not just missing.
  if (state === 'pending' || state === 'cooldown' || state === 'conflict') {
    const pill = {
      pending: { label: 'Challenged', title: 'Challenge already sent — report the result to unlock' },
      cooldown: { label: 'Cooldown', title: `Rematch cooldown — you can challenge again after ${LADDER_COOLDOWN_DAYS} days` },
      conflict: { label: 'In another event', title: 'You already have a match with this player in another active event — that game can only count once, so finish it there first' },
    }[state];
    return (
      <span
        title={pill.title}
        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 text-white/40 px-3 py-1 text-xs font-bold cursor-not-allowed"
      >
        <Lock className="w-3 h-3" />{pill.label}
      </span>
    );
  }
  return (
    <button
      disabled={busy || disabled}
      onClick={onClick}
      title={disabled ? 'Weekly challenge limit reached — resets Monday' : undefined}
      className="inline-flex items-center gap-1 rounded-lg bg-clay hover:bg-clay/90 text-white px-3 py-1 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Swords className="w-3.5 h-3.5" />Challenge
    </button>
  );
};

const ReportModal: React.FC<{
  challenge: LadderChallenge;
  busy: boolean;
  onClose: () => void;
  onSubmit: (winner: { id: string; name: string }, scoreLine: string) => void;
}> = ({ challenge, busy, onClose, onSubmit }) => {
  const [winnerId, setWinnerId] = useState(challenge.challenger_id);
  const [scoreLine, setScoreLine] = useState('');
  const winnerName = winnerId === challenge.challenger_id ? challenge.challenger_name : challenge.opponent_name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-tennis-surface border border-white/10 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-4">Report result</h3>
        <label className="block text-xs text-white/60 uppercase tracking-widest mb-1">Winner</label>
        <select
          value={winnerId}
          onChange={(e) => setWinnerId(e.target.value)}
          className="w-full rounded-xl bg-tennis-dark border border-white/10 text-white px-3 py-2 mb-4"
        >
          <option value={challenge.challenger_id}>{challenge.challenger_name}</option>
          <option value={challenge.opponent_id}>{challenge.opponent_name}</option>
        </select>
        <label className="block text-xs text-white/60 uppercase tracking-widest mb-1">Score (optional)</label>
        <input
          value={scoreLine}
          onChange={(e) => setScoreLine(e.target.value)}
          placeholder="e.g. 6-4"
          className="w-full rounded-xl bg-tennis-dark border border-white/10 text-white px-3 py-2 mb-5"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/20 text-white/80 hover:bg-white/10 px-4 py-2 text-sm font-bold">Cancel</button>
          <button
            disabled={busy}
            onClick={() => onSubmit({ id: winnerId, name: winnerName }, scoreLine.trim())}
            className="rounded-xl bg-clay hover:bg-clay/90 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            Submit
          </button>
        </div>
        <p className="mt-3 text-xs text-white/40">The organizer confirms before points move (+3 winner / −3 loser).</p>
      </div>
    </div>
  );
};
