// Availability is a set of preset windows on `preferences.availability_tags`.
// The per-day AM/PM grid and the availability_day/availability_time lists it replaced are gone
// from both the code and the database - tags are the only representation.

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
