import { TournamentMatch } from './types';
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

const buildDrawSvg = (matches: TournamentMatch[], drawTitle: string): string => {
  const drawSize = Math.max(8, matches[0]?.drawsize || 8);
  const roundLabels = getRoundLabels(drawSize);
  const rowHeight = 46;
  const topOffset = 72;
  const width = Math.max(900, roundLabels.length * 190 + 80);
  const height = Math.max(520, topOffset + drawSize * rowHeight + 40);
  const colWidth = (width - 80) / roundLabels.length;

  const rounds = roundLabels.map((round) => ({
    round,
    matches: matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position),
  }));

  const cells = rounds.flatMap((round, ri) => {
    const x = 40 + ri * colWidth;
    const colColor = round.round === 'SF' || round.round === 'F' ? '#ecfdf3' : '#eff6ff';
    const col = `<rect x="${x - 12}" y="48" width="${colWidth - 24}" height="${height - 70}" rx="14" fill="${colColor}" stroke="#d1d5db" />`;
    const label = `<text x="${x + (colWidth - 24) / 2}" y="34" text-anchor="middle" font-size="13" font-weight="800" fill="#374151">${round.round}</text>`;

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
      return `<g>
        <rect x="${x}" y="${y}" width="${colWidth - 58}" height="72" rx="4" fill="#ffffff" stroke="#9ca3af" />
        <text x="${x + 10}" y="${y + 27}" font-size="13" font-weight="700" fill="${match.winner_user_id === match.player_1_user_id ? '#ff6b35' : '#111827'}">${escapeSvg(p1)}</text>
        <line x1="${x}" y1="${y + 36}" x2="${x + colWidth - 58}" y2="${y + 36}" stroke="#d1d5db" />
        <text x="${x + 10}" y="${y + 61}" font-size="13" font-weight="700" fill="${match.winner_user_id === match.player_2_user_id ? '#ff6b35' : '#111827'}">${escapeSvg(p2)}</text>
        ${connector}
      </g>`;
    }).join('');

    return `${col}${label}${items}`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ede9fe" />
  <text x="${width / 2}" y="24" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="24" font-weight="900" fill="#111827">${escapeSvg(drawTitle)}</text>
  <g font-family="Montserrat,Arial,sans-serif">${cells}</g>
</svg>`;
};

export const downloadDrawAsPng = (matches: TournamentMatch[], drawTitle: string): void => {
  const drawSize = Math.max(8, matches[0]?.drawsize || 8);
  const roundLabels = getRoundLabels(drawSize);
  const width = Math.max(900, roundLabels.length * 190 + 80);
  const height = Math.max(520, 72 + drawSize * 46 + 40);
  const svg = buildDrawSvg(matches, drawTitle);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  const img = new Image(width, height);

  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, width, height);
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

  img.src = svgUrl;
};
