import { TournamentMatch, TournamentPlayer } from './types';
import { BYE, PLAYER_LOADING, byMatchNumber, formatDeadline, formatPlayerName, withSeed } from './utils';

export const getRoundLabels = (drawSize: number): string[] => {
  if (drawSize <= 2) return ['F'];
  if (drawSize === 4) return ['SF', 'F'];
  if (drawSize === 8) return ['QF', 'SF', 'F'];
  if (drawSize === 16) return ['R16', 'QF', 'SF', 'F'];
  if (drawSize === 32) return ['R32', 'R16', 'QF', 'SF', 'F'];
  const rounds = Math.log2(drawSize);
  return Array.from({ length: rounds }, (_, i) => `R${i + 1}`);
};

const ROUND_ORDER = ['R128', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const roundRank = (r: string) => {
  const i = ROUND_ORDER.indexOf(r);
  return i === -1 ? ROUND_ORDER.length : i;
};
const ROUND_TITLE: Record<string, string> = {
  R32: 'ROUND OF 32', R16: 'ROUND OF 16', QF: 'QUARTERFINALS', SF: 'SEMIFINALS', F: 'FINAL',
};

const escapeSvg = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const truncate = (value: string, max = 20) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/**
 * Fits a name to the space by dropping the surname to an initial before resorting to an ellipsis:
 * "Riccardo Macchioro" becomes "Riccardo M", which still identifies somebody. A doubles pair keeps
 * its slash and is shortened on both halves.
 */
const shortName = (raw: string, max = 18): string => {
  const full = formatPlayerName(raw);
  if (full.length <= max) return full;
  if (full.includes(' / ')) {
    return truncate(full.split(' / ').map((n) => shortName(n, Math.floor(max / 2))).join(' / '), max);
  }
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const initial = `${parts[0]} ${parts[parts.length - 1][0]}`;
    if (initial.length <= max) return initial;
  }
  return truncate(full, max);
};

// A slot nobody real is standing in yet. Both the placeholder and a BYE are "not a fixture".
const isRealSlot = (name?: string, uid?: string) =>
  !!uid && !!name && name !== PLAYER_LOADING && name !== BYE;
const isRealMatch = (m: TournamentMatch) =>
  isRealSlot(m.player_1_name, m.player_1_uid) && isRealSlot(m.player_2_name, m.player_2_uid);

const C = {
  page: '#0F2B24',
  card: '#16443A',
  cardStroke: '#2C6656',
  text: '#F1F5F9',
  textMuted: '#9FB8B0',
  clay: '#FF6B35',
  divider: '#24564A',
  connector: '#3A7565',
};

// Every frame is the same portrait canvas, so a set of them reads as one series and each one
// suits a phone screen or a social post without cropping.
const W = 1080;
const H = 1350;
const PAD = 64;
const BODY_TOP = 392;
const BODY_BOTTOM = 1216;
const BODY_H = BODY_BOTTOM - BODY_TOP;
const COL_W = (W - PAD * 2 - 24) / 2;
const FONT = 'Montserrat,Arial,sans-serif';

/**
 * The round "It's all love, till someone gets bageled" badge. Only the white box around the disc
 * is removed; the badge keeps its own green so it reads as a logo rather than a watermark.
 *
 * It has to end up as a `data:` URI inside the SVG. The rasteriser draws the SVG through a
 * canvas, which refuses to fetch external files, so a `/Draw Logo.png` reference would silently
 * come out blank. It is fetched and converted at runtime rather than base64'd into the source:
 * the file is 70KB, which would be ~95KB of string shipped to every visitor whether or not they
 * ever open a draw picture. `public/` is same-origin, so reading the pixels back does not taint
 * the canvas.
 */
const BRAND_MARK_SRC = '/Draw%20Logo.png';
const isNearWhite = (d: Uint8ClampedArray, i: number) => d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200;

let markPromise: Promise<string> | null = null;

export const loadBrandMark = (): Promise<string> => {
  if (markPromise) return markPromise;
  markPromise = new Promise<string>((resolve) => {
    const img = new Image();
    img.onerror = () => resolve('');
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = img.width;
        cv.height = img.height;
        const ctx = cv.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const image = ctx.getImageData(0, 0, cv.width, cv.height);
        const d = image.data;
        const { width: w, height: h } = cv;

        // Flood the white surround away from the four corners rather than keying out white
        // everywhere: the lettering and the ball are white too, and they must survive.
        const seen = new Uint8Array(w * h);
        const stack: number[] = [0, w - 1, (h - 1) * w, h * w - 1];
        while (stack.length) {
          const p = stack.pop()!;
          if (p < 0 || p >= w * h || seen[p]) continue;
          const i = p * 4;
          if (!isNearWhite(d, i)) continue;
          seen[p] = 1;
          d[i + 3] = 0;
          const x = p % w;
          if (x > 0) stack.push(p - 1);
          if (x < w - 1) stack.push(p + 1);
          stack.push(p - w, p + w);
        }

        // The badge KEEPS its own green. Dropping it to the page colour did blend it, but it
        // blended it away: at 92px all that survived was the hairline white lettering, which read
        // as a smudge. Only the white box around the disc is removed.
        ctx.putImageData(image, 0, 0);
        resolve(cv.toDataURL('image/png'));
      } catch {
        resolve('');
      }
    };
    img.src = BRAND_MARK_SRC;
  });
  return markPromise;
};

const brandMark = (x: number, y: number, size: number, uri?: string): string => {
  if (uri) return `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${uri}" />`;
  // Never leave the corner empty if the badge could not be loaded.
  const r = size / 2;
  return `<g>
    <circle cx="${x + r}" cy="${y + r}" r="${r - 2}" fill="none" stroke="${C.text}" stroke-width="3" />
    <text x="${x + r}" y="${y + r + 7}" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="900" fill="${C.text}">R&amp;S</text>
  </g>`;
};

type FrameOpts = {
  eventTitle: string;
  division: string;
  stage: string;
  zone?: string;
  deadline?: string;
  mark?: string;
  body: string;
};

// Brand mark top left, tournament top right, division as the headline, stage as a clay chip,
// then zone and deadline. Every builder below draws into `body` and nothing else.
const frame = ({ eventTitle, division, stage, zone, deadline, mark, body }: FrameOpts): string => {
  const chipW = Math.max(150, stage.length * 12 + 40);
  const zoneY = zone ? 322 : 0;
  const deadlineY = deadline ? (zone ? 356 : 322) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="100%" height="100%" fill="${C.page}" />
  ${brandMark(PAD, 56, 92, mark)}
  <text x="${PAD + 112}" y="113" font-size="30" font-weight="900" fill="${C.clay}" letter-spacing="0.5">Racquets &amp; Strings</text>
  <text x="${W - PAD}" y="113" text-anchor="end" font-size="22" font-weight="700" fill="${C.textMuted}">${escapeSvg(eventTitle)}</text>
  <text x="${PAD}" y="232" font-size="58" font-weight="900" fill="${C.text}">${escapeSvg(division)}</text>
  <rect x="${PAD}" y="256" width="${chipW}" height="40" rx="20" fill="${C.clay}" />
  <text x="${PAD + chipW / 2}" y="283" text-anchor="middle" font-size="16" font-weight="900" fill="#0F2B24" letter-spacing="1.5">${escapeSvg(stage)}</text>
  ${zone ? `<text x="${PAD}" y="${zoneY}" font-size="20" font-weight="600" fill="${C.textMuted}">${escapeSvg(zone)}</text>` : ''}
  ${deadline ? `<text x="${PAD}" y="${deadlineY}" font-size="18" font-weight="600" fill="${C.textMuted}">Deadline: ${escapeSvg(deadline)}</text>` : ''}
  <g>${body}</g>
  <text x="${W / 2}" y="${H - 76}" text-anchor="middle" font-size="26" font-weight="900" fill="${C.text}" letter-spacing="2">L&#8217;&#338;UF FOR THE GAME</text>
  <text x="${W / 2}" y="${H - 44}" text-anchor="middle" font-size="17" font-weight="600" fill="${C.textMuted}">racquetsandstrings.ca &#183; @racqnstringstoronto</text>
</svg>`;
};

// ── Blocks and pagination ────────────────────────────────────────────────────
// Every body is a list of fixed-height blocks flowed down the page. When they overrun the body
// area the overflow starts a new frame, which is what turns a 32 draw into two pictures rather
// than one crowded one.

type Block = { height: number; render: (y: number) => string };

const paginate = (blocks: Block[]): Block[][] => {
  const pages: Block[][] = [];
  let page: Block[] = [];
  let used = 0;
  for (const b of blocks) {
    if (page.length && used + b.height > BODY_H) { pages.push(page); page = []; used = 0; }
    page.push(b);
    used += b.height;
  }
  if (page.length) pages.push(page);
  return pages.length ? pages : [[]];
};

const renderPage = (page: Block[]): string => {
  let y = BODY_TOP;
  return page.map((b) => { const out = b.render(y); y += b.height; return out; }).join('');
};

const contactOf = (uid: string, contacts: ContactMap): string => {
  const c = contacts[uid];
  return c?.phone || c?.email || '';
};

/**
 * One still-to-play match. Every card is the same height, and each player's contact sits on the
 * SAME line as their name, right-aligned, rather than on a second line underneath.
 */
const PENDING_CARD_H = 108;

const pendingCard = (m: TournamentMatch, col: number, contacts: ContactMap, tag: string, seeds: SeedMap) =>
  (y: number): string => {
    const x = PAD + col * (COL_W + 24);
    let out = `<rect x="${x}" y="${y}" width="${COL_W}" height="${PENDING_CARD_H - 16}" rx="14" fill="${C.card}" stroke="${C.cardStroke}" />`;
    if (tag) out += `<text x="${x + 20}" y="${y + 26}" font-size="13" font-weight="800" fill="${C.textMuted}" letter-spacing="1">${escapeSvg(tag)}</text>`;
    const slots: [string, string][] = [
      [m.player_1_name, m.player_1_uid],
      [m.player_2_name, m.player_2_uid],
    ];
    slots.forEach(([name, uid], i) => {
      const ry = y + 34 + i * 30;
      const contact = contactOf(uid, contacts);
      const seed = seeds[uid];
      out += `<text x="${x + 20}" y="${ry + 22}" font-size="18" font-weight="700" fill="${C.text}">${escapeSvg(withSeed(shortName(name, seed ? 12 : 16), seed))}</text>`;
      if (contact) out += `<text x="${x + COL_W - 20}" y="${ry + 22}" text-anchor="end" font-size="14" fill="${C.textMuted}">${escapeSvg(truncate(contact, 18))}</text>`;
    });
    return out;
  };

// Cards are laid two across, so they are paired into full-width rows before pagination.
const pendingRows = (
  matches: TournamentMatch[], contacts: ContactMap, tagOf: (m: TournamentMatch) => string,
  seedsOf: (m: TournamentMatch) => SeedMap,
): Block[] => {
  const rows: Block[] = [];
  for (let i = 0; i < matches.length; i += 2) {
    const pair = matches.slice(i, i + 2).map((m, c) => pendingCard(m, c, contacts, tagOf(m), seedsOf(m)));
    rows.push({ height: PENDING_CARD_H, render: (y) => pair.map((p) => p(y)).join('') });
  }
  return rows;
};

// ── Slides ───────────────────────────────────────────────────────────────────

export type ContactMap = Record<string, { phone?: string; email?: string }>;
/** uid → seed. */
export type SeedMap = Record<string, number>;

export type DrawSlide = {
  id: string;
  label: string;
  svg: string;
  filename: string;
};

export type DrawSlideInput = {
  matches: TournamentMatch[];
  groups: TournamentPlayer[][];
  groupLabels: string[];
  eventTitle: string;
  division: string;
  zone?: string;
  roundDeadlines?: Record<string, string>;
  contacts?: ContactMap;
  /** RR group seeds (per group) and the bracket's seeds; a seeded name reads "(1) Name". */
  groupSeeds?: SeedMap;
  bracketSeeds?: SeedMap;
  /** Data URI from loadBrandMark(); the frame falls back to a plain ring without it. */
  brandMark?: string;
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const stageOf = (base: string, i: number, total: number) =>
  (total > 1 ? `${base} · ${i + 1} OF ${total}` : base);

const groupSlides = (input: DrawSlideInput, deadline?: string): DrawSlide[] => {
  const contacts = input.contacts ?? {};
  const shown = input.groups
    .map((players, i) => ({ players, label: input.groupLabels[i] ?? `Group ${String.fromCharCode(65 + i)}` }))
    .filter((g) => g.players.length > 0);
  if (shown.length === 0) return [];

  const cardHeight = (players: TournamentPlayer[]) => 56 + players.length * 34 + 24;

  const card = (g: typeof shown[number], col: number) => (y: number) => {
    const x = PAD + col * (COL_W + 24);
    let out = `<rect x="${x}" y="${y}" width="${COL_W}" height="${cardHeight(g.players) - 20}" rx="14" fill="${C.card}" stroke="${C.cardStroke}" />`;
    out += `<text x="${x + 20}" y="${y + 32}" font-size="20" font-weight="900" fill="${C.text}">${escapeSvg(g.label)}</text>`;
    out += `<line x1="${x}" y1="${y + 46}" x2="${x + COL_W}" y2="${y + 46}" stroke="${C.divider}" />`;
    g.players.forEach((p, pi) => {
      const ry = y + 46 + pi * 34;
      const seed = input.groupSeeds?.[p.uid];
      const name = withSeed(truncate(formatPlayerName(p.name), seed ? 14 : 18), seed);
      const contact = truncate(contactOf(p.uid, contacts), 16);
      out += `<text x="${x + 20}" y="${ry + 26}" font-size="18" font-weight="600" fill="${C.text}">${escapeSvg(name)}</text>`;
      if (contact) out += `<text x="${x + COL_W - 20}" y="${ry + 26}" text-anchor="end" font-size="14" fill="${C.textMuted}">${escapeSvg(contact)}</text>`;
    });
    return out;
  };

  // Two cards to a row, the row as tall as the taller of the pair.
  const rows: Block[] = [];
  for (let i = 0; i < shown.length; i += 2) {
    const pair = shown.slice(i, i + 2).map((g, col) => card(g, col));
    const height = Math.max(...shown.slice(i, i + 2).map((g) => cardHeight(g.players)));
    rows.push({ height, render: (y) => pair.map((r) => r(y)).join('') });
  }

  const pages = paginate(rows);
  return pages.map((page, i) => ({
    id: `groups-${i}`,
    label: stageOf('Group stage', i, pages.length),
    filename: `${slugify(input.division)}-groups${pages.length > 1 ? `-${i + 1}` : ''}.png`,
    svg: frame({
      eventTitle: input.eventTitle,
      division: input.division,
      stage: stageOf('GROUP STAGE', i, pages.length),
      zone: input.zone,
      deadline,
      mark: input.brandMark,
      body: renderPage(page),
    }),
  }));
};

/**
 * The knockout as stacked round sections: the round just finished, the round being played, and
 * the round coming next. The next round appears only once its matches exist, so an empty future
 * round never pads the picture out with placeholders.
 */
const bracketSlides = (input: DrawSlideInput, deadline?: string): DrawSlide[] => {
  const knockout = input.matches.filter((m) => m.round && m.round !== 'RR');
  if (knockout.length === 0) return [];

  const present = [...new Set(knockout.map((m) => m.round))].sort((a, b) => roundRank(a) - roundRank(b));
  const currentIdx = Math.max(0, present.findIndex((r) =>
    knockout.some((m) => m.round === r && m.status !== 'complete')));
  const windowRounds = [present[currentIdx - 1], present[currentIdx], present[currentIdx + 1]]
    .filter((r): r is string => !!r)
    // A round nobody has been drawn into yet is not worth a column.
    .filter((r) => knockout.some((m) => m.round === r && (m.status === 'complete' || isRealMatch(m))));
  if (windowRounds.length === 0) return [];

  const byRound = windowRounds.map((round) =>
    knockout.filter((m) => m.round === round).sort(byMatchNumber));

  // A draw sheet only reads if the whole of a first-round pair is on the same sheet, so an
  // oversized first column is halved and every later column is halved with it. Keeping the first
  // column at eight or fewer is also what keeps every block the same height on every sheet.
  const half = byRound[0].length > 8;
  const pages = (half ? [0, 1] : [0]).map((h) =>
    byRound.map((ms) => (half ? ms.slice(h * Math.ceil(ms.length / 2), (h + 1) * Math.ceil(ms.length / 2)) : ms)));

  const TOP = BODY_TOP + 34;
  const AREA = BODY_BOTTOM - TOP;
  const BLOCK_H = 58;
  const GAP = 16;

  return pages.map((cols, pageIndex) => {
    const n0 = Math.max(1, cols[0].length);
    const pitch = AREA / n0;
    const colW = (W - PAD * 2 - GAP * (cols.length - 1)) / cols.length;
    const colX = (c: number) => PAD + c * (colW + GAP);
    // A block sits centred on the span its feeders occupy, which is what draws the bracket shape.
    const centreY = (c: number, i: number) => TOP + pitch * (2 ** c) * (i + 0.5);

    let body = '';
    cols.forEach((ms, c) => {
      body += `<text x="${colX(c)}" y="${BODY_TOP + 20}" font-size="16" font-weight="900" fill="${C.clay}" letter-spacing="1.5">${escapeSvg(ROUND_TITLE[windowRounds[c]] ?? windowRounds[c])}</text>`;

      ms.forEach((m, i) => {
        const y = centreY(c, i) - BLOCK_H / 2;
        const x = colX(c);
        body += `<rect x="${x}" y="${y}" width="${colW}" height="${BLOCK_H}" rx="10" fill="${C.card}" stroke="${C.cardStroke}" />`;
        body += `<line x1="${x}" y1="${y + BLOCK_H / 2}" x2="${x + colW}" y2="${y + BLOCK_H / 2}" stroke="${C.divider}" />`;

        const res = m.result;
        const rows: [string, string, number[]][] = [
          [m.player_1_name, m.player_1_uid, [res?.set_1_player_1 ?? 0, res?.set_2_player_1 ?? 0, res?.set_3_player_1 ?? 0]],
          [m.player_2_name, m.player_2_uid, [res?.set_1_player_2 ?? 0, res?.set_2_player_2 ?? 0, res?.set_3_player_2 ?? 0]],
        ];
        rows.forEach(([name, uid, games], r) => {
          const ty = y + 19 + r * (BLOCK_H / 2);
          const won = !!m.winner_uid && m.winner_uid === uid;
          const seed = input.bracketSeeds?.[uid];
          const label = isRealSlot(name, uid) ? withSeed(shortName(name, seed ? 11 : 15), seed) : 'TBD';
          body += `<text x="${x + 12}" y="${ty}" font-size="15" font-weight="700" fill="${won ? C.clay : C.text}">${escapeSvg(label)}</text>`;
          if (m.status === 'complete') {
            const score = games.filter((g) => g > 0).join(' ');
            if (score) body += `<text x="${x + colW - 12}" y="${ty}" text-anchor="end" font-size="13" font-weight="700" fill="${C.textMuted}">${escapeSvg(score)}</text>`;
          }
        });

        // Connector into the block this pair feeds, drawn from the pair's own column.
        if (c < cols.length - 1 && i % 2 === 0) {
          const partnerExists = i + 1 < ms.length;
          const next = cols[c + 1][Math.floor(i / 2)];
          if (partnerExists && next) {
            const yA = centreY(c, i);
            const yB = centreY(c, i + 1);
            const yN = centreY(c + 1, Math.floor(i / 2));
            const xR = x + colW;
            const xM = xR + GAP / 2;
            body += `<path d="M${xR} ${yA} H${xM} V${yB} H${xR} M${xM} ${yN} H${colX(c + 1)}" fill="none" stroke="${C.connector}" stroke-width="1.5" />`;
          }
        }
      });
    });

    return {
      id: `bracket-${pageIndex}`,
      label: stageOf('Bracket', pageIndex, pages.length),
      filename: `${slugify(input.division)}-bracket${pages.length > 1 ? `-${pageIndex + 1}` : ''}.png`,
      svg: frame({
        eventTitle: input.eventTitle,
        division: input.division,
        stage: stageOf('BRACKET', pageIndex, pages.length),
        zone: input.zone,
        deadline,
        mark: input.brandMark,
        body,
      }),
    };
  });
};

/**
 * Only matches somebody actually has to go and play: unfinished, and with a real person on both
 * sides. A slot still showing the placeholder, or a bye, means the fixture does not exist yet.
 */
const pendingSlides = (input: DrawSlideInput, deadline?: string): DrawSlide[] => {
  const contacts = input.contacts ?? {};
  const pending = input.matches
    .filter((m) => m.status !== 'complete' && isRealMatch(m))
    .sort((a, b) => (roundRank(a.round ?? '') - roundRank(b.round ?? '')) || byMatchNumber(a, b));
  if (pending.length === 0) return [];

  const PER_SLIDE = 8;
  const chunks: TournamentMatch[][] = [];
  for (let i = 0; i < pending.length; i += PER_SLIDE) chunks.push(pending.slice(i, i + PER_SLIDE));

  return chunks.map((chunk, i) => ({
    id: `pending-${i}`,
    label: stageOf('To be played', i, chunks.length),
    filename: `${slugify(input.division)}-to-play${chunks.length > 1 ? `-${i + 1}` : ''}.png`,
    svg: frame({
      eventTitle: input.eventTitle,
      division: input.division,
      stage: stageOf('TO BE PLAYED', i, chunks.length),
      zone: input.zone,
      deadline,
      mark: input.brandMark,
      body: renderPage(pendingRows(chunk, contacts, (m) => {
        const round = m.round === 'RR' ? 'GROUP' : (m.round ?? '');
        return round ? `${round} · ${m.match_id ?? ''}`.trim() : (m.match_id ?? '');
      }, (m) => (m.round === 'RR' ? input.groupSeeds : input.bracketSeeds) ?? {})),
    }),
  }));
};

/** Every picture for the selected draw, in the order they are shown in the slideshow. */
export const buildDrawSlides = (input: DrawSlideInput): DrawSlide[] => {
  // One deadline line for the whole frame: the round being played next is the one that matters.
  const deadlines = input.roundDeadlines ?? {};
  const nextRound = input.matches
    .filter((m) => m.status !== 'complete' && m.round)
    .sort((a, b) => roundRank(a.round ?? '') - roundRank(b.round ?? ''))[0]?.round;
  const deadline = formatDeadline(deadlines[nextRound ?? '']) || undefined;

  return [
    ...groupSlides(input, deadline),
    ...bracketSlides(input, deadline),
    ...pendingSlides(input, deadline),
  ];
};

// ── Saving ───────────────────────────────────────────────────────────────────

/**
 * Rasterises an SVG string to a PNG at 2x and saves it. The same string is what the slideshow
 * shows on screen, so a picture can never differ from its download.
 */
export const downloadSvgAsPng = (svg: string, filename: string, width = W, height = H): void => {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const svgImg = new Image(width, height);
  svgImg.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.drawImage(svgImg, 0, 0, width, height);
    URL.revokeObjectURL(svgUrl);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(pngUrl);
    }, 'image/png');
  };
  svgImg.src = svgUrl;
};

export const downloadSlide = (slide: DrawSlide): void => downloadSvgAsPng(slide.svg, slide.filename);
