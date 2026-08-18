/**
 * Pure metric computation for the admin dashboard, kept out of adminMetrics.js so it can be run
 * against an export without Firebase credentials, and so index.js never re-exports a non-function
 * (the Firebase CLI treats every export it finds there as a Cloud Function).
 *
 * Definitions mirror analysis/build-engagement-xlsx.py — change one, change both.
 */
const WINDOW_DAYS = 7;
const RECENT_MATCH_LIMIT = 25;

// ── helpers ──────────────────────────────────────────────────────────────────

const str = (v) => String(v ?? '').trim();
const isoDaysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
/** ISO strings sort lexicographically, so a plain >= is a valid date filter. */
const after = (v, cutoff) => !!v && str(v) >= cutoff;
/** Court `type` is inconsistent in the data ('waitingBoard' vs 'waiting_board'). */
const ctype = (row) => str(row.type).replace(/[^a-z]/gi, '').toLowerCase();


// ── metrics ──────────────────────────────────────────────────────────────────

function computeMetrics(data) {
  const cutoff = isoDaysAgo(WINDOW_DAYS);
  const { users, stats, events, event_participants, matches, courts, tasks, listings, connections,
    preferences } = data;

  const parts = event_participants.filter((p) => !p.removal);
  const completed = matches.filter((m) => str(m.status) === 'complete');
  const completed7 = completed.filter((m) => after(m.completed_at || m.created_at, cutoff));
  const byCat = (rows, ...cats) => rows.filter((m) => cats.includes(str(m.category)));

  const checkins = courts.filter((c) => ['checkin', 'attendance'].includes(ctype(c)));
  const reports = courts.filter((c) => ['condition', 'waitingboard', 'queue'].includes(ctype(c)));
  const checkins7 = checkins.filter((c) => after(c.created_at, cutoff));

  const requests = byCat(matches, 'rally', 'challenge');
  const progress = tasks.filter((t) => !str(t.type));       // per-member progress docs

  const headline = {
    // — activity, rolling 7 days —
    matches_completed_7d: completed7.length,
    matches_tournament_7d: byCat(completed7, 'singles', 'doubles').length,
    matches_challenge_7d: byCat(completed7, 'challenge').length,
    matches_rally_7d: byCat(completed7, 'rally').length,
    new_members_7d: users.filter((u) => after(u.created_at, cutoff)).length,
    new_event_entries_7d: parts.filter((p) => after(p.created_at, cutoff)).length,
    court_checkins_7d: checkins7.length,
    court_reports_7d: reports.filter((c) => after(c.created_at, cutoff)).length,
    requests_created_7d: requests.filter((m) => after(m.created_at, cutoff)).length,
    requests_accepted_7d: requests.filter((m) => after(m.responded_at, cutoff)
      && str(m.status) === 'accepted').length,

    // — totals, current state —
    members_total: users.length,
    members_entered_event: new Set(parts.map((p) => str(p.uid)).filter(Boolean)).size,
    members_played_match: stats.filter((s) => Number(s.matchesPlayed) > 0).length,
    matches_complete_total: completed.length,
    matches_pending_total: matches.length - completed.length,
    members_with_task_record: progress.length,
    listings_live: listings.filter((l) => str(l.status) === 'available').length,
    connections_total: connections.length,
  };

  // — dimensional —
  const courtAgg = new Map();
  for (const c of checkins) {
    const key = str(c.court_name) || str(c.court) || str(c.court_key) || '(unknown)';
    const d = courtAgg.get(key) || { court: key, zone: '', checkins_7d: 0, members: new Set(), last: '' };
    d.zone = d.zone || str(c.zone);
    d.last = d.last > str(c.created_at) ? d.last : str(c.created_at).slice(0, 10);
    if (after(c.created_at, cutoff)) { d.checkins_7d += 1; d.members.add(str(c.uid)); }
    courtAgg.set(key, d);
  }
  const byCourt = [...courtAgg.values()]
    .map((d) => ({ court: d.court, zone: d.zone, checkins_7d: d.checkins_7d,
      distinct_members_7d: d.members.size, last_checkin: d.last }))
    .sort((a, b) => b.checkins_7d - a.checkins_7d || a.court.localeCompare(b.court));

  const zoneAgg = new Map();
  for (const p of preferences) {
    const z = str(p.preferred_zone) || '(none set)';
    zoneAgg.set(z, (zoneAgg.get(z) || 0) + 1);
  }
  const byZone = [...zoneAgg.entries()].map(([zone, members]) => ({ zone, members }))
    .sort((a, b) => b.members - a.members);

  const eventTitle = new Map(events.map((e) => [e._id, str(e.title)]));
  const eventAgg = new Map();
  for (const p of parts) {
    const t = eventTitle.get(str(p.event_id)) || str(p.event_name) || '(unknown)';
    eventAgg.set(t, (eventAgg.get(t) || 0) + 1);
  }
  const byEvent = [...eventAgg.entries()].map(([event, entries]) => ({ event, entries }))
    .sort((a, b) => b.entries - a.entries);

  // A walkover and a no-show are both stored as an ALL-ZERO score (see CLAUDE.md), so printing the
  // raw sets renders a match nobody played as "0-0, 0-0, 0-0". Name the outcome instead, and check
  // no_show first — it is the one case with no winner at all.
  const truthy = (v) => v === true || str(v).toLowerCase() === 'true';
  const setScore = (m) => {
    if (truthy(m.no_show)) return 'No show';
    if (truthy(m.walkover)) return 'Walkover';
    const sets = [1, 2, 3]
      .map((n) => [m[`set_${n}_player_1`], m[`set_${n}_player_2`]])
      .filter(([a, b]) => a !== undefined && a !== '' && b !== undefined && b !== '');
    if (sets.every(([a, b]) => Number(a) === 0 && Number(b) === 0)) return '';
    return sets.map(([a, b]) => `${a}-${b}`).join(', ');
  };

  const recentMatches = completed
    .slice()
    .sort((a, b) => str(b.completed_at).localeCompare(str(a.completed_at)))
    .slice(0, RECENT_MATCH_LIMIT)
    .map((m) => ({
      date: str(m.completed_at).slice(0, 10),
      category: str(m.category),
      player_1: str(m.player_1_name),
      player_2: str(m.player_2_name),
      winner: str(m.winner_name),
      score: setScore(m),
      event: eventTitle.get(str(m.event_id)) || '',
    }));

  // One row per completed match — the fact table real analysis runs on.
  const matchFacts = completed
    .filter((m) => str(m.completed_at))
    .map((m) => ({
      match_id: m._id,
      completed_at: str(m.completed_at),
      category: str(m.category),
      event_id: str(m.event_id),
      player_1_uid: str(m.player_1_uid),
      player_2_uid: str(m.player_2_uid),
      winner_uid: str(m.winner_uid),
      division: str(m.division),
      skill_group: str(m.skill_group),
      zone: str(m.zone),
    }));

  return { headline, byCourt, byZone, byEvent, recentMatches, matchFacts };
}

module.exports = { computeMetrics, WINDOW_DAYS, RECENT_MATCH_LIMIT };
