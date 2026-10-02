// Levels a player may self-select — the full range.
export const SELECTABLE_SKILL_LEVELS = [2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

// Plain-language bands shown below the selected skill box.
export const SKILL_LEVEL_TIERS = [
  { range: '2–2.5', label: 'Beginner' },
  { range: '3–3.5', label: 'Challengers' },
  { range: '4–5', label: 'Masters' },
] as const;

// Skill band used to sub-group players within a draw: Beginners 2–2.5, Challengers 3–3.5,
// Masters 4–5. The one place the cut-offs live (functions/zoneMoves.js mirrors it server-side).
export const skillBand = (skill: number): 'Beginners' | 'Challengers' | 'Masters' =>
  skill < 3 ? 'Beginners' : skill < 4 ? 'Challengers' : 'Masters';

/** A challenge/rally's `division`: the players' shared league, else 'Mixed'. */
export const pairDivision = (a?: string, b?: string): string => {
  const da = leagueDivision(a), db = leagueDivision(b);
  return da && da === db ? da : 'Mixed';
};

/** A challenge/rally's `skill_group`: the lower of the two bands; one missing → the other; none → ''. */
export const pairSkillGroup = (a?: number, b?: number): string => {
  const levels = [a, b].filter((s): s is number => typeof s === 'number' && s > 0);
  return levels.length ? skillBand(Math.min(...levels)) : '';
};

/** The same band as a singular label for a player card ("Beginner", "Challenger", "Masters"). */
export const skillTier = (skill: number) =>
  ({ Beginners: 'Beginner', Challengers: 'Challenger', Masters: 'Masters' } as const)[skillBand(skill)];

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