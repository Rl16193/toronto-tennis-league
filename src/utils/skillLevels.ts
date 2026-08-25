export const SKILL_LEVELS = [2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

// Levels a player may self-select — the full range, matching SKILL_LEVELS.
export const SELECTABLE_SKILL_LEVELS = [2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

// Plain-language bands shown below the selected skill box.
export const SKILL_LEVEL_TIERS = [
  { range: '2–2.5', label: 'Beginner' },
  { range: '3–3.5', label: 'Challengers' },
  { range: '4–5', label: 'Masters' },
] as const;

export const TOURNAMENT_OPTIONS = [
  { name: 'Beginners', range: '2.0-2.5' },
  { name: 'Challengers', range: '3.0-3.5' },
  { name: 'Masters', range: '4.0-5.0' },
] as const;

// Normalize the free-text stats.league into the Men's/Women's selector value ("women" first —
// it contains "men").
export const leagueDivision = (league?: string): "Men's" | "Women's" | '' => {
  const l = (league || '').toLowerCase();
  if (l.includes('wom') || l.includes('female')) return "Women's";
  if (l.includes('men') || l.includes('male')) return "Men's";
  return '';
};

// Age category is an optional suffix on stats.league (e.g. "Men's Retired Pro", "Women's
// Juniors") — set from Signup or Profile's League chips. Mutually exclusive by construction
// (only one suffix is ever appended), so these checks double as the "which one" question.
export const isSeniorsLeague = (league?: string) => (league || '').toLowerCase().includes('retired pro');
export const isJuniorsLeague = (league?: string) => (league || '').toLowerCase().includes('junior');
export const leagueAgeCategory = (league?: string): 'Retired Pro' | 'Juniors' | '' => {
  if (isSeniorsLeague(league)) return 'Retired Pro';
  if (isJuniorsLeague(league)) return 'Juniors';
  return '';
};
