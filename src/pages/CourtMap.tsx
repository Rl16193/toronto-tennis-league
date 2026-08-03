import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import MapGL, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Search, Loader2, X } from 'lucide-react';
import { ZONE_NAMES, getZone, haversineKm } from '../utils/zones';

import type { CourtWithCount, PickleballOnlyCourt, NearestCourt, NearestProgram, SuggestionItem } from './courtmap/courtMapUtils';
import {
  TORONTO_CENTER,
  formatDist,
  parseDateStr,
  geocodeQuery, geocodeLocationId,
  courtMarkerHtml, pickleballMarkerHtml, hasPublicHours,
  GENERIC_OSM_TYPES,
  locationGeoCache,
} from './courtmap/courtMapUtils';
import { FilterSelect, DaysDropdown, Badge, PickleballBadges } from './courtmap/courtMapComponents';
import { CourtPopup } from './courtmap/CourtPopup';
import { PhotoSubmitModal } from '../features/tasks/PhotoSubmitModal';
import { useCourtData } from './courtmap/useCourtData';
import { CourtResultsList } from './courtmap/CourtResultsList';
import { useAuth } from '../context/AuthContext';
import { ProgramResultsList } from './courtmap/ProgramResultsList';
import { track } from '../lib/analytics';
import { LoadingBar } from '../components/LoadingBar';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';

export const CourtMap: React.FC = () => {
  useEffect(() => { document.title = 'Court Locator — Racquets & Strings'; }, []);

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
  const [pickleballFilter, setPickleballFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  // Default view: only courts where members are currently present. "Show all courts" reveals
  // the rest (empty courts, programs-only, etc.) as a deliberate opt-in layer toggle.
  const [showAllCourts, setShowAllCourts] = useState(false);

  const [progDaysFilter, setProgDaysFilter] = useState(new Set<string>());
  const [progAgeFilter, setProgAgeFilter] = useState('');
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

  const isPrograms = courtTypeFilter === 'Programs';

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
    if (zoneFilter) list = list.filter((c) => c.zone === zoneFilter);
    if (courtTypeFilter === 'Pickleball') {
      list = list.filter((c) => c.pickleballEntries.length > 0);
      if (pickleballFilter) list = list.filter((c) => c.pickleballEntries.some((pb) => pb.netType === pickleballFilter));
    } else {
      if (courtTypeFilter === 'Public')    list = list.filter((c) => c.courtType.toLowerCase() === 'public');
      if (courtTypeFilter === 'Club')      list = list.filter((c) => c.courtType.toLowerCase() === 'club');
      if (courtTypeFilter === 'OpenHours') list = list.filter((c) => hasPublicHours(c));
      if (courtTypeFilter === 'Programs')  list = list.filter((c) => c.hasPrograms);
      if (courtTypeFilter === 'Bookings')  list = list.filter((c) => !!c.bookingUrl);
      if (!courtTypeFilter && pickleballFilter) list = list.filter((c) => c.pickleballEntries.some((pb) => pb.netType === pickleballFilter));
    }
    if (courtLightsFilter === 'yes') list = list.filter((c) => c.lights);
    if (courtLightsFilter === 'no')  list = list.filter((c) => !c.lights);
    if (!showAllCourts) list = list.filter((c) => c.count > 0);

    return list
      .map((c) => ({ ...c, distKm: userCoords ? haversineKm(userCoords.lat, userCoords.lng, c.lat, c.lng) : 0 }))
      .sort((a, b) => {
        if (userCoords) return a.distKm - b.distKm;
        if (b.count !== a.count) return b.count - a.count;
        return a.dropdown.localeCompare(b.dropdown);
      });
  }, [courts, zoneFilter, courtTypeFilter, courtLightsFilter, pickleballFilter, userCoords, showAllCourts]);

  const displayedPickleballOnly = useMemo((): PickleballOnlyCourt[] => {
    if (!showAllCourts) return [];
    if (courtTypeFilter && courtTypeFilter !== 'Pickleball') return [];
    let list = pickleballOnly;
    if (zoneFilter) {
      list = list.filter((pb) =>
        pb.lat !== undefined && pb.lng !== undefined && getZone(pb.lat, pb.lng) === zoneFilter,
      );
    }
    if (!pickleballFilter) return list;
    return list.filter((pb) => pb.entries.some((e) => e.netType === pickleballFilter));
  }, [pickleballOnly, courtTypeFilter, pickleballFilter, zoneFilter, showAllCourts]);

  // ── Filtered programs ────────────────────────────────────────────────────────
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
    if (progAgeFilter === 'under13') list = list.filter((p) => (p.minAgeYr ?? 0) < 13);
    else if (progAgeFilter === '13to18') list = list.filter((p) => { const m = p.minAgeYr ?? 0; return m >= 13 && m <= 18; });
    else if (progAgeFilter === '19plus') list = list.filter((p) => (p.minAgeYr ?? 0) >= 19);

    if (progLocationFilter) list = list.filter((p) => p.matchedDropdown === progLocationFilter);

    const scored: NearestProgram[] = list.map((p) => ({
      ...p,
      distKm: p.lat !== undefined && p.lng !== undefined && userCoords
        ? haversineKm(userCoords.lat, userCoords.lng, p.lat, p.lng) : null,
    }));

    if (userCoords) {
      const withDist = scored.filter((p) => p.distKm !== null).sort((a, b) => a.distKm! - b.distKm!);
      return [...withDist, ...scored.filter((p) => p.distKm === null)];
    }
    return scored.sort((a, b) => {
      const da = parseDateStr(a.dateRange.split(' to ')[0]?.trim() || '');
      const db_ = parseDateStr(b.dateRange.split(' to ')[0]?.trim() || '');
      if (!da && !db_) return 0;
      if (!da) return 1;
      if (!db_) return -1;
      return da.getTime() - db_.getTime();
    });
  }, [programs, progStatusFilter, progDaysFilter, progAgeFilter, userCoords, progLocationFilter]);

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
    setPickleballFilter('');
    setZoneFilter('');
    setProgDaysFilter(new Set());
    setProgAgeFilter('');
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
    try { mapRef.current?.getMap().flyTo({ center: [court.lng, court.lat], zoom: 13, duration: 600 }); } catch { /* ignore */ }
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
          const data = await res.json() as { display_name: string; lat: string; lon: string; type: string; class: string }[];
          const addressMatches: SuggestionItem[] = data
            .filter((d) => !GENERIC_OSM_TYPES.has(d.type) && !GENERIC_OSM_TYPES.has(d.class))
            .slice(0, 4)
            .map((d) => ({
              kind: 'address' as const,
              label: d.display_name.split(',').slice(0, 2).join(',').trim(),
              lat: parseFloat(d.lat),
              lng: parseFloat(d.lon),
            }));
          setSuggestions((prev) => {
            const courtPart = prev.filter((s) => s.kind === 'court');
            return [...courtPart, ...addressMatches].slice(0, 6);
          });
        } catch { /* silent */ }
      }, 500);
    }
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
    />
  ) : (
    <ProgramResultsList
      programs={displayedPrograms}
      totalPrograms={programs.length}
      loading={loading}
      userCoords={userCoords}
    />
  );

  const filtersBody = !isPrograms ? (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <FilterSelect
          label="Type" value={courtTypeFilter}
          onChange={(v) => { setCourtTypeFilter(v); trackMap('filter', { filter_name: 'type', filter_value: v || '(all)' }); }}
          options={[
            { value: 'Public',     label: 'Public'          },
            { value: 'Club',       label: 'Club'            },
            { value: 'Pickleball', label: 'Pickleball'      },
            { value: 'OpenHours',  label: 'Open Hours'      },
            { value: 'Programs',   label: 'Tennis Programs' },
            { value: 'Bookings',   label: 'Court Bookings'  },
          ]}
        />
        <FilterSelect
          label="Lights" value={courtLightsFilter}
          onChange={(v) => { setCourtLightsFilter(v); trackMap('filter', { filter_name: 'lights', filter_value: v || '(all)' }); }}
          options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <FilterSelect
          label="Zone" value={zoneFilter}
          onChange={(v) => { setZoneFilter(v); trackMap('filter', { filter_name: 'zone', filter_value: v || '(all)' }); }}
          options={ZONE_NAMES.map((z) => ({ value: z, label: z }))}
        />
        <FilterSelect
          label="Pickleball" value={pickleballFilter}
          onChange={(v) => { setPickleballFilter(v); trackMap('filter', { filter_name: 'pickleball', filter_value: v || '(all)' }); }}
          disabled={!!courtTypeFilter && courtTypeFilter !== 'Pickleball'}
          options={[
            { value: 'Pickleball', label: 'Standalone'       },
            { value: 'Tennis',     label: 'On Tennis Courts' },
            { value: 'No Net',     label: 'Bring Own Net'    },
            { value: 'Adjustable', label: 'Adjustable'       },
          ]}
        />
      </div>
    </div>
  ) : (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <FilterSelect
          label="Type" value={courtTypeFilter}
          onChange={(v) => { setCourtTypeFilter(v); setProgLocationFilter(''); trackMap('filter', { filter_name: 'type', filter_value: v || '(all)' }); }}
          options={[
            { value: 'Public',    label: 'Public'          },
            { value: 'Club',      label: 'Club'            },
            { value: 'OpenHours', label: 'Open Hours'      },
            { value: 'Programs',  label: 'Tennis Programs' },
            { value: 'Bookings',  label: 'Court Bookings'  },
          ]}
        />
        <FilterSelect
          label="Status" value={progStatusFilter}
          onChange={(v) => { setProgStatusFilter(v); trackMap('filter', { filter_name: 'program_status', filter_value: v || '(all)' }); }}
          options={[{ value: 'ongoing', label: 'Ongoing' }, { value: 'upcoming', label: 'Upcoming' }]}
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <FilterSelect
          label="Age" value={progAgeFilter}
          onChange={(v) => { setProgAgeFilter(v); trackMap('filter', { filter_name: 'program_age', filter_value: v || '(all)' }); }}
          options={[{ value: 'under13', label: 'Under 13' }, { value: '13to18', label: '13–18' }, { value: '19plus', label: '19+' }]}
        />
        <DaysDropdown selected={progDaysFilter} onChange={setProgDaysFilter} />
      </div>
    </div>
  );

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-dvh pt-16 pb-16 bg-tennis-dark overflow-hidden">

      {/* MAP — full screen (mobile-only layout; wireframe 1j) */}
      <div className="flex-1 relative">
        {(loading || !mapReady) && (
          <LoadingBar label="Loading locations…" progress={loadingProgress} barColorClassName="bg-[#4ade80]" />
        )}

        <MapGL
          ref={mapRef}
          initialViewState={{ longitude: TORONTO_CENTER[1], latitude: TORONTO_CENTER[0], zoom: 9 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="https://tiles.openfreemap.org/styles/liberty"
          onClick={closePopups}
          onLoad={() => setMapReady(true)}
        >
          <NavigationControl position="top-right" />

          {displayedCourts.map((court, i) => (
            <Marker key={i} longitude={court.lng} latitude={court.lat} anchor="center">
              <div
                dangerouslySetInnerHTML={{ __html: courtMarkerHtml(court) }}
                onClick={(e) => { e.stopPropagation(); handleSelectCourt(court); }}
                style={{ cursor: 'pointer' }}
              />
            </Marker>
          ))}

          {displayedPickleballOnly
            .filter((pb) => pb.lat !== undefined)
            .map((pb, i) => (
              <Marker key={`pb-${i}`} longitude={pb.lng!} latitude={pb.lat!} anchor="center">
                <div
                  dangerouslySetInnerHTML={{ __html: pickleballMarkerHtml() }}
                  onClick={(e) => { e.stopPropagation(); setSelectedPickleball(pb); setSelectedCourt(null); trackMap('select_pickleball', { court_name: pb.location }); }}
                  style={{ cursor: 'pointer' }}
                />
              </Marker>
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
                onViewPrograms={selectedCourt.hasPrograms ? () => {
                  setProgLocationFilter(selectedCourt.dropdown || selectedCourt.name);
                  setCourtTypeFilter('Programs');
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
        <div className="absolute top-3 left-3 right-3 z-10 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className={`h-10 flex items-center gap-2 px-3 bg-tennis-dark/95 backdrop-blur border border-fg/10 shadow-xl transition-colors focus-within:border-clay/50 ${suggestions.length > 0 ? 'rounded-t-2xl' : 'rounded-2xl'}`}>
              <Search className="w-3.5 h-3.5 text-fg/40 shrink-0 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(e); }}
                placeholder="Search courts or an address…"
                className="flex-1 bg-transparent text-fg placeholder-fg/30 text-sm outline-none min-w-0"
              />
              {searching
                ? <Loader2 className="w-3.5 h-3.5 text-clay animate-spin shrink-0" />
                : searchQuery && (
                  <button type="button" onClick={handleReset} aria-label="Clear" className="text-fg/40 hover:text-fg transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )
              }
            </div>
            {suggestions.length > 0 && (
              <div className="border border-fg/10 border-t-0 rounded-b-2xl overflow-hidden bg-tennis-dark/95 backdrop-blur shadow-xl">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={() => applySuggestion(s)}
                    className="w-full text-left px-4 py-3 text-sm text-fg/80 hover:bg-fg/10 hover:text-fg transition-colors border-b border-fg/5 last:border-0"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {searchError && <p className="text-red-400 text-xs mt-1.5 bg-tennis-dark/80 rounded-lg px-2 py-1">{searchError}</p>}
          </div>
          <button
            type="button"
            onClick={() => setShowAllCourts((v) => !v)}
            className={`h-10 shrink-0 px-3.5 rounded-2xl backdrop-blur border shadow-xl text-xs font-bold transition-colors ${
              showAllCourts
                ? 'bg-clay/15 border-clay/40 text-clay'
                : 'bg-tennis-dark/95 border-fg/10 text-fg hover:border-clay/50'
            }`}
          >
            {showAllCourts ? 'All Courts' : 'Members Only'}
          </button>
          <button
            type="button"
            onClick={() => setShowFiltersSheet(true)}
            className="h-10 shrink-0 px-3.5 rounded-2xl bg-tennis-dark/95 backdrop-blur border border-fg/10 shadow-xl text-xs font-bold text-fg hover:border-clay/50 transition-colors"
          >
            Filters
          </button>
        </div>

        {/* Join CTA — floats just above the pull-up handle for logged-out visitors; goes away
            once the results list is opened so it never blocks the list itself. */}
        {!user && !mobileResultsOpen && (
          <Link
            to="/signup"
            className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-clay text-white text-xs font-bold shadow-lg shadow-clay/30 hover:bg-clay-dark transition-colors"
          >
            Join
          </Link>
        )}

        {/* Pull-up results panel (Maps/Uber model) ── */}
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-tennis-dark rounded-t-3xl border-t border-fg/10 shadow-[0_-8px_24px_rgba(0,0,0,0.4)]">
          <button
            type="button"
            onClick={() => setMobileResultsOpen((v) => !v)}
            className="w-full pt-2.5 pb-2 flex flex-col items-center"
            aria-expanded={mobileResultsOpen}
          >
            <span className="h-1.5 w-10 rounded-full bg-fg/20 mb-1.5" />
            <span className="text-xs font-bold text-fg">
              {isPrograms ? `${displayedPrograms.length} programs` : `${displayedCourts.length} courts`}
              {userCoords ? ' near you' : ''} {mobileResultsOpen ? '▾' : '▴'}
            </span>
          </button>
          {mobileResultsOpen && (
            <>
              <div className="max-h-[45vh] overflow-y-auto border-t border-fg/5">{resultsBody}</div>
              <div className="border-t border-fg/10 px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-fg/50 pointer-events-none">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#15803d] inline-block shrink-0" />Active</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#eab308] inline-block shrink-0" />Programs</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6] inline-block shrink-0" />Open hours</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSuggestModal(true)}
                  className="shrink-0 px-3 py-1.5 rounded-xl border border-clay/40 text-clay text-[11px] font-semibold hover:bg-clay/10 transition-colors"
                >
                  Submit a Report
                </button>
              </div>
            </>
          )}
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
          <PhotoSubmitModal onClose={() => setShowSuggestModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};
