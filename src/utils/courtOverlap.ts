// Shared "do these two players share a preferred court" check — used wherever a "Nearby" pill
// is shown (Matches page, Tournament match cards, Profile upcoming matches).
export const sharesCourt = (theirCourts: string[] | undefined, myCourts: Set<string>): boolean =>
  !!theirCourts?.some((c) => myCourts.has(c));
