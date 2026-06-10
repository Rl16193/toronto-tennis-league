import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { getDocs, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { parseCsvLine } from '../features/signup/utils/courtSearch';
import { Search, Loader2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type CsvCourt = {
  name: string;
  dropdown: string;
  lat: number;
  lng: number;
  address: string;
  courtType: string;
  numCourts: number;
  lights: boolean;
  clubInfo: string;
};

type CourtWithCount = CsvCourt & { count: number; hasPrograms: boolean };

type TennisProgram = {
  courseId: string;
  locationId: string;
  locationName: string;
  address: string;
  title: string;
  days: string;
  dateRange: string;
  timeRange: string;
  ageRange: string;
  minAgeYr: number | null;
  maxAgeYr: number | null;
  status: string;
  activityUrl: string;
  lat?: number;
  lng?: number;
};

type NearestCourt = CourtWithCount & { distKm: number };
type NearestProgram = TennisProgram & { distKm: number | null };

// ─── Constants ────────────────────────────────────────────────────────────────

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TORONTO_CENTER: [number, number] = [43.718, -79.38];

const COURT_ALIASES: Record<string, string> = {
  'stanley park': 'stanley park south - toronto',
};

const MONTH_ABBR: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const PROGRAM_LOCATION_ADDRESSES: Record<string, string> = {
  '9': '101 Emmett Ave, Toronto',
  '27': '81 Ranleigh Ave, Toronto',
  '33': '454 Avenue Rd, Toronto',
  '96': '181 Cleveland St, Toronto',
  '127': '1725 Gerrard St E, Toronto',
  '155': '870 Queen St E, Toronto',
  '220': '19 Coleman Ave, Toronto',
  '241': '790 Queen St W, Toronto',
  '276': '181 Westview Blvd, Toronto',
  '329': '1081 Pape Ave, Toronto',
  '348': '289 Sorauren Ave, Toronto',
  '405': '4325 Mccowan Rd, Toronto',
  '472': '1507 Lawrence Ave W, Toronto',
  '484': '151 Culford Rd, Toronto',
  '487': '41 Ancaster Rd, Toronto',
  '510': '569 Jane St, Toronto',
  '514': '1200 Lansdowne Ave, Toronto',
  '582': '165 Grenoble Dr, Toronto',
  '638': '35 Glen Long Ave, Toronto',
  '643': '45 Goulding Ave, Toronto',
  '648': '23 Grandravine Dr, Toronto',
  '665': '205 Wilmington Ave, Toronto',
  '699': '300 Silver Springs Blvd, Toronto',
  '712': '2467 Eglinton Ave E, Toronto',
  '750': '10 Rampart Rd, Toronto',
  '755': '850 Humberwood Blvd, Toronto',
  '793': '18 Ourland Ave, Toronto',
  '797': '105 Norseman St, Toronto',
  '892': '590 Rathburn Rd, Toronto',
  '959': '46 Kingsview Blvd, Toronto',
  '1056': '29 St Dennis Dr, Toronto',
  '1078': '28 Colonel Samuel Smith Park Dr, Toronto',
  '1105': '2500 Birchmount Rd, Toronto',
  '1132': '10 Toledo Rd, Toronto',
  '1234': '90 Thirty First St, Toronto',
  '1236': '95 Mimico Ave, Toronto',
  '1237': '130 Lloyd Manor Rd, Toronto',
  '1288': '71 Ballacaine Dr, Toronto',
  '2831': '50 Davisville Ave, Toronto',
};

const locationGeoCache = new Map<string, { lat: number; lng: number } | null>();

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function parseDateStr(s: string): Date | null {
  const parts = s.trim().split('-');
  if (parts.length !== 3) return null;
  const m = MONTH_ABBR[parts[0]];
  if (m === undefined) return null;
  const yr = parseInt(parts[2]);
  const day = parseInt(parts[1]);
  if (isNaN(yr) || isNaN(day)) return null;
  return new Date(yr, m, day);
}

function toYears(months: string | undefined): number | null {
  if (!months || months === 'None') return null;
  const m = parseInt(months);
  return isNaN(m) ? null : Math.floor(m / 12);
}

function matchCourtName(
  preference: string,
  byDropdown: Map<string, CsvCourt>,
  byName: Map<string, CsvCourt>,
): CsvCourt | undefined {
  const raw = preference.toLowerCase().trim();
  const pref = COURT_ALIASES[raw] ?? raw;
  if (byDropdown.has(pref)) return byDropdown.get(pref);
  if (byName.has(pref)) return byName.get(pref);
  for (const [key, court] of byDropdown) {
    if (key.startsWith(pref) || pref.startsWith(key)) return court;
  }
  for (const [key, court] of byName) {
    if (key.startsWith(pref) || pref.startsWith(key)) return court;
  }
  return undefined;
}

function parseCourts(csvText: string): CsvCourt[] {
  const [headerLine, ...lines] = csvText.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const idx = (col: string) => headers.indexOf(col);
  const iName = idx('Name'), iDropdown = idx('Dropdown'), iType = idx('Type');
  const iLights = idx('Lights'), iCourts = idx('Courts');
  const iAddress = idx('LocationAddress'), iGeom = idx('geometry');
  const iClubInfo = idx('ClubInfo');

  const courts: CsvCourt[] = [];
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const geomRaw = cells[iGeom];
    if (!geomRaw) continue;
    try {
      const geom = JSON.parse(geomRaw) as { coordinates: [[number, number]] };
      const [lng, lat] = geom.coordinates[0];
      const dropdown = cells[iDropdown]?.trim() || cells[iName]?.trim() || '';
      if (!dropdown || !lat || !lng) continue;
      courts.push({
        name: cells[iName]?.trim() || dropdown,
        dropdown,
        lat, lng,
        address: cells[iAddress]?.trim() || '',
        courtType: cells[iType]?.trim() || '',
        numCourts: parseInt(cells[iCourts]) || 0,
        lights: cells[iLights]?.trim().toLowerCase() === 'yes',
        clubInfo: iClubInfo >= 0 ? (cells[iClubInfo]?.trim() || '') : '',
      });
    } catch { /* skip malformed */ }
  }
  return courts;
}

function parsePrograms(
  programCsv: string,
  byDropdown: Map<string, CsvCourt>,
  byName: Map<string, CsvCourt>,
): TennisProgram[] {
  const [headerLine, ...lines] = programCsv.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const pIdx = (col: string) => headers.indexOf(col);

  const iCourseId = pIdx('Course_ID'), iLocId = pIdx('Location ID');
  const iLocName = pIdx('Location Name'), iSection = pIdx('Section');
  const iCourseTitle = pIdx('Course Title'), iDays = pIdx('Days of The Week');
  const iFromTo = pIdx('From To'), iStartHr = pIdx('Start Hour');
  const iStartMin = pIdx('Start Min'), iEndHr = pIdx('End Hour');
  const iEndMin = pIdx('End Min'), iMinAge = pIdx('Min Age');
  const iMaxAge = pIdx('Max Age'), iStatus = pIdx('Status / Information');
  const iActivityUrl = pIdx('Activity URL');

  const programs: TennisProgram[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const cells = parseCsvLine(line);
    if (!cells[iSection]?.toLowerCase().includes('tennis')) continue;
    const courseId = cells[iCourseId]?.trim() || '';
    if (!courseId || seen.has(courseId)) continue;
    seen.add(courseId);

    const locationId = cells[iLocId]?.trim() || '';
    const locationName = cells[iLocName]?.trim() || '';
    const address = PROGRAM_LOCATION_ADDRESSES[locationId] || '';

    const pad = (s: string) => s.padStart(2, '0');
    const timeRange = `${pad(cells[iStartHr]?.trim() || '0')}:${pad(cells[iStartMin]?.trim() || '0')}–${pad(cells[iEndHr]?.trim() || '0')}:${pad(cells[iEndMin]?.trim() || '0')}`;

    const minAgeYr = toYears(cells[iMinAge]?.trim());
    const maxAgeYr = toYears(cells[iMaxAge]?.trim());
    const ageRange = minAgeYr !== null && maxAgeYr !== null
      ? `${minAgeYr}–${maxAgeYr} yr`
      : minAgeYr !== null
      ? `${minAgeYr}+ yr`
      : 'All ages';

    const courtMatch = locationName ? matchCourtName(locationName, byDropdown, byName) : undefined;
    if (courtMatch && !locationGeoCache.has(locationId)) {
      locationGeoCache.set(locationId, { lat: courtMatch.lat, lng: courtMatch.lng });
    }
    const cached = locationGeoCache.get(locationId);

    programs.push({
      courseId, locationId,
      locationName: locationName || address,
      address,
      title: cells[iCourseTitle]?.trim() || '',
      days: cells[iDays]?.trim() || '',
      dateRange: cells[iFromTo]?.trim() || '',
      timeRange, ageRange,
      minAgeYr, maxAgeYr,
      status: cells[iStatus]?.trim() || '',
      activityUrl: iActivityUrl >= 0 ? (cells[iActivityUrl]?.trim() || '') : '',
      lat: cached?.lat,
      lng: cached?.lng,
    });
  }
  return programs;
}


async function geocodeQuery(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=ca`;
  const res = await fetch(url, { headers: { 'User-Agent': 'toronto-tennis-league' } });
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function geocodeLocationId(locationId: string, locationName: string): Promise<{ lat: number; lng: number } | null> {
  if (locationGeoCache.has(locationId)) return locationGeoCache.get(locationId) ?? null;
  const address = PROGRAM_LOCATION_ADDRESSES[locationId] || '';
  const query = locationName ? `${locationName} Toronto` : address;
  if (!query) { locationGeoCache.set(locationId, null); return null; }
  try {
    const coords = await geocodeQuery(query);
    locationGeoCache.set(locationId, coords);
    return coords;
  } catch {
    locationGeoCache.set(locationId, null);
    return null;
  }
}

// ─── Marker icon (SVG DivIcon) ────────────────────────────────────────────────

function hasPublicHours(court: CourtWithCount): boolean {
  return court.courtType.toLowerCase() === 'club'
    && !!court.clubInfo
    && !court.clubInfo.toLowerCase().includes('private');
}

function courtMarkerIcon(court: CourtWithCount) {
  const hasPlayers = court.count > 0;
  const bigCount = court.count >= 10;
  const s = !hasPlayers ? 12 : bigCount ? 30 : 20;
  const r = s / 2;
  const label = String(court.count);
  const fs = bigCount ? 8 : 10;

  let html: string;
  if (hasPlayers && court.hasPrograms) {
    // Green + Yellow split: players AND programs
    html = `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <path d="M${r},0 A${r},${r} 0 0,0 ${r},${s} Z" fill="#15803d" opacity="0.95"/>
      <path d="M${r},0 A${r},${r} 0 0,1 ${r},${s} Z" fill="#eab308" opacity="0.95"/>
      <text x="${r}" y="${r}" dominant-baseline="central" text-anchor="middle" fill="white" font-size="${fs}" font-family="sans-serif" font-weight="bold">${label}</text>
    </svg>`;
  } else if (hasPlayers && hasPublicHours(court)) {
    // Green + Blue split: players AND public hours
    html = `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <path d="M${r},0 A${r},${r} 0 0,0 ${r},${s} Z" fill="#15803d" opacity="0.95"/>
      <path d="M${r},0 A${r},${r} 0 0,1 ${r},${s} Z" fill="#3b82f6" opacity="0.95"/>
      <text x="${r}" y="${r}" dominant-baseline="central" text-anchor="middle" fill="white" font-size="${fs}" font-family="sans-serif" font-weight="bold">${label}</text>
    </svg>`;
  } else if (hasPlayers) {
    // Green: players only
    html = `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${r}" cy="${r}" r="${r}" fill="#15803d" opacity="0.95"/>
      <text x="${r}" y="${r}" dominant-baseline="central" text-anchor="middle" fill="white" font-size="${fs}" font-family="sans-serif" font-weight="bold">${label}</text>
    </svg>`;
  } else if (court.hasPrograms) {
    // Yellow: programs, no players
    html = `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${r}" cy="${r}" r="${r}" fill="#eab308" opacity="0.82"/>
    </svg>`;
  } else if (hasPublicHours(court)) {
    // Blue: public hours available (clubInfo non-empty and not "Private")
    html = `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${r}" cy="${r}" r="${r}" fill="#3b82f6" opacity="0.82"/>
    </svg>`;
  } else {
    // Orange: nothing
    html = `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${r}" cy="${r}" r="${r}" fill="#f97316" opacity="0.82"/>
    </svg>`;
  }
  return divIcon({ html, className: '', iconSize: [s, s], iconAnchor: [r, r], popupAnchor: [0, -(r + 4)] });
}

// ─── FitBounds ────────────────────────────────────────────────────────────────

const FitBounds: React.FC<{ bounds: [number, number][] }> = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds.length > 0) map.fitBounds(bounds as [number, number][], { padding: [60, 60], maxZoom: 14 });
  }, [bounds, map]);
  return null;
};

// ─── Filter chip UI ───────────────────────────────────────────────────────────

function ChipGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-white text-xs shrink-0">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value === value ? '' : opt.value)}
          className={`px-2 py-0.5 rounded-md text-xs transition-colors ${
            value === opt.value
              ? 'bg-clay text-white'
              : 'bg-white/10 text-white/60 hover:bg-white/20'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DaysChips({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-white text-xs shrink-0">Days:</span>
      {DAYS.map((d) => (
        <button
          key={d}
          onClick={() => {
            const next = new Set(selected);
            if (next.has(d)) next.delete(d); else next.add(d);
            onChange(next);
          }}
          className={`px-2 py-0.5 rounded-md text-xs transition-colors ${
            selected.has(d) ? 'bg-clay text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
          }`}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const CourtMap: React.FC = () => {
  const [courts, setCourts] = useState<CourtWithCount[]>([]);
  const [programs, setPrograms] = useState<TennisProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [fitBounds, setFitBounds] = useState<[number, number][]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showCourtsTable, setShowCourtsTable] = useState(false);
  const [showProgramsTable, setShowProgramsTable] = useState(false);
  const [searchingMode, setSearchingMode] = useState<'courts' | 'programs' | null>(null);

  // Courts filters
  const [courtTypeFilter, setCourtTypeFilter] = useState('');
  const [courtLightsFilter, setCourtLightsFilter] = useState('');

  // Programs filters (Time and Program removed)
  const [progDaysFilter, setProgDaysFilter] = useState(new Set<string>());
  const [progAgeFilter, setProgAgeFilter] = useState('');
  const [progStatusFilter, setProgStatusFilter] = useState('');

  const [courtsShowMore, setCourtsShowMore] = useState(false);
  const [programsShowMore, setProgramsShowMore] = useState(false);

  const [suggestions, setSuggestions] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const geocodingActiveRef = useRef(false);

  // ── Filtered + sorted courts ───────────────────────────────────────────────
  const displayedCourts = useMemo((): NearestCourt[] => {
    let list = courts;
    if (courtTypeFilter === 'Public') list = list.filter((c) => c.courtType.toLowerCase() === 'public');
    if (courtTypeFilter === 'Club') list = list.filter((c) => c.courtType.toLowerCase() === 'club');
    if (courtLightsFilter === 'yes') list = list.filter((c) => c.lights);
    if (courtLightsFilter === 'no') list = list.filter((c) => !c.lights);
    return list
      .map((c) => ({
        ...c,
        distKm: userCoords ? haversineKm(userCoords.lat, userCoords.lng, c.lat, c.lng) : 0,
      }))
      .sort((a, b) => a.distKm - b.distKm);
  }, [courts, courtTypeFilter, courtLightsFilter, userCoords]);

  // ── Filtered + sorted programs ─────────────────────────────────────────────
  const displayedPrograms = useMemo((): NearestProgram[] => {
    const today = new Date();
    let list = programs;

    if (progStatusFilter) {
      list = list.filter((p) => {
        const parts = p.dateRange.split(' to ');
        const start = parseDateStr(parts[0] || '');
        const end = parts.length > 1 ? parseDateStr(parts[1]) : null;
        if (progStatusFilter === 'ongoing') return start !== null && end !== null && start <= today && end >= today;
        if (progStatusFilter === 'upcoming') return start !== null && start > today;
        return true;
      });
    }

    if (progDaysFilter.size > 0) {
      list = list.filter((p) => {
        const days = p.days.split(/[,\s]+/).map((d) => d.trim()).filter(Boolean);
        return days.some((d) => progDaysFilter.has(d));
      });
    }

    if (progAgeFilter === 'under13') {
      list = list.filter((p) => (p.minAgeYr ?? 0) < 13);
    } else if (progAgeFilter === '13to18') {
      list = list.filter((p) => { const m = p.minAgeYr ?? 0; return m >= 13 && m <= 18; });
    } else if (progAgeFilter === '19plus') {
      list = list.filter((p) => (p.minAgeYr ?? 0) >= 19);
    }

    const scored: NearestProgram[] = list.map((p) => ({
      ...p,
      distKm:
        p.lat !== undefined && p.lng !== undefined && userCoords
          ? haversineKm(userCoords.lat, userCoords.lng, p.lat, p.lng)
          : null,
    }));
    const withDist = scored.filter((p) => p.distKm !== null).sort((a, b) => a.distKm! - b.distKm!);
    const withoutDist = scored.filter((p) => p.distKm === null);
    return [...withDist, ...withoutDist];
  }, [programs, progStatusFilter, progDaysFilter, progAgeFilter, userCoords]);

  // ── Reset "show more" when filters change ─────────────────────────────────
  useEffect(() => { setCourtsShowMore(false); }, [courtTypeFilter, courtLightsFilter]);
  useEffect(() => { setProgramsShowMore(false); }, [progDaysFilter, progAgeFilter, progStatusFilter]);

  // ── Load data on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [courtsCsv, programsCsv] = await Promise.all([
        fetch('/Tennis Courts Facilities - 4326.csv').then((r) => (r.ok ? r.text() : '')),
        fetch('/Registered Programs.csv').then((r) => (r.ok ? r.text() : '')),
      ]);
      if (cancelled) return;

      const rawCourts = parseCourts(courtsCsv);
      const byDropdown = new Map<string, CsvCourt>();
      const byName = new Map<string, CsvCourt>();
      for (const court of rawCourts) {
        byDropdown.set(court.dropdown.toLowerCase(), court);
        byName.set(court.name.toLowerCase(), court);
      }

      const parsedPrograms = parsePrograms(programsCsv, byDropdown, byName);

      const programDropdowns = new Set<string>();
      for (const prog of parsedPrograms) {
        if (prog.lat !== undefined) {
          const c = matchCourtName(prog.locationName, byDropdown, byName);
          if (c) programDropdowns.add(c.dropdown.toLowerCase());
        }
      }

      if (!cancelled) {
        setCourts(rawCourts.map((c) => ({ ...c, count: 0, hasPrograms: programDropdowns.has(c.dropdown.toLowerCase()) })));
        setPrograms(parsedPrograms);
        setLoading(false);
      }

      // Firestore player counts (silent fail after 10s)
      try {
        const TIMEOUT_MS = 10_000;
        const withTimeout = <T,>(p: Promise<T>) =>
          Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))]);

        const [prefsSnap, statsSnap, usersSnap] = await Promise.all([
          withTimeout(getDocs(collection(db, 'preferences'))),
          withTimeout(getDocs(collection(db, 'stats'))),
          withTimeout(getDocs(collection(db, 'users'))),
        ]);
        if (cancelled) return;

        const statsMap = new Map<string, number>();
        statsSnap.forEach((d) => statsMap.set(d.id, (d.data().leaguePoints26 as number) || 0));

        const lastActiveMap = new Map<string, number>();
        usersSnap.forEach((d) => {
          const raw = d.data().lastActive;
          if (raw && typeof raw.toMillis === 'function') lastActiveMap.set(d.id, raw.toMillis());
        });

        const now = Date.now();
        const courtCountMap = new Map<string, number>();
        prefsSnap.forEach((d) => {
          const uid = d.id;
          const preferred: string[] = d.data().preferred_courts || [];
          if (!preferred.length) return;
          const points = statsMap.get(uid) ?? 0;
          const lastActive = lastActiveMap.get(uid) ?? 0;
          if (!points && now - lastActive >= NINETY_DAYS_MS) return;
          for (const pref of preferred) {
            const matched = matchCourtName(pref, byDropdown, byName);
            if (matched) courtCountMap.set(matched.dropdown, (courtCountMap.get(matched.dropdown) ?? 0) + 1);
          }
        });

        if (!cancelled) {
          setCourts(rawCourts.map((c) => ({
            ...c,
            count: courtCountMap.get(c.dropdown) ?? 0,
            hasPrograms: programDropdowns.has(c.dropdown.toLowerCase()),
          })));
        }
      } catch { /* Firestore unavailable */ }
    };
    load().catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  // ── Geocode helper ─────────────────────────────────────────────────────────
  const lastGeocodedQuery = useRef('');
  const lastGeocodedCoords = useRef<{ lat: number; lng: number } | null>(null);

  const getCoords = async (q: string) => {
    if (q === lastGeocodedQuery.current && lastGeocodedCoords.current) return lastGeocodedCoords.current;
    const coords = await geocodeQuery(q);
    lastGeocodedQuery.current = q;
    lastGeocodedCoords.current = coords;
    return coords;
  };

  // ── Find nearest courts ────────────────────────────────────────────────────
  const handleFindCourts = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q || !courts.length) return;
    setSearching(true);
    setSearchingMode('courts');
    setSearchError('');
    try {
      const coords = await getCoords(q);
      if (!coords) { setSearchError('Address not found. Try a more specific address.'); return; }
      setUserCoords(coords);
      setShowCourtsTable(true);
      setShowProgramsTable(false);
      const nearest5 = courts
        .map((c) => ({ lat: c.lat, lng: c.lng, dist: haversineKm(coords.lat, coords.lng, c.lat, c.lng) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);
      setFitBounds([[coords.lat, coords.lng], ...nearest5.map((c) => [c.lat, c.lng] as [number, number])]);
    } catch { setSearchError('Could not geocode address. Please try again.'); }
    finally { setSearching(false); setSearchingMode(null); }
  };

  // ── Find tennis programs ───────────────────────────────────────────────────
  const handleFindPrograms = async (e: React.MouseEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q || !programs.length) return;
    setSearching(true);
    setSearchingMode('programs');
    setSearchError('');
    try {
      const coords = await getCoords(q);
      if (!coords) { setSearchError('Address not found. Try a more specific address.'); return; }
      setUserCoords(coords);
      setShowProgramsTable(true);
      setShowCourtsTable(false);
      const withCoords = programs.filter((p) => p.lat !== undefined);
      const nearest5 = withCoords
        .map((p) => ({ lat: p.lat!, lng: p.lng!, dist: haversineKm(coords.lat, coords.lng, p.lat!, p.lng!) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);
      setFitBounds([[coords.lat, coords.lng], ...nearest5.map((p) => [p.lat, p.lng] as [number, number])]);

      if (!geocodingActiveRef.current) {
        geocodingActiveRef.current = true;
        const unresolved = [
          ...new Map(
            programs.filter((p) => p.lat === undefined && !locationGeoCache.has(p.locationId))
              .map((p) => [p.locationId, p]),
          ).values(),
        ];
        (async () => {
          for (const prog of unresolved) {
            await new Promise((r) => setTimeout(r, 1200));
            const c = await geocodeLocationId(prog.locationId, prog.locationName);
            if (c) setPrograms((prev) => prev.map((p) => p.locationId === prog.locationId ? { ...p, lat: c.lat, lng: c.lng } : p));
          }
          geocodingActiveRef.current = false;
        })();
      }
    } catch { setSearchError('Could not geocode address. Please try again.'); }
    finally { setSearching(false); setSearchingMode(null); }
  };

  // ── Clear ──────────────────────────────────────────────────────────────────
  const handleClear = () => {
    setSearchQuery('');
    setSearchError('');
    setFitBounds([]);
    setUserCoords(null);
    setShowCourtsTable(false);
    setShowProgramsTable(false);
    setCourtTypeFilter('');
    setCourtLightsFilter('');
    setProgDaysFilter(new Set());
    setProgAgeFilter('');
    setProgStatusFilter('');
    setCourtsShowMore(false);
    setProgramsShowMore(false);
    setSuggestions([]);
    setShowSuggestions(false);
    lastGeocodedQuery.current = '';
    lastGeocodedCoords.current = null;
    inputRef.current?.focus();
  };

  const hasResults = showCourtsTable || showProgramsTable;

  return (
    <div className="min-h-screen bg-tennis-dark pt-20 pb-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="mb-1">
          <h1 className="text-3xl font-bold font-['Montserrat']">
            <span className="text-white">Our </span>
            <span className="text-clay">Courts</span>
          </h1>
        </div>

        {/* Search bar */}
        <form onSubmit={handleFindCourts} className="mb-3 flex flex-wrap gap-2 relative z-[1001]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none z-10" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const value = e.target.value;
                setSearchQuery(value);
                if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
                if (value.trim().length < 3) { setSuggestions([]); setShowSuggestions(false); return; }
                suggestDebounceRef.current = setTimeout(async () => {
                  try {
                    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value + ' Toronto')}&limit=5&countrycodes=ca`;
                    const res = await fetch(url, { headers: { 'User-Agent': 'toronto-tennis-league' } });
                    const data = await res.json() as { display_name: string; lat: string; lon: string }[];
                    const next = data.map((d) => ({
                      label: d.display_name.split(',').slice(0, 3).join(',').trim(),
                      lat: parseFloat(d.lat),
                      lng: parseFloat(d.lon),
                    }));
                    setSuggestions(next);
                    setShowSuggestions(next.length > 0);
                  } catch { /* silent */ }
                }, 600);
              }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Enter your address to find nearest courts or programs…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-clay/60 transition-colors"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[#1c1c2e] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={() => {
                      setSearchQuery(s.label);
                      lastGeocodedQuery.current = s.label;
                      lastGeocodedCoords.current = { lat: s.lat, lng: s.lng };
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-0"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={searching || !searchQuery.trim()}
            className="px-4 py-2.5 rounded-xl bg-clay text-white text-sm font-medium hover:bg-clay/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {searching && searchingMode === 'courts' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Find Nearest Courts
          </button>
          <button
            type="button"
            onClick={handleFindPrograms}
            disabled={searching || !searchQuery.trim()}
            className="px-4 py-2.5 rounded-xl border border-white/20 text-white text-sm font-medium hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {searching && searchingMode === 'programs' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Find Tennis Programs
          </button>
          {hasResults && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2.5 rounded-xl border border-white/10 text-white/60 text-sm hover:text-white hover:border-white/30 transition-colors"
            >
              Clear
            </button>
          )}
        </form>

        {searchError && <p className="text-red-400 text-sm mb-3">{searchError}</p>}

        {/* Legend */}
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-white">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
              <path d="M7,0 A7,7 0 0,0 7,14 Z" fill="#15803d" opacity="0.9" />
              <path d="M7,0 A7,7 0 0,1 7,14 Z" fill="#eab308" opacity="0.9" />
            </svg>
            Active players + programs
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#15803d] inline-block shrink-0" />
            Active players
          </div>
          <div className="flex items-center gap-2">
            <svg width="12" height="12" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
              <path d="M6,0 A6,6 0 0,0 6,12 Z" fill="#15803d" opacity="0.95" />
              <path d="M6,0 A6,6 0 0,1 6,12 Z" fill="#3b82f6" opacity="0.95" />
            </svg>
            Active players + public hours
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#eab308] inline-block shrink-0" />
            Tennis programs
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#3b82f6] inline-block shrink-0" />
            Public hours available
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#f97316] inline-block shrink-0" />
            No registered players
          </div>
        </div>

        {/* Map — normal flow, not sticky */}
        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-xl relative [isolation:isolate]" style={{ height: '55vh' }}>
          {loading ? (
            <div className="w-full h-full flex items-center justify-center bg-white/5">
              <Loader2 className="w-8 h-8 text-clay animate-spin" />
            </div>
          ) : (
            <MapContainer center={TORONTO_CENTER} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {fitBounds.length > 0 && <FitBounds bounds={fitBounds} />}
              {courts.map((court, i) => (
                <Marker
                  key={i}
                  position={[court.lat, court.lng]}
                  icon={courtMarkerIcon(court)}
                >
                  <Popup>
                    <div className="text-sm" style={{ minWidth: 180 }}>
                      <p className="font-semibold text-base mb-1">{court.dropdown}</p>
                      {court.address && (
                        <p className="text-gray-500 text-xs mb-1">{court.address}</p>
                      )}
                      {court.count > 0 && (
                        <p className="text-green-700 font-medium text-xs mb-1">
                          {court.count} active player{court.count !== 1 ? 's' : ''}
                        </p>
                      )}
                      {court.hasPrograms && (
                        <p className="text-yellow-600 font-medium text-xs mb-1">Tennis programs available</p>
                      )}
                      {court.clubInfo && (
                        <p className="text-blue-600 text-xs mb-1">{court.clubInfo}</p>
                      )}
                      <p className="text-gray-400 text-xs mt-1">
                        {court.courtType}{court.courtType ? ' · ' : ''}{court.numCourts} court{court.numCourts !== 1 ? 's' : ''} · {court.lights ? 'Lights ✓' : 'No lights'}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>

        {/* ── Courts table ─────────────────────────────────────────────────── */}
        {showCourtsTable && (() => {
          const top10 = displayedCourts.slice(0, 10);
          const visible = courtsShowMore ? top10 : top10.slice(0, 5);
          return (
            <div className="mt-6">
              <h2 className="text-white font-semibold text-lg mb-2">
                Tennis Courts{' '}
                <span className="text-white/40 font-normal text-sm">
                  {displayedCourts.length} result{displayedCourts.length !== 1 ? 's' : ''}, showing top {Math.min(10, displayedCourts.length)}
                </span>
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
                <ChipGroup
                  label="Type"
                  value={courtTypeFilter}
                  options={[
                    { value: 'Public', label: 'Public' },
                    { value: 'Club', label: 'Club' },
                  ]}
                  onChange={setCourtTypeFilter}
                />
                <ChipGroup
                  label="Lights"
                  value={courtLightsFilter}
                  options={[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                  ]}
                  onChange={setCourtLightsFilter}
                />
              </div>

              {displayedCourts.length === 0 ? (
                <p className="text-white/40 text-sm py-4 text-center">No courts match the current filters.</p>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-2">
                    {visible.map((c) => (
                      <div key={`${c.dropdown}-${c.lat}`} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-white text-sm leading-snug">{c.dropdown}</p>
                          {userCoords && (
                            <span className="text-clay font-medium text-sm shrink-0">{formatDist(c.distKm)}</span>
                          )}
                        </div>
                        {c.address && <p className="text-white/50 text-xs">{c.address}</p>}
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/60">
                          {c.numCourts > 0 && <span>{c.numCourts} court{c.numCourts !== 1 ? 's' : ''}</span>}
                          {c.count > 0 && <span className="text-clay font-medium">{c.count} active player{c.count !== 1 ? 's' : ''}</span>}
                          {c.lights && <span>Lights ✓</span>}
                        </div>
                        {c.clubInfo && <p className="text-white/40 text-xs">{c.clubInfo}</p>}
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm text-white/80">
                      <thead className="bg-white/5 text-white/50 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-3 text-left">Court</th>
                          <th className="px-4 py-3 text-left"># Courts</th>
                          <th className="px-4 py-3 text-left">Players</th>
                          <th className="px-4 py-3 text-left">Public Hours</th>
                          <th className="px-4 py-3 text-left">Address</th>
                          <th className="px-4 py-3 text-left">Distance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {visible.map((c) => (
                          <tr key={`${c.dropdown}-${c.lat}`} className="hover:bg-white/[0.03] transition-colors">
                            <td className="px-4 py-3 font-medium">{c.dropdown}</td>
                            <td className="px-4 py-3">{c.numCourts || '—'}</td>
                            <td className="px-4 py-3">
                              {c.count > 0 ? <span className="text-clay font-medium">{c.count}</span> : '—'}
                            </td>
                            <td className="px-4 py-3 text-white/50 text-xs max-w-[200px]">{c.clubInfo || '—'}</td>
                            <td className="px-4 py-3 text-white/50">{c.address || '—'}</td>
                            <td className="px-4 py-3 text-clay font-medium">
                              {userCoords ? formatDist(c.distKm) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!courtsShowMore && top10.length > 5 && (
                    <button
                      onClick={() => setCourtsShowMore(true)}
                      className="mt-2 text-sm text-white/50 hover:text-white transition-colors"
                    >
                      Load {top10.length - 5} more
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* ── Programs table ───────────────────────────────────────────────── */}
        {showProgramsTable && (() => {
          const top10 = displayedPrograms.slice(0, 10);
          const visible = programsShowMore ? top10 : top10.slice(0, 5);
          return (
            <div className="mt-6">
              <h2 className="text-white font-semibold text-lg mb-2">
                Tennis Programs{' '}
                <span className="text-white/40 font-normal text-sm">
                  {displayedPrograms.length} result{displayedPrograms.length !== 1 ? 's' : ''}, showing top {Math.min(10, displayedPrograms.length)}
                </span>
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
                <ChipGroup
                  label="Status"
                  value={progStatusFilter}
                  options={[
                    { value: 'ongoing', label: 'Ongoing' },
                    { value: 'upcoming', label: 'Upcoming' },
                  ]}
                  onChange={setProgStatusFilter}
                />
                <DaysChips selected={progDaysFilter} onChange={setProgDaysFilter} />
                <ChipGroup
                  label="Age"
                  value={progAgeFilter}
                  options={[
                    { value: '', label: 'All ages' },
                    { value: 'under13', label: 'Under 13' },
                    { value: '13to18', label: '13–18' },
                    { value: '19plus', label: '19+' },
                  ]}
                  onChange={setProgAgeFilter}
                />
              </div>

              {displayedPrograms.length === 0 ? (
                <p className="text-white/40 text-sm py-4 text-center">No programs match the current filters.</p>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-2">
                    {visible.map((p) => (
                      <div key={p.courseId} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-white text-sm leading-snug">{p.title}</p>
                          {p.distKm !== null && (
                            <span className="text-clay font-medium text-sm shrink-0">{formatDist(p.distKm)}</span>
                          )}
                        </div>
                        <p className="text-white/60 text-xs">{p.locationName}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/50">
                          {p.days && <span>{p.days}</span>}
                          {p.timeRange && <span>{p.timeRange}</span>}
                          {p.dateRange && <span>{p.dateRange}</span>}
                          <span>{p.ageRange}</span>
                        </div>
                        {p.activityUrl && (
                          <a
                            href={p.activityUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-clay text-xs hover:underline"
                          >
                            View activity →
                          </a>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm text-white/80">
                      <thead className="bg-white/5 text-white/50 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-3 text-left">Program</th>
                          <th className="px-4 py-3 text-left">Location</th>
                          <th className="px-4 py-3 text-left">Days</th>
                          <th className="px-4 py-3 text-left">Time</th>
                          <th className="px-4 py-3 text-left">Date Range</th>
                          <th className="px-4 py-3 text-left">Ages</th>
                          <th className="px-4 py-3 text-left">Activity</th>
                          <th className="px-4 py-3 text-left">Distance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {visible.map((p) => (
                          <tr key={p.courseId} className="hover:bg-white/[0.03] transition-colors">
                            <td className="px-4 py-3 font-medium">{p.title}</td>
                            <td className="px-4 py-3">{p.locationName}</td>
                            <td className="px-4 py-3">{p.days}</td>
                            <td className="px-4 py-3 text-white/60">{p.timeRange}</td>
                            <td className="px-4 py-3 text-white/50">{p.dateRange}</td>
                            <td className="px-4 py-3">{p.ageRange}</td>
                            <td className="px-4 py-3">
                              {p.activityUrl ? (
                                <a
                                  href={p.activityUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-clay hover:underline text-xs whitespace-nowrap"
                                >
                                  View activity
                                </a>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3 text-clay font-medium">
                              {p.distKm !== null ? formatDist(p.distKm) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!programsShowMore && top10.length > 5 && (
                    <button
                      onClick={() => setProgramsShowMore(true)}
                      className="mt-2 text-sm text-white/50 hover:text-white transition-colors"
                    >
                      Load {top10.length - 5} more
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })()}


      </div>
    </div>
  );
};
