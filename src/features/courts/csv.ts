import { parseCsvLine } from '../../utils/csv';
import { getZone } from '../../utils/zones';
import type { CsvCourt } from './types';

/** Parse the source court export into the normalized shape used by map and task flows. */
export function parseCourts(csvText: string): CsvCourt[] {
  const [headerLine, ...lines] = csvText.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const idx = (col: string) => headers.indexOf(col);
  const iName = idx('Name'),
    iDropdown = idx('Dropdown'),
    iType = idx('Type');
  const iLights = idx('Lights'),
    iCourts = idx('Courts');
  const iAddress = idx('LocationAddress'),
    iGeom = idx('geometry');
  const iClubInfo = idx('ClubInfo');
  const iWinterPlay = idx('WinterPlay');
  const iWebsite = idx('ClubWebsite');
  const iBooking = idx('BookingUrl');

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
        lat,
        lng,
        address: cells[iAddress]?.trim() || '',
        courtType: cells[iType]?.trim() || '',
        numCourts: parseInt(cells[iCourts]) || 0,
        lights: cells[iLights]?.trim().toLowerCase() === 'yes',
        winterPlay: iWinterPlay >= 0 && cells[iWinterPlay]?.trim().toLowerCase() === 'yes',
        website: iWebsite >= 0 ? cells[iWebsite]?.trim() || '' : '',
        clubInfo: iClubInfo >= 0 ? cells[iClubInfo]?.trim() || '' : '',
        zone: getZone(lat, lng),
        bookingUrl: iBooking >= 0 ? cells[iBooking]?.trim() || undefined : undefined,
      });
    } catch {
      /* skip malformed */
    }
  }
  return courts;
}
