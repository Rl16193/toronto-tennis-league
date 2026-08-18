/**
 * Scheduled port of scripts/snapshot-ranks.mjs — same logic, running on its own instead of
 * requiring a manual `node scripts/snapshot-ranks.mjs --key serviceAccount.json` run. The
 * manual script is kept for ad-hoc/dry-run use; keep both in sync if this logic changes.
 *
 * Per division (Men's / Women's / Doubles) ranks players by `leaguePoints26`, updates
 * `rankPosition`/`rankTrend` on `stats` and appends `ranking_history` on a change. Also
 * refreshes the public `site_stats/summary` counters (Players = distinct event_participants
 * user_id, Matches = completed tournament matches + 70) — neither source collection is
 * world-readable, so this precomputes them for the public landing page to read.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

const { TZ, REGION } = require('./lib/constants');
const db = () => admin.firestore();

// Mirror of inDivision() in src/features/leagues/useStandings.ts — keep in sync.
const DIV_TABS = ['mens', 'womens', 'doubles'];
const inDivision = (league, tab) => {
  const l = (league || '').toLowerCase();
  if (tab === 'mens') return (l.includes('men') || l.includes('male')) && !l.includes('women') && !l.includes('female');
  if (tab === 'womens') return l.includes('wom') || l.includes('female');
  if (tab === 'doubles') return l.includes('double') || l.includes('mixed');
  return false;
};

exports.weeklyRankSnapshot = onSchedule(
  { schedule: '0 1 * * 6', timeZone: TZ, region: REGION },
  async () => {
    const snap = await db().collection('stats').get();
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
      const ranked = players
        .filter((p) => inDivision(p.league, tab))
        .sort((a, b) => b.points - a.points);
      ranked.forEach((p, i) => {
        const position = i + 1;
        const old = p.rankPosition;
        if (old === position) return; // no change
        const trend = old === null ? 'flat' : position < old ? 'up' : 'down';
        const move = old === null ? 0 : Math.abs(old - position);
        ops.push({ uid: p.uid, position, trend, move, historyDir: old === null ? null : trend });
      });
    }

    const active = new Set();
    (await db().collection('event_participants').get()).forEach((d) => { const u = d.data().uid; if (u) active.add(u); });
    const completed = await db().collection('matches').where('category', 'in', ['singles', 'doubles']).where('status', '==', 'complete').count().get();
    // snake_case, matching every other site_stats doc — this one was the lone camelCase holdout.
    const siteStats = { active_players: active.size, matches_organized: completed.data().count + 70, updated_at: date };

    for (let i = 0; i < ops.length; i += 400) {
      const batch = db().batch();
      for (const op of ops.slice(i, i + 400)) {
        batch.set(db().collection('stats').doc(op.uid), { rankPosition: op.position, rankTrend: op.trend, rankMove: op.move, rankUpdatedAt: date }, { merge: true });
        if (op.historyDir) {
          batch.set(db().collection('ranking_history').doc(op.uid).collection('entries').doc(), { date, position: op.position, direction: op.historyDir });
        }
      }
      await batch.commit();
    }
    await db().collection('site_stats').doc('summary').set(siteStats, { merge: true });
    logger.info(`weeklyRankSnapshot: ${ops.length} rank update(s), site_stats active_players=${siteStats.active_players} matches_organized=${siteStats.matches_organized}`);
  },
);
