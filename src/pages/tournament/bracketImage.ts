import { TournamentMatch, TournamentPlayer } from './types';
import { formatDeadline, formatPlayerName } from './utils';

export const getRoundLabels = (drawSize: number): string[] => {
  if (drawSize <= 2) return ['F'];
  if (drawSize === 4) return ['SF', 'F'];
  if (drawSize === 8) return ['QF', 'SF', 'F'];
  if (drawSize === 16) return ['R16', 'QF', 'SF', 'F'];
  if (drawSize === 32) return ['R32', 'R16', 'QF', 'SF', 'F'];
  const rounds = Math.log2(drawSize);
  return Array.from({ length: rounds }, (_, i) => `R${i + 1}`);
};

const escapeSvg = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const truncate = (value: string, max = 20) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

// Format a stored 'YYYY-MM-DD' round deadline like the on-screen bracket ("Till May 23").
const formatSvgScore = (match: TournamentMatch): string => {
  const pairs: [number, number][] = [
    [match.set_1_player_1 ?? 0, match.set_1_player_2 ?? 0],
    [match.set_2_player_1 ?? 0, match.set_2_player_2 ?? 0],
    [match.set_3_player_1 ?? 0, match.set_3_player_2 ?? 0],
  ];
  return pairs
    .filter(([p1, p2]) => p1 > 0 || p2 > 0)
    .map(([p1, p2]) => `${p1}-${p2}`)
    .join('  ');
};

// Dark palette matching the site (clay accent on tennis-green surfaces) so the exported
// draw feels continuous with the app rather than a light "printout".
const C = {
  page: '#0F2B24',
  colNormal: '#16443A',
  colLate: '#1B5346',
  colStroke: '#2C6656',
  cardFill: '#0E2B24',
  cardStroke: '#2C6656',
  text: '#F1F5F9',
  textMuted: '#9FB8B0',
  winner: '#FF6B35',
  divider: '#24564A',
  connector: '#3A7565',
  score: '#CBD5E1',
};

const buildDrawSvg = (matches: TournamentMatch[], drawTitle: string, drawState?: string, eventTitle?: string, roundDeadlines: Record<string, string> = {}): string => {
  const drawSize = Math.max(8, matches[0]?.drawsize || 8);
  const roundLabels = getRoundLabels(drawSize);
  const rowHeight = 46;
  const colStart = 44;
  const topOffset = 105;
  const footerHeight = 50;
  const width = Math.max(900, roundLabels.length * 190 + 80);
  const height = Math.max(580, topOffset + drawSize * rowHeight + footerHeight + 20);
  const colWidth = (width - 80) / roundLabels.length;

  const rounds = roundLabels.map((round) => ({
    round,
    matches: matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position),
  }));

  const cells = rounds.flatMap((round, ri) => {
    const x = 40 + ri * colWidth;
    const colColor = round.round === 'SF' || round.round === 'F' ? C.colLate : C.colNormal;
    const colH = height - colStart - footerHeight - 10;
    const colCenterX = x - 12 + (colWidth - 24) / 2;

    const col = `<rect x="${x - 12}" y="${colStart}" width="${colWidth - 24}" height="${colH}" rx="14" fill="${colColor}" stroke="${C.colStroke}" />`;

    const formatted = formatDeadline(roundDeadlines[round.round]);
    const deadline = formatted ? `Till ${formatted}` : '';
    const label = `<text x="${colCenterX}" y="${colStart + 22}" text-anchor="middle" font-size="13" font-weight="800" fill="${C.text}">${round.round}</text>${
      deadline ? `<text x="${colCenterX}" y="${colStart + 36}" text-anchor="middle" font-size="9" fill="${C.textMuted}">${deadline}</text>` : ''
    }`;

    const items = round.matches.map((match, mi) => {
      const rowSpan = 2 ** ri;
      const centerRow = mi * 2 ** (ri + 1) + rowSpan;
      const y = topOffset + centerRow * rowHeight - 18;
      const p1 = truncate(formatPlayerName(match.player_1_name));
      const p2 = truncate(formatPlayerName(match.player_2_name));
      const connX = x + colWidth - 38;
      const connector = ri < rounds.length - 1
        ? `<line x1="${connX - 16}" y1="${y + 36}" x2="${connX}" y2="${y + 36}" stroke="${C.connector}" stroke-width="1.5" />`
        : '';

      const scoreText = match.status === 'complete' ? formatSvgScore(match) : '';
      const p1Y = y + (scoreText ? 20 : 27);
      const divY = y + (scoreText ? 28 : 36);
      const p2Y = y + (scoreText ? 48 : 61);

      return `<g>
        <rect x="${x}" y="${y}" width="${colWidth - 58}" height="72" rx="4" fill="${C.cardFill}" stroke="${C.cardStroke}" />
        <text x="${x + 10}" y="${p1Y}" font-size="13" font-weight="700" fill="${match.winner_uid === match.player_1_uid ? C.winner : C.text}">${escapeSvg(p1)}</text>
        <line x1="${x}" y1="${divY}" x2="${x + colWidth - 58}" y2="${divY}" stroke="${C.divider}" />
        <text x="${x + 10}" y="${p2Y}" font-size="13" font-weight="700" fill="${match.winner_uid === match.player_2_uid ? C.winner : C.text}">${escapeSvg(p2)}</text>
        ${scoreText ? `<line x1="${x}" y1="${y + 56}" x2="${x + colWidth - 58}" y2="${y + 56}" stroke="${C.divider}" /><text x="${x + 10}" y="${y + 67}" font-size="10" fill="${C.score}" font-family="monospace">${escapeSvg(scoreText)}</text>` : ''}
        ${connector}
      </g>`;
    }).join('');

    return `${col}${label}${items}`;
  }).join('');

  const footerLabel = escapeSvg(eventTitle || drawTitle);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${C.page}" />
  <text x="${width / 2}" y="26" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="22" font-weight="900" fill="${C.text}">${escapeSvg(drawTitle)}</text>
  ${drawState ? `<text x="40" y="26" text-anchor="start" font-family="Montserrat,Arial,sans-serif" font-size="11" font-weight="900" fill="${C.winner}" letter-spacing="2">${escapeSvg(drawState.toUpperCase())}</text>` : ''}
  <g font-family="Montserrat,Arial,sans-serif">${cells}</g>
  <text x="${width / 2}" y="${height - 24}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="14" font-weight="900" fill="${C.text}">${footerLabel}</text>
  <text x="${width / 2}" y="${height - 8}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="11" font-weight="600" fill="${C.textMuted}">Presented by Racquets &amp; Strings</text>
</svg>`;
};

// ── Round Robin group image ──────────────────────────────────────────────────

export type RRContactMap = Record<string, { phone?: string; email?: string }>;

const buildRRGroupSvg = (
  groups: TournamentPlayer[][],
  groupLabels: string[],
  groupMatches: TournamentMatch[],
  drawTitle: string,
  eventTitle?: string,
  contacts: RRContactMap = {},
): { svg: string; width: number; height: number } => {
  // Skip empty groups so a stray placeholder never renders as a hollow card.
  const shown = groups
    .map((players, gi) => ({ players, label: groupLabels[gi] ?? `Group ${String.fromCharCode(65 + gi)}` }))
    .filter((g) => g.players.length > 0);

  const cols = Math.min(2, Math.max(1, shown.length));
  const cardW = 360;
  const cardPad = 20;
  const headerH = 80;
  const rowH = 28;
  const cardGap = 20;
  const outerPad = 40;
  const footerH = 50;
  const width = outerPad * 2 + cols * cardW + (cols - 1) * cardGap;

  // For doubles "Alice Smith / Bob Jones" → shortest of first/last per partner e.g. "Alice / Bob"
  const doublesShortNames = (name: string): string =>
    name.split(' / ').map((n) => {
      const parts = n.trim().split(/\s+/);
      if (parts.length <= 1) return parts[0] ?? n.trim();
      const first = parts[0];
      const last = parts[parts.length - 1];
      return first.length <= last.length ? first : last;
    }).join(' / ');

  // Phone first, email only when no phone. There is no third fallback: the old snapshot string on
  // TournamentPlayer was derived from a preference nobody set, and is gone.
  const contactOf = (p: TournamentPlayer): string => {
    const c = contacts[p.uid];
    return c?.phone || c?.email || '';
  };

  const cardHeights = shown.map((g) => cardPad * 2 + 24 + g.players.length * rowH + 8);

  const rowCount = Math.max(1, Math.ceil(shown.length / cols));
  const rowHeights: number[] = [];
  for (let r = 0; r < rowCount; r++) {
    let maxH = 0;
    for (let c = 0; c < cols; c++) {
      const gi = r * cols + c;
      if (gi < cardHeights.length) maxH = Math.max(maxH, cardHeights[gi]);
    }
    rowHeights.push(maxH);
  }
  const totalCardsH = rowHeights.reduce((a, b) => a + b, 0) + Math.max(0, rowCount - 1) * cardGap;
  const height = headerH + totalCardsH + footerH;

  let cards = '';
  let curY = headerH;
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < cols; c++) {
      const gi = r * cols + c;
      if (gi >= shown.length) break;
      const { players, label } = shown[gi];
      const x = outerPad + c * (cardW + cardGap);
      const y = curY;
      const cardH = cardHeights[gi];

      cards += `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="12" fill="${C.colNormal}" stroke="${C.colStroke}" />`;
      cards += `<text x="${x + cardPad}" y="${y + cardPad + 14}" font-size="13" font-weight="800" fill="${C.text}" font-family="Montserrat,Arial,sans-serif">${escapeSvg(label)}</text>`;
      cards += `<line x1="${x}" y1="${y + cardPad + 22}" x2="${x + cardW}" y2="${y + cardPad + 22}" stroke="${C.divider}" />`;

      const contactX = x + cardPad + 165;
      let playerY = y + cardPad + 30;
      players.forEach((p) => {
        const contact = truncate(contactOf(p), 18);
        const name = p.name.includes(' / ')
          ? truncate(doublesShortNames(p.name), 20)
          : truncate(formatPlayerName(p.name), 20);
        cards += `<text x="${x + cardPad}" y="${playerY + 18}" font-size="13" font-weight="600" fill="${C.text}" font-family="Montserrat,Arial,sans-serif">${escapeSvg(name)}</text>`;
        if (contact) {
          cards += `<text x="${contactX}" y="${playerY + 18}" font-size="11" fill="${C.textMuted}" font-family="Montserrat,Arial,sans-serif">${escapeSvg(contact)}</text>`;
        }
        playerY += rowH;
      });
    }
    curY += rowHeights[r] + cardGap;
  }

  const footerLabel = escapeSvg(eventTitle || drawTitle);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${C.page}" />
  <text x="${width / 2}" y="36" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="22" font-weight="900" fill="${C.text}">${escapeSvg(drawTitle)}</text>
  <text x="${width / 2}" y="58" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="12" font-weight="700" fill="${C.winner}" letter-spacing="2">GROUP STAGE</text>
  <g>${cards}</g>
  <text x="${width / 2}" y="${height - 24}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="14" font-weight="900" fill="${C.text}">${footerLabel}</text>
  <text x="${width / 2}" y="${height - 8}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="11" font-weight="600" fill="${C.textMuted}">Presented by Racquets &amp; Strings</text>
</svg>`;
  return { svg, width, height };
};

export const downloadRRGroupsAsPng = (groups: TournamentPlayer[][], groupLabels: string[], groupMatches: TournamentMatch[], drawTitle: string, eventTitle?: string, contacts?: RRContactMap): void => {
  // Use the exact dimensions the SVG was built with (previously recomputed with an averaging
  // approximation, which stretched the PNG and left empty space).
  const { svg, width, height } = buildRRGroupSvg(groups, groupLabels, groupMatches, drawTitle, eventTitle, contacts);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
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
      link.download = `${drawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-groups.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(pngUrl);
    }, 'image/png');
  };

  svgImg.src = svgUrl;
};

// ── Single knockout round image ─────────────────────────────────────────────
// One card per match, players stacked with name + contact (phone first, then email), laid out
// two across like the RR group cards. Complements the full-bracket image rather than replacing
// it: that one shows scores and deadlines across every round; this one exists so a round's
// players can reach each other.

const buildRoundSvg = (
  matches: TournamentMatch[],
  round: string,
  drawTitle: string,
  eventTitle?: string,
  contacts: RRContactMap = {},
): { svg: string; width: number; height: number } => {
  const roundMatches = matches
    .filter((m) => m.round === round)
    .sort((a, b) => a.position - b.position);

  const cols = Math.min(2, Math.max(1, roundMatches.length));
  const cardW = 360;
  const cardPad = 20;
  const headerH = 80;
  const rowH = 44;
  const cardGap = 20;
  const outerPad = 40;
  const footerH = 50;
  const cardH = cardPad * 2 + 2 * rowH;
  const width = outerPad * 2 + cols * cardW + (cols - 1) * cardGap;

  const rowCount = Math.max(1, Math.ceil(roundMatches.length / cols));
  const height = headerH + rowCount * cardH + Math.max(0, rowCount - 1) * cardGap + footerH;

  const contactOf = (uid: string): string => {
    const c = contacts[uid];
    return c?.phone || c?.email || '';
  };

  let cards = '';
  roundMatches.forEach((match, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = outerPad + c * (cardW + cardGap);
    const y = headerH + r * (cardH + cardGap);
    cards += `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="12" fill="${C.colNormal}" stroke="${C.colStroke}" />`;

    const slots: [string, string, boolean][] = [
      [match.player_1_name, match.player_1_uid, match.winner_uid === match.player_1_uid],
      [match.player_2_name, match.player_2_uid, match.winner_uid === match.player_2_uid],
    ];
    slots.forEach(([name, uid, won], si) => {
      const rowY = y + cardPad + si * rowH;
      const label = truncate(formatPlayerName(name), 24);
      const contact = truncate(contactOf(uid), 22);
      cards += `<text x="${x + cardPad}" y="${rowY + 16}" font-size="13" font-weight="700" fill="${won ? C.winner : C.text}" font-family="Montserrat,Arial,sans-serif">${escapeSvg(label)}</text>`;
      if (contact) {
        cards += `<text x="${x + cardPad}" y="${rowY + 32}" font-size="11" fill="${C.textMuted}" font-family="Montserrat,Arial,sans-serif">${escapeSvg(contact)}</text>`;
      }
      if (si === 0) {
        cards += `<line x1="${x}" y1="${y + cardPad + rowH - 2}" x2="${x + cardW}" y2="${y + cardPad + rowH - 2}" stroke="${C.divider}" />`;
      }
    });
  });

  const footerLabel = escapeSvg(eventTitle || drawTitle);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${C.page}" />
  <text x="${width / 2}" y="36" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="22" font-weight="900" fill="${C.text}">${escapeSvg(drawTitle)}</text>
  <text x="${width / 2}" y="58" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="12" font-weight="700" fill="${C.winner}" letter-spacing="2">${escapeSvg(round.toUpperCase())}</text>
  <g>${cards}</g>
  <text x="${width / 2}" y="${height - 24}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="14" font-weight="900" fill="${C.text}">${footerLabel}</text>
  <text x="${width / 2}" y="${height - 8}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="11" font-weight="600" fill="${C.textMuted}">Presented by Racquets &amp; Strings</text>
</svg>`;
  return { svg, width, height };
};

// Rasterises an SVG string to a PNG at 2x and triggers a download. Shared by all three exports.
const downloadSvgAsPng = (svg: string, width: number, height: number, filename: string): void => {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
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

export const downloadRoundAsPng = (
  matches: TournamentMatch[], round: string, drawTitle: string, eventTitle?: string, contacts?: RRContactMap,
): void => {
  const { svg, width, height } = buildRoundSvg(matches, round, drawTitle, eventTitle, contacts);
  const slug = drawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  downloadSvgAsPng(svg, width, height, `${slug}-${round.toLowerCase()}.png`);
};

export const downloadDrawAsPng = (matches: TournamentMatch[], drawTitle: string, drawState?: string, eventTitle?: string, roundDeadlines: Record<string, string> = {}): void => {
  const drawSize = Math.max(8, matches[0]?.drawsize || 8);
  const roundLabels = getRoundLabels(drawSize);
  const width = Math.max(900, roundLabels.length * 190 + 80);
  const height = Math.max(580, 105 + drawSize * 46 + 70);
  const svg = buildDrawSvg(matches, drawTitle, drawState, eventTitle, roundDeadlines);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
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
      link.download = `${drawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(pngUrl);
    }, 'image/png');
  };

  svgImg.src = svgUrl;
};
