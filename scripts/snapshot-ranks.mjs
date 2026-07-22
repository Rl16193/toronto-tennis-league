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
 *   node scripts/snapshot-ranks.mjs --key serviceAccount.json
 *   node scripts/snapshot-ranks.mjs --key serviceAccount.json --dry-run
 *
 * The division filter mirrors src/features/leagues/useStandings.ts — keep them in sync.
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const dryRun = process.argv.includes('--dry-run');
const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/snapshot-ranks.mjs --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

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
  const ops = []; // { uid, position, trend, historyDir | null }

  for (const tab of DIV_TABS) {
    const ranked = players
      .filter((p) => inDivision(p.league, tab))
      .sort((a, b) => b.points - a.points);
    ranked.forEach((p, i) => {
      const position = i + 1;
      const old = p.rankPosition;
      if (old === position) return; // no change
      const trend = old === null ? 'flat' : position < old ? 'up' : 'down';
      ops.push({ uid: p.uid, position, trend, historyDir: old === null ? null : trend });
    });
  }

  console.log(`${ops.length} rank change(s) of ${players.length} ranked players`);
  for (const op of ops.slice(0, 20)) {
    console.log(`  ${op.uid.slice(0, 8)} → #${op.position} (${op.trend})${op.historyDir ? '' : ' [baseline]'}`);
  }
  if (ops.length > 20) console.log(`  … +${ops.length - 20} more`);

  // ── Public homepage counters (site_stats/summary) ──────────────────────────
  // Active Players = distinct users who joined an event OR played a match. Matches Organized =
  // completed matches + 80 (last year's offline matches). event_participants / tournament_matches
  // aren't world-readable, so these are precomputed here for the public landing to read.
  const active = new Set();
  (await db.collection('event_participants').get()).forEach((d) => { const u = d.data().user_id; if (u) active.add(u); });
  snap.forEach((d) => { if ((d.data().matchesPlayed ?? 0) > 0) active.add(d.id); });
  const completed = await db.collection('tournament_matches').where('status', '==', 'complete').count().get();
  const siteStats = { activePlayers: active.size, matchesOrganized: completed.data().count + 80, updatedAt: date };
  console.log(`site_stats → activePlayers=${siteStats.activePlayers}, matchesOrganized=${siteStats.matchesOrganized}`);

  if (dryRun) { console.log('\n(dry run — no writes)'); process.exit(0); }

  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 400)) {
      batch.set(db.collection('stats').doc(op.uid), { rankPosition: op.position, rankTrend: op.trend, rankUpdatedAt: date }, { merge: true });
      if (op.historyDir) {
        batch.set(db.collection('ranking_history').doc(op.uid).collection('entries').doc(), { date, position: op.position, direction: op.historyDir });
      }
    }
    await batch.commit();
  }
  await db.collection('site_stats').doc('summary').set(siteStats, { merge: true });
  console.log(`\nWrote ${ops.length} rank update(s) + site_stats/summary.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
