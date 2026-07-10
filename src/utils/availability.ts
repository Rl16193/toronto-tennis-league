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
