/** Pure Round Robin primitives. Persistence and rendering stay outside this module. */

/**
 * Split n players into balanced groups of 3–5: g = ceil(n/5), sizes differ by at most 1,
 * larger groups first. n<3 retains the existing single-group behavior.
 */
export function splitEvenly(n: number): number[] {
  if (n <= 0) return [];
  const g = Math.max(1, Math.ceil(n / 5));
  const base = Math.floor(n / g);
  const rem = n % g;
  return Array.from({ length: g }, (_, i) => (i < rem ? base + 1 : base));
}

/** Circle-method Round Robin: every unique [i, j] pairing once, with a ghost bye when needed. */
export function generateGroupPairings(n: number): [number, number][] {
  if (n < 2) return [];
  const pairs: [number, number][] = [];

  const padded = n % 2 === 0 ? n : n + 1;
  const arr = Array.from({ length: padded }, (_, i) => (i < n ? i : -1));

  for (let r = 0; r < padded - 1; r++) {
    for (let i = 0; i < padded / 2; i++) {
      const p1 = arr[i];
      const p2 = arr[padded - 1 - i];
      if (p1 !== -1 && p2 !== -1) {
        pairs.push([Math.min(p1, p2), Math.max(p1, p2)]);
      }
    }
    const last = arr[padded - 1];
    for (let i = padded - 1; i > 1; i--) arr[i] = arr[i - 1];
    arr[1] = last;
  }

  return pairs;
}
