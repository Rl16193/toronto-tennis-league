import { DrawConfig } from './types';

export const VISIBLE_DRAWS: DrawConfig[] = [
  { tab: 'mens', label: "Men's Challengers", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Challengers' },
  { tab: 'mens', label: "Men's Masters", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Masters' },
  { tab: 'mens', label: "Men's Retired Pro", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Retired Pro' },
  { tab: 'womens', label: "Women's Challengers", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Challengers' },
  { tab: 'womens', label: "Women's Masters", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Masters' },
  { tab: 'womens', label: "Women's Retired Pro", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Retired Pro' },
  { tab: 'doubles', label: "Men's Doubles", tournamentChoice: 'Doubles', division: "Men's", skillGroup: 'All' },
  { tab: 'doubles', label: "Women's Doubles", tournamentChoice: 'Doubles', division: "Women's", skillGroup: 'All' },
  { tab: 'doubles', label: 'Mixed Doubles', tournamentChoice: 'Doubles', division: 'Mixed Doubles', skillGroup: 'All' },
];

export const MENS_MERGED_DRAW: DrawConfig = {
  tab: 'mens',
  label: "Men's Masters",
  tournamentChoice: 'Singles',
  division: "Men's",
  skillGroup: 'All',
};

export const WOMENS_MERGED_DRAW: DrawConfig = {
  tab: 'womens',
  label: "Women's Masters",
  tournamentChoice: 'Singles',
  division: "Women's",
  skillGroup: 'All',
};

export const CONSOLIDATED_DOUBLES_DRAW: DrawConfig = {
  tab: 'doubles',
  label: 'Doubles',
  tournamentChoice: 'Doubles',
  division: 'All',
  skillGroup: 'All',
};
