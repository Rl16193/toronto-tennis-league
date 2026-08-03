import { addDoc, collection, getDocs } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, storage } from '../../../lib/firebase';
import { TennisEvent } from '../../../types';
import { sortEventsByStartDate } from '../../../utils/eventDates';

export type DisplayEvent = TennisEvent & {
  imagePath?: string;
};

export type EventFormState = {
  title: string;
  type: string;
  location: string;
  organizer: string;
  about: string;
  startDate: string;
  endDate: string;
  joinLastDate: string;
  time: string;
  skillLevel: string;
  tournamentFormat: 'knockout' | 'rr';
  tournamentChoice: 'Singles' | 'Doubles';
};

export const INITIAL_EVENT_FORM: EventFormState = {
  title: '',
  type: 'Tournament',
  location: 'Anywhere',
  organizer: '',
  about: '',
  startDate: '',
  endDate: '',
  joinLastDate: '',
  time: 'Anytime',
  skillLevel: 'All',
  tournamentFormat: 'knockout',
  tournamentChoice: 'Singles',
};

export const EVENT_SKILL_OPTIONS = ['All', '2.5+', '3.0+', '3.5+', '4.0+', '4.5+', '5.0+'];
export const EVENT_TYPE_OPTIONS = ['Tournament', 'League Ladder', 'Meetup', 'Special Event', 'League Event', 'Social'];

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

export const validateEventForm = (eventForm: EventFormState) => {
  if (!eventForm.title.trim()) return 'Please enter an event title.';
  if (!eventForm.type.trim()) return 'Please select an event type.';
  if (!eventForm.location.trim()) return 'Please enter a location.';
  if (!eventForm.organizer.trim()) return 'Please enter the organizer name.';
  if (!eventForm.about.trim()) return 'Please describe the event.';
  if (!eventForm.startDate) return 'Please choose a start date.';
  if (!eventForm.endDate) return 'Please choose an end date.';
  if (eventForm.endDate < eventForm.startDate) return 'End date must be on or after the start date.';
  if (eventForm.joinLastDate && eventForm.joinLastDate > eventForm.endDate) return 'Join last date must be on or before the end date.';
  if (!eventForm.time.trim()) return 'Please enter the event time.';
  return '';
};

export const createEvent = async (userId: string, eventForm: EventFormState, imageUrl: string) => {
  const newEvent = {
    title: eventForm.title.trim(),
    type: eventForm.type.trim(),
    location: eventForm.location.trim(),
    organizer: eventForm.organizer.trim(),
    about: eventForm.about.trim(),
    image: imageUrl,
    start_date: eventForm.startDate,
    end_date: eventForm.endDate,
    join_last_date: eventForm.joinLastDate,
    time: eventForm.time.trim(),
    skill_level: eventForm.skillLevel,
    creator_id: userId,
    created_at: new Date().toISOString(),
    ...(eventForm.type.trim() === 'Tournament' && {
      tournament_format: eventForm.tournamentFormat,
      tournament_choice: eventForm.tournamentChoice,
    }),
  };

  const created = await addDoc(collection(db, 'events'), newEvent);
  return { id: created.id, ...newEvent } as DisplayEvent;
};
