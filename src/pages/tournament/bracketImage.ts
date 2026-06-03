import { ScoreSubmission, TournamentMatch } from './types';
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

const formatSvgScore = (sub: ScoreSubmission): string => {
  const pairs: [number, number][] = [
    [sub.set_1_player_1, sub.set_1_player_2],
    [sub.set_2_player_1, sub.set_2_player_2],
    [sub.set_3_player_1, sub.set_3_player_2],
  ];
  return pairs
    .filter(([p1, p2]) => p1 > 0 || p2 > 0)
    .map(([p1, p2]) => `${p1}-${p2}`)
    .join('  ');
};

const buildDrawSvg = (matches: TournamentMatch[], drawTitle: string, drawState?: string, eventTitle?: string, submissions: ScoreSubmission[] = [], roundDeadlines: Record<string, string> = {}): string => {
  const subsMap = new Map<string, ScoreSubmission>();
  for (const s of [...submissions].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!subsMap.has(s.match_doc_id)) subsMap.set(s.match_doc_id, s);
  }

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
    const colColor = round.round === 'SF' || round.round === 'F' ? '#ecfdf3' : '#eff6ff';
    const colH = height - colStart - footerHeight - 10;
    const colCenterX = x - 12 + (colWidth - 24) / 2;

    const col = `<rect x="${x - 12}" y="${colStart}" width="${colWidth - 24}" height="${colH}" rx="14" fill="${colColor}" stroke="#d1d5db" />`;

    const deadline = formatDeadline(roundDeadlines[round.round]);
    const label = `<text x="${colCenterX}" y="${colStart + 22}" text-anchor="middle" font-size="13" font-weight="800" fill="#111827">${round.round}</text>${
      deadline ? `<text x="${colCenterX}" y="${colStart + 36}" text-anchor="middle" font-size="9" fill="#111827">${deadline}</text>` : ''
    }`;

    const items = round.matches.map((match, mi) => {
      const rowSpan = 2 ** ri;
      const centerRow = mi * 2 ** (ri + 1) + rowSpan;
      const y = topOffset + centerRow * rowHeight - 18;
      const p1 = truncate(formatPlayerName(match.player_1_name));
      const p2 = truncate(formatPlayerName(match.player_2_name));
      const connX = x + colWidth - 38;
      const connector = ri < rounds.length - 1
        ? `<line x1="${connX - 16}" y1="${y + 36}" x2="${connX}" y2="${y + 36}" stroke="#4b5563" stroke-width="1.5" />`
        : '';

      const sub = subsMap.get(match.id);
      const scoreText = sub ? formatSvgScore(sub) : '';
      const p1Y = y + (scoreText ? 20 : 27);
      const divY = y + (scoreText ? 28 : 36);
      const p2Y = y + (scoreText ? 48 : 61);

      return `<g>
        <rect x="${x}" y="${y}" width="${colWidth - 58}" height="72" rx="4" fill="#ffffff" stroke="#9ca3af" />
        <text x="${x + 10}" y="${p1Y}" font-size="13" font-weight="700" fill="${match.winner_user_id === match.player_1_user_id ? '#ff6b35' : '#111827'}">${escapeSvg(p1)}</text>
        <line x1="${x}" y1="${divY}" x2="${x + colWidth - 58}" y2="${divY}" stroke="#d1d5db" />
        <text x="${x + 10}" y="${p2Y}" font-size="13" font-weight="700" fill="${match.winner_user_id === match.player_2_user_id ? '#ff6b35' : '#111827'}">${escapeSvg(p2)}</text>
        ${scoreText ? `<line x1="${x}" y1="${y + 56}" x2="${x + colWidth - 58}" y2="${y + 56}" stroke="#e5e7eb" /><text x="${x + 10}" y="${y + 67}" font-size="10" fill="#374151" font-family="monospace">${escapeSvg(scoreText)}</text>` : ''}
        ${connector}
      </g>`;
    }).join('');

    return `${col}${label}${items}`;
  }).join('');

  const footerLabel = escapeSvg(eventTitle || drawTitle);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ede9fe" />
  <text x="${width / 2}" y="26" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="22" font-weight="900" fill="#111827">${escapeSvg(drawTitle)}</text>
  ${drawState ? `<text x="40" y="26" text-anchor="start" font-family="Montserrat,Arial,sans-serif" font-size="11" font-weight="900" fill="#ff6b35" letter-spacing="2">${escapeSvg(drawState.toUpperCase())}</text>` : ''}
  <g font-family="Montserrat,Arial,sans-serif">${cells}</g>
  <text x="${width / 2}" y="${height - 24}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="14" font-weight="900" fill="#111827">${footerLabel}</text>
  <text x="${width / 2}" y="${height - 8}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="11" font-weight="600" fill="#374151">Presented by Racquets &amp; Strings</text>
</svg>`;
};

export const downloadDrawAsPng = (matches: TournamentMatch[], drawTitle: string, drawState?: string, eventTitle?: string, submissions: ScoreSubmission[] = [], roundDeadlines: Record<string, string> = {}): void => {
  const drawSize = Math.max(8, matches[0]?.drawsize || 8);
  const roundLabels = getRoundLabels(drawSize);
  const width = Math.max(900, roundLabels.length * 190 + 80);
  const height = Math.max(580, 105 + drawSize * 46 + 70);
  const svg = buildDrawSvg(matches, drawTitle, drawState, eventTitle, submissions, roundDeadlines);
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
