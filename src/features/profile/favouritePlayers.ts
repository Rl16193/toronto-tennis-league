import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { leagueDivision } from '../../utils/skillLevels';

/**
 * Suggestions for the "favourite players" field, ranked by how many members picked each name.
 *
 * There is no curated list — the five hardcoded names this replaced were a guess that never
 * matched what people actually typed. The vocabulary is now whatever members have entered, so it
 * starts thin and sharpens as the league fills it in. Free text is the only way it grows.
 *
 * The read is deliberately lazy (`enabled`): it's a full pass over `preferences`, and the Profile
 * page shouldn't pay for it unless someone actually opens the editor.
 */
type PrefDoc = { id: string; favourite_players?: string[] };

const rank = (docs: PrefDoc[]): string[] => {
  const counts = new Map<string, number>();
  for (const d of docs) {
    // A name is only counted once per member, however many times it appears in their array.
    for (const raw of new Set(d.favourite_players ?? [])) {
      const name = String(raw).trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
};

/** The whole ranked list, plus the top 3 picked by each league's members. */
export type FavouriteOptions = {
  all: string[];
  mens: string[];
  womens: string[];
};

const EMPTY: FavouriteOptions = { all: [], mens: [], womens: [] };

let cache: FavouriteOptions | null = null;

export function useFavouritePlayerOptions(enabled: boolean): FavouriteOptions {
  const [options, setOptions] = useState<FavouriteOptions>(() => cache ?? EMPTY);

  useEffect(() => {
    if (!enabled || cache) return;
    let cancelled = false;
    // Two full collection reads, but only once per session and only after the editor opens.
    // `stats` is needed purely for `league`, which is what splits the quick picks in two;
    // `preferences` doesn't carry the division.
    Promise.all([getDocs(collection(db, 'preferences')), getDocs(collection(db, 'stats'))])
      .then(([prefSnap, statsSnap]) => {
        const divisionByUid = new Map<string, string>();
        for (const d of statsSnap.docs) {
          divisionByUid.set(d.id, leagueDivision((d.data() as { league?: string }).league));
        }
        const prefs: PrefDoc[] = prefSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as { favourite_players?: string[] }),
        }));
        cache = {
          all: rank(prefs),
          mens: rank(prefs.filter((p) => divisionByUid.get(p.id) === "Men's")).slice(0, 3),
          womens: rank(prefs.filter((p) => divisionByUid.get(p.id) === "Women's")).slice(0, 3),
        };
        if (!cancelled) setOptions(cache);
      })
      .catch(() => { /* suggestions are a convenience — free text still works */ });
    return () => { cancelled = true; };
  }, [enabled]);

  return options;
}

/**
 * Filters the ranked list for the typed query, dropping anything already chosen. Mirrors
 * getCourtSuggestions in features/signup/utils/courtSearch.ts: prefix matches first, then
 * substring, capped so the dropdown never runs off the screen.
 */
export const getFavouritePlayerSuggestions = (
  options: string[],
  chosen: string[],
  query: string,
  limit = 6,
): string[] => {
  const q = query.trim().toLowerCase();
  const available = options.filter((o) => !chosen.includes(o));
  if (!q) return available.slice(0, limit);
  const starts = available.filter((o) => o.toLowerCase().startsWith(q));
  const contains = available.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
};
