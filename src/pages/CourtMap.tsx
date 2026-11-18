import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import MapGL, { Marker, Popup, NavigationControl, GeolocateControl, Source, Layer } from 'react-map-gl/maplibre';
import type { GeolocateResultEvent, MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Search, Loader2, X, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { ZONE_NAMES, ZONE_COLORS, getZone, haversineKm, zoneOverlayGeoJSON } from '../utils/zones';
import { GTA_ZONE_NAMES } from '../utils/gtaZones';

import type { CourtWithCount, PickleballOnlyCourt, NearestCourt, NearestProgram, SuggestionItem } from './courtmap/courtMapUtils';
import {
  TORONTO_CENTER,
  parseDateStr,
  getProgramStatus,
  geocodeQuery, geocodeLocationId,
  courtMarkerHtml, pickleballMarkerHtml, hasPublicHours,
  GENERIC_OSM_TYPES,
  locationGeoCache,
} from './courtmap/courtMapUtils';
import {
  CourtPopup, CourtResultsList, FilterSelect, MultiFilterSelect, PickleballBadges,
  ProgramResultsList,
} from './courtmap/CourtMapElements';
import { useCourtData } from './courtmap/useCourtData';
import { useAuth } from '../context/AuthContext';
import { track } from '../lib/analytics';
import { LoadingBar } from '../components/LoadingBar';
import { Sheet } from '../components/Sheet';
import { SelectField } from '../components/SelectField';
import { Button, buttonCls } from '../components/Button';
import { lazyWithRetry } from '../lib/lazyWithRetry';

// Lazy: this modal pulls in `exifr` for photo EXIF stripping (~87 KB), and it only ever renders
// behind the "Suggest an improvement" action.
const PhotoSubmitModal = lazyWithRetry(() =>
  import('../features/tasks/PhotoSubmitModal').then((m) => ({ default: m.PhotoSubmitModal })), 'PhotoSubmitModal');

// Markers are memoized because CourtMap re-renders on every search keystroke. Inline, each of the
// ~600 markers rebuilt its SVG string and its onClick closure on every one of those renders.
// Memoizing needs the marker's props to be stable, which is why the click handlers are passed in
// (handleSelectCourt is already a useCallback) rather than written inline at the call site.
const CourtMarker = React.memo<{ court: CourtWithCount; busiestCount: number; metric?: number; onSelect: (c: CourtWithCount) => void }>(
  ({ court, busiestCount, metric, onSelect }) => {
    const html = useMemo(() => courtMarkerHtml(court, busiestCount, metric), [court, busiestCount, metric]);
    return (
      <Marker longitude={court.lng} latitude={court.lat} anchor="center">
        <div
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={(e) => { e.stopPropagation(); onSelect(court); }}
          style={{ cursor: 'pointer' }}
        />
      </Marker>
    );
  },
);

// The pickleball marker HTML is a constant (no per-court variation), so it's hoisted out entirely.
const PICKLEBALL_MARKER_HTML = pickleballMarkerHtml();

const PickleballMarker = React.memo<{ pb: PickleballOnlyCourt; onSelect: (p: PickleballOnlyCourt) => void }>(
  ({ pb, onSelect }) => (
    <Marker longitude={pb.lng!} latitude={pb.lat!} anchor="center">
      <div
        dangerouslySetInnerHTML={{ __html: PICKLEBALL_MARKER_HTML }}
        onClick={(e) => { e.stopPropagation(); onSelect(pb); }}
        style={{ cursor: 'pointer' }}
      />
    </Marker>
  ),
);

// Filter option lists are fixed. Written inline they were rebuilt on every render (including
// every search keystroke), handing FilterSelect a new array identity each time.
// FilterSelect renders its own "All" entry for the empty value, so it isn't listed here.
// Every option except Pickleball is a tennis-court filter — see displayedPickleballOnly.
// The map bar's one View control: one view at a time.
type MapView = 'all' | 'members' | 'd7' | 'd30' | 'reports';
const VIEW_OPTIONS: { value: MapView; label: string; hint: string }[] = [
  { value: 'all',     label: 'All courts',         hint: 'Every court on the map' },
  { value: 'members', label: "Members' courts",    hint: 'Courts members play at' },
  { value: 'd7',      label: 'Activity · 7 days',  hint: 'Check-ins, reports and matches this week' },
  { value: 'd30',     label: 'Activity · 30 days', hint: 'Check-ins, reports and matches this month' },
  { value: 'reports', label: 'Court reports',      hint: 'Courts with condition notes' },
];

const COURT_TYPE_OPTIONS = [
  { value: 'Tennis',     label: 'Tennis'                  },
  { value: 'Pickleball', label: 'Pickleball'              },
  { value: 'Public',     label: 'Public Tennis Courts'    },
  { value: 'Club',       label: 'Tennis Clubs'            },
  { value: 'Programs',   label: 'Tennis Programs'         },
  { value: 'Bookings',   label: 'Court Bookings'          },
  { value: 'OpenHours',  label: 'Clubs with Public Hours' },
];
const LIGHTS_OPTIONS = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
const TORONTO_ZONE_OPTIONS = ZONE_NAMES.map((z) => ({ value: z, label: z }));
// Total-court-count bands (on CsvCourt.numCourts). Non-overlapping: under 4, exactly 4, 5–8, over 8.
const COURT_COUNT_OPTIONS = [
  { value: 'lt4',  label: 'Under 4'      },
  { value: 'eq4',  label: '4'            },
  { value: '5to8', label: '5 – 8'       },
  { value: 'gt8',  label: 'More than 8'  },
];
// Program status lives on the results header as pills (STATUS_PILLS in CourtMapElements), and
// Age/Days are read off each row's pills — none of them are filter-panel controls any more.

export const CourtMap: React.FC = () => {
  useEffect(() => { document.title = 'Toronto Tennis Court Finder · Racquets & Strings'; }, []);

  const { user } = useAuth();
  const { courts, programs, pickleballOnly, loading, loadingProgress, setPrograms } = useCourtData();

  const [mapReady, setMapReady] = useState(false);
  const [selectedCourt, setSelectedCourt] = useState<CourtWithCount | null>(null);
  const [selectedPickleball, setSelectedPickleball] = useState<PickleballOnlyCourt | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [fitBoundsData, setFitBoundsData] = useState<[number, number][]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // courtTypeFilter also handles 'Programs' to switch to programs view
  const [courtTypeFilter, setCourtTypeFilter] = useState('');
  const [courtLightsFilter, setCourtLightsFilter] = useState('');
  // Multi-select: an empty set means "all" and applies no filtering. Selections within one filter
  // are OR'd (two zones = either zone); the filters themselves still AND together.
  const [courtCountFilters, setCourtCountFilters] = useState(new Set<string>());
  const [zoneFilters, setZoneFilters] = useState(new Set<string>());
  // Zone overlay — off by default so it doesn't clutter the map for people just finding a court.
  const [showZones, setShowZones] = useState(false);
  const zoneGeoJSON = useMemo(() => zoneOverlayGeoJSON(), []);
  // Toronto zones, then only the GTA municipalities that have a court on the map.
  const zoneOptions = useMemo(() => {
    const withCourts = new Set(courts.map((c) => c.zone));
    return [...TORONTO_ZONE_OPTIONS, ...GTA_ZONE_NAMES.filter((z) => withCourts.has(z)).map((z) => ({ value: z, label: z }))];
  }, [courts]);
  // Drives the marker size bands. Taken from every court, not just the filtered set, so a marker
  // doesn't change size just because the user narrowed the filters.
  const busiestCount = useMemo(() => courts.reduce((n, c) => Math.max(n, c.count), 0), [courts]);
  // All Courts (the default) shows every court, including the empty, programs-only and pickleball
  // ones; Members Only narrows to the courts members prefer. Activity is its own button and its
  // own idea: while it is on, only courts that saw a check-in, report or recorded result in the
  // chosen window are shown, ranked by how many. Pickleball-only sites belong to All Courts alone,
  // since activity is a narrowing view rather than a widening one.
  // Reports: only courts with court-condition notes, each row showing them as pills.
  const [view, setView] = useState<MapView>('all');
  const showAllCourts = view === 'all';
  const activityWindow = view === 'd7' || view === 'd30' ? view : '';
  const reportsOn = view === 'reports';
  const activityOf = (c: CourtWithCount) => (activityWindow === 'd7' ? c.activity7 : c.activity30);


  const [progStatusFilter, setProgStatusFilter] = useState('');
  const [progLocationFilter, setProgLocationFilter] = useState('');

  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  // Mobile-only layout (wireframe 1j): filters live in a bottom sheet; results in a pull-up panel.
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [mobileResultsOpen, setMobileResultsOpen] = useState(false);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const geocodingActiveRef = useRef(false);
  const lastGeocodedQuery = useRef('');
  const lastGeocodedCoords = useRef<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<MapRef>(null);

  // The programs list is now a drill-down from one court's "View Available Programs", not a value
  // of the Type filter — 'Programs' there filters the COURT list to courts that run programs.
  const isPrograms = progLocationFilter !== '';

  // Single consolidated GA4 event for all court-map interactions
  // (search, filter changes, marker/result selection). Break down in GA4 by
  // the interaction_type / filter_name / filter_value custom dimensions.
  const trackMap = useCallback(
    (interactionType: string, params: Record<string, unknown> = {}) =>
      void track('court_map_interaction', { interaction_type: interactionType, ...params }),
    [],
  );

  // ── Filtered courts ──────────────────────────────────────────────────────────
  const displayedCourts = useMemo((): NearestCourt[] => {
    let list = courts;
    if (zoneFilters.size) list = list.filter((c) => zoneFilters.has(c.zone));
    // 'Tennis' needs no clause — every court in this list is a tennis site. 'Pickleball' keeps only
    // the tennis sites that ALSO host pickleball; the pickleball-only sites come in separately.
    if (courtTypeFilter === 'Pickleball') list = list.filter((c) => c.pickleballEntries.length > 0);
    if (courtTypeFilter === 'Public')    list = list.filter((c) => c.courtType.toLowerCase() === 'public');
    if (courtTypeFilter === 'Club')      list = list.filter((c) => c.courtType.toLowerCase() === 'club');
    if (courtTypeFilter === 'OpenHours') list = list.filter((c) => c.courtType.toLowerCase() === 'club' && hasPublicHours(c));
    if (courtTypeFilter === 'Programs')  list = list.filter((c) => c.hasPrograms);
    if (courtTypeFilter === 'Bookings')  list = list.filter((c) => !!c.bookingUrl);
    if (courtLightsFilter === 'yes') list = list.filter((c) => c.lights);
    if (courtLightsFilter === 'no')  list = list.filter((c) => !c.lights);
    if (courtCountFilters.size) {
      list = list.filter((c) =>
        (courtCountFilters.has('lt4')  && c.numCourts < 4) ||
        (courtCountFilters.has('eq4')  && c.numCourts === 4) ||
        (courtCountFilters.has('5to8') && c.numCourts >= 5 && c.numCourts <= 8) ||
        (courtCountFilters.has('gt8')  && c.numCourts > 8));
    }
    // Activity takes the map over while it is on: only courts busy in that window.
    if (activityWindow) list = list.filter((c) => activityOf(c) > 0);
    if (reportsOn) list = list.filter((c) => c.reports.length > 0);
    if (!activityWindow && !reportsOn && !showAllCourts) list = list.filter((c) => c.count > 0);

    return list
      .map((c) => ({ ...c, distKm: userCoords ? haversineKm(userCoords.lat, userCoords.lng, c.lat, c.lng) : 0 }))
      .sort((a, b) => {
        // Recent Activity ranks by how busy a court has been — that is the point of the view, so
        // it outranks proximity here. The other two views keep nearest-first.
        if (activityWindow && activityOf(b) !== activityOf(a)) return activityOf(b) - activityOf(a);
        if (userCoords) return a.distKm - b.distKm;
        if (b.count !== a.count) return b.count - a.count;
        return a.dropdown.localeCompare(b.dropdown);
      });
  }, [courts, zoneFilters, courtTypeFilter, courtLightsFilter, courtCountFilters, userCoords, showAllCourts, activityWindow, reportsOn]);

  const displayedPickleballOnly = useMemo((): PickleballOnlyCourt[] => {
    // Pickleball-only sites belong to All and Pickleball alone — every other Type is a tennis-court
    // filter, and a pickleball park is not a public tennis court, a tennis club, or bookable.
    const pickleballAsked = courtTypeFilter === 'Pickleball';
    if (courtTypeFilter && !pickleballAsked) return [];
    // These sites carry no check-in counts, so the default "courts with players" view would always
    // hide them. Asking for Pickleball explicitly overrides that; All still respects the toggle.
    if (!showAllCourts && !pickleballAsked) return [];
    let list = pickleballOnly;
    if (zoneFilters.size) {
      list = list.filter((pb) =>
        pb.lat !== undefined && pb.lng !== undefined && zoneFilters.has(getZone(pb.lat, pb.lng)),
      );
    }
    return list;
  }, [pickleballOnly, courtTypeFilter, zoneFilters, showAllCourts]);

  // ── Filtered programs ────────────────────────────────────────────────────────
  const displayedPrograms = useMemo((): NearestProgram[] => {
    const today = new Date();
    let list = programs;

    // Same helper the row badge uses, so the pill you pick always agrees with the badge you see.
    // (The old inline version had no 'past' branch and silently matched everything.)
    if (progStatusFilter) list = list.filter((p) => getProgramStatus(p.dateRange, today) === progStatusFilter);
    if (progLocationFilter) list = list.filter((p) => p.matchedDropdown === progLocationFilter);

    const scored: NearestProgram[] = list.map((p) => ({
      ...p,
      distKm: p.lat !== undefined && p.lng !== undefined && userCoords
        ? haversineKm(userCoords.lat, userCoords.lng, p.lat, p.lng) : null,
    }));

    // A typed address means "what's near me" — distance wins outright, as it always has.
    if (userCoords) {
      const withDist = scored.filter((p) => p.distKm !== null).sort((a, b) => a.distKm! - b.distKm!);
      return [...withDist, ...scored.filter((p) => p.distKm === null)];
    }

    // Otherwise: what you can still sign up for, first. Upcoming (soonest start first), then
    // ongoing, then past (most recently finished first) — a finished program is the least useful
    // row on the page, and date-only sorting buried every upcoming one behind them.
    const rank = (p: NearestProgram) => {
      const s = getProgramStatus(p.dateRange, today);
      return s === 'upcoming' ? 0 : s === 'ongoing' ? 1 : 2;
    };
    const startOf = (p: NearestProgram) => parseDateStr(p.dateRange.split(' to ')[0]?.trim() || '');
    return scored.sort((a, b) => {
      const ra = rank(a); const rb = rank(b);
      if (ra !== rb) return ra - rb;
      const da = startOf(a); const db_ = startOf(b);
      if (!da && !db_) return 0;
      if (!da) return 1;
      if (!db_) return -1;
      // Past runs newest-first; everything else soonest-first.
      return ra === 2 ? db_.getTime() - da.getTime() : da.getTime() - db_.getTime();
    });
  }, [programs, progStatusFilter, userCoords, progLocationFilter]);

  // ── FitBounds ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fitBoundsData.length || !mapRef.current) return;
    const lngs = fitBoundsData.map((p) => p[1]);
    const lats = fitBoundsData.map((p) => p[0]);
    try {
      mapRef.current.getMap().fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, maxZoom: 11, duration: 800 },
      );
    } catch { /* map not ready */ }
  }, [fitBoundsData]);

  // ── Search ───────────────────────────────────────────────────────────────────
  const getCoords = useCallback(async (q: string) => {
    if (q === lastGeocodedQuery.current && lastGeocodedCoords.current) return lastGeocodedCoords.current;
    const coords = await geocodeQuery(q);
    lastGeocodedQuery.current = q;
    lastGeocodedCoords.current = coords;
    return coords;
  }, []);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q || !courts.length) return;
    setSearching(true);
    setSearchError('');
    try {
      const lq = q.toLowerCase();
      const courtMatch = courts.find(
        (c) => c.dropdown.toLowerCase().includes(lq) || c.name.toLowerCase().includes(lq),
      );
      const coords = courtMatch ? { lat: courtMatch.lat, lng: courtMatch.lng } : await getCoords(q);
      trackMap('search', { search_term: q.slice(0, 100), view: isPrograms ? 'programs' : 'courts', found: !!coords });
      if (!coords) {
        setSearchError("Address not found — try a more specific address (e.g. '123 Bloor St W' or 'Danforth & Pape')");
        return;
      }
      setUserCoords(coords);
      if (!isPrograms) {
        const nearest5 = courts
          .map((c) => ({ lat: c.lat, lng: c.lng, dist: haversineKm(coords.lat, coords.lng, c.lat, c.lng) }))
          .sort((a, b) => a.dist - b.dist).slice(0, 5);
        setFitBoundsData([[coords.lat, coords.lng], ...nearest5.map((c) => [c.lat, c.lng] as [number, number])]);
      } else {
        const withCoords = programs.filter((p) => p.lat !== undefined);
        const nearest5 = withCoords
          .map((p) => ({ lat: p.lat!, lng: p.lng!, dist: haversineKm(coords.lat, coords.lng, p.lat!, p.lng!) }))
          .sort((a, b) => a.dist - b.dist).slice(0, 5);
        setFitBoundsData([[coords.lat, coords.lng], ...nearest5.map((p) => [p.lat, p.lng] as [number, number])]);

        if (!geocodingActiveRef.current) {
          geocodingActiveRef.current = true;
          const unresolved = [
            ...new Map(
              programs
                .filter((p) => p.lat === undefined && !locationGeoCache.has(p.locationId))
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
      }
    } catch {
      setSearchError('Could not geocode address. Please try again.');
    } finally {
      setSearching(false);
    }
  }, [searchQuery, courts, programs, isPrograms, getCoords, setPrograms, trackMap]);

  const handleClear = useCallback(() => {
    setSearchQuery('');
    setSearchError('');
    setFitBoundsData([]);
    setUserCoords(null);
    setSuggestions([]);
    setProgLocationFilter('');
    lastGeocodedQuery.current = '';
    lastGeocodedCoords.current = null;
    inputRef.current?.focus();
  }, []);

  const handleReset = useCallback(() => {
    handleClear();
    setCourtTypeFilter('');
    setCourtLightsFilter('');
    setCourtCountFilters(new Set());
    setZoneFilters(new Set());
    setProgStatusFilter('');
  }, [handleClear]);

  const closePopups = useCallback(() => {
    setSelectedCourt(null);
    setSelectedPickleball(null);
  }, []);

  const handleSelectCourt = useCallback((court: CourtWithCount) => {
    setSelectedCourt(court);
    setSelectedPickleball(null);
    trackMap('select_court', { court_name: court.dropdown || court.name, court_type: court.courtType });
    try { mapRef.current?.getMap().flyTo({ center: [court.lng, court.lat], zoom: 15, duration: 600 }); } catch { /* ignore */ }
  }, [trackMap]);

  const handleSelectPickleball = useCallback((pb: PickleballOnlyCourt) => {
    setSelectedPickleball(pb);
    setSelectedCourt(null);
    trackMap('select_pickleball', { court_name: pb.location });
  }, [trackMap]);

  // Search-as-you-type: court matches instantly, debounced Nominatim address lookup after.
  // Shared by the desktop sidebar input and the mobile floating input.
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    const q = value.trim().toLowerCase();
    if (q.length < 2) { setSuggestions([]); return; }

    const courtMatches: SuggestionItem[] = courts
      .filter((c) => c.dropdown.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 3)
      .map((c) => ({ kind: 'court' as const, label: c.dropdown || c.name, court: c }));
    setSuggestions(courtMatches);

    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    if (q.length >= 3) {
      suggestDebounceRef.current = setTimeout(async () => {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json` +
            `&q=${encodeURIComponent(value + ' Toronto')}&limit=5&countrycodes=ca&viewbox=-79.75,43.50,-79.05,43.90&bounded=1`;
          const res = await fetch(url, { headers: { 'User-Agent': 'toronto-tennis-league' } });
          // An error response is a JSON object, not an array — without these guards `.filter`
          // throws, and a row with a missing lat yields NaN coordinates that flow into
          // haversineKm (making every distance NaN) and into the map as an invalid LngLat.
          if (!res.ok) return;
          const data = await res.json() as { display_name: string; lat: string; lon: string; type: string; class: string }[];
          if (!Array.isArray(data)) return;
          const addressMatches: SuggestionItem[] = data
            .filter((d) => d && !GENERIC_OSM_TYPES.has(d.type) && !GENERIC_OSM_TYPES.has(d.class))
            .map((d) => ({
              kind: 'address' as const,
              label: String(d.display_name || '').split(',').slice(0, 2).join(',').trim(),
              lat: parseFloat(d.lat),
              lng: parseFloat(d.lon),
            }))
            .filter((s) => s.label && Number.isFinite(s.lat) && Number.isFinite(s.lng))
            .slice(0, 4);
          setSuggestions((prev) => {
            const courtPart = prev.filter((s) => s.kind === 'court');
            return [...courtPart, ...addressMatches].slice(0, 6);
          });
        } catch { /* silent */ }
      }, 500);
    }
  }, [courts]);

  // Near me: the browser's location stands in for a typed address, so the list sorts by distance
  // and the map fits you plus the five nearest courts, exactly as a search does.
  const handleNearMe = useCallback((e: GeolocateResultEvent) => {
    const coords = { lat: e.coords.latitude, lng: e.coords.longitude };
    setSearchError('');
    setUserCoords(coords);
    const nearest5 = courts
      .map((c) => ({ lat: c.lat, lng: c.lng, dist: haversineKm(coords.lat, coords.lng, c.lat, c.lng) }))
      .sort((a, b) => a.dist - b.dist).slice(0, 5);
    setFitBoundsData([[coords.lat, coords.lng], ...nearest5.map((c) => [c.lat, c.lng] as [number, number])]);
  }, [courts]);

  const applySuggestion = useCallback((s: SuggestionItem) => {
    setSuggestions([]);
    if (s.kind === 'court') {
      setSearchQuery(s.label);
      handleSelectCourt(s.court);
    } else {
      const coords = { lat: s.lat, lng: s.lng };
      setSearchQuery(s.label);
      lastGeocodedQuery.current = s.label;
      lastGeocodedCoords.current = coords;
      setUserCoords(coords);
      const nearest5 = courts
        .map((c) => ({ lat: c.lat, lng: c.lng, dist: haversineKm(coords.lat, coords.lng, c.lat, c.lng) }))
        .sort((a, b) => a.dist - b.dist).slice(0, 5);
      setFitBoundsData([[coords.lat, coords.lng], ...nearest5.map((c) => [c.lat, c.lng] as [number, number])]);
      trackMap('search', { search_term: s.label.slice(0, 100), view: isPrograms ? 'programs' : 'courts', found: true });
    }
  }, [courts, handleSelectCourt, isPrograms, trackMap]);

  // ── Shared pieces (rendered in the desktop sidebar AND the mobile overlay/sheet) ─────────────
  const resultsBody = !isPrograms ? (
    <CourtResultsList
      courts={displayedCourts}
      totalCourts={courts.length}
      loading={loading}
      userCoords={userCoords}
      onSelectCourt={handleSelectCourt}
      activityWindow={activityWindow}
      showReports={reportsOn}
      onViewPrograms={(c) => {
        setProgLocationFilter(c.dropdown || c.name);
        setMobileResultsOpen(true);
      }}
    />
  ) : (
    <ProgramResultsList
      programs={displayedPrograms}
      totalPrograms={programs.length}
      loading={loading}
      userCoords={userCoords}
      status={progStatusFilter}
      onStatusChange={(v) => { setProgStatusFilter(v); trackMap('filter', { filter_name: 'program_status', filter_value: v || '(all)' }); }}
    />
  );

  // One filter view, always these four. Programs carry no filters of their own any more — Status
  // moved onto the results header and Age/Days are shown as pills on each row instead.
  const filtersBody = (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <FilterSelect
          label="Type" value={courtTypeFilter}
          onChange={(v) => { setCourtTypeFilter(v); trackMap('filter', { filter_name: 'type', filter_value: v || '(all)' }); }}
          options={COURT_TYPE_OPTIONS}
        />
        <FilterSelect
          label="Lights" value={courtLightsFilter}
          onChange={(v) => { setCourtLightsFilter(v); trackMap('filter', { filter_name: 'lights', filter_value: v || '(all)' }); }}
          options={LIGHTS_OPTIONS}
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <MultiFilterSelect
          label="Zone" allLabel="All zones" selected={zoneFilters}
          onChange={(s) => { setZoneFilters(s); trackMap('filter', { filter_name: 'zone', filter_value: s.size ? [...s].join('|') : '(all)' }); }}
          options={zoneOptions}
        />
        <MultiFilterSelect
          label="Total Courts" allLabel="Any size" selected={courtCountFilters}
          onChange={(s) => { setCourtCountFilters(s); trackMap('filter', { filter_name: 'court_count', filter_value: s.size ? [...s].join('|') : '(all)' }); }}
          options={COURT_COUNT_OPTIONS}
        />
      </div>
    </div>
  );

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-dvh pt-16 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 bg-tennis-dark overflow-hidden">

      {/* MAP — full screen (mobile-only layout; wireframe 1j) */}
      <div className="flex-1 relative">
        {(loading || !mapReady) && (
          <LoadingBar label="Loading locations…" progress={loadingProgress} barColorClassName="bg-[#4ade80]" />
        )}

        {/* Zone overlay toggle + legend — sits BELOW the Search/Members Only/Filters bar (which
            is top-3 left-3 right-3, full width) so the two don't paint on top of each other. That
            bar is two rows below `sm` (search on its own line), hence the taller offset there. */}
        <div className="absolute top-[7.5rem] sm:top-[4.25rem] left-3 z-10 flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => { setShowZones((v) => !v); trackMap('filter', { filter_name: 'show_zones', filter_value: String(!showZones) }); }}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-bold shadow-lg transition-colors ${
              showZones ? 'bg-clay text-white' : 'bg-white text-ink hover:bg-white/90'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />Show Zones
          </button>
          {showZones && (
            <div className="rounded-2xl bg-white shadow-lg p-2 space-y-1 max-w-[180px]">
              {ZONE_NAMES.map((z) => (
                <div key={z} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ZONE_COLORS[z] }} />
                  <span className="text-xs font-semibold text-ink leading-tight">{z}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <MapGL
          ref={mapRef}
          initialViewState={{ longitude: TORONTO_CENTER[1], latitude: TORONTO_CENTER[0], zoom: 10 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="https://tiles.openfreemap.org/styles/liberty"
          onClick={closePopups}
          onLoad={() => setMapReady(true)}
        >
          {/* bottom-right, not top-right — the Search/Members Only/Filters bar spans the full
              top width (top-3 left-3 right-3) and was sitting on top of the zoom controls there,
              making them unclickable. */}
          <NavigationControl position="bottom-right" />
          {/* Near me. One fix, no tracking; the page's own "you are here" marker draws the point,
              so the control's blue dot is off rather than showing two. */}
          <GeolocateControl
            position="bottom-right"
            trackUserLocation={false}
            showUserLocation={false}
            onGeolocate={handleNearMe}
            onError={() => setSearchError('Couldn’t get your location. Allow location access, or search an address.')}
          />

          {showZones && (
            <Source id="zones" type="geojson" data={zoneGeoJSON}>
              <Layer
                id="zones-fill"
                type="fill"
                paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 }}
              />
              <Layer
                id="zones-line"
                type="line"
                paint={{ 'line-color': ['get', 'color'], 'line-opacity': 0.6, 'line-width': 1.5 }}
              />
            </Source>
          )}

          {displayedCourts.map((court, i) => (
            <CourtMarker
              key={i}
              court={court}
              busiestCount={busiestCount}
              metric={reportsOn ? court.reportCount : activityWindow ? activityOf(court) : undefined}
              onSelect={handleSelectCourt}
            />
          ))}

          {displayedPickleballOnly
            .filter((pb) => pb.lat !== undefined)
            .map((pb, i) => (
              <PickleballMarker key={`pb-${i}`} pb={pb} onSelect={handleSelectPickleball} />
            ))
          }

          {selectedCourt && (
            <Popup
              longitude={selectedCourt.lng}
              latitude={selectedCourt.lat}
              onClose={() => setSelectedCourt(null)}
              closeButton anchor="bottom" maxWidth="280px"
            >
              <CourtPopup
                court={selectedCourt}
                // Opens the results panel on this court's programs. `setMobileResultsOpen` matters:
                // on mobile the panel is collapsed by default, so without it the tap looked inert.
                onViewPrograms={selectedCourt.hasPrograms ? () => {
                  setProgLocationFilter(selectedCourt.dropdown || selectedCourt.name);
                  setMobileResultsOpen(true);
                  setSelectedCourt(null);
                } : undefined}
                onSuggest={() => {
                  setShowSuggestModal(true);
                  setSelectedCourt(null);
                }}
              />
            </Popup>
          )}

          {selectedPickleball && selectedPickleball.lat !== undefined && (
            <Popup
              longitude={selectedPickleball.lng!}
              latitude={selectedPickleball.lat!}
              onClose={() => setSelectedPickleball(null)}
              closeButton anchor="bottom" maxWidth="260px"
            >
              <div style={{ fontFamily: 'system-ui, sans-serif', padding: '4px 2px', textAlign: 'center' }}>
                <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, marginTop: 0, color: '#1f2937' }}>
                  {selectedPickleball.location}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4, justifyContent: 'center' }}>
                  <PickleballBadges entries={selectedPickleball.entries} popup />
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 6, justifyContent: 'center' }}>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPickleball.lat},${selectedPickleball.lng}`}
                    target="_blank" rel="noreferrer"
                    style={{ padding: '4px 10px', background: '#166534', color: '#fff', borderRadius: 6, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}
                  >
                    Directions
                  </a>
                </div>
              </div>
            </Popup>
          )}
          {userCoords && (
            <Marker longitude={userCoords.lng} latitude={userCoords.lat} anchor="bottom">
              <div style={{ pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: 22,
                  height: 22,
                  background: '#3b82f6',
                  borderRadius: '50% 50% 50% 0',
                  transform: 'rotate(-45deg)',
                  border: '2.5px solid white',
                  boxShadow: '0 2px 8px rgba(59,130,246,0.7)',
                }} />
              </div>
            </Marker>
          )}
        </MapGL>

        {/* Search + Filters float OVER the map (wireframe 1j) ── */}
        {/* On a phone the search box shares this row with three buttons that can't shrink, which
            left it about 90px wide — too narrow to read an address back. Below `sm` it takes a row
            of its own and the buttons sit under it. */}
        <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 sm:flex-1">
            <div className={`h-11 flex items-center gap-2 px-3 bg-tennis-dark/95 backdrop-blur shadow-xl transition-colors focus-within:border-clay/50 ${suggestions.length > 0 ? 'rounded-t-2xl' : 'rounded-2xl'}`}>
              <Search className="w-3.5 h-3.5 text-fg/70 shrink-0 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(e); }}
                placeholder="Search courts or an address…"
                className="flex-1 bg-transparent text-fg placeholder-fg/70 text-base sm:text-sm outline-none min-w-0"
              />
              {searching
                ? <Loader2 className="w-3.5 h-3.5 text-clay animate-spin shrink-0" />
                : searchQuery && (
                  <button type="button" onClick={handleReset} aria-label="Clear" className="text-fg/70 hover:text-fg transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )
              }
            </div>
            {suggestions.length > 0 && (
              <div className="border-t-0 rounded-b-2xl overflow-hidden bg-tennis-dark/95 backdrop-blur shadow-xl">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={() => applySuggestion(s)}
                    className="w-full text-left px-4 py-3 text-sm text-fg hover:bg-fg/10 hover:text-fg transition-colors border-b border-fg/5 last:border-0"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {searchError && <p className="text-badge-loss text-xs mt-1.5 bg-tennis-dark/80 rounded-2xl px-2 py-1">{searchError}</p>}
          </div>
          <div className="flex items-start gap-2 -my-2 py-2 overflow-x-auto no-scrollbar sm:contents">

          <SelectField
            value={view}
            options={VIEW_OPTIONS}
            onChange={(v) => setView(v as MapView)}
            title="View"
            className="w-auto shrink-0 space-y-0"
            triggerClassName={`h-11 py-0 px-3.5 gap-1.5 backdrop-blur shadow-xl text-xs font-bold ${
              showAllCourts
                ? 'bg-tennis-dark/95 border-fg/10 text-fg hover:border-clay/50'
                : 'bg-clay/15 border-clay/40 text-clay'
            }`}
          />
          <button
            type="button"
            onClick={() => setShowFiltersSheet(true)}
            className="h-11 shrink-0 px-3.5 rounded-2xl bg-tennis-dark/95 backdrop-blur shadow-xl text-xs font-bold text-fg hover:border-clay/50 transition-colors"
          >
            Filters
          </button>
          </div>
        </div>

        {/* The Join CTA and the pull-up panel share ONE bottom-anchored column, so the button is
            always above the panel whatever height it renders at. Pinned separately at `bottom-14`
            it sat on top of the "N courts" handle, and any fixed offset breaks again as soon as
            the legend row wraps. The column ignores pointer events so the map still drags either
            side of the button. */}
        <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center pointer-events-none">
        {/* Logged-out visitors only, and it goes away once the list is open so it never blocks it. */}
        {!user && !mobileResultsOpen && (
          <Link
            to="/signup"
            className={`pointer-events-auto mb-2.5 ${buttonCls('clay')}`}
          >
            Join
          </Link>
        )}

        {/* Pull-up results panel (Maps/Uber model) ── */}
        <div className="pointer-events-auto w-full bg-tennis-dark rounded-t-3xl border-t border-fg/10 shadow-[0_-8px_24px_rgba(0,0,0,0.4)]">
          <button
            type="button"
            onClick={() => setMobileResultsOpen((v) => !v)}
            className="w-full pt-2.5 pb-2 flex flex-col items-center"
            aria-expanded={mobileResultsOpen}
          >
            <span className="h-1.5 w-10 rounded-full bg-fg/20 mb-1.5" />
            <span className="flex items-center gap-1 text-xs font-bold text-fg">
              {isPrograms ? `${displayedPrograms.length} programs` : `${displayedCourts.length} courts`}
              {userCoords ? ' near you' : ''}
              {mobileResultsOpen ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
            </span>
          </button>
          {mobileResultsOpen && (
            <div className="max-h-[45dvh] overflow-y-auto overscroll-contain border-t border-fg/5">{resultsBody}</div>
          )}
          {/* Legend + Report: always visible, open or closed. */}
              <div className="border-t border-fg/10 px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg/70 pointer-events-none">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#15803d] inline-block shrink-0" />Active</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#eab308] inline-block shrink-0" />Programs</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6] inline-block shrink-0" />Public hours</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#67e8f9] inline-block shrink-0" />Winter</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSuggestModal(true)}
                  className={`shrink-0 ${buttonCls('secondary', 'sm')}`}
                >
                  Report
                </button>
              </div>
        </div>
        </div>
      </div>

      {/* Filters sheet */}
      {showFiltersSheet && (
        <Sheet onClose={() => setShowFiltersSheet(false)} title="Filters" maxWidthClassName="max-w-md">
          <div className="p-6 pt-3 space-y-4">
            {filtersBody}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { handleReset(); setShowFiltersSheet(false); }}>
                Reset
              </Button>
              <Button className="flex-1" onClick={() => setShowFiltersSheet(false)}>Done</Button>
            </div>
          </div>
        </Sheet>
      )}

      <AnimatePresence>
        {showSuggestModal && (
          <React.Suspense fallback={null}>
            <PhotoSubmitModal onClose={() => setShowSuggestModal(false)} />
          </React.Suspense>
        )}
      </AnimatePresence>
    </div>
  );
};
