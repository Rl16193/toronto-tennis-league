// Availability is stored as a per-day AM/PM grid: { MON: ['AM','PM'], SAT: ['PM'], … }.
// Legacy docs used two independent lists (availability_day + availability_time); this module
// reads either shape and can derive one from the other.

export const DAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type DayCode = typeof DAY_CODES[number];
export type TimeSlot = 'AM' | 'PM';
export type AvailabilityGrid = Record<string, TimeSlot[]>;

export const DAY_LABELS: Record<DayCode, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
};

// Normalize a legacy day string (MON / Monday / mon) → 3-letter code, or null.
export const normalizeDay = (d: string): DayCode | null => {
  const up = d.trim().toUpperCase().slice(0, 3);
  return (DAY_CODES as readonly string[]).includes(up) ? (up as DayCode) : null;
};

const asSlots = (arr: unknown): TimeSlot[] =>
  (Array.isArray(arr) ? arr : []).filter((s): s is TimeSlot => s === 'AM' || s === 'PM');

/**
 * Return the availability grid for a preferences doc: the `availability` field when present,
 * otherwise derived from the legacy `availability_day` × `availability_time` (each selected day
 * gets all selected times). Empty days are dropped.
 */
export const getAvailabilityGrid = (prefs: {
  availability?: Record<string, string[]>;
  availability_day?: string[];
  availability_time?: string[];
} | null | undefined): AvailabilityGrid => {
  const grid: AvailabilityGrid = {};
  if (!prefs) return grid;

  if (prefs.availability && Object.keys(prefs.availability).length > 0) {
    for (const [day, slots] of Object.entries(prefs.availability)) {
      const code = normalizeDay(day);
      const norm = asSlots(slots);
      if (code && norm.length) grid[code] = norm;
    }
    return grid;
  }

  const times = asSlots(prefs.availability_time);
  for (const d of prefs.availability_day ?? []) {
    const code = normalizeDay(d);
    if (code && times.length) grid[code] = [...times];
  }
  return grid;
};

// Derive the legacy fields from a grid, so old readers keep working during the migration.
export const gridToLegacy = (grid: AvailabilityGrid) => ({
  availability_day: DAY_CODES.filter((d) => (grid[d]?.length ?? 0) > 0),
  availability_time: [...new Set(Object.values(grid).flat())] as TimeSlot[],
});

// Simplified availability — replaces the old per-day AM/PM grid for editing. A player picks any
// number of these 7 preset windows (multi-select, e.g. "Weekday Evenings" + "Weekend Mornings"
// is a valid combination) instead of checking individual day/slot cells.
export type AvailabilityTag =
  | 'weekday_mornings' | 'weekend_mornings' | 'weekend_evenings' | 'weekday_evenings'
  | 'mornings' | 'evenings' | 'anytime';

export const AVAILABILITY_TAGS: { id: AvailabilityTag; label: string }[] = [
  { id: 'weekday_mornings', label: 'Weekday Mornings' },
  { id: 'weekend_mornings', label: 'Weekend Mornings' },
  { id: 'weekend_evenings', label: 'Weekend Evenings' },
  { id: 'weekday_evenings', label: 'Weekday Evenings' },
  { id: 'mornings', label: 'Mornings' },
  { id: 'evenings', label: 'Evenings' },
  { id: 'anytime', label: 'Anytime' },
];

export const availabilityTagLabel = (id: string): string =>
  AVAILABILITY_TAGS.find((t) => t.id === id)?.label || COLLAPSED_LABELS[id] || id;

const COLLAPSED_LABELS: Record<string, string> = {
  weekdays: 'Weekdays',
  weekends: 'Weekends',
};

/**
 * Display-only shortening: someone available both weekday mornings AND weekday evenings is just
 * "available weekdays", and the same for weekends. Four pills on a row is noise; two says the
 * same thing.
 *
 * Purely a render-time transform — the stored tags keep their full detail, so nothing downstream
 * (matching, filtering) loses precision.
 */
export const collapseAvailabilityTags = (tags: string[]): string[] => {
  const has = (t: string) => tags.includes(t);
  const out: string[] = [];

  if (has('weekday_mornings') && has('weekday_evenings')) out.push('weekdays');
  else {
    if (has('weekday_mornings')) out.push('weekday_mornings');
    if (has('weekday_evenings')) out.push('weekday_evenings');
  }

  if (has('weekend_mornings') && has('weekend_evenings')) out.push('weekends');
  else {
    if (has('weekend_mornings')) out.push('weekend_mornings');
    if (has('weekend_evenings')) out.push('weekend_evenings');
  }

  return out;
};

// Best-effort mapping from the old day×AM/PM grid to the new preset tags — used by the one-time
// backfill script so existing users don't appear to have "no availability" set.
export const gridToAvailabilityTags = (grid: AvailabilityGrid): AvailabilityTag[] => {
  const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const;
  const weekend = ['SAT', 'SUN'] as const;
  const has = (days: readonly string[], slot: TimeSlot) => days.some((d) => grid[d]?.includes(slot));
  const wdAM = has(weekdays, 'AM');
  const wdPM = has(weekdays, 'PM');
  const weAM = has(weekend, 'AM');
  const wePM = has(weekend, 'PM');

  if (wdAM && wdPM && weAM && wePM) return ['anytime'];

  const tags: AvailabilityTag[] = [];
  if (wdAM && weAM) tags.push('mornings');
  else {
    if (wdAM) tags.push('weekday_mornings');
    if (weAM) tags.push('weekend_mornings');
  }
  if (wdPM && wePM) tags.push('evenings');
  else {
    if (wdPM) tags.push('weekday_evenings');
    if (wePM) tags.push('weekend_evenings');
  }
  return tags;
};
