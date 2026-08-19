import { UNASSIGNED_ZONE_ID, type ZoneBucket, type ZoneDrawConfig } from '../types';
import { ZONE_NAMES } from '../../../utils/zones';

/** Map a numeric skill rating to the established tournament draw band. */
export const skillBand = (skill: number): 'Beginners' | 'Challengers' | 'Masters' =>
  skill < 3 ? 'Beginners' : skill < 4 ? 'Challengers' : 'Masters';

export const DEFAULT_ZONE = 'Downtown - Midtown';
export const zoneBucketId = (zone: string) => zone.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
export const DEFAULT_ZONE_BUCKETS: ZoneBucket[] = ZONE_NAMES.map((z) => ({
  id: zoneBucketId(z),
  label: z,
  zones: [z],
}));

/** Follow a zone through merges to the one it plays in. Chains resolve; a cycle bails out. */
export const resolveMergedZone = (bucketId: string, merges: Record<string, string> = {}): string => {
  let current = bucketId;
  const seen = new Set<string>([current]);
  while (merges[current]) {
    const next = merges[current];
    if (seen.has(next)) break;
    seen.add(next);
    current = next;
  }
  return current;
};

/**
 * The zone config actually in force. Zone draws default to ON — an event that never configured
 * zones still gets the standard seven; an explicit `false` from Manage Draw is honoured. Every
 * bucket is kept, including merged-away sources, so a player's zone can be matched before it is
 * redirected to the target bucket.
 */
export const resolveZoneConfig = (cfg: ZoneDrawConfig | undefined): ZoneDrawConfig => ({
  ...(cfg ?? { includeUnassigned: false }),
  enabled: cfg?.enabled ?? true,
  buckets: cfg?.buckets?.length ? cfg.buckets : DEFAULT_ZONE_BUCKETS,
  includeUnassigned: cfg?.includeUnassigned ?? false,
  merges: cfg?.merges ?? {},
});

/**
 * Normalize a missing or merged player zone to the bucket used for placement. A draw or match
 * with no zone belongs to the default zone; this preserves pre-zone draw keys and prevents old
 * running groups from being counted as a separate category.
 */
export const zoneBucketFor = (
  preferredZone: string | undefined,
  zoneConfig: ZoneDrawConfig | undefined,
): string | undefined => {
  if (!zoneConfig?.enabled) return undefined;
  const merges = zoneConfig.merges ?? {};
  const zone = (preferredZone || '').trim();
  const all = zoneConfig.buckets.length ? zoneConfig.buckets : DEFAULT_ZONE_BUCKETS;
  const bucket = zone ? all.find((b) => b.zones.includes(zone)) : undefined;
  if (bucket) return resolveMergedZone(bucket.id, merges);
  const fallback = all.find((b) => b.zones.includes(DEFAULT_ZONE));
  if (fallback) return resolveMergedZone(fallback.id, merges);
  return zoneConfig.includeUnassigned ? UNASSIGNED_ZONE_ID : undefined;
};

/** A missing zone is the Downtown-Midtown bucket used by pre-zone draws. */
export const effectiveZone = (zone?: string | null): string => zone || zoneBucketId(DEFAULT_ZONE);
export const isDefaultZone = (zone?: string | null): boolean => effectiveZone(zone) === zoneBucketId(DEFAULT_ZONE);
