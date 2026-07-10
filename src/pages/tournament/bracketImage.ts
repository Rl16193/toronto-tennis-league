import { TournamentMatch, TournamentPlayer } from './types';
import { formatPlayerName } from './utils';

export const getRoundLabels = (drawSize: number): string[] => {
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
const formatDeadline = (iso?: string): string => {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Till ${months[m - 1]} ${d}`;
};

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

    const deadline = formatDeadline(roundDeadlines[round.round]);
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
        <text x="${x + 10}" y="${p1Y}" font-size="13" font-weight="700" fill="${match.winner_user_id === match.player_1_user_id ? C.winner : C.text}">${escapeSvg(p1)}</text>
        <line x1="${x}" y1="${divY}" x2="${x + colWidth - 58}" y2="${divY}" stroke="${C.divider}" />
        <text x="${x + 10}" y="${p2Y}" font-size="13" font-weight="700" fill="${match.winner_user_id === match.player_2_user_id ? C.winner : C.text}">${escapeSvg(p2)}</text>
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
  const rowH = 28; // one line per player: name column + contact column
  const cardGap = 20;
  const outerPad = 40;
  const footerH = 50;
  const width = outerPad * 2 + cols * cardW + (cols - 1) * cardGap;

  // Card heights by player count, then lay out rows of 2 using the row's tallest card.
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

  // Build per-group win-loss map from groupMatches.
  const wl: Record<string, { w: number; l: number }> = {};
  groupMatches.forEach((m) => {
    if (m.status !== 'complete') return;
    [m.player_1_user_id, m.player_2_user_id].forEach((uid) => { if (uid) wl[uid] = wl[uid] ?? { w: 0, l: 0 }; });
    if (m.winner_user_id) {
      const loserId = m.player_1_user_id === m.winner_user_id ? m.player_2_user_id : m.player_1_user_id;
      if (m.winner_user_id) wl[m.winner_user_id] = { ...(wl[m.winner_user_id] ?? { w: 0, l: 0 }), w: (wl[m.winner_user_id]?.w ?? 0) + 1 };
      if (loserId) wl[loserId] = { ...(wl[loserId] ?? { w: 0, l: 0 }), l: (wl[loserId]?.l ?? 0) + 1 };
    }
  });

  // Phone first, email only when no phone, then the match-snapshot contact as a last resort.
  const contactOf = (p: TournamentPlayer): string => {
    const c = contacts[p.user_id];
    return c?.phone || c?.email || p.contact || '';
  };

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

      // Two columns on one line: name (left) and contact (a separate column to its right).
      const contactX = x + cardPad + 165;
      players.forEach((p, pi) => {
        const py = y + cardPad + 30 + pi * rowH;
        const stat = wl[p.user_id];
        const statStr = stat ? `${stat.w}W ${stat.l}L` : '';
        const name = truncate(formatPlayerName(p.name), 17);
        const contact = truncate(contactOf(p), statStr ? 12 : 18);
        cards += `<text x="${x + cardPad}" y="${py + 18}" font-size="13" font-weight="600" fill="${C.text}" font-family="Montserrat,Arial,sans-serif">${escapeSvg(name)}</text>`;
        if (contact) {
          cards += `<text x="${contactX}" y="${py + 18}" font-size="11" fill="${C.textMuted}" font-family="Montserrat,Arial,sans-serif">${escapeSvg(contact)}</text>`;
        }
        if (statStr) {
          cards += `<text x="${x + cardW - cardPad}" y="${py + 18}" text-anchor="end" font-size="11" fill="${C.textMuted}" font-family="Montserrat,Arial,sans-serif">${escapeSvg(statStr)}</text>`;
        }
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

export const openRRGroupsInNewTab = (groups: TournamentPlayer[][], groupLabels: string[], groupMatches: TournamentMatch[], drawTitle: string, eventTitle?: string, contacts?: RRContactMap): void => {
  const { svg } = buildRRGroupSvg(groups, groupLabels, groupMatches, drawTitle, eventTitle, contacts);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

// Open the draw as a crisp SVG in a new browser tab. Runs synchronously inside the click
// handler (no async canvas step) so it isn't caught by popup blockers. Used by the player-facing
// "View entire draw" button in place of the old inline bracket.
export const openDrawInNewTab = (matches: TournamentMatch[], drawTitle: string, drawState?: string, eventTitle?: string, roundDeadlines: Record<string, string> = {}): void => {
  const svg = buildDrawSvg(matches, drawTitle, drawState, eventTitle, roundDeadlines);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  window.open(url, '_blank', 'noopener,noreferrer');
  // Give the new tab time to load before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
