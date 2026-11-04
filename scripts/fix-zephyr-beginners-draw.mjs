/**
 * One-off: rebuild the Zephyr Open 2026 Singles Men's Beginners draw as QF / SF / Final.
 *
 * Doc ids are kept (a match's id carries its number, and its results point at that id); the
 * matches that aren't part of the new shape are set `cancelled` rather than deleted. Every points
 * movement goes through scoring.js's own `resetScore` / `recordScore`, so `commitPoints` stays the
 * only writer and no `submissions` entry is written by hand.
 *
 *   QF  m1  Mike vs Rohan S          Rohan, 10-15          (re-recorded: R16 loss 2 -> QF 3)
 *   QF  m6  Prarus vs Mike           Prarus, 6-2 6-1       (new result, Trinity Bellwoods)
 *   QF  m4  Andrew Alzaga vs Feng L  Feng L, walkover      (re-recorded)
 *   QF  m5  Prarus vs Geoffrey       Geoffrey, 4-10 0-10   (re-recorded)
 *   SF  m13 Rohan S vs Prarus        to play
 *   SF  m11 Geoffrey vs Feng L       Geoffrey, 6-1 6-0     (re-recorded: QF loss 3 -> SF 5)
 *   F   m15 winner of m13 vs Geoffrey
 *
 * Cancelled: m2, m3, m7, m8, m9, m10, m12, m14. Kyle Serebryanny, Yash Thakur, Daniel and
 * Vittorio Romero are withdrawn from the event (`unavailable`) and the points their cancelled
 * matches paid are reversed.
 *
 * PRODUCTION IS THE ONLY ENVIRONMENT. Dry run is the default.
 *
 *   node scripts/fix-zephyr-beginners-draw.mjs --key serviceAccount.json
 *   node scripts/fix-zephyr-beginners-draw.mjs --key serviceAccount.json --apply
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const keyPath = args.includes('--key') ? args[args.indexOf('--key') + 1] : null;
const apply = args.includes('--apply');
if (!keyPath) {
  console.error('Usage: node scripts/fix-zephyr-beginners-draw.mjs --key serviceAccount.json [--apply]');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const { recordScore, resetScore } = require('./lib/scoring');

const EVENT = 'dNbsCjbKLo1NdUdAm70F';
const ADMIN = '7PvfzNtDmsOq5GLMieId7QRT7wH3';
const id = (n) => `${EVENT}_singles_men_s_beginners_${n}`;

// Rounds and next-match wiring for the seven that stay.
const SHAPE = {
  m1:  { round: 'QF', next: 'm13', slot: 'player_1' },
  m6:  { round: 'QF', next: 'm13', slot: 'player_2' },
  m4:  { round: 'QF', next: 'm11', slot: 'player_2' },
  m5:  { round: 'QF', next: 'm11', slot: 'player_1' },
  m11: { round: 'SF', next: 'm15', slot: 'player_2' },
  m13: { round: 'SF', next: 'm15', slot: 'player_1' },
  m15: { round: 'F',  next: '',    slot: '' },
};
const CANCEL = ['m2', 'm3', 'm7', 'm8', 'm9', 'm10', 'm12', 'm14'];
// Reset first so each reversal matches the round its points were paid at.
const RESET = ['m1', 'm4', 'm5', 'm11', 'm2', 'm3', 'm9'];
// Re-recorded in bracket order, so a winner advances into a slot that is still open.
const RECORD = [
  { n: 'm1',  winner: 'player_2', sets: [[10, 15], [0, 0], [0, 0]] },
  { n: 'm4',  winner: 'player_2', sets: [[0, 0], [0, 0], [0, 0]], walkover: true },
  { n: 'm5',  winner: 'player_2', sets: [[4, 10], [0, 10], [0, 0]] },
  { n: 'm6',  winner: 'player_1', sets: [[6, 2], [6, 1], [0, 0]], court: 'Trinity Bellwoods Park' },
  { n: 'm11', winner: 'player_1', sets: [[6, 1], [6, 0], [0, 0]] },
];
// Who to withdraw is DERIVED, never a name list: whoever plays only in cancelled matches. Names
// drift in case and spelling between a match doc and a registration ("kyle serebryanny"), uids
// don't, and this can't strand someone who turns out to still be in the draw.

async function main() {
  const snap = await db.collection('matches').where('event_id', '==', EVENT).get();
  const beginners = new Map();
  snap.forEach((d) => {
    const m = d.data();
    if (/beginner/i.test(m.skill_group || '')) beginners.set(m.match_id, { ref: d.ref, id: d.id, m });
  });

  const missing = [...Object.keys(SHAPE), ...CANCEL].filter((n) => !beginners.has(n));
  if (missing.length) { console.error(`Missing matches: ${missing.join(', ')}`); process.exit(1); }

  console.log(apply ? '=== APPLYING ===\n' : '=== DRY RUN ===\n');

  console.log('1. Reset (reverses the points each paid):');
  for (const n of RESET) {
    const { id: docId, m } = beginners.get(n);
    const label = `${m.player_1_name || '—'} vs ${m.player_2_name || '—'}`;
    console.log(`   ${n.padEnd(4)} [${m.round}] ${label}`);
    if (apply) await resetScore(db, { uid: ADMIN, matchId: docId });
  }

  console.log('\n2. Re-shape (round + next-match wiring; no result fields):');
  for (const [n, s] of Object.entries(SHAPE)) {
    const { ref, m } = beginners.get(n);
    console.log(`   ${n.padEnd(4)} ${m.round} -> ${s.round}   next ${m.next_match_id || '-'} -> ${s.next || '-'}/${s.slot || '-'}`);
    if (apply) await ref.update({ round: s.round, next_match_id: s.next, next_slot: s.slot });
  }
  // SF1 is Rohan vs Prarus: seat Prarus now so the slot isn't a placeholder before m6 is recorded.
  {
    const { ref, m } = beginners.get('m13');
    const prarus = beginners.get('m6').m;
    console.log(`   m13  player_2 "${m.player_2_name}" -> "${prarus.player_1_name}"`);
    if (apply) await ref.update({ player_2_uid: prarus.player_1_uid, player_2_name: prarus.player_1_name });
  }

  console.log('\n3. Cancel (kept as documents, status only):');
  for (const n of CANCEL) {
    const { ref, m } = beginners.get(n);
    console.log(`   ${n.padEnd(4)} [${m.round}] ${m.player_1_name || '—'} vs ${m.player_2_name || '—'}`);
    if (apply) await ref.update({ status: 'cancelled' });
  }

  console.log('\n4. Record (pays the NEW round):');
  for (const r of RECORD) {
    const { id: docId, m } = beginners.get(r.n);
    const winnerUid = m[`${r.winner}_uid`];
    const winnerName = m[`${r.winner}_name`];
    console.log(`   ${r.n.padEnd(4)} ${SHAPE[r.n]?.round || 'QF'}  winner ${winnerName}${r.walkover ? ' (walkover)' : ''}  ${r.sets.filter(([a, b]) => a || b).map(([a, b]) => `${a}-${b}`).join(', ') || '—'}`);
    if (apply) {
      await recordScore(db, {
        callerUid: ADMIN,
        matchId: docId,
        input: { winnerUid, scores: r.sets, walkover: !!r.walkover, court: r.court || '' },
      });
    }
  }

  console.log('\n5. Withdraw from the event (reason: unavailable):');
  const uidsIn = (names) => new Set(names.flatMap((n) => {
    const { m } = beginners.get(n);
    return [m.player_1_uid, m.player_2_uid].filter(Boolean);
  }));
  const kept = uidsIn(Object.keys(SHAPE));
  const dropped = [...uidsIn(CANCEL)].filter((u) => !kept.has(u));
  const regs = await db.collection('event_participants').where('event_id', '==', EVENT).get();
  const hits = regs.docs.filter((d) => dropped.includes(d.data().uid) && d.data().status === 'active');
  hits.forEach((d) => console.log(`   ${d.data().user_name}  (${d.id})`));
  const unregistered = dropped.filter((u) => !hits.some((d) => d.data().uid === u));
  if (unregistered.length) console.log(`   No active registration for: ${unregistered.join(', ')}`);
  if (apply) {
    const batch = db.batch();
    hits.forEach((d) => batch.update(d.ref, {
      status: 'withdrawn',
      withdrawn_reason: 'unavailable',
      withdrawn_at: admin.firestore.Timestamp.now(),
      withdrawn_by: ADMIN,
    }));
    await batch.commit();
  }

  console.log(apply ? '\nDone.' : '\nNothing written. Re-run with --apply.');
}

main().catch((err) => { console.error(err); process.exit(1); });
