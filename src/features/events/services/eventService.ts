import { Timestamp, addDoc, collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../../lib/firebase';
import { TennisEvent } from '../../../types';
import { sortEventsByStartDate, toDate } from '../../../utils/eventDates';

export type DisplayEvent = TennisEvent & {
  imagePath?: string;
};

export type EventFormState = {
  title: string;
  /** The form's Type; categoryOf() maps it (with the fields below) to category + sub_category. */
  type: string;
  location: string;
  about: string;
  startDate: string;
  endDate: string;
  joinLastDate: string;
  time: string;
  skillLevel: string;
  tournamentFormat: 'knockout' | 'rr';
  tournamentChoice: 'Singles' | 'Doubles';
  /** Meetup only: on = a weekly meetup (sub_category 'meetup'), off = a one-off special. */
  recurring: boolean;
  /** The image already stored on the event (a URL or a legacy gs:// path), or '' for none. A newly
   *  picked file is held by the page until Save and uploaded then, never kept here. */
  image: string;
};

export const INITIAL_EVENT_FORM: EventFormState = {
  title: '',
  type: 'Tournament',
  location: 'Anywhere',
  about: '',
  startDate: '',
  endDate: '',
  joinLastDate: '',
  time: 'Anytime',
  skillLevel: 'All',
  tournamentFormat: 'knockout',
  recurring: false,
  tournamentChoice: 'Singles',
  image: '',
};

export const EVENT_SKILL_OPTIONS = ['All', '2.5+', '3.0+', '3.5+', '4.0+', '4.5+', '5.0+'];
export const EVENT_TYPE_OPTIONS = ['Tournament', 'League Ladder', 'Meetup', 'Coaching Clinic'];

/** The form's Type (plus format / participants / recurring) as the event's category and sub_category. */
const categoryOf = (f: EventFormState): Pick<TennisEvent, 'category' | 'sub_category'> => {
  if (f.type === 'Tournament') {
    return { category: f.tournamentChoice === 'Doubles' ? 'doubles_tournament' : 'singles_tournament', sub_category: f.tournamentFormat };
  }
  if (f.type === 'League Ladder') return { category: 'ladder', sub_category: 'challenge' };
  if (f.type === 'Coaching Clinic') return { category: 'coaching_clinic', sub_category: 'one_off' };
  return { category: 'social', sub_category: f.recurring ? 'meetup' : 'special' };
};

/** A date input's "YYYY-MM-DD" as a local Timestamp: 00:00, or 23:59:59 for an end or a cutoff. */
const dateInputToTimestamp = (value: string, endOfDay: boolean) => {
  const [y, m, d] = value.split('-').map(Number);
  return Timestamp.fromDate(endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d));
};

/** The dated fields a form save writes. */
const datesOf = (f: EventFormState) => ({
  start_date: dateInputToTimestamp(f.startDate, false),
  end_date: dateInputToTimestamp(f.endDate, true),
  join_last_date: f.joinLastDate ? dateInputToTimestamp(f.joinLastDate, true) : null,
});

export const fetchEvents = async () => {
  const snapshot = await getDocs(collection(db, 'events'));
  const eventsData = snapshot.docs.map((eventDoc) => {
    const event = { id: eventDoc.id, ...eventDoc.data() } as TennisEvent;
    const rawImage = event.image || '';

    return {
      ...event,
      image: rawImage.startsWith('gs://') ? '' : rawImage,
      imagePath: rawImage.startsWith('gs://') ? rawImage : undefined,
    } as DisplayEvent;
  });

  return sortEventsByStartDate(eventsData);
};

export const resolveStorageUrl = async (imagePath: string) => {
  if (!imagePath) return '';
  if (imagePath.startsWith('gs://')) {
    return getDownloadURL(ref(storage, imagePath));
  }
  return imagePath;
};

export const MAX_EVENT_IMAGE_BYTES = 5 * 1024 * 1024;

/** Uploads an event image into the creator's own folder (see storage.rules) and returns its URL. */
export const uploadEventImage = async (userId: string, file: File) => {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > MAX_EVENT_IMAGE_BYTES) throw new Error('The image must be under 5 MB.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const imageRef = ref(storage, `events/${userId}/${Date.now()}_${safeName}`);
  await uploadBytes(imageRef, file, { contentType: file.type });
  return getDownloadURL(imageRef);
};

export const validateEventForm = (eventForm: EventFormState) => {
  if (!eventForm.title.trim()) return 'Please enter an event title.';
  if (!eventForm.type.trim()) return 'Please select an event type.';
  if (!eventForm.location.trim()) return 'Please enter a location.';
  if (!eventForm.about.trim()) return 'Please describe the event.';
  if (!eventForm.startDate) return 'Please choose a start date.';
  if (!eventForm.endDate) return 'Please choose an end date.';
  if (eventForm.endDate < eventForm.startDate) return 'End date must be on or after the start date.';
  if (eventForm.joinLastDate && eventForm.joinLastDate > eventForm.endDate) return 'Join last date must be on or before the end date.';
  if (!eventForm.time.trim()) return 'Please enter the event time.';
  return '';
};

export const createEvent = async (userId: string, organizerName: string, eventForm: EventFormState, imageUrl: string) => {
  // Every field of the event shape, typed empties where unused. organizer_ids is the creator only
  // (firestore.rules); only the super admin changes it.
  const newEvent = {
    ...categoryOf(eventForm),
    title: eventForm.title.trim(),
    about: eventForm.about.trim(),
    location: eventForm.location.trim(),
    image: imageUrl,
    skill_level: eventForm.skillLevel,
    organizer: organizerName,
    organizer_ids: [userId],
    ...datesOf(eventForm),
    time: eventForm.time.trim(),
    round_deadlines: {},
    zone_draw_config: {},
    completed_at: null,
    created_at: Timestamp.now(),
  };

  const created = await addDoc(collection(db, 'events'), newEvent);
  return { id: created.id, ...newEvent } as DisplayEvent;
};

/** An organizer edits the event's details. Never touches organizer_ids or created_at. */
export const updateEvent = async (eventId: string, eventForm: EventFormState) => {
  const patch = {
    ...categoryOf(eventForm),
    title: eventForm.title.trim(),
    location: eventForm.location.trim(),
    about: eventForm.about.trim(),
    image: eventForm.image,
    ...datesOf(eventForm),
    time: eventForm.time.trim(),
    skill_level: eventForm.skillLevel,
  };
  await updateDoc(doc(db, 'events', eventId), patch);
  return patch;
};

/** A stored date as the date input's local "YYYY-MM-DD" ('' when absent). */
const asDateInputValue = (v: TennisEvent['start_date'] | undefined) => {
  const d = toDate(v);
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
};

const FORM_TYPE: Record<TennisEvent['category'], string> = {
  singles_tournament: 'Tournament', doubles_tournament: 'Tournament', ladder: 'League Ladder', social: 'Meetup', coaching_clinic: 'Coaching Clinic',
};

/** Prefills the edit form from an existing event. */
export const formFromEvent = (event: DisplayEvent): EventFormState => ({
  title: event.title || '',
  type: FORM_TYPE[event.category] || 'Tournament',
  location: event.location || '',
  about: event.about || '',
  startDate: asDateInputValue(event.start_date),
  endDate: asDateInputValue(event.end_date),
  joinLastDate: asDateInputValue(event.join_last_date),
  time: event.time || '',
  skillLevel: event.skill_level || 'All',
  tournamentFormat: event.sub_category === 'rr' ? 'rr' : 'knockout',
  recurring: event.sub_category === 'meetup',
  tournamentChoice: event.category === 'doubles_tournament' ? 'Doubles' : 'Singles',
  // fetchEvents moves a gs:// path out of `image` into `imagePath`; hand back whichever is stored,
  // so saving an edit without touching the image writes the same value back.
  image: event.imagePath || event.image || '',
});
