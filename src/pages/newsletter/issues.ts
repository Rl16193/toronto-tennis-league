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
  /** Widest it is shown on its own page, in px: a small source image is never stretched past this. */
  maxWidth?: number;
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
    number: 2,
    date: 'November 2026',
    tagline: "L'œuf for the game",
    pdf: '/newsletter/Served-Up-Issue-02.pdf',
    credits: [
      'Words & edit — Rahul Tirath Lal',
      'Interview — Friends of Cedarvale',
      'Archival image — City of Toronto Archives',
    ],
    items: [
      {
        kind: 'article',
        slug: 'cedarvale-park',
        slot: 'lead',
        kicker: 'Court of the Month · 02',
        headline: 'Cedarvale Park',
        dek: 'From a gated community to a wooded ravine.',
        image: { src: `${IMG}cedarvale-courts.jpg`, alt: 'Cedarvale Park tennis courts behind a chain-link fence, with a bench in the foreground', caption: 'The tennis courts at Cedarvale Park' },
        facts: [
          ['Courts', '4 tennis · hardcourt acrylic'],
          ['Size', '80 acres'],
          ['Lights', 'Yes'],
          ['Established', 'Before 1999'],
          ['Resurfacing', 'Around Spring 2012'],
          ['Lights installed', 'Around 2022'],
          ['Before the Park', 'A valley shaped by the Castle Frank Brook'],
          ['Fun Fact', 'Line 1 tunnels run beneath the park'],
          ['New playground', 'Summer 2027'],
        ],
        sections: [
          {
            paragraphs: [
              'Located in Midtown, just south of Eglinton Avenue West, Cedarvale Park was once envisioned to be an exclusive gated community by Sir Henry Pellatt, the financier that built the Casa Loma, only to be halted by WWI and the great depression. The valley was then slated for the Spadina Expressway and its floor was cleared for it. The expressway was stopped and the subway tunnel was built beneath it instead. The forest has since grown back, as the southern part of the park drops into a wooded ravine, with an off-leash dog arena, a trail that runs to St.Clair West Station and a cattail wetland farther south.',
              'The four tennis courts are in the open north end, with Phil White Arena and a cricket pitch. Among the 67 courts our members name, Cedarvale is home to 19 of our members.',
              'A club ran here before 1999, when a City report noted that the outdoor clubs at Cedarvale and Smythe parks had been cancelled after memberships declined. In the spring of 2012, a group calling itself the Cedarvale Tennis Academy proposed running Cedarvale Park’s four public tennis courts as a membership club, with fees to pay for upkeep. Neighbours objected, in a fight to keep the courts public, Toronto Life reported.',
              'Eglinton West station became Cedarvale station on December 7, 2025. Line 5 Eglinton opened there on February 8, 2026, so the station is now where Line 1 meets Line 5. Players coming from the south can take the ravine trail, which links St. Clair West station to the north end of the park.',
              'Friends of Cedarvale is a small neighbourhood group dedicated to maintaining and improving Cedarvale Park and Ravine. Volunteers run Saturday stewardship sessions that pull invasive plants, a litter pickup team and guided nature walks.',
            ],
          },
        ],
        figures: [
          { src: `${IMG}cedarvale-archive-1917.jpg`, alt: 'Archival photograph of the Cedarvale ravine in 1917', caption: 'Cedarvale Park Archival Image (1917)' },
          { src: `${IMG}cedarvale-ravine.jpg`, alt: 'A walker on the Cedarvale ravine trail beneath the Glen Road bridge', caption: 'Cedarvale Park Ravine Trail' },
        ],
      },
      {
        kind: 'table',
        slug: 'events',
        slot: 'centre',
        kicker: 'November 2026',
        headline: 'Events to watch',
        dek: 'ATP events and where to watch them in Canada.',
        columns: ['Dates', 'Tournament', 'Level', 'Location', 'Surface', 'Where to watch'],
        rows: [
          ['Oct 26–Nov 1', 'Swiss Indoors Basel', 'ATP 500', 'Basel, Switzerland', 'Hard (indoor)', 'TSN, TSN Premium'],
          ['Oct 26–Nov 1', 'Erste Bank Open', 'ATP 500', 'Vienna, Austria', 'Hard (indoor)', 'TSN Premium'],
          ['Nov 2–8', 'Rolex Paris Masters', 'ATP 1000', 'Paris, France (La Défense Arena)', 'Hard (indoor)', 'TSN, TSN Premium'],
          ['Nov 8–14', 'Stockholm Open', 'ATP 250', 'Stockholm, Sweden', 'Hard (indoor)', 'TSN Premium'],
          ['Nov 15–22', 'Nitto ATP Finals', 'ATP Finals', 'Turin, Italy', 'Hard (indoor)', 'TSN, TSN Premium'],
          ['Nov 24–29', 'Davis Cup Finals', 'Team event (ITF)', 'Bologna, Italy', 'Hard (indoor)', 'TSN, TSN Premium'],
          ['Dec 9–13', 'Next Gen ATP Finals', 'ATP (under 21)', 'Reggio Calabria, Italy', 'Hard (indoor)', 'Not announced yet'],
        ],
        note: 'Broadcast listings are Canadian where available; check local rights before you commit the evening.',
      },
      {
        kind: 'article',
        slug: 'awards-gala',
        slot: 'left',
        kicker: 'Upcoming Event',
        headline: 'Racquets And Strings Awards Gala',
        dek: 'The perfect opportunity to dress up, meet fellow community members and learn what motivates people to play tennis.',
        sections: [
          {
            paragraphs: ['The perfect opportunity to dress up, meet fellow community members and learn what motivates people to play tennis. We have a bunch of awards to give out including prizes for the tournament winners.'],
          },
        ],
        facts: [
          ['Dates', 'Tentatively the 3rd week of November or the 1st week of December'],
          ['Venue', 'TBD'],
          ['Awards', 'Including prizes for the tournament winners'],
        ],
        links: [{ label: 'View the event', href: '/events?category=socials' }],
      },
      {
        kind: 'article',
        slug: 'shadow-practice',
        slot: 'left',
        kicker: 'Level up your game',
        headline: 'What is shadow practice?',
        dek: 'Learn how to build perfect muscle memory, without a ball.',
        sections: [
          {
            paragraphs: [
              'Shadow practice is the rehearsal of your swings and footwork through the air without an actual ball or opponent. You perform full, controlled strokes, focusing entirely on clean mechanics, smooth weight transfer, and proper balance.',
              'Do it too fast and you’ll just repeat your bad habits; omit the footwork and you won’t build a realistic kinetic chain. Watch any pro pacing the back of the court before a match and you’ll see them visualizing and shadow-swinging through their strokes.',
            ],
          },
          {
            heading: 'Drill to try this week: The Mirror Freeze',
            paragraphs: ['Stand in front of a full-length mirror. Shadow-swing your forehand or backhand at 25% speed, and physically freeze your body exactly at the contact point. Check that your racket face is flush, your knees are bent, and your non-dominant hand is balanced. Do 20 controlled swings per side to lock in the feeling.'],
          },
        ],
        links: [
          { label: 'Shadow practice drill 1', href: 'https://www.youtube.com/watch?v=iKwvxSQ9spE' },
          { label: 'Shadow practice drill 2', href: 'https://www.youtube.com/watch?v=rQrqvdkWvJA' },
        ],
      },
      {
        kind: 'image',
        slug: 'meme',
        slot: 'left',
        kicker: 'Meme of the month',
        headline: 'Trust or Communicate',
        dek: 'What’s your weapon of choice?',
        image: { src: `${IMG}meme-doubles.jpg`, alt: 'Two doubles players leaping apart in opposite directions on a clay court. Caption: My doubles partner and I *communicating*', caption: 'What’s your weapon of choice?' },
      },
      {
        kind: 'puzzle',
        slug: 'tie-break',
        slot: 'left',
        kicker: 'The Tie Break',
        headline: 'Trivia & a mini crossword',
        dek: 'What is the maximum number of career ATP Points collected by a tennis player without winning any Slams or ATP 1000 titles?',
        trivia: {
          question: 'What is the maximum number of career ATP Points collected by a tennis player without winning any Slams or ATP 1000 titles?',
          answer: 'Gaël Monfils (34,753 ATP Points).',
        },
        grid: ['SMASH', 'P#C##', 'I#E##', 'N####'],
        across: [{ num: 1, clue: 'A big overhead shot (5)' }],
        down: [
          { num: 1, clue: 'Rotation on the ball (4)' },
          { num: 2, clue: 'A serve your opponent can’t touch (3)' },
        ],
      },
      {
        kind: 'article',
        slug: 'night-tennis',
        slot: 'right',
        kicker: 'Night Tennis',
        headline: 'Night Tennis in Toronto',
        dek: 'A brief look at the landscape of night tennis in Toronto.',
        image: { src: `${IMG}moss-park-lights.jpg`, alt: 'Moss Park tennis courts lit up at dusk', caption: 'Moss Park Tennis Courts Under Lights', maxWidth: 348 },
        sections: [
          {
            paragraphs: [
              'A 2016 City report put the tennis season at about April 1 to October 31. On the last day of that season the sun sets in Toronto at 6:10 p.m. The clocks go back the next day, and by the second week of November it sets before five.',
              'Hours vary from court to court, but lit courts generally stay open until 10 p.m. Measured from sunset, a 10 p.m. closing gives lit courts 57 extra minutes on June 21, just over two hours on September 1, three on October 1 and almost four on October 31.',
              'A March 2025 City report counted over 600 outdoor tennis courts in 185 parks, about one court for every 4,800 residents. Of those, 339 are operated as public facilities and 263 are operated by 61 not-for-profit community tennis clubs, many with long waitlists. The City’s 2017 Parks and Recreation Facilities Master Plan found an oversupply of public courts and set no target for adding more. It still recommended up to 20 new courts over 20 years in growth areas without court access, naming Downtown and North Scarborough.',
              'The City’s 2025 to 2027 court improvements program which funds one park per ward covers 28 parks, with Cedarvale not among them. 24 programs have been completed. The City asked residents about lighting, fencing and surfaces. No park on the list shows lighting work. In the City’s survey of 19 parks, lighting was a top theme at 11, with at least 169 comments. Ramsden drew 45, High Park 35 and Norwood 24. At Ramsden, surfaces drew more than lighting, with 100 comments which is why the resurfacing was prioritized.',
              'In our 2026 season review, 263 members named 67 Toronto courts as their preferred option with downtown-midtown covering 75% of our player base. Downtown has only one court with lights, Moss Park. The closest zone with night lights is the Etobicoke-Lakeshore, with 76% courts covered with lights, the second-highest share of lit public courts.',
            ],
          },
        ],
      },
      {
        kind: 'article',
        slug: 'in-their-words',
        slot: 'right',
        kicker: 'In their words',
        headline: 'Friends of Cedarvale on the park',
        dek: 'John Cummings, chair, and Valentina Gastaldo, community member, on sharing the park and their wishlist.',
        image: { src: `${IMG}friends-of-cedarvale.jpg`, alt: 'Botanical illustration of a pink flower cluster with green leaves', caption: 'John Cummings, chair · Valentina Gastaldo, community member', maxWidth: 224 },
        sections: [
          {
            paragraphs: ['Friends of Cedarvale is a local community group known for documenting everyday life at Cedarvale Park and Ravine. John Cummings is a long-term resident and the chair of the community; Valentina Gastaldo is a community member.'],
          },
          {
            heading: 'Cedarvale hosts diverse groups, tennis players, dog owners, trail runners and more. How do you see the public tennis courts fitting into the broader social fabric of the park?',
            paragraphs: ['John said, “Cedarvale provides access to a bunch of sports: cricket, baseball, basketball, soccer, hockey, tennis, pickleball and more. They all fit in well to the ‘park’ section of the park. We also have a separate ‘ravine’ section of the park.” Val added, “I’d like to see additional support for a variety of sports, a full sized soccer field and basketball courts, as well as programming for youth.”'],
          },
          {
            heading: 'Beyond tennis, what broader park or ravine enhancements are highest on your wishlist?',
            paragraphs: ['John said, “Further eradication of non-native invasive species and its replacement with native species.” Val added, “Better washrooms, lighter picnic tables, more seating area to allow people to gather in the park.”'],
          },
        ],
      },
    ],
  },
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
