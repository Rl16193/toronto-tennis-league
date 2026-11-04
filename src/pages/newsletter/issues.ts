// Served Up issues, newest first. To publish one, add an entry at the top and put its images in
// public/newsletter/img/. `slot` places an item on the front page; every item also gets its own
// page at /newsletter/:issue/:slug.

export type Slot = 'lead' | 'centre' | 'left' | 'right';

export interface Section {
  heading?: string;
  paragraphs: string[];
}

export interface Figure {
  src: string;
  alt: string;
  caption: string;
}

interface Base {
  slug: string;
  slot: Slot;
  kicker: string;
  headline: string;
  dek: string;
}

export interface Article extends Base {
  kind: 'article';
  image?: Figure;
  isNew?: boolean;
  /** An events doc id: the front-page box opens /events?event=ID instead of the article. */
  event?: string;
  sections: Section[];
  facts?: [string, string][];
  quotes?: { name: string; role: string; image?: string; paragraphs: string[] };
  figures?: Figure[];
  links?: { label: string; href: string }[];
}

export interface ImageItem extends Base {
  kind: 'image';
  image: Figure;
}

export interface TableItem extends Base {
  kind: 'table';
  columns: string[];
  rows: string[][];
  note: string;
}

export interface PuzzleItem extends Base {
  kind: 'puzzle';
  trivia: { question: string; answer: string };
  /** Solution rows; '#' is a black square. */
  grid: string[];
  across: { num: number; clue: string }[];
  down: { num: number; clue: string }[];
}

export type Item = Article | ImageItem | TableItem | PuzzleItem;

export interface Issue {
  number: number;
  date: string;
  tagline: string;
  pdf: string;
  credits: string[];
  items: Item[];
}

const IMG = '/newsletter/img/';

export const ISSUES: Issue[] = [
  {
    number: 1,
    date: 'October 2026',
    tagline: "L'œuf for the game",
    pdf: '/newsletter/served-up-issue-01.pdf',
    credits: [
      'Words & edit — Rahul Tirath Lal',
      'Player interview — Ralph Tientcheu',
      'Archival image — Toronto Public Library',
    ],
    items: [
      {
        kind: 'article',
        slug: 'unspoken-rules',
        slot: 'lead',
        kicker: 'House Rules',
        headline: 'Unspoken rules of Toronto tennis courts',
        dek: 'A field guide to the queue, the phantom racquet, and the 30-minute clock. Get the lines moving faster.',
        image: { src: `${IMG}queue.jpg`, alt: 'Racquets lined up on a court fence', caption: 'The racquet queue' },
        sections: [
          {
            paragraphs: [
              "You plan to play on a sunny weekend, head to your local public court, and spot ten racquets in the queue. You estimate 90 minutes, grab a coffee nearby, and return 40 minutes later, only to find your racquet was bypassed, or the line didn't move at all. Now you're starting over.",
              "If this sounds familiar, you are not alone. Navigating Toronto's public court queueing system takes a bit of local know-how. Here's how to keep things smooth, fair and hassle-free.",
            ],
          },
          {
            heading: 'Know your board',
            paragraphs: ['Every entry point features a board designated for 2, 3, or 4 specific courts. The queue applies only to those designated courts. If the board slots are full, place your racquet securely in the fence weave, or on the ground directly below it, in sequence.'],
          },
          {
            heading: 'Watch for phantom racquets',
            paragraphs: ['Popular spots like Trinity Bellwoods often see long queues padded with multiple racquets placed by a single group, or by players already on court. If a court opens and nobody claims the lead racquet politely call out to the crowd. If it stays unclaimed, move to the next racquet in line. Keep jumping till you find someone actually waiting to play.'],
          },
          {
            heading: 'Track the time',
            paragraphs: ['Rotations typically run on 30-minute cycles when people are waiting. If a group has been playing well past 30 minutes, politely ask how much time they have for their game to be completed.'],
          },
          {
            heading: 'Etiquette first',
            paragraphs: ['Never walk onto or behind a court during an active rally; wait for the point to conclude before crossing. Stay patient, stay alert, and keep the tone friendly, queue shifts often happen faster than expected when groups pack up early.'],
          },
        ],
      },
      {
        kind: 'table',
        slug: 'events',
        slot: 'centre',
        kicker: 'October 2026',
        headline: 'Events to watch',
        dek: 'ATP & WTA events and where to watch them in Canada.',
        columns: ['Dates', 'Tournament', 'Level', 'Location', 'Surface', 'Where to watch'],
        rows: [
          ['Sep 30–Oct 6', 'Japan Open (Kinoshita Group)', 'ATP 500', 'Tokyo, Japan', 'Hard (outdoor)', 'TSN, RDS, Tennis TV'],
          ['Sep 30–Oct 6', "China Open (Men's)", 'ATP 500', 'Beijing, China', 'Hard (outdoor)', 'TSN, RDS, Tennis TV'],
          ['Sep 28–Oct 11', "China Open (Women's)", 'WTA 1000', 'Beijing, China', 'Hard (outdoor)', 'TSN, TVA Sports, Tennis Channel'],
          ['Oct 7–18', 'Shanghai Masters', 'ATP Masters 1000', 'Shanghai, China', 'Hard (outdoor)', 'TSN, RDS, Tennis TV'],
          ['Oct 12–18', 'Wuhan Open', 'WTA 1000', 'Wuhan, China', 'Hard (outdoor)', 'TSN, TVA Sports, Tennis Channel'],
          ['Oct 19–25', 'Almaty Open', 'ATP 250', 'Almaty, Kazakhstan', 'Hard (indoor)', 'Tennis TV'],
          ['Oct 19–25', 'European Open', 'ATP 250', 'Brussels, Belgium', 'Hard (indoor)', 'Tennis TV'],
          ['Oct 19–25', 'Grand Prix Auvergne-Rhône-Alpes (formerly Open 13 Provence)', 'ATP 250', 'Lyon, France', 'Hard (indoor)', 'Tennis TV'],
          ['Oct 19–26', 'Ningbo Open', 'WTA 250', 'Ningbo, China', 'Hard (outdoor)', 'Tennis Channel'],
          ['Oct 21, 22, 24', 'Six Kings Slam', 'Exhibition', 'Riyadh, Saudi Arabia', 'Hard (indoor)', 'Netflix'],
          ['Oct 25–Nov 2', 'Guangzhou Open', 'WTA 250', 'Guangzhou, China', 'Hard (outdoor)', 'Tennis Channel'],
          ['Oct 26–Nov 1', 'Swiss Indoors Basel', 'ATP 500', 'Basel, Switzerland', 'Hard (indoor)', 'TSN, RDS, Tennis TV'],
          ['Oct 26–Nov 1', 'Erste Bank Open', 'ATP 500', 'Vienna, Austria', 'Hard (indoor)', 'TSN, RDS, Tennis TV'],
        ],
        note: 'Broadcast listings are Canadian where available; check local rights before you commit the evening.',
      },
      {
        kind: 'article',
        slug: 'october-slam',
        slot: 'left',
        kicker: 'Tournaments',
        isNew: true,
        event: 'mp5EfBJBTHgoWJyEROuW',
        headline: 'The October Slam',
        dek: 'Play a match and get a chance to win a free set of Nova Strata strings.',
        sections: [
          {
            paragraphs: [
              "Play a match and get a chance to win a free set of Nova Strata strings. Schedule the match with your opponent or join us on selected matchdays. It's the biggest thing on the fall calendar, get your name in.",
              'Pick your court, get placed in a zone, play your first match with Racquets and Strings.',
            ],
          },
        ],
        facts: [
          ['Dates', 'Oct 10 – Nov 7'],
          ['Levels', 'All levels welcome'],
          ['How', 'Contact your opponent, schedule a time and court and play one match a week if you keep winning.'],
          ['Prize', 'A set of Nova Strata Strings, 1 Can of Wilson US Open Tennis Balls'],
        ],
        links: [{ label: 'Enter the October Slam', href: '/events' }],
      },
      {
        kind: 'article',
        slug: 'in-their-words',
        slot: 'left',
        kicker: 'In their words',
        headline: 'Ralph Tientcheu on the new Ramsden courts',
        dek: 'A Ramsden regular on the resurfacing, and what he would still like to see.',
        image: { src: `${IMG}ralph.jpg`, alt: 'Ralph Tientcheu', caption: 'Ralph Tientcheu · Ramsden regular' },
        sections: [],
        quotes: {
          name: 'Ralph Tientcheu',
          role: 'Ramsden regular',
          paragraphs: [
            'The upgrade to Ramsden Court has made a really noticeable difference. The new hard-court surface feels fresh, consistent and much better to play on, and it’s been great seeing the court brought up to this standard. It feels like a significant improvement for players and makes playing there even more enjoyable.',
            'If there’s anything I’d still love to see, it would be expanded night-play availability with lights on the courts. The 2 last courts to the far left have a bumpy shape making them tricky to play on. But overall, the court upgrade has been a fantastic improvement.',
          ],
        },
      },
      {
        kind: 'article',
        slug: 'split-step',
        slot: 'left',
        kicker: 'Level up your game',
        headline: 'What is a split-step?',
        dek: 'Learn how to be ready for the next shot, after every shot.',
        sections: [
          {
            paragraphs: [
              'The split-step is the small hop you take just as your opponent strikes the ball. You land on the balls of your feet, knees soft, feet a little wider than your shoulders: loaded and ready to push off in any direction.',
              "Time it too early and you're flat-footed by the time the ball arrives; too late and you're still in the air. Watch any pro return a serve and you'll see it, every single point.",
            ],
          },
          {
            heading: 'Drill to try this week: Say “hop”',
            paragraphs: ['Have a partner feed from the service line. Say “hop” out loud and split the instant their racquet meets the ball, land, then move. Ten balls to the forehand, ten to the backhand, then mix it up. The goal: land before you know which side the ball is going.'],
          },
        ],
        links: [
          { label: 'Split-step explanation', href: 'https://www.youtube.com/watch?v=-PBPgBkwtRk' },
          { label: "Why it's important", href: 'https://www.youtube.com/shorts/IoWiK5SN5fk' },
        ],
      },
      {
        kind: 'image',
        slug: 'meme',
        slot: 'left',
        kicker: 'Meme of the month',
        headline: 'The racquet-throwing gene',
        dek: 'Some things really do run in the family.',
        image: { src: `${IMG}meme.jpg`, alt: 'Meme: the racquet-throwing gene', caption: 'Some things really do run in the family.' },
      },
      {
        kind: 'puzzle',
        slug: 'tie-break',
        slot: 'left',
        kicker: 'The Tie Break',
        headline: 'Trivia & a mini crossword',
        dek: 'Which of the four Grand Slams is the only one played on clay?',
        trivia: {
          question: 'Which of the four Grand Slams is the only one played on clay?',
          answer: 'The French Open (Roland-Garros).',
        },
        grid: ['SERVE', 'E#A##', 'T#C##', '##E##'],
        across: [{ num: 1, clue: 'How every point begins (5)' }],
        down: [
          { num: 1, clue: "Win six games (usually) and you've got one (3)" },
          { num: 2, clue: 'The season-long points chase to the Finals (4)' },
        ],
      },
      {
        kind: 'article',
        slug: 'ramsden-park',
        slot: 'right',
        kicker: 'Court of the Month · 01',
        headline: 'Ramsden Park',
        dek: 'A 13.7 acres public park with an upgraded rink, eight tennis courts and brickyard past.',
        image: { src: `${IMG}courts-hero.jpg`, alt: 'The Ramsden Park tennis courts', caption: 'The resurfaced courts at Ramsden Park' },
        facts: [
          ['Courts', '8 tennis · hardcourt acrylic'],
          ['Size', '13.7 acres'],
          ['Established', '1904'],
          ['Named after', 'Ald. J. George Ramsden'],
          ['Before the park', 'Yorkville Brick Yards, 1840s–1890s'],
          ['Resurfacing', 'Completed in 2025'],
          ['New rec centre', 'Summer 2032'],
        ],
        sections: [
          {
            paragraphs: [
              "Located in Yorkville/North Midtown, Ramsden Park is one of Toronto's larger and more active public parks. The 13.7-acre park offers eight tennis courts alongside a playground, water play area, off-leash dog park, outdoor rinks, basketball courts and other recreational amenities.",
              "The western courts received major asphalt-to-hardcourt acrylic resurfacing as part of the City's tennis-court improvement work. The revitalized courts were in use by 2025.",
              'The site was formerly home to the Yorkville Brick Yards, which operated from the 1840s into the 1890s. The City purchased the land in 1904 and established Ramsden Park, named after Alderman J. George Ramsden.',
            ],
          },
          {
            heading: 'The rink',
            paragraphs: ["Ramsden's outdoor rink is undergoing a major state-of-good-repair project. The City awarded the contract to Frank Pellegrino General Contracting Limited ($3.91 million) for work that includes rebuilding the rink slab, upgrading the refrigeration system and glycol piping, replacing the dasher boards, and improving the adjacent change rooms and washrooms. The City's published timeline for completion was winter 2025/26. As of September 2026, the site looks ready for winter activities. The City's rinks typically open from late November to March."],
          },
          {
            heading: 'The community centre',
            paragraphs: ['The City is also planning a new Ramsden Park Community Centre, with construction currently anticipated from spring 2028 to summer 2032.'],
          },
        ],
        figures: [
          { src: `${IMG}brickyards.jpg`, alt: 'Yorkville Brickyards in the 1880s', caption: 'Yorkville Brickyards, 1880s. Source: Toronto Public Library.' },
          { src: `${IMG}rink.jpg`, alt: 'The upgraded Ramsden rink', caption: 'The upgraded Rink with two outdoor pickleball courts (15th September 2026)' },
        ],
      },
      {
        kind: 'article',
        slug: 'keep-courts-public',
        slot: 'right',
        kicker: 'Ramsden Park',
        headline: 'A fight to keep the courts public',
        dek: 'Residents pushed back on a club model and on giving tennis courts over to pickleball.',
        image: { src: `${IMG}maple.jpg`, alt: 'Maple leaves on a tennis court', caption: 'Fallen leaves of the Norway Maple adorning the tennis courts at Ramsden Park.' },
        sections: [
          {
            paragraphs: [
              'In late 2024, signs posted at the park indicated that the City was considering a club-based operating model for the tennis facilities. The ABC Residents Association (ABCRA), which represents the Yorkville/North Midtown community, pushed back, pointing to the commitment made during the 2017 Ramsden Park revitalization to keep the courts open and free to the public.',
              "The debate continued into 2025 as the City explored changes involving dedicated pickleball use. ABCRA again advocated for the eight primary courts to remain dedicated to tennis, while suggesting that the park's dry-pad areas could accommodate pickleball and other multi-sport uses. The association also questioned the timing of the City's feedback process, noting that signs were posted in November, after the active tennis season had largely ended.",
            ],
          },
        ],
      },
    ],
  },
];
