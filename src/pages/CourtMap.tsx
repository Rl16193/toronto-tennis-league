import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import MapGL, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Search, Loader2, X } from 'lucide-react';
import { ZONE_NAMES, getZone, haversineKm } from '../utils/zones';

import type { CourtWithCount, PickleballOnlyCourt, NearestCourt, NearestProgram, SuggestionItem } from './courtmap/courtMapTypes';
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
import { useCourtData } from './courtmap/useCourtData';
import { CourtResultsList } from './courtmap/CourtResultsList';
import { useAuth } from '../context/AuthContext';
import { ProgramResultsList } from './courtmap/ProgramResultsList';

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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const geocodingActiveRef = useRef(false);
  const lastGeocodedQuery = useRef('');
  const lastGeocodedCoords = useRef<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<MapRef>(null);

  const isPrograms = courtTypeFilter === 'Programs';

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
        { padding: 60, maxZoom: 14, duration: 800 },
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
      const coords = await getCoords(q);
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
  }, [searchQuery, courts, programs, isPrograms, getCoords, setPrograms]);

  const handleClear = useCallback(() => {
    setSearchQuery('');
    setSearchError('');
    setFitBoundsData([]);
    setUserCoords(null);
    setSuggestions([]);
    setShowSuggestions(false);
    setProgLocationFilter('');
    lastGeocodedQuery.current = '';
    lastGeocodedCoords.current = null;
    inputRef.current?.focus();
  }, []);

  const closePopups = useCallback(() => {
    setSelectedCourt(null);
    setSelectedPickleball(null);
  }, []);

  const handleSelectCourt = useCallback((court: CourtWithCount) => {
    setSelectedCourt(court);
    setSelectedPickleball(null);
    try { mapRef.current?.getMap().flyTo({ center: [court.lng, court.lat], zoom: 15, duration: 600 }); } catch { /* ignore */ }
  }, []);

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
                onClick={(e) => { e.stopPropagation(); setSelectedCourt(court); setSelectedPickleball(null); }}
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
                  onClick={(e) => { e.stopPropagation(); setSelectedPickleball(pb); setSelectedCourt(null); }}
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

          {/* Search */}
          <form onSubmit={handleSearch} className="relative">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none z-10" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchQuery(value);
                    const q = value.trim().toLowerCase();

                    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }

                    const courtMatches: SuggestionItem[] = courts
                      .filter((c) => c.dropdown.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
                      .slice(0, 3)
                      .map((c) => ({ kind: 'court' as const, label: c.dropdown || c.name, court: c }));

                    setSuggestions(courtMatches);
                    if (courtMatches.length > 0) setShowSuggestions(true);

                    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
                    if (q.length >= 3) {
                      suggestDebounceRef.current = setTimeout(async () => {
                        try {
                          const url = `https://nominatim.openstreetmap.org/search?format=json` +
                            `&q=${encodeURIComponent(value + ' Toronto')}&limit=8&countrycodes=ca&viewbox=-79.75,43.50,-79.05,43.90`;
                          const res = await fetch(url, { headers: { 'User-Agent': 'toronto-tennis-league' } });
                          const data = await res.json() as { display_name: string; lat: string; lon: string; type: string; class: string }[];
                          const addressMatches: SuggestionItem[] = data
                            .filter((d) => !GENERIC_OSM_TYPES.has(d.type) && !GENERIC_OSM_TYPES.has(d.class))
                            .slice(0, 4)
                            .map((d) => ({
                              kind: 'address' as const,
                              label: d.display_name.split(',').slice(0, 3).join(',').trim(),
                              lat: parseFloat(d.lat),
                              lng: parseFloat(d.lon),
                            }));
                          setSuggestions((prev) => {
                            const courtPart = prev.filter((s) => s.kind === 'court');
                            return [...courtPart, ...addressMatches].slice(0, 6);
                          });
                          if (addressMatches.length > 0) setShowSuggestions(true);
                        } catch { /* silent */ }
                      }, 500);
                    }
                  }}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Search courts or enter an address…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-clay/60 transition-colors"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-[#1c1c2e] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => {
                          if (s.kind === 'court') {
                            setSearchQuery(s.label);
                            setSuggestions([]); setShowSuggestions(false);
                            setSelectedCourt(s.court); setSelectedPickleball(null);
                            try {
                              mapRef.current?.getMap().flyTo({ center: [s.court.lng, s.court.lat], zoom: 15, duration: 600 });
                            } catch { /* ignore */ }
                          } else {
                            setSearchQuery(s.label);
                            lastGeocodedQuery.current = s.label;
                            lastGeocodedCoords.current = { lat: s.lat, lng: s.lng };
                            setSuggestions([]); setShowSuggestions(false);
                          }
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          {s.kind === 'court' && (
                            <span className="text-[9px] text-clay font-bold shrink-0 bg-clay/10 px-1 py-0.5 rounded">
                              COURT
                            </span>
                          )}
                          <span className="truncate">{s.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="px-3 py-2 rounded-lg bg-clay text-white text-sm font-medium hover:bg-clay/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 shrink-0"
              >
                {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Find
              </button>
              {userCoords && (
                <button
                  type="button" onClick={handleClear}
                  className="px-2.5 py-2 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors shrink-0"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {searchError && <p className="text-red-400 text-xs mt-1.5">{searchError}</p>}
          </form>

          {/* Filters */}
          {!isPrograms ? (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <FilterSelect
                  label="Type" value={courtTypeFilter}
                  onChange={(v) => { setCourtTypeFilter(v); }}
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
                  onChange={setCourtLightsFilter}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <FilterSelect
                  label="Zone" value={zoneFilter}
                  onChange={setZoneFilter}
                  options={ZONE_NAMES.map((z) => ({ value: z, label: z }))}
                />
                <FilterSelect
                  label="Pickleball" value={pickleballFilter}
                  onChange={setPickleballFilter}
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
                  onChange={(v) => { setCourtTypeFilter(v); setProgLocationFilter(''); }}
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
                  onChange={setProgStatusFilter}
                  options={[{ value: 'ongoing', label: 'Ongoing' }, { value: 'upcoming', label: 'Upcoming' }]}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <FilterSelect
                  label="Age" value={progAgeFilter}
                  onChange={setProgAgeFilter}
                  options={[{ value: 'under13', label: 'Under 13' }, { value: '13to18', label: '13–18' }, { value: '19plus', label: '19+' }]}
                />
                <DaysDropdown selected={progDaysFilter} onChange={setProgDaysFilter} />
              </div>
            </div>
          )}
        </div>

        {courtTypeFilter === 'Bookings' && (
          <div className="px-4 py-2 border-b border-white/10 bg-clay/5">
            <p className="text-clay text-[11px] leading-snug">
              Court 1 — 1 hr slots, $5/hr fee · max 10 players
            </p>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {!isPrograms ? (
            <>
              {!user && (
                <div className="px-4 py-3 border-b border-clay/20 bg-clay/5 flex items-center justify-between gap-3">
                  <p className="text-white/70 text-xs leading-snug">Found your court? Meet local tennis players.</p>
                  <Link
                    to="/signup?returnTo=/events&intent=join-league"
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-clay text-white text-xs font-bold hover:bg-clay/80 transition-colors whitespace-nowrap"
                  >
                    Join Now
                  </Link>
                </div>
              )}
              <CourtResultsList
                courts={displayedCourts}
                totalCourts={courts.length}
                loading={loading}
                userCoords={userCoords}
                onSelectCourt={handleSelectCourt}
              />
            </>
          ) : (
            <ProgramResultsList
              programs={displayedPrograms}
              totalPrograms={programs.length}
              loading={loading}
              userCoords={userCoords}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex-shrink-0 px-4 py-2.5 border-t border-white/10 bg-white/[0.02]">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/50">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#15803d] inline-block shrink-0" />Active players</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#eab308] inline-block shrink-0" />Programs</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] inline-block shrink-0" />Open hours</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#f97316] inline-block shrink-0" />No Activity</span>
          </div>
        </div>
      </aside>
    </div>
  );
};
