import React, { useEffect, useState } from 'react';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import {
  defaultCourtOptions, extractCourtsWithCoords, extractDropdownCourts,
  getCourtSuggestions, mergeCourtOptions,
} from '../../signup/utils/courtSearch';
import { getZone, zoneFromCourts } from '../../../utils/zones';
import { UserPreferences } from '../../../types';
import { loadCourtsCsv } from '../../tasks/courtList';

/**
 * The preferred-courts editor, shared by the profile card and the Player Dash. A roster court goes
 * to `preferred_courts`, a typed one not on the roster to `custom_courts`. Saving always recomputes
 * the zone from the roster courts, limited to their zones.
 */
export const CourtsEditor: React.FC<{
  preferences: Pick<UserPreferences, 'preferred_courts' | 'custom_courts' | 'preferred_zone'>;
  saving: boolean;
  onSave: (courts: string[], zone: string, custom: string[]) => void;
  /** Set when another button saves (the join sheet's Join): reports the draft and hides Save. */
  onDraftChange?: (courts: string[], zone: string, custom: string[]) => void;
}> = ({ preferences, saving, onSave, onDraftChange }) => {
  // Court option list + coords (for the suggestions + zone recompute), loaded once.
  const [courtOptions, setCourtOptions] = useState<string[]>(defaultCourtOptions);
  const [courtCoords, setCourtCoords] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  useEffect(() => {
    let alive = true;
    loadCourtsCsv()
      .then((csv) => { if (alive && csv) { setCourtOptions(mergeCourtOptions(extractDropdownCourts(csv))); setCourtCoords(extractCourtsWithCoords(csv)); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const [courtsDraft, setCourtsDraft] = useState<string[]>([...(preferences.preferred_courts ?? []), ...(preferences.custom_courts ?? [])]);
  const [courtInput, setCourtInput] = useState('');

  // Split the draft into [roster, custom]: on the roster means in the court option list.
  const split = (courts: string[]): [string[], string[]] => {
    const roster = new Set(courtOptions.map((c) => c.toLowerCase()));
    return [courts.filter((c) => roster.has(c.toLowerCase())), courts.filter((c) => !roster.has(c.toLowerCase()))];
  };
  const report = (fn: (courts: string[], zone: string, custom: string[]) => void) => {
    const [roster, custom] = split(courtsDraft);
    fn(roster, computeZone(roster), custom);
  };

  const computeZone = (courts: string[]): string => {
    if (courts.length === 0) return '';
    // Majority vote across ALL preferred courts (not just the first one) — a player who splits
    // time across zones should land in whichever zone most of their courts are actually in,
    // with Downtown as the tiebreaker (see zoneFromCourts).
    // No Toronto zone from the courts (a non-Toronto court) means '' — the Unassigned draw. The old
    // zone is kept only until the court coordinates have loaded, so an early save can't wipe it.
    const zone = zoneFromCourts(courts, courtCoords);
    if (!zone) return courtCoords.size > 0 ? '' : preferences.preferred_zone || '';
    // The current zone stays while one of the chosen courts is in it; otherwise the majority wins.
    const courtZones = courts
      .map((c) => courtCoords.get(c.trim().toLowerCase()))
      .filter((c): c is { lat: number; lng: number } => !!c)
      .map((c) => getZone(c.lat, c.lng) as string);
    return courtZones.includes(preferences.preferred_zone) ? preferences.preferred_zone : zone;
  };

  // Re-reported once the court coordinates load, so the zone isn't computed from an empty map.
  useEffect(() => { if (onDraftChange) report(onDraftChange); }, [courtsDraft, courtCoords, courtOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const courtSuggestions = getCourtSuggestions(courtOptions, courtsDraft, courtInput);
  const addCourt = (court: string) => {
    const t = court.trim();
    if (!t || courtsDraft.includes(t)) return;
    setCourtsDraft([...courtsDraft, t]); setCourtInput('');
  };

  return (
    <div className="mt-2 space-y-2">
      {courtsDraft.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {courtsDraft.map((c) => (
            <button key={c} type="button" onClick={() => setCourtsDraft(courtsDraft.filter((x) => x !== c))}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-clay text-fg flex items-center gap-1.5">{c} <span className="opacity-70">✕</span></button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input placeholder="Search courts…" value={courtInput} onChange={(e) => setCourtInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCourt(courtInput); } }} />
        <Button size="sm" variant="clay" className="px-3 shrink-0" onClick={() => addCourt(courtInput)} disabled={!courtInput.trim()}>Add</Button>
      </div>
      {courtSuggestions.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-xl bg-tennis-dark/95 p-1">
          {courtSuggestions.map((c) => (
            <button key={c} type="button" onClick={() => addCourt(c)} className="w-full text-left px-3 py-2 text-sm text-fg rounded-lg hover:bg-clay/20">{c}</button>
          ))}
        </div>
      )}
      {!onDraftChange && <Button size="sm" onClick={() => report(onSave)} isLoading={saving}>Save</Button>}
    </div>
  );
};
