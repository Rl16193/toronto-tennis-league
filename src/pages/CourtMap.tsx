import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import MapGL, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Search, Loader2, ChevronDown, X } from 'lucide-react';
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
import { SuggestImprovementModal } from './courtmap/SuggestImprovementModal';
import { useCourtData } from './courtmap/useCourtData';
import { CourtResultsList } from './courtmap/CourtResultsList';
import { useAuth } from '../context/AuthContext';
import { ProgramResultsList } from './courtmap/ProgramResultsList';
import { track } from '../lib/analytics';

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

  const [progDaysFilter, setProgDaysFilter] = useState(new Set<string>());
  const [progAgeFilter, setProgAgeFilter] = useState('');
  const [progStatusFilter, setProgStatusFilter] = useState('');
  const [progLocationFilter, setProgLocationFilter] = useState('');

  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  // When the suggest form is opened from a court pop-up, pre-fill that court's name.
  const [suggestPresetCourt, setSuggestPresetCourt] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showResults, setShowResults] = useState(false);
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

    return list
      .map((c) => ({ ...c, distKm: userCoords ? haversineKm(userCoords.lat, userCoords.lng, c.lat, c.lng) : 0 }))
      .sort((a, b) => {
        if (userCoords) return a.distKm - b.distKm;
        if (b.count !== a.count) return b.count - a.count;
        return a.dropdown.localeCompare(b.dropdown);
      });
  }, [courts, zoneFilter, courtTypeFilter, courtLightsFilter, pickleballFilter, userCoords]);

  const displayedPickleballOnly = useMemo((): PickleballOnlyCourt[] => {
    if (courtTypeFilter && courtTypeFilter !== 'Pickleball') return [];
    let list = pickleballOnly;
    if (zoneFilter) {
      list = list.filter((pb) =>
        pb.lat !== undefined && pb.lng !== undefined && getZone(pb.lat, pb.lng) === zoneFilter,
      );
    }
    if (!pickleballFilter) return list;
    return list.filter((pb) => pb.entries.some((e) => e.netType === pickleballFilter));
  }, [pickleballOnly, courtTypeFilter, pickleballFilter, zoneFilter]);

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
        { padding: 60, maxZoom: 13, duration: 800 },
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
      setShowResults(true);
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
    setShowResults(false);
    setShowFilters(false);
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

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row h-dvh pt-16 bg-tennis-dark overflow-hidden">

      {/* MAP — top on mobile, right on desktop */}
      <div className="order-1 md:order-2 h-[38vh] md:h-auto md:flex-1 relative">
        {(loading || !mapReady) && (
          <div className="absolute inset-0 z-20 bg-[#0d1f14] flex flex-col items-center justify-center gap-4">
            <p className="text-white font-semibold text-sm tracking-wide">Loading locations…</p>
            <div className="w-56 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#4ade80] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="text-white/40 text-xs">{loadingProgress}%</p>
          </div>
        )}

        <MapGL
          ref={mapRef}
          initialViewState={{ longitude: TORONTO_CENTER[1], latitude: TORONTO_CENTER[0], zoom: 11 }}
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
              <div style={{ fontFamily: 'system-ui, sans-serif', padding: '4px 2px', textAlign: 'center' }}>
                <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, marginTop: 0, color: '#1f2937' }}>
                  {selectedCourt.dropdown || selectedCourt.name}
                </p>
                {selectedCourt.address && (
                  <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 7, marginTop: 0 }}>
                    {selectedCourt.address}
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 7, justifyContent: 'center' }}>
                  <span style={{ background: '#e5e7eb', color: '#111', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                    {selectedCourt.courtType.toUpperCase()}
                  </span>
                  {selectedCourt.numCourts > 0 && (
                    <span style={{ background: '#e5e7eb', color: '#111', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                      {selectedCourt.numCourts} CT
                    </span>
                  )}
                  {selectedCourt.lights && (
                    <span style={{ background: '#fef08a', color: '#713f12', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                      LIGHTS
                    </span>
                  )}
                  {hasPublicHours(selectedCourt) && (
                    <span style={{ background: '#1e3a5f', color: '#93c5fd', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                      OPEN HOURS
                    </span>
                  )}
                  {selectedCourt.bookingUrl && (
                    <span style={{ background: '#7c2d12', color: '#fdba74', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                      BOOKABLE
                    </span>
                  )}
                  <PickleballBadges entries={selectedCourt.pickleballEntries} popup />
                </div>
                {selectedCourt.count > 0 && (
                  <p style={{ color: '#16a34a', fontSize: 11, margin: '0 0 3px' }}>
                    {selectedCourt.count} active player{selectedCourt.count !== 1 ? 's' : ''}
                  </p>
                )}
                {selectedCourt.clubInfo && (
                  <p style={{ color: '#6b7280', fontSize: 10, margin: '0 0 6px', lineHeight: 1.4 }}>
                    {selectedCourt.clubInfo}
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, justifyContent: 'center' }}>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedCourt.lat},${selectedCourt.lng}`}
                    target="_blank" rel="noreferrer"
                    style={{ padding: '4px 10px', background: '#166534', color: '#fff', borderRadius: 6, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}
                  >
                    Directions
                  </a>
                  {selectedCourt.website && (
                    <a
                      href={selectedCourt.website}
                      target="_blank" rel="noreferrer"
                      style={{ padding: '4px 10px', background: '#1d4ed8', color: '#fff', borderRadius: 6, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}
                    >
                      Website
                    </a>
                  )}
                  {selectedCourt.bookingUrl && (
                    <a
                      href={selectedCourt.bookingUrl}
                      target="_blank" rel="noreferrer"
                      style={{ padding: '4px 10px', background: '#166534', color: '#fff', borderRadius: 6, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}
                    >
                      Book Online
                    </a>
                  )}
                  {selectedCourt.hasPrograms && (
                    <button
                      onClick={() => {
                        setProgLocationFilter(selectedCourt.dropdown || selectedCourt.name);
                        setCourtTypeFilter('Programs');
                        setSelectedCourt(null);
                      }}
                      style={{ padding: '4px 10px', background: '#ca8a04', color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer' }}
                    >
                      View Available Programs
                    </button>
                  )}
                </div>
                {/* Suggest an improvement about this specific court */}
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => {
                      setSuggestPresetCourt(selectedCourt.dropdown || selectedCourt.name);
                      setShowSuggestModal(true);
                      setSelectedCourt(null);
                    }}
                    style={{ padding: '5px 12px', background: '#ea580c', color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                  >
                    Suggest an Improvement
                  </button>
                </div>
              </div>
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
      </div>

      {/* SIDEBAR — bottom on mobile, left on desktop */}
      <aside className="order-2 md:order-1 flex-1 md:flex-none md:w-[380px] flex flex-col
                        border-t border-white/10 md:border-t-0 md:border-r overflow-hidden
                        bg-tennis-dark">

        <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-white/10">

          <h1 className="text-xl font-bold font-['Montserrat'] leading-tight text-center">
            <span className="text-white">Toronto {courtTypeFilter === 'Pickleball' ? 'Pickleball' : 'Tennis'} </span>
            <span className="text-clay">{isPrograms ? 'Programs' : 'Courts'}</span>
          </h1>

          <p className="text-xs text-white/40 text-center">Click on a location for more information</p>

          {/* Search */}
          <div>
            <div className={`flex items-center gap-2 px-3 py-2.5 bg-white/5 border border-white/10 transition-colors focus-within:border-clay/50 ${suggestions.length > 0 ? 'rounded-t-xl' : 'rounded-xl'}`}>
              <Search className="w-3.5 h-3.5 text-white/40 shrink-0 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  const value = e.target.value;
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
                }}
                placeholder="Search courts or enter an address…"
                className="flex-1 bg-transparent text-white placeholder-white/30 text-sm outline-none min-w-0"
              />
              {searching
                ? <Loader2 className="w-3.5 h-3.5 text-clay animate-spin shrink-0" />
                : searchQuery && (
                  <button type="button" onClick={handleReset} aria-label="Clear" className="text-white/40 hover:text-white transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )
              }
            </div>
            {suggestions.length > 0 && (
              <div className="border border-white/10 border-t-0 rounded-b-xl overflow-hidden bg-white/5">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={() => {
                      setSuggestions([]);
                      if (s.kind === 'court') {
                        setSearchQuery(s.label);
                        handleSelectCourt(s.court);
                        setShowResults(true);
                      } else {
                        const coords = { lat: s.lat, lng: s.lng };
                        setSearchQuery(s.label);
                        lastGeocodedQuery.current = s.label;
                        lastGeocodedCoords.current = coords;
                        setUserCoords(coords);
                        setShowResults(true);
                        const nearest5 = courts
                          .map((c) => ({ lat: c.lat, lng: c.lng, dist: haversineKm(coords.lat, coords.lng, c.lat, c.lng) }))
                          .sort((a, b) => a.dist - b.dist).slice(0, 5);
                        setFitBoundsData([[coords.lat, coords.lng], ...nearest5.map((c) => [c.lat, c.lng] as [number, number])]);
                        trackMap('search', { search_term: s.label.slice(0, 100), view: isPrograms ? 'programs' : 'courts', found: true });
                      }
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-0"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {searchError && <p className="text-red-400 text-xs mt-1.5">{searchError}</p>}
          </div>

          {/* Filters toggle */}
          <button
            type="button"
            onClick={() => setShowFilters(f => !f)}
            className="w-full flex items-center justify-between py-0.5 text-sm font-semibold text-white/60 hover:text-white transition-colors"
          >
            <span>Filters</span>
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {showFilters && (!isPrograms ? (
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
          ))}
        </div>

        {courtTypeFilter === 'Bookings' && (
          <div className="px-4 py-2 border-b border-white/10 bg-clay/5">
            <p className="text-clay text-[11px] leading-snug">
              Court 1 — 1 hr slots, $5/hr fee · max 10 players
            </p>
          </div>
        )}

        {/* Count + results toggle */}
        <div className="flex-shrink-0 px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
          <span className="text-xs text-white/50">
            Showing {isPrograms ? displayedPrograms.length : displayedCourts.length} of {isPrograms ? programs.length : courts.length} {isPrograms ? 'programs' : 'courts'}
          </span>
          <button
            type="button"
            onClick={() => setShowResults(r => !r)}
            className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors font-medium"
          >
            {isPrograms ? 'Programs' : 'Courts'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showResults ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Collapsible results */}
        {showResults && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {!isPrograms ? (
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
            )}
          </div>
        )}

        {/* Guest CTA */}
        {!user && (
          <div className="flex-shrink-0 px-4 py-3 border-t border-white/10 bg-clay/5 flex items-center justify-between gap-3">
            <p className="text-white/70 text-xs leading-snug">Found your court? Meet local tennis players.</p>
            <Link
              to="/signup?returnTo=/events&intent=join-league"
              className="shrink-0 px-3 py-1.5 rounded-lg bg-clay text-white text-xs font-bold hover:bg-clay/80 transition-colors whitespace-nowrap"
            >
              Join Now
            </Link>
          </div>
        )}

        {/* Sidebar footer: legend + suggest */}
        <div className="mt-auto flex-shrink-0 border-t border-white/10 px-4 py-3">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/50 mb-2.5 pointer-events-none">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#15803d] inline-block shrink-0" />Active</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#eab308] inline-block shrink-0" />Programs</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6] inline-block shrink-0" />Open hours</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f97316] inline-block shrink-0" />No Activity</span>
          </div>
          <button
            type="button"
            onClick={() => { setSuggestPresetCourt(null); setShowSuggestModal(true); }}
            className="w-full px-3 py-2 rounded-xl border border-clay/40 text-clay text-xs font-semibold hover:bg-clay/10 transition-colors"
          >
            Suggest an Improvement
          </button>
        </div>

      </aside>

      <AnimatePresence>
        {showSuggestModal && (
          <SuggestImprovementModal
            courtNames={courts.map((c) => c.dropdown || c.name)}
            presetCourt={suggestPresetCourt ?? undefined}
            onClose={() => { setShowSuggestModal(false); setSuggestPresetCourt(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
