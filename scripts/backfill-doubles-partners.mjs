/**
 * Credits both partners of every completed doubles match with the same stats the captain received.
 *
 * Idempotent: each processed match is stamped with `doubles_partner_pts_v2: true` — the backfill
 * skips any match that already carries it. Safe to re-run at any time.
 *
 * Usage:
 *   node scripts/backfill-doubles-partners.mjs --project rands-staging --key serviceAccount.json
 *   node scripts/backfill-doubles-partners.mjs --project rands-staging --key serviceAccount.json --apply
 *
 * Dry-run is the default. Production additionally requires the migration confirmation triple.
 */
import admin from 'firebase-admin';
import { createMigrationDb, parseMigrationArgs, scanCollection } from './migrations/lib/cli.mjs';

const args = process.argv.slice(2);
const options = parseMigrationArgs(args, { supportsPaging: true });
if (options.help) {
  console.log(
    'Usage: node scripts/backfill-doubles-partners.mjs --project <id> --key <serviceAccount.json> [--apply] [--limit <n>] [--resume <document-id>]',
  );
  process.exit(0);
}
const dryRun = options.dryRun;
const db = createMigrationDb(options);

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
const normalise = (s = '') =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

const run = async () => {
  // 1. Scan an ordered page so --limit and --resume are real safety controls rather than
  // accepted-but-ignored flags. Filtering happens after the bounded document scan.
  const matchesSnap = await scanCollection(db, 'matches', { limit: options.limit, resume: options.resume });

  const matches = matchesSnap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
    .filter(
      (m) =>
        m.category === 'doubles' &&
        m.status === 'complete' &&
        (m.winner_uid || m.winner_user_id) &&
        !m.doubles_partner_pts_v2,
    );

  console.log(`${matchesSnap.size} matches scanned · ${matches.length} ${dryRun ? 'would be ' : ''}processed\n`);

  if (matches.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

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

    const credit = (
      uid,
      { wins: w, loses: l, leaguePoints26: lp, tournamentsPlayed: tp, pointswon: pw, totalPointsPlayed: tp2 },
    ) => {
      increments.push({
        uid,
        match: m,
        wins: w,
        loses: l,
        leaguePoints26: lp,
        tournamentsPlayed: tp,
        pointswon: pw,
        totalPointsPlayed: tp2,
      });
    };

    // Winner's partner.
    const winnerPartner = captainToPartner.get(winnerUid);
    if (winnerPartner && winnerPartner !== winnerUid) {
      credit(winnerPartner, {
        wins: 1,
        loses: 0,
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
        wins: 0,
        loses: 1,
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
    if (!byUid.has(inc.uid))
      byUid.set(inc.uid, {
        uid: inc.uid,
        matchesPlayed: 0,
        wins: 0,
        loses: 0,
        leaguePoints26: 0,
        tournamentsPlayed: 0,
        pointswon: 0,
        totalPointsPlayed: 0,
      });
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

  // 4. Credit each match and stamp that same match in one transaction. The marker and increments
  // must be atomic: a crash between separate stats and match commits would double-credit a rerun.
  if (!dryRun) {
    for (const match of matches) {
      const matchIncrements = increments.filter((increment) => increment.match.id === match.id);
      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(match.ref);
        if (!current.exists || current.data()?.doubles_partner_pts_v2) return;

        const matchDeltas = new Map();
        for (const increment of matchIncrements) {
          const delta = matchDeltas.get(increment.uid) ?? {
            matchesPlayed: 0,
            wins: 0,
            loses: 0,
            leaguePoints26: 0,
            tournamentsPlayed: 0,
            pointswon: 0,
            totalPointsPlayed: 0,
          };
          delta.matchesPlayed += 1;
          delta.wins += increment.wins;
          delta.loses += increment.loses;
          delta.leaguePoints26 += increment.leaguePoints26;
          delta.tournamentsPlayed += increment.tournamentsPlayed;
          delta.pointswon += increment.pointswon;
          delta.totalPointsPlayed += increment.totalPointsPlayed;
          matchDeltas.set(increment.uid, delta);
        }

        for (const [uid, delta] of matchDeltas) {
          transaction.set(
            db.doc(`stats/${uid}`),
            {
              matchesPlayed: admin.firestore.FieldValue.increment(delta.matchesPlayed),
              wins: admin.firestore.FieldValue.increment(delta.wins),
              loses: admin.firestore.FieldValue.increment(delta.loses),
              leaguePoints26: admin.firestore.FieldValue.increment(delta.leaguePoints26),
              tournamentsPlayed: admin.firestore.FieldValue.increment(delta.tournamentsPlayed),
              pointswon: admin.firestore.FieldValue.increment(delta.pointswon),
              totalPointsPlayed: admin.firestore.FieldValue.increment(delta.totalPointsPlayed),
            },
            { merge: true },
          );
        }
        transaction.update(match.ref, {
          doubles_partner_pts_v2: true,
          doubles_partner_pts_v2_at: new Date().toISOString(),
        });
      });
    }
  }

  console.log(`\n${byUid.size} player(s) ${dryRun ? 'would be ' : ''}credited from ${matches.length} match(es).`);
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
