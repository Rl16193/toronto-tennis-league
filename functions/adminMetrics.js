// Admin dashboard metrics.
//
// Runs Sunday and Wednesday and lands the same numbers in three places:
//   1. Firestore  admin_stats/dashboard  — one doc, what the future in-app admin view reads
//   2. Google Sheets                      — the human dashboard (4 tabs)
//   3. BigQuery   rs_analytics            — append-only history you can run SQL over
//
// NOT `site_stats`: that collection is `allow read: if true`, so anything written there is public
// to the entire internet. Business numbers get their own collection, organizer-read only.
//
// Activity metrics are a ROLLING 7 DAYS, not "since the last run" — every run is comparable to the
// one before it whatever the gap. Consecutive runs therefore overlap and must never be summed.
//
// The metric definitions mirror analysis/build-engagement-xlsx.py. Both read the same
// post-consolidation collections (`matches` split by `category`, `courts` by `type`, `tasks` by
// `type`); if you change a definition in one, change it in the other or the scheduled numbers and
// the engagement report will disagree.
//
// Deployment is environment-gated. Follow docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md;
// do not use a bare Firebase deploy command from this checkout.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { TZ, REGION } = require('./lib/constants');
// Metric definitions live in lib/ so they can be run against an export without credentials.
const { computeMetrics, WINDOW_DAYS } = require('./lib/adminMetricsCompute');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Same spreadsheet the weekly collection sync writes to.
const SPREADSHEET_ID = '1RpEowUk-fN08Y-zpZwIWL5XVbDESc7L_ZYRoUcbHkvI';
const BQ_DATASET = 'rs_analytics';

// ── data load ────────────────────────────────────────────────────────────────

async function readAll() {
  const names = [
    'users',
    'stats',
    'events',
    'event_participants',
    'matches',
    'courts',
    'tasks',
    'listings',
    'connections',
    'preferences',
  ];
  const snaps = await Promise.all(names.map((n) => db.collection(n).get()));
  const out = {};
  names.forEach((n, i) => {
    out[n] = snaps[i].docs.map((d) => ({ _id: d.id, ...d.data() }));
  });
  return out;
}

// ── Google Sheets ────────────────────────────────────────────────────────────

async function writeSheets(metrics, previous) {
  const { google } = require('googleapis');
  // Application Default Credentials — the function's OWN service account. No key file is bundled
  // into the deploy (see syncFirestoreAndSheets, which still ships one). The spreadsheet must be
  // shared with that service account as an Editor.
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const TABS = ['Dashboard', 'Snapshots', 'By Court', 'Recent Matches'];
  // A missing tab makes values.update fail with "Unable to parse range" — create any up front so
  // a renamed or deleted tab can't take the whole run down.
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = new Set((meta.data.sheets || []).map((s) => s.properties.title));
  const missing = TABS.filter((t) => !existing.has(t));
  if (missing.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
    });
    logger.info(`[adminMetrics] created sheet tab(s): ${missing.join(', ')}`);
  }

  const keys = Object.keys(metrics.headline);
  const label = (k) =>
    k
      .replace(/_7d$/, ' (7d)')
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());

  const put = (range, values) =>
    sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
  const clear = (range) => sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range });

  // Dashboard — current value against the previous run.
  const dash = [['Metric', 'Value', 'Previous run', 'Change']];
  for (const k of keys) {
    const now = metrics.headline[k];
    const was = previous && typeof previous[k] === 'number' ? previous[k] : '';
    dash.push([label(k), now, was, was === '' ? '' : now - was]);
  }
  await clear('Dashboard!A:Z');
  await put('Dashboard!A1', dash);

  // Snapshots — APPEND one row per run. Never cleared; this is the trend history.
  const runDate = new Date().toISOString().slice(0, 10);
  const snapHeader = ['run_date', ...keys];
  const snapRow = [runDate, ...keys.map((k) => metrics.headline[k])];
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Snapshots!A1:A',
  });
  if (!current.data.values || current.data.values.length === 0) {
    await put('Snapshots!A1', [snapHeader, snapRow]);
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Snapshots!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [snapRow] },
    });
  }

  await clear('By Court!A:Z');
  await put('By Court!A1', [
    ['Court', 'Zone', 'Check-ins (7d)', 'Distinct members (7d)', 'Last check-in'],
    ...metrics.byCourt.map((r) => [r.court, r.zone, r.checkins_7d, r.distinct_members_7d, r.last_checkin]),
  ]);

  await clear('Recent Matches!A:Z');
  await put('Recent Matches!A1', [
    ['Date', 'Type', 'Player 1', 'Player 2', 'Winner', 'Score', 'Event'],
    ...metrics.recentMatches.map((r) => [r.date, r.category, r.player_1, r.player_2, r.winner, r.score, r.event]),
  ]);
}

// ── BigQuery ─────────────────────────────────────────────────────────────────

const SNAPSHOT_SCHEMA = [
  { name: 'run_date', type: 'DATE', mode: 'REQUIRED' },
  { name: 'metric', type: 'STRING', mode: 'REQUIRED' },
  { name: 'dimension', type: 'STRING' },
  { name: 'value', type: 'NUMERIC' },
];
const FACT_SCHEMA = [
  { name: 'match_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'completed_at', type: 'TIMESTAMP' },
  { name: 'category', type: 'STRING' },
  { name: 'event_id', type: 'STRING' },
  { name: 'player_1_uid', type: 'STRING' },
  { name: 'player_2_uid', type: 'STRING' },
  { name: 'winner_uid', type: 'STRING' },
  { name: 'division', type: 'STRING' },
  { name: 'skill_group', type: 'STRING' },
  { name: 'zone', type: 'STRING' },
];

async function ensureTable(dataset, name, schema, partitionField) {
  const table = dataset.table(name);
  const [exists] = await table.exists();
  if (exists) return table;
  await dataset.createTable(name, {
    schema,
    timePartitioning: { type: 'DAY', field: partitionField },
  });
  logger.info(`[adminMetrics] created BigQuery table ${name}`);
  return dataset.table(name);
}

async function writeBigQuery(metrics) {
  const { BigQuery } = require('@google-cloud/bigquery');
  const bq = new BigQuery();
  const dataset = bq.dataset(BQ_DATASET);
  const [dsExists] = await dataset.exists();
  if (!dsExists) {
    logger.warn(
      `[adminMetrics] BigQuery dataset "${BQ_DATASET}" does not exist — skipping. Create it once, then this starts filling.`,
    );
    return;
  }

  await ensureTable(dataset, 'metric_snapshots', SNAPSHOT_SCHEMA, 'run_date');
  await ensureTable(dataset, 'match_facts', FACT_SCHEMA, 'completed_at');

  const runDate = new Date().toISOString().slice(0, 10);

  // Long format — one row per metric per run. Adding a metric never needs a schema change.
  const rows = Object.entries(metrics.headline).map(([metric, value]) => ({ metric, dimension: null, value }));
  for (const r of metrics.byCourt)
    rows.push({ metric: 'court_checkins_7d_by_court', dimension: r.court, value: r.checkins_7d });
  for (const r of metrics.byZone) rows.push({ metric: 'members_by_zone', dimension: r.zone, value: r.members });
  for (const r of metrics.byEvent) rows.push({ metric: 'entries_by_event', dimension: r.event, value: r.entries });

  // DML, not streaming inserts: rows in the streaming buffer cannot be deleted, which would make a
  // manual re-run double-count. Delete-then-insert keeps a run idempotent.
  await bq.query({
    query: `DELETE FROM \`${BQ_DATASET}.metric_snapshots\` WHERE run_date = @run_date`,
    params: { run_date: runDate },
  });
  await bq.query({
    query: `INSERT INTO \`${BQ_DATASET}.metric_snapshots\` (run_date, metric, dimension, value)
            SELECT @run_date, metric, dimension, value
            FROM UNNEST(@rows) AS r`,
    params: { run_date: runDate, rows },
    types: {
      run_date: 'DATE',
      rows: [{ metric: 'STRING', dimension: 'STRING', value: 'NUMERIC' }],
    },
  });

  // Completed matches are effectively immutable, so the fact table is rebuilt wholesale — at this
  // volume that is cheaper to reason about than an incremental merge.
  await bq.query({ query: `TRUNCATE TABLE \`${BQ_DATASET}.match_facts\`` });
  if (metrics.matchFacts.length) {
    await bq.query({
      query: `INSERT INTO \`${BQ_DATASET}.match_facts\`
              (match_id, completed_at, category, event_id, player_1_uid, player_2_uid, winner_uid, division, skill_group, zone)
              SELECT match_id, TIMESTAMP(completed_at), category, event_id,
                     player_1_uid, player_2_uid, winner_uid, division, skill_group, zone
              FROM UNNEST(@rows)`,
      params: { rows: metrics.matchFacts },
      types: {
        rows: [
          {
            match_id: 'STRING',
            completed_at: 'STRING',
            category: 'STRING',
            event_id: 'STRING',
            player_1_uid: 'STRING',
            player_2_uid: 'STRING',
            winner_uid: 'STRING',
            division: 'STRING',
            skill_group: 'STRING',
            zone: 'STRING',
          },
        ],
      },
    });
  }
  logger.info(`[adminMetrics] BigQuery: ${rows.length} snapshot rows, ${metrics.matchFacts.length} match facts`);
}

// ── entry point ──────────────────────────────────────────────────────────────

exports.aggregateAdminMetrics = onSchedule(
  // 06:00 Toronto, Sunday and Wednesday. Explicit timeZone — the bare cron form defaults to UTC.
  { schedule: '0 6 * * 0,3', timeZone: TZ, region: REGION, timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    const data = await readAll();
    const metrics = computeMetrics(data);

    // Firestore first: it's the one the app depends on, so it must land even if an external
    // service is down. Each target is isolated so one failure can't take the others with it.
    const prevSnap = await db
      .doc('admin_stats/dashboard')
      .get()
      .catch(() => null);
    const previous = prevSnap && prevSnap.exists ? prevSnap.data().headline : null;

    await db.doc('admin_stats/dashboard').set({
      headline: metrics.headline,
      by_court: metrics.byCourt.slice(0, 20),
      by_zone: metrics.byZone,
      by_event: metrics.byEvent,
      window_days: WINDOW_DAYS,
      generated_at: new Date().toISOString(),
    });
    logger.info('[adminMetrics] wrote admin_stats/dashboard', metrics.headline);

    try {
      await writeSheets(metrics, previous);
      logger.info('[adminMetrics] sheets updated');
    } catch (err) {
      logger.error('[adminMetrics] sheets write failed', err);
    }

    try {
      await writeBigQuery(metrics);
    } catch (err) {
      logger.error('[adminMetrics] bigquery write failed', err);
    }
  },
);
