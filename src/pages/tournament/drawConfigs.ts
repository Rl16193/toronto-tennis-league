import { DrawConfig, SkillGroup, SKILL_GROUP_ORDER, SkillMergePair } from './types';

export const VISIBLE_DRAWS: DrawConfig[] = [
  { tab: 'mens', label: "Men's Beginners", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Beginners' },
  { tab: 'mens', label: "Men's Challengers", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Challengers' },
  { tab: 'mens', label: "Men's Masters", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Masters' },
  { tab: 'mens', label: "Men's Retired Pro", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Retired Pro' },
  { tab: 'womens', label: "Women's Beginners", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Beginners' },
  { tab: 'womens', label: "Women's Challengers", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Challengers' },
  { tab: 'womens', label: "Women's Masters", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Masters' },
  { tab: 'womens', label: "Women's Retired Pro", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Retired Pro' },
  { tab: 'doubles', label: "Men's Doubles", tournamentChoice: 'Doubles', division: "Men's", skillGroup: 'All' },
  { tab: 'doubles', label: "Women's Doubles", tournamentChoice: 'Doubles', division: "Women's", skillGroup: 'All' },
  { tab: 'doubles', label: 'Mixed Doubles', tournamentChoice: 'Doubles', division: 'Mixed Doubles', skillGroup: 'All' },
];

// The strongest band in a merge — Beginners+Challengers is a Challengers draw, anything including
// Masters is a Masters draw. SKILL_GROUP_ORDER runs weakest → strongest, so the highest index wins.
export const highestBandIn = (pair: SkillMergePair): SkillGroup =>
  (pair.split('+') as SkillGroup[])
    .reduce((best, b) => (SKILL_GROUP_ORDER.indexOf(b) > SKILL_GROUP_ORDER.indexOf(best) ? b : best));

// A merged singles skill draw for one adjacent pair (Beginners+Challengers, or
// Challengers+Masters). Replaces the old static MENS/WOMENS_MERGED_DRAW constants now that
// there's more than one possible pair per division.
//
// Named after the strongest band rather than every band glued together: a merged draw plays as
// that band, and "Men's Beginners + Challengers + Masters" was both a mouthful and misleading.
export const buildMergedSkillDraw = (tab: 'mens' | 'womens', division: "Men's" | "Women's", pair: SkillMergePair): DrawConfig => ({
  tab,
  label: `${division} ${highestBandIn(pair)}`,
  tournamentChoice: 'Singles',
  division,
  skillGroup: 'All',
  mergedFrom: pair,
});

export const CONSOLIDATED_DOUBLES_DRAW: DrawConfig = {
  tab: 'doubles',
  label: 'Doubles',
  tournamentChoice: 'Doubles',
  division: 'All',
  skillGroup: 'All',
};
