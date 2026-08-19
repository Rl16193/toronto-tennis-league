/**
 * Ranking snapshot (Trend source for the Leagues table).
 *
 * Per division (Men's / Women's / Doubles) ranks players by `leaguePoints26`, compares each
 * player's new position to the `rankPosition` stored on their `stats` doc, and on a change:
 *   - sets `rankTrend` ('up' if the position improved, 'down' if worse, else 'flat'),
 *   - updates `rankPosition`,
 *   - appends a history entry `ranking_history/{uid}/entries/{autoId}` = { date, position, direction }.
 * First run just records the baseline position (rankTrend 'flat', no history entry).
 * Idempotent: a run with no rank changes writes nothing. Admin SDK bypasses the stats owner rule.
 *
 * Usage:
 *   node scripts/snapshot-ranks.mjs --project rands-staging --key serviceAccount.json
 *   node scripts/snapshot-ranks.mjs --project rands-staging --key serviceAccount.json --apply
 *
 * Dry-run is the default. Production additionally requires the migration confirmation triple.
 *
 * The division filter mirrors src/features/leagues/useStandings.ts — keep them in sync.
 */
import { createMigrationDb, parseMigrationArgs } from './migrations/lib/cli.mjs';

const args = process.argv.slice(2);
const options = parseMigrationArgs(args);
if (options.help) {
  console.log('Usage: node scripts/snapshot-ranks.mjs --project <id> --key <serviceAccount.json> [--apply]');
  process.exit(0);
}
const dryRun = options.dryRun;
const db = createMigrationDb(options);

// Mirror of inDivision() in src/features/leagues/useStandings.ts.
const DIV_TABS = ['mens', 'womens', 'doubles'];
const inDivision = (league, tab) => {
  const l = (league || '').toLowerCase();
  if (tab === 'mens') return (l.includes('men') || l.includes('male')) && !l.includes('women') && !l.includes('female');
  if (tab === 'womens') return l.includes('wom') || l.includes('female');
  if (tab === 'doubles') return l.includes('double') || l.includes('mixed');
  return false;
};

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no writes\n' : '✏️  LIVE RUN\n');
  const snap = await db.collection('stats').get();
  const players = [];
  snap.forEach((d) => {
    const s = d.data();
    if (!s.leaguePoints26 || s.leaguePoints26 <= 0) return;
    players.push({
      uid: d.id,
      league: s.league || '',
      points: s.leaguePoints26,
      rankPosition: typeof s.rankPosition === 'number' ? s.rankPosition : null,
      rankTrend: s.rankTrend ?? 'flat',
    });
  });

  const date = new Date().toISOString();
  const ops = []; // { uid, position, trend, move, historyDir | null }

  for (const tab of DIV_TABS) {
    const ranked = players.filter((p) => inDivision(p.league, tab)).sort((a, b) => b.points - a.points);
    ranked.forEach((p, i) => {
      const position = i + 1;
      const old = p.rankPosition;
      if (old === position) return; // no change
      const trend = old === null ? 'flat' : position < old ? 'up' : 'down';
      const move = old === null ? 0 : Math.abs(old - position); // places climbed/fallen
      ops.push({ uid: p.uid, position, trend, move, historyDir: old === null ? null : trend });
    });
  }

  console.log(`${ops.length} rank change(s) of ${players.length} ranked players`);
  for (const op of ops.slice(0, 20)) {
    console.log(
      `  ${op.uid.slice(0, 8)} → #${op.position} (${op.trend} ${op.move})${op.historyDir ? '' : ' [baseline]'}`,
    );
  }
  if (ops.length > 20) console.log(`  … +${ops.length - 20} more`);

  // ── Public homepage counters (site_stats/summary) ──────────────────────────
  // Players = distinct uid in event_participants (registered for an event). Matches =
  // completed tournament matches + 70 (last year's total). Neither collection is world-readable,
  // so both are precomputed here for the public landing to read.
  const active = new Set();
  (await db.collection('event_participants').get()).forEach((d) => {
    const data = d.data();
    const u = data.uid || data.user_id;
    if (u) active.add(u);
  });
  const completedSnap = await db.collection('matches').where('status', '==', 'complete').get();
  const completedCount = completedSnap.docs.filter((d) => {
    const category = d.data().category;
    return category === 'singles' || category === 'doubles';
  }).length;
  const siteStats = { activePlayers: active.size, matchesOrganized: completedCount + 70, updatedAt: date };
  console.log(`site_stats → activePlayers=${siteStats.activePlayers}, matchesOrganized=${siteStats.matchesOrganized}`);

  if (dryRun) {
    console.log('\n(dry run — no writes)');
    process.exit(0);
  }

  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 400)) {
      batch.set(
        db.collection('stats').doc(op.uid),
        { rankPosition: op.position, rankTrend: op.trend, rankMove: op.move, rankUpdatedAt: date },
        { merge: true },
      );
      if (op.historyDir) {
        batch.set(db.collection('ranking_history').doc(op.uid).collection('entries').doc(), {
          date,
          position: op.position,
          direction: op.historyDir,
        });
      }
    }
    await batch.commit();
  }
  await db.collection('site_stats').doc('summary').set(siteStats, { merge: true });
  console.log(`\nWrote ${ops.length} rank update(s) + site_stats/summary.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
