import { Event, TournamentBracket, User } from '../types';

export const mockUser: User = {
  id: '1',
  name: 'Rahul Tirath',
  displayName: 'RahulT',
  email: 'rahultirath.lal@gmail.com',
  phone: '416-555-0192',
  avatar: 'https://picsum.photos/seed/rahul/200/200',
  skillLevel: 4.0,
  preferredCourts: ['Trinity Bellwoods', 'Riverdale Park East'],
  motto: 'Play with heart, win with grace.',
  stats: {
    wins: 12,
    losses: 4,
    winRate: 75,
  },
  playingHistory: ['Spring Classic 2023 - QF', 'Summer Open 2023 - SF'],
  favouritePlayers: ['Roger Federer', 'Carlos Alcaraz'],
};

export const mockEvents: Event[] = [
  {
    id: 'e1',
    title: 'Spring Classic',
    location: 'Trinity Bellwoods',
    date: 'April 5 – April 30',
    type: 'Tournament',
    image: 'https://picsum.photos/seed/tennis1/600/400',
  },
  {
    id: 'e2',
    title: 'Monday Evening Volleys',
    location: 'Riverdale Park East',
    date: 'Every Monday, 6:00 PM',
    type: 'Casual Meetup',
    image: 'https://picsum.photos/seed/tennis2/600/400',
  },
  {
    id: 'e3',
    title: 'Serving Perfection Clinic',
    location: 'Eglinton Park',
    date: 'May 12, 10:00 AM',
    type: 'Clinic',
    image: 'https://picsum.photos/seed/tennis3/600/400',
  },
];

export const mockChallengersBracket: TournamentBracket[] = [
  {
    id: 'r1',
    round: 'Quarterfinals',
    matches: [
      { id: 'm1', player1: 'Alex M.', player2: 'Sam T.', score: '6-4, 6-2', winner: 'Alex M.' },
      { id: 'm2', player1: 'Jordan K.', player2: 'Casey R.', score: '7-5, 4-6, 10-8', winner: 'Jordan K.' },
      { id: 'm3', player1: 'Taylor B.', player2: 'Morgan L.', score: '6-1, 6-3', winner: 'Taylor B.' },
      { id: 'm4', player1: 'Riley P.', player2: 'Jamie D.', score: '2-6, 6-4, 10-5', winner: 'Jamie D.' },
    ],
  },
  {
    id: 'r2',
    round: 'Semifinals',
    matches: [
      { id: 'm5', player1: 'Alex M.', player2: 'Jordan K.', score: '6-3, 6-4', winner: 'Alex M.' },
      { id: 'm6', player1: 'Taylor B.', player2: 'Jamie D.', score: 'TBD', winner: '' },
    ],
  },
  {
    id: 'r3',
    round: 'Finals',
    matches: [
      { id: 'm7', player1: 'Alex M.', player2: 'TBD', score: 'TBD', winner: '' },
    ],
  }
];

export const mockMastersBracket: TournamentBracket[] = [
  {
    id: 'r1',
    round: 'Semifinals',
    matches: [
      { id: 'm1', player1: 'Rahul T.', player2: 'David S.', score: '6-4, 7-6', winner: 'Rahul T.' },
      { id: 'm2', player1: 'Michael C.', player2: 'Sarah W.', score: '6-2, 6-1', winner: 'Michael C.' },
    ],
  },
  {
    id: 'r2',
    round: 'Finals',
    matches: [
      { id: 'm3', player1: 'Rahul T.', player2: 'Michael C.', score: 'TBD', winner: '' },
    ],
  }
];
