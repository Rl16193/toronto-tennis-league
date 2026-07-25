import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { Check, Dices, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { SegmentedControl } from '../components/SegmentedControl';
import { RacquetIcon } from '../components/RacquetIcon';
import { ContactOpponentButton } from './tournament/ContactOpponentButton';
import { DivTab, LeagueRow, inDivision, toTitleCase, useStandings } from '../features/leagues/useStandings';
import { Rally, cancelRally, createRally, respondRally, useRallies } from '../features/friendlies/rallyService';
import { fetchEvents } from '../features/events/services/eventService';
import { isLadderEvent } from '../utils/eventTypes';
import { TennisEvent } from '../types';
import { createChallenge, cancelChallenge, LadderDivision } from '../features/leagues/ladderService';
import { useLadder } from '../features/leagues/useLadder';
import { useCrossEventConflicts } from '../features/leagues/useCrossEventConflicts';
import { skillBand } from './tournament/utils';

type Mode = 'friendlies' | 'challenges';

// ── Per-slot randomizer (shared by both tabs): 12 category slots, each with its own dice. A weekly
// budget of 2 slots may be put into "randomized" mode; re-rolls are then free. Originals are kept.
const RAND_SLOTS_PER_WEEK = 2;
const weekKey = () => {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
};
const randStoreKey = (uid: string, mode: Mode) => `matches_rand_${mode}_${uid}_${weekKey()}`;
type RandState = { slots: number[]; overrides: Record<number, string> };
const loadRandState = (uid: string, mode: Mode): RandState => {
  try { const raw = localStorage.getItem(randStoreKey(uid, mode)); if (raw) return JSON.parse(raw) as RandState; }
  catch { /* ignore */ }
  return { slots: [], overrides: {} };
};
const saveRandState = (uid: string, mode: Mode, s: RandState) => {
  try { localStorage.setItem(randStoreKey(uid, mode), JSON.stringify(s)); } catch { /* ignore */ }
};

// Deterministic pseudo-random in [0,1) from a string seed — used to give the Friendlies pool a
// stable-for-the-week tiebreak among equally-active players (so the 12 shown can rotate weekly
// without jittering on every reload).
const seededRand = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (h >>> 0) / 4294967296;
};

// Ranked window: up to 12 OTHER players centered on the viewer's rank within `divisionRows`
// (assumed pre-sorted by rank). If the viewer is unranked or the very lowest rank, there's no one
// below — show the 12 immediately above instead.
const rankWindow = (divisionRows: LeagueRow[], myUid: string): LeagueRow[] => {
  const n = divisionRows.length;
  const myIdx = divisionRows.findIndex((r) => r.user_id === myUid);
  let start: number;
  let end: number;
  if (myIdx < 0 || myIdx === n - 1) {
    // Unranked, or ranked lowest — nothing below, so show the 12 above.
    end = myIdx < 0 ? n : n - 1;
    start = Math.max(0, end - 12);
  } else {
    start = Math.max(0, myIdx - 6);
    end = Math.min(n, start + 13); // self + up to 12 others
    start = Math.max(0, end - 13);
  }
  return divisionRows.slice(start, end).filter((r) => r.user_id !== myUid).slice(0, 12);
};

// One "Matches" hub with Friendlies (non-competitive) and Challenges (competitive) tabs. The two
// tabs draw from DIFFERENT player pools:
//  - Challenges: a rank window — 6 above + 6 below the viewer (or the 12 above, if the viewer is
//    unranked/lowest-ranked).
//  - Friendlies: the most active players who share the viewer's skill band AND at least one
//    preferred court — falling back to just skill band, then just activity, if fewer than 12
//    qualify. The exact 12 can rotate week to week.
export const Matches: React.FC = () => {
  const { user, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'challenges' ? 'challenges' : 'friendlies');
  const { rows, loading: peopleLoading } = useStandings();
  const { sent, received, loading: ralliesLoading, activePartnerIds } = useRallies();
  const [busy, setBusy] = useState<string | null>(null);
  const [rand, setRand] = useState<RandState>({ slots: [], overrides: {} });
  const [courtsByUid, setCourtsByUid] = useState<Record<string, string[]>>({});

  // The single active league ladder (one per league).
  const [ladder, setLadder] = useState<TennisEvent | null>(null);
  const { myChallenges, incoming, contactMap, stateWith, weeklyChallengesLeft } = useLadder(ladder?.id, user?.uid);
  // Anti double-farming: block challenging someone already faced in another still-active event.
  const conflicts = useCrossEventConflicts(user?.uid, ladder?.id);

  useEffect(() => { document.title = 'Matches — Racquets & Strings'; }, []);
  useEffect(() => { if (user?.uid) setRand(loadRandState(user.uid, mode)); }, [user?.uid, mode]);
  useEffect(() => {
    fetchEvents().then((all) => setLadder(all.filter((e) => isLadderEvent(e))[0] ?? null)).catch(() => {});
  }, []);
  // Everyone's preferred courts — public preferences, read once for the Friendlies court-overlap
  // check ("even if one matches, they show up").
  useEffect(() => {
    getDocs(collection(db, 'preferences')).then((snap) => {
      const map: Record<string, string[]> = {};
      snap.docs.forEach((d) => { map[d.id] = (d.data().preferred_courts as string[]) || []; });
      setCourtsByUid(map);
    }).catch(() => {});
  }, []);

  const myName = profile?.user.name || '';
  const myDivision: DivTab | null = useMemo(() => {
    const league = profile?.stats?.league || '';
    if (inDivision(league, 'mens')) return 'mens';
    if (inDivision(league, 'womens')) return 'womens';
    return null;
  }, [profile?.stats?.league]);

  // Same-division base pool (everyone eligible to appear in either tab).
  const divisionPool = useMemo(() => rows
    .filter((r) => r.user_id && r.user_id !== user?.uid && r.name)
    .filter((r) => !myDivision || inDivision(r.league, myDivision)),
    [rows, user?.uid, myDivision]);

  // ── Challenges pool: rank window ──
  const divisionRanked = useMemo(
    () => [...rows.filter((r) => !myDivision || inDivision(r.league, myDivision))]
      .sort((a, b) => b.leaguePoints26 - a.leaguePoints26 || b.matchesPlayed - a.matchesPlayed || a.name.localeCompare(b.name)),
    [rows, myDivision],
  );
  const challengesPool = useMemo(
    () => (user ? rankWindow(divisionRanked, user.uid) : []),
    [divisionRanked, user],
  );

  // ── Friendlies pool: active + same skill band + court overlap, with graceful fallback ──
  const myBand = skillBand(profile?.stats?.skill_level ?? 0);
  const myCourts = useMemo(() => new Set(profile?.preferences.preferred_courts ?? []), [profile?.preferences.preferred_courts]);
  const week = weekKey();
  const byActivity = (a: LeagueRow, b: LeagueRow) =>
    (b.matchesPlayed - a.matchesPlayed) || (seededRand(week + a.user_id) - seededRand(week + b.user_id));
  const sameBand = (r: LeagueRow) => skillBand(r.skill_level) === myBand;
  const sharesCourtWithMe = (r: LeagueRow) => (courtsByUid[r.user_id] || []).some((c) => myCourts.has(c));

  const friendliesExtended = useMemo(() => {
    const tier1 = divisionPool.filter((r) => sameBand(r) && sharesCourtWithMe(r)).sort(byActivity);
    const used1 = new Set(tier1.map((r) => r.user_id));
    const tier2 = divisionPool.filter((r) => sameBand(r) && !used1.has(r.user_id)).sort(byActivity);
    const used2 = new Set([...used1, ...tier2.map((r) => r.user_id)]);
    const tier3 = divisionPool.filter((r) => !used2.has(r.user_id)).sort(byActivity);
    return [...tier1, ...tier2, ...tier3];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionPool, courtsByUid, myBand, myCourts, week]);
  const friendliesPool = useMemo(() => friendliesExtended.slice(0, 12), [friendliesExtended]);

  const people = mode === 'challenges' ? challengesPool : friendliesPool;
  // Re-roll source: Challenges draws from the full division ranking; Friendlies keeps drawing
  // from the same activity/skill/court-ordered candidate list (not just the initial top 12).
  const rerollSource = mode === 'challenges' ? divisionRanked.filter((r) => r.user_id !== user?.uid) : friendliesExtended;

  const rowById = useMemo(() => new Map(rows.map((r) => [r.user_id, r])), [rows]);
  const slots = useMemo(
    () => people.map((base, i) => (rand.overrides[i] && rowById.get(rand.overrides[i])) || base),
    [people, rand.overrides, rowById],
  );
  const budgetLeft = RAND_SLOTS_PER_WEEK - rand.slots.length;

  if (!user) return null; // private route

  const randomizeSlot = (i: number) => {
    const already = rand.slots.includes(i);
    if (!already && budgetLeft <= 0) return;
    const shownIds = new Set(slots.map((s) => s.user_id));
    const pool = rerollSource.filter((r) => !shownIds.has(r.user_id) && !activePartnerIds.has(r.user_id));
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const next: RandState = {
      slots: already ? rand.slots : [...rand.slots, i],
      overrides: { ...rand.overrides, [i]: pick.user_id },
    };
    setRand(next); saveRandState(user.uid, mode, next);
  };
  const resetSlot = (i: number) => {
    const rest = { ...rand.overrides };
    delete rest[i];
    const next: RandState = { slots: rand.slots.filter((s) => s !== i), overrides: rest };
    setRand(next); saveRandState(user.uid, mode, next);
  };

  // ── Actions ──
  const sendRally = async (to: { id: string; name: string }) => {
    setBusy(to.id);
    try { await createRally({ id: user.uid, name: myName }, to); } finally { setBusy(null); }
  };
  const sendChallenge = async (to: LeagueRow) => {
    if (!ladder || !myDivision) return;
    setBusy(to.user_id);
    try {
      await createChallenge({
        eventId: ladder.id,
        division: myDivision as LadderDivision,
        challenger: { id: user.uid, name: myName },
        opponent: { id: to.user_id, name: to.name },
      });
    } finally { setBusy(null); }
  };

  const openReceived = received.filter((r) => r.status === 'open');
  const activeRallies = [...sent, ...received].filter((r) => r.status === 'accepted');
  const openSent = sent.filter((r) => r.status === 'open');

  const RallyRow: React.FC<{ r: Rally; incoming?: boolean }> = ({ r, incoming: inc }) => (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg truncate">{inc ? toTitleCase(r.from_name) : toTitleCase(r.to_name)}</p>
        <p className="text-[11px] text-fg/40">
          {r.status === 'accepted' ? 'Rally on — arrange a time and court' : inc ? 'Wants to rally with you' : 'Waiting for their reply'}
        </p>
      </div>
      {inc && r.status === 'open' ? (
        <div className="flex gap-1.5 shrink-0">
          <button type="button" onClick={() => respondRally(r.id, true)} className="p-2.5 rounded-xl bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors" aria-label="Accept rally"><Check className="w-4 h-4" /></button>
          <button type="button" onClick={() => respondRally(r.id, false)} className="p-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors" aria-label="Decline rally"><X className="w-4 h-4" /></button>
        </div>
      ) : !inc && r.status === 'open' ? (
        <button type="button" onClick={() => cancelRally(r.id)} className="shrink-0 text-xs font-bold text-fg/40 hover:text-red-400 transition-colors">Cancel</button>
      ) : (
        <span className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide bg-green-500/15 text-green-400">Rally on</span>
      )}
    </div>
  );

  return (
    <div className="max-w-xl mx-auto px-4 pb-20 pt-4">
      <div className="flex items-center gap-2 mb-4">
        <RacquetIcon className="w-6 h-6 text-clay" />
        <h1 className="text-2xl font-display font-bold text-fg">Matches</h1>
      </div>

      <SegmentedControl<Mode>
        options={[{ value: 'friendlies', label: 'Friendlies' }, { value: 'challenges', label: 'Challenges' }]}
        value={mode}
        onChange={setMode}
        className="mb-5"
      />

      {/* Active / incoming items for the current mode */}
      {mode === 'friendlies'
        ? !ralliesLoading && (openReceived.length > 0 || activeRallies.length > 0 || openSent.length > 0) && (
          <div className="rounded-3xl bg-tennis-surface/30 border border-fg/5 overflow-hidden divide-y divide-white/5 mb-5">
            {openReceived.map((r) => <RallyRow key={r.id} r={r} incoming />)}
            {activeRallies.map((r) => <RallyRow key={r.id} r={r} incoming={r.to_id === user.uid} />)}
            {openSent.map((r) => <RallyRow key={r.id} r={r} />)}
          </div>
        )
        : (incoming.length > 0 || myChallenges.length > 0) && (
          <div className="rounded-3xl bg-tennis-surface/30 border border-fg/5 overflow-hidden divide-y divide-white/5 mb-5">
            {incoming.map((c) => {
              const contact = contactMap[c.challenger_id];
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg truncate">{toTitleCase(c.challenger_name)}</p>
                    <p className="text-[11px] text-fg/40">Challenged you{c.status === 'reported' ? ' — result reported' : ''}</p>
                  </div>
                  <ContactOpponentButton name={c.challenger_name} phone={contact?.phone} email={contact?.email} whatsappContact={contact?.whatsapp_contact} whatsappSameAsPhone={contact?.whatsapp_same_as_phone} size="sm" />
                </div>
              );
            })}
            {myChallenges.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg truncate">{toTitleCase(c.opponent_name)}</p>
                  <p className="text-[11px] text-fg/40">You challenged{c.status === 'reported' ? ' — result reported' : ''}</p>
                </div>
                {c.status === 'open' && (
                  <button type="button" onClick={() => cancelChallenge(c.id)} className="shrink-0 text-xs font-bold text-fg/40 hover:text-red-400 transition-colors">Cancel</button>
                )}
              </div>
            ))}
          </div>
        )}

      {mode === 'challenges' && !ladder && (
        <div className="rounded-2xl border border-fg/10 bg-fg/5 px-4 py-3 mb-4 text-sm text-fg/60">
          No active league ladder right now.
        </div>
      )}

      <p className="text-[11px] font-bold uppercase tracking-widest text-fg/40 mb-2">
        {budgetLeft} of {RAND_SLOTS_PER_WEEK} randomizes left this week
      </p>

      {peopleLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}</div>
      ) : slots.length === 0 ? (
        <div className="rounded-3xl bg-tennis-surface/30 border border-fg/5 py-12 text-center"><p className="text-sm text-fg/40">No players found.</p></div>
      ) : (
        <div className="rounded-3xl bg-tennis-surface/30 border border-fg/5 overflow-hidden divide-y divide-white/5">
          {slots.map((p, i) => {
            const isRandomized = rand.slots.includes(i);
            const canRandomize = isRandomized || budgetLeft > 0;
            const rallyPending = activePartnerIds.has(p.user_id);
            const challengeState = ladder ? stateWith(p.user_id) : 'cooldown';
            const challengeBlocked = !ladder || !myDivision || challengeState !== 'available'
              || weeklyChallengesLeft === 0 || conflicts.has(p.user_id);
            return (
              <div key={`${i}-${p.user_id}`} className="flex items-center gap-2 px-4 py-3 min-h-[44px]">
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-fg truncate">{toTitleCase(p.name)}</span>
                  {p.skill_level > 0 && <span className="text-[11px] text-fg/40">{skillBand(p.skill_level)} · {p.skill_level}</span>}
                </div>
                <button type="button" onClick={() => randomizeSlot(i)} disabled={!canRandomize} title={canRandomize ? 'Randomize this slot' : 'No randomizes left this week'} className="p-2 rounded-xl bg-fg/5 text-fg/60 hover:text-fg transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0" aria-label="Randomize slot"><Dices className="w-4 h-4" /></button>
                {isRandomized && (
                  <button type="button" onClick={() => resetSlot(i)} title="Restore original player" className="p-2 rounded-xl bg-fg/5 text-fg/40 hover:text-fg transition-colors shrink-0" aria-label="Reset slot"><X className="w-4 h-4" /></button>
                )}
                {mode === 'friendlies' ? (
                  rallyPending ? (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-fg/30">Pending</span>
                  ) : (
                    <Button size="sm" variant="white" onClick={() => sendRally({ id: p.user_id, name: p.name })} isLoading={busy === p.user_id}>
                      <RacquetIcon className="w-3.5 h-3.5 mr-1.5" />Rally
                    </Button>
                  )
                ) : (
                  challengeState === 'pending' ? (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-fg/30">Pending</span>
                  ) : (
                    <Button size="sm" variant="clay" onClick={() => sendChallenge(p)} isLoading={busy === p.user_id} disabled={challengeBlocked}>
                      <RacquetIcon className="w-3.5 h-3.5 mr-1.5" />Challenge
                    </Button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
