/**
 * Credits both partners of every completed doubles match with the same stats the captain received.
 *
 * Idempotent: each processed match is stamped with `doubles_partner_pts_v2: true` — the backfill
 * skips any match that already carries it. Safe to re-run at any time.
 *
 * Usage:
 *   node scripts/backfill-doubles-partners.mjs --key serviceAccount.json --dry-run
 *   node scripts/backfill-doubles-partners.mjs --key serviceAccount.json
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const args = process.argv;
const dryRun = args.includes('--dry-run');
const keyIdx = args.indexOf('--key');
if (keyIdx === -1 || !args[keyIdx + 1]) {
  console.error('Usage: node scripts/backfill-doubles-partners.mjs --key <serviceAccount.json> [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(args[keyIdx + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

// The same point table used by computeMatchPoints in useTournament.ts.
// RR group-stage: winner 3 / loser 1. Non-RR knockout: winner 20 / loser varies by round.
const LOSER_PTS = { R32: 1, R16: 2, QF: 3, RR: 1, SF: 5, F: 10 };
const computePoints = (match) => {
  const round = match.round || 'R32';
  const isRRGroupStage = (match.format || 'bracket') === 'rr' && round === 'RR';
  const loserPts = LOSER_PTS[round] ?? 1;
  const winnerPts = isRRGroupStage ? 3 : 20;
  const isFinal = round === 'F';
  const winnerPointsApply = isFinal || isRRGroupStage;
  return { loserPts, winnerPts, isFinal, winnerPointsApply };
};

// Normalise a name for fuzzy partner matching — same logic as normalizeForMatch in utils.ts.
const normalise = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

// Firestore caps a batch at 500 writes.
const commitInChunks = async (items, apply) => {
  for (let i = 0; i < items.length; i += 400) {
    const batch = db.batch();
    items.slice(i, i + 400).forEach((item) => apply(batch, item));
    await batch.commit();
  }
};

const run = async () => {
  // 1. Every completed doubles match not yet stamped.
  const matchesSnap = await db.collection('matches')
    .where('category', '==', 'doubles')
    .where('status', '==', 'complete')
    .get();

  const matches = matchesSnap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter((m) => (m.winner_uid || m.winner_user_id) && !m.doubles_partner_pts_v2);

  console.log(`${matchesSnap.size} total completed doubles matches · ${matches.length} ${dryRun ? 'would be ' : ''}processed\n`);

  if (matches.length === 0) { console.log('Nothing to do.'); process.exit(0); }

  // 2. Resolve partner_uid for every involved player across all affected events.
  const eventIds = [...new Set(matches.map((m) => m.event_id))];
  const participantsSnap = await Promise.all(
    eventIds.map((eid) => db.collection('event_participants').where('event_id', '==', eid).get()),
  );

  // Build two lookup structures:
  //   captainUid → partnerUid         (from participant.partner_uid, new registrations)
  //   captainUid → partnerUid (fallback)  (from name-matching the `doubles` field, old registrations)
  const captainToPartner = new Map();

  for (const snap of participantsSnap) {
    // Exact uid-based links from the participant doc.
    snap.docs.forEach((d) => {
      const p = d.data();
      const captainUid = p.uid || p.user_id;
      if (captainUid && p.partner_uid) captainToPartner.set(captainUid, p.partner_uid);
    });

    // Name-based fallback: find pairs where A.doubles == B.user_name AND B.doubles == A.user_name.
    const byId = new Map(snap.docs.map((d) => [d.id, d.data()]));
    const byName = new Map(snap.docs.map((d) => [normalise(d.data().user_name || d.data().doubles || ''), d.id]));

    snap.docs.forEach((d) => {
      const p = d.data();
      const captainUid = p.uid || p.user_id;
      if (!captainUid || captainToPartner.has(captainUid)) return;
      if (!p.doubles) return;
      const partnerName = normalise(p.doubles);
      const partnerDoc = byName.get(partnerName);
      if (!partnerDoc) return;
      const partner = byId.get(partnerDoc);
      if (partner && normalise(partner.doubles || '') === normalise(p.user_name || '')) {
        captainToPartner.set(captainUid, partner.uid || partner.user_id);
      }
    });
  }

  // 3. Prepare stats increments for each match.
  const increments = [];

  for (const m of matches) {
    const { loserPts, winnerPts, winnerPointsApply, isFinal } = computePoints(m);
    const winnerUid = m.winner_uid || m.winner_user_id;
    const player1Uid = m.player_1_uid || m.player_1_user_id;
    const player2Uid = m.player_2_uid || m.player_2_user_id;
    const loserUid = winnerUid === player1Uid ? player2Uid : player1Uid;

    const p1G = (m.set_1_player_1 ?? 0) + (m.set_2_player_1 ?? 0) + (m.set_3_player_1 ?? 0);
    const p2G = (m.set_1_player_2 ?? 0) + (m.set_2_player_2 ?? 0) + (m.set_3_player_2 ?? 0);
    const total = p1G + p2G;
    const winnerIsP1 = winnerUid === player1Uid;

    const credit = (uid, { wins: w, loses: l, leaguePoints26: lp, tournamentsPlayed: tp, pointswon: pw, totalPointsPlayed: tp2 }) => {
      increments.push({ uid, match: m, wins: w, loses: l, leaguePoints26: lp, tournamentsPlayed: tp, pointswon: pw, totalPointsPlayed: tp2 });
    };

    // Winner's partner.
    const winnerPartner = captainToPartner.get(winnerUid);
    if (winnerPartner && winnerPartner !== winnerUid) {
      credit(winnerPartner, {
        wins: 1, loses: 0,
        leaguePoints26: winnerPointsApply ? winnerPts : 0,
        tournamentsPlayed: isFinal ? 1 : 0,
        pointswon: winnerIsP1 ? p1G : p2G,
        totalPointsPlayed: total,
      });
    }

    // Loser's partner.
    const loserPartner = captainToPartner.get(loserUid);
    if (loserPartner && loserPartner !== loserUid) {
      credit(loserPartner, {
        wins: 0, loses: 1,
        leaguePoints26: loserPts,
        tournamentsPlayed: 1,
        pointswon: winnerIsP1 ? p2G : p1G,
        totalPointsPlayed: total,
      });
    }
  }

  if (increments.length === 0) {
    console.log('No partner_uid resolved — nothing to credit.');
    process.exit(0);
  }

  // Group by stats uid so every player gets one batch.set with all their deltas summed.
  const byUid = new Map();
  increments.forEach((inc) => {
    if (!byUid.has(inc.uid)) byUid.set(inc.uid, { uid: inc.uid, matchesPlayed: 0, wins: 0, loses: 0, leaguePoints26: 0, tournamentsPlayed: 0, pointswon: 0, totalPointsPlayed: 0 });
    const acc = byUid.get(inc.uid);
    acc.matchesPlayed += 1;
    acc.wins += inc.wins;
    acc.loses += inc.loses;
    acc.leaguePoints26 += inc.leaguePoints26;
    acc.tournamentsPlayed += inc.tournamentsPlayed;
    acc.pointswon += inc.pointswon;
    acc.totalPointsPlayed += inc.totalPointsPlayed;
  });

  // Log per-match detail.
  increments.forEach((inc) => {
    const tag = inc.wins ? 'winner' : 'loser';
    console.log(`${dryRun ? '[dry-run] ' : ''}stats/${inc.uid} ← match ${inc.match.id} (${tag} partner)`);
    console.log(`    leaguePoints26 +${inc.leaguePoints26}  matchesPlayed +1  wins +${inc.wins}  loses +${inc.loses}`);
  });

  // 4. Write stats + stamp every processed match doc.
  if (!dryRun) {
    await commitInChunks([...byUid.values()], (batch, row) => {
      const { uid, ...delta } = row;
      batch.set(db.doc(`stats/${uid}`), {
        matchesPlayed: admin.firestore.FieldValue.increment(delta.matchesPlayed),
        wins: admin.firestore.FieldValue.increment(delta.wins),
        loses: admin.firestore.FieldValue.increment(delta.loses),
        leaguePoints26: admin.firestore.FieldValue.increment(delta.leaguePoints26),
        tournamentsPlayed: admin.firestore.FieldValue.increment(delta.tournamentsPlayed),
        pointswon: admin.firestore.FieldValue.increment(delta.pointswon),
        totalPointsPlayed: admin.firestore.FieldValue.increment(delta.totalPointsPlayed),
      }, { merge: true });
    });

    // Stamp every processed match so a re-run skips them. Each match gets its own batch
    // because a Firestore batch can't exceed 500 ops and we're mixing stats + match writes.
    await commitInChunks(matches, (batch, m) => {
      batch.update(m.ref, { doubles_partner_pts_v2: true });
    });
  }

  console.log(`\n${byUid.size} player(s) ${dryRun ? 'would be ' : ''}credited from ${matches.length} match(es).`);
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
