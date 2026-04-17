export const SKILL_LEVELS = [2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

export const SKILL_DESCRIPTIONS: Record<number, string> = {
  2: 'I know how to hit the ball over the net',
  2.5: 'I know basic footwork and can sustain short rallies',
  3: 'I have good ground strokes (Forehand/Backhand)',
  3.5: 'I know how to serve',
  4: 'I can play points and have long rallies',
  4.5: 'Advanced strokes (Net-Play, trickshots) and strong serve',
  5: 'Expert / professional level',
};

export const TOURNAMENT_OPTIONS = [
  { name: 'Beginners', range: '2.0-2.5' },
  { name: 'Challengers', range: '3.0-3.5' },
  { name: 'Masters', range: '4.0-5.0' },
] as const;