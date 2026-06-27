export type CsvCourt = {
  name: string;
  dropdown: string;
  lat: number;
  lng: number;
  address: string;
  courtType: string;
  numCourts: number;
  lights: boolean;
  winterPlay: boolean;
  website: string;
  clubInfo: string;
  zone: string;
  bookingUrl?: string;   // set when the court is reservable online (from the CSV)
};

export type PickleballNetType = 'Tennis' | 'Pickleball' | 'No Net' | 'Adjustable';

export type PickleballEntry = {
  netType: PickleballNetType;
  lights: boolean;
  numCourts: number;
};

export type PickleballOnlyCourt = {
  location: string;
  entries: PickleballEntry[];
  lat?: number;
  lng?: number;
};

export type CourtWithCount = CsvCourt & {
  count: number;
  hasPrograms: boolean;
  pickleballEntries: PickleballEntry[];
};

export type TennisProgram = {
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
  matchedDropdown?: string;  // dropdown of the court this program maps to (for filtering)
};

export type NearestCourt = CourtWithCount & { distKm: number };
export type NearestProgram = TennisProgram & { distKm: number | null };

export type SuggestionItem =
  | { kind: 'court'; label: string; court: CourtWithCount }
  | { kind: 'address'; label: string; lat: number; lng: number };
