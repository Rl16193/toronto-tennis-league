import React from 'react';
import type { CourtWithCount } from './courtMapUtils';
import { hasPublicHours } from './courtMapUtils';
import { PickleballBadges } from './courtMapComponents';

// Shared court detail bubble, rendered inside a MapGL <Popup> on both the Court Locator page
// and the Home landing map so the two show the identical content. The program/suggest actions
// only appear when their handlers are supplied (the landing omits them).
export const CourtPopup: React.FC<{
  court: CourtWithCount;
  onViewPrograms?: () => void;
  onSuggest?: () => void;
}> = ({ court, onViewPrograms, onSuggest }) => (
  <div style={{ fontFamily: 'system-ui, sans-serif', padding: '4px 2px', textAlign: 'center' }}>
    <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, marginTop: 0, color: '#1f2937' }}>
      {court.dropdown || court.name}
    </p>
    {court.address && (
      <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 7, marginTop: 0 }}>
        {court.address}
      </p>
    )}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 7, justifyContent: 'center' }}>
      <span style={{ background: '#e5e7eb', color: '#111', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
        {court.courtType.toUpperCase()}
      </span>
      {court.numCourts > 0 && (
        <span style={{ background: '#e5e7eb', color: '#111', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
          {court.numCourts} CT
        </span>
      )}
      {court.lights && (
        <span style={{ background: '#fef08a', color: '#713f12', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
          LIGHTS
        </span>
      )}
      {hasPublicHours(court) && (
        <span style={{ background: '#1e3a5f', color: '#93c5fd', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
          OPEN HOURS
        </span>
      )}
      {court.bookingUrl && (
        <span style={{ background: '#7c2d12', color: '#fdba74', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
          BOOKABLE
        </span>
      )}
      <PickleballBadges entries={court.pickleballEntries} popup />
    </div>
    {court.count > 0 && (
      <p style={{ color: '#16a34a', fontSize: 11, margin: '0 0 3px' }}>
        {court.count} active player{court.count !== 1 ? 's' : ''}
      </p>
    )}
    {court.clubInfo && (
      <p style={{ color: '#6b7280', fontSize: 10, margin: '0 0 6px', lineHeight: 1.4 }}>
        {court.clubInfo}
      </p>
    )}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, justifyContent: 'center' }}>
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${court.lat},${court.lng}`}
        target="_blank" rel="noreferrer"
        style={{ padding: '4px 10px', background: '#166534', color: '#fff', borderRadius: 6, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}
      >
        Directions
      </a>
      {court.website && (
        <a
          href={court.website}
          target="_blank" rel="noreferrer"
          style={{ padding: '4px 10px', background: '#1d4ed8', color: '#fff', borderRadius: 6, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}
        >
          Website
        </a>
      )}
      {court.bookingUrl && (
        <a
          href={court.bookingUrl}
          target="_blank" rel="noreferrer"
          style={{ padding: '4px 10px', background: '#166534', color: '#fff', borderRadius: 6, fontSize: 11, textDecoration: 'none', fontWeight: 500 }}
        >
          Book Online
        </a>
      )}
      {court.hasPrograms && onViewPrograms && (
        <button
          onClick={onViewPrograms}
          style={{ padding: '4px 10px', background: '#ca8a04', color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer' }}
        >
          View Available Programs
        </button>
      )}
    </div>
    {onSuggest && (
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={onSuggest}
          style={{ padding: '5px 12px', background: '#ea580c', color: '#fff', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          Suggest an Improvement
        </button>
      </div>
    )}
  </div>
);
