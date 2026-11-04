import React, { createContext, useContext, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Article, Figure, ImageItem, Issue, Item, PuzzleItem, TableItem } from './issues';

// The Served Up newspaper: the Claude Design "three-column gazette" (Option C), in the type of the
// original issue export — Times New Roman for display, Josefin Sans (loaded by Newsletter.tsx) for text.

export const SERIF = "font-['Times_New_Roman',Times,serif]";
export const SANS = "font-['Josefin_Sans',sans-serif]";
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay';
const KICKER = 'text-xs uppercase tracking-[0.08em] text-fg/70';
const CARD = `block rounded-2xl bg-fg/5 p-4 text-fg ${FOCUS}`;
const BTN = `inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl text-sm font-bold ${FOCUS}`;

export const itemHref = (issue: Issue, item: Item) =>
  item.kind === 'article' && item.event ? `/events?event=${item.event}` : `/newsletter/${issue.number}/${item.slug}`;
const issueNo = (n: number) => String(n).padStart(2, '0');

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" />
  </svg>
);

const Kicker: React.FC<{ children: React.ReactNode; centred?: boolean }> = ({ children, centred }) =>
  centred ? (
    <div className={`flex items-center justify-center gap-2.5 ${KICKER}`}>
      <span className="w-6 h-0.5 bg-clay" aria-hidden="true" />{children}<span className="w-6 h-0.5 bg-clay" aria-hidden="true" />
    </div>
  ) : <span className={KICKER}>{children}</span>;

const NewPill = () => <span className="rounded-full bg-clay px-2 py-0.5 text-xs font-bold text-white">New</span>;

const SubscribeLink: React.FC<{ className?: string }> = ({ className = '' }) => (
  <Link to="/?subscribe" className={`${BTN} bg-lime text-ink ${className}`}>Subscribe</Link>
);

// ── Masthead ─────────────────────────────────────────────────────────────────

export const Masthead: React.FC<{ issue: Issue }> = ({ issue }) => (
  <header>
    <div className="border-y border-fg py-4 flex flex-col items-center gap-2 lg:flex-row lg:justify-between lg:gap-4">
      <div className={`hidden lg:flex flex-1 flex-col gap-0.5 ${KICKER}`}>
        <span className="text-fg font-semibold">Issue No. {issueNo(issue.number)}</span>
        <span>{issue.date}</span>
        <span>Toronto</span>
      </div>
      <h1 className={`${SERIF} font-bold text-[64px] lg:text-[min(112px,9vw)] leading-none tracking-tight whitespace-nowrap`}>Served Up</h1>
      <div className="flex-1 flex flex-col items-center lg:items-end gap-0.5">
        <span className={`${SERIF} italic text-lg`}>{issue.tagline}</span>
        <span className={`hidden lg:block ${KICKER}`}>Racquets &amp; Strings</span>
      </div>
    </div>
    <div className={`flex justify-between py-2 lg:hidden ${KICKER}`}>
      <span>Issue No. {issueNo(issue.number)}</span><span>{issue.date}</span>
    </div>
    <div className="flex flex-col gap-3 py-3 border-b-[3px] border-double border-fg lg:flex-row lg:items-center lg:justify-between">
      <span className={`hidden lg:block ${KICKER}`}>The monthly newsletter for Toronto&apos;s public-court players</span>
      <div className="grid grid-cols-2 gap-3 lg:flex">
        <SubscribeLink />
        {issue.pdf && (
          <a href={issue.pdf} download className={`${BTN} bg-clay text-white`}><DownloadIcon />Download PDF</a>
        )}
      </div>
    </div>
  </header>
);

/** Compact masthead on an item page. */
export const MastBar: React.FC<{ issue: Issue }> = ({ issue }) => (
  <nav className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b-[3px] border-double border-fg">
    <Link to={`/newsletter/${issue.number}`} className={`min-h-11 inline-flex items-center font-semibold text-fg ${FOCUS}`}>← Back to front page</Link>
    <span className={`${SERIF} font-bold text-[32px] leading-none tracking-tight`}>Served Up</span>
    <span className={KICKER}>No. {issueNo(issue.number)} · {issue.date}</span>
  </nav>
);

export const BackFooter: React.FC<{ issue: Issue }> = ({ issue }) => (
  <>
    <div className="border-t-[3px] border-double border-fg" />
    <Link to={`/newsletter/${issue.number}`} className={`${BTN} self-center bg-fg/5 text-fg font-semibold`}>← Back to front page</Link>
  </>
);

// ── Photo focus ──────────────────────────────────────────────────────────────

/** Where a cropped photo is centred, in percent. Keyed by the image's file name (`queue` for queue.jpg). */
export type FocusMap = Record<string, { x: number; y: number }>;
export const focusKey = (src: string) => (src.split('/').pop() ?? src).replace(/.w+$/, '');

/** The issue's saved focus points, and `nudge` for the super admin only (undefined for everyone else). */
export const PhotoFocus = createContext<{ focus: FocusMap; nudge?: (key: string, x: number, y: number) => void }>({ focus: {} });

const STEP = 10;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** A cropped photo. The super admin gets arrows to move which part of it shows. */
const Photo: React.FC<{ fig: Figure; className: string; eager?: boolean }> = ({ fig, className, eager }) => {
  const { focus, nudge } = useContext(PhotoFocus);
  const key = focusKey(fig.src);
  const { x, y } = focus[key] ?? { x: 50, y: 50 };
  const img = (
    <img
      src={fig.src} alt={fig.alt} loading={eager ? undefined : 'lazy'}
      style={{ objectPosition: `${x}% ${y}%` }}
      className={`w-full object-cover ${className}`}
    />
  );
  if (!nudge) return img;
  // Inside a front-page link: stop the tap from following it.
  const move = (dx: number, dy: number) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    nudge(key, clamp(x + dx), clamp(y + dy));
  };
  const arrow = `w-9 h-9 rounded-2xl bg-tennis-dark/80 text-white text-sm font-bold ${FOCUS}`;
  return (
    <div className="relative">
      {img}
      <div className="absolute bottom-2 right-2 grid grid-cols-3 gap-1">
        <span /><button type="button" aria-label="Show more of the top" className={arrow} onClick={move(0, -STEP)}>↑</button><span />
        <button type="button" aria-label="Show more of the left" className={arrow} onClick={move(-STEP, 0)}>←</button>
        <button type="button" aria-label="Centre the photo" className={arrow} onClick={move(50 - x, 50 - y)}>•</button>
        <button type="button" aria-label="Show more of the right" className={arrow} onClick={move(STEP, 0)}>→</button>
        <span /><button type="button" aria-label="Show more of the bottom" className={arrow} onClick={move(0, STEP)}>↓</button><span />
      </div>
    </div>
  );
};

// ── Front-page boxes ─────────────────────────────────────────────────────────

const Img: React.FC<{ fig: Figure; className: string }> = ({ fig, className }) => (
  <Photo fig={fig} className={`rounded-2xl ${className}`} />
);

const LeadBox: React.FC<{ a: Article; to: string }> = ({ a, to }) => (
  <Link to={to} className={`${CARD} lg:p-5 flex flex-col gap-3.5`}>
    {a.image && <Img fig={a.image} className="h-64 lg:h-[400px]" />}
    <h2 className={`${SERIF} font-bold text-2xl leading-tight text-center text-balance`}>{a.headline}</h2>
    <p className="leading-relaxed">{a.sections[0]?.paragraphs[0] ?? a.dek}</p>
    <span className="min-h-11 flex items-center justify-center font-semibold">Read the full story →</span>
  </Link>
);

/** A small article: text with a thumbnail beside it. */
const RowBox: React.FC<{ a: Article; to: string }> = ({ a, to }) => (
  <Link to={to} className={`${CARD} flex gap-4 items-start`}>
    {a.image && (
      <div className="order-last sm:order-first shrink-0 w-24 sm:w-44">
        <Photo fig={a.image} className="h-24 sm:h-44 rounded-2xl" />
      </div>
    )}
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">{a.isNew && <NewPill />}<Kicker>{a.kicker}</Kicker></div>
      <h3 className={`${SERIF} font-bold text-lg leading-tight`}>{a.headline}</h3>
      <p>{a.dek}</p>
      {a.facts && a.facts.length > 0 && <span className="text-xs text-fg/70">{a.facts[0][0]}: {a.facts[0][1]}</span>}
    </div>
  </Link>
);

const StackBox: React.FC<{ a: Article; to: string }> = ({ a, to }) => (
  <Link to={to} className={`${CARD} flex flex-col gap-2`}>
    <Kicker>{a.kicker}</Kicker>
    {a.image && <Img fig={a.image} className="h-36" />}
    <h3 className={`${SERIF} font-bold text-lg leading-tight`}>{a.headline}</h3>
    <p>{a.dek}</p>
  </Link>
);

/** Court of the Month: a tall picture over a fact card. */
const CourtBox: React.FC<{ a: Article; to: string }> = ({ a, to }) => (
  <Link to={to} className={`${CARD} flex flex-col gap-2`}>
    <div className="flex items-center gap-2">{a.isNew && <NewPill />}<Kicker>{a.kicker}</Kicker></div>
    {a.image && <Img fig={a.image} className="h-56 lg:h-72" />}
    <h3 className={`${SERIF} font-bold text-lg leading-tight`}>{a.headline}</h3>
    <p>{a.dek}</p>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t border-fg/30 pt-2.5">
      {a.facts!.slice(0, 3).map(([k, v]) => (
        <React.Fragment key={k}><dt className="text-fg/70">{k}</dt><dd className="text-right">{v}</dd></React.Fragment>
      ))}
    </dl>
  </Link>
);

const MemeBox: React.FC<{ m: ImageItem; to: string }> = ({ m, to }) => (
  <Link to={to} className={`${CARD} flex flex-col gap-2`}>
    <Kicker>{m.kicker}</Kicker>
    {/* Never cropped: a meme's joke can sit at any edge. */}
    <img src={m.image.src} alt={m.image.alt} loading="lazy" className="w-full h-auto rounded-2xl" />
    <h3 className={`${SERIF} font-bold text-lg leading-tight`}>{m.headline}</h3>
    <p className={`${SERIF} italic text-fg/70`}>{m.dek}</p>
  </Link>
);

const MiniGrid: React.FC<{ grid: string[] }> = ({ grid }) => {
  const nums = numberCells(grid);
  return (
    <div role="img" aria-label="Mini crossword preview" className="grid gap-[3px] w-fit" style={{ gridTemplateColumns: `repeat(${grid[0].length}, 28px)`, gridAutoRows: '28px' }}>
      {grid.flatMap((row, r) => [...row].map((ch, c) => (
        <div key={`${r}-${c}`} className={ch === '#' ? '' : 'border-[1.5px] border-fg rounded'}>
          <span className="block text-xs leading-none pt-0.5 pl-[3px]">{nums[`${r}-${c}`] ?? ''}</span>
        </div>
      )))}
    </div>
  );
};

const PuzzleBox: React.FC<{ p: PuzzleItem; to: string }> = ({ p, to }) => (
  <Link to={to} className={`${CARD} flex flex-col gap-2.5`}>
    <Kicker>{p.kicker}</Kicker>
    <h3 className={`${SERIF} font-bold text-lg leading-snug`}>{p.trivia.question}</h3>
    <MiniGrid grid={p.grid} />
    <span className="font-semibold">Reveal answer · Play →</span>
  </Link>
);

const EventsBox: React.FC<{ t: TableItem; to: string }> = ({ t, to }) => (
  <Link to={to} className={`${CARD} flex flex-col gap-1`}>
    <h2 className={`${SERIF} font-bold text-2xl leading-tight`}>{t.headline}</h2>
    <span className={`${KICKER} pb-1.5`}>{t.kicker}</span>
    {t.rows.slice(0, 4).map(([dates, name, level, loc, surface, watch]) => (
      <div key={name} className="border-t border-fg/30 py-2.5 flex flex-col gap-0.5">
        <div className="flex justify-between gap-2"><span className="font-bold">{name}</span><span className="whitespace-nowrap">{dates}</span></div>
        <span className="text-xs text-fg/70">{level} · {loc} · {surface}</span>
        <span className="text-xs text-fg/70">Watch: {watch}</span>
      </div>
    ))}
    <span className="border-t border-fg/30 min-h-11 flex items-center font-semibold">Full table →</span>
  </Link>
);

const FrontBox: React.FC<{ issue: Issue; item: Item }> = ({ issue, item }) => {
  const to = itemHref(issue, item);
  switch (item.kind) {
    case 'puzzle': return <PuzzleBox p={item} to={to} />;
    case 'table': return <EventsBox t={item} to={to} />;
    case 'image': return <MemeBox m={item} to={to} />;
    default:
      if (item.slot === 'lead') return <LeadBox a={item} to={to} />;
      if (item.slot === 'centre') return <RowBox a={item} to={to} />;
      if (item.facts && item.slot === 'right') return <CourtBox a={item} to={to} />;
      return <StackBox a={item} to={to} />;
  }
};

// ── Front page ───────────────────────────────────────────────────────────────

export const FrontPage: React.FC<{ issue: Issue; issues: Issue[] }> = ({ issue, issues }) => {
  const col = (slots: Item['slot'][]) =>
    issue.items.filter((i) => slots.includes(i.slot)).map((i) => <FrontBox key={i.slug} issue={issue} item={i} />);
  return (
    <>
      <Masthead issue={issue} />
      {/* Phone order: centre (lead + small articles), then left, then right. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:gap-0 lg:items-stretch">
        <div className="order-2 lg:order-1 lg:w-1/4 min-w-0 flex flex-col gap-5 lg:pr-6 lg:pb-6">{col(['left'])}</div>
        <div className="order-1 lg:order-2 lg:w-1/2 min-w-0 flex flex-col gap-5 lg:px-6 lg:pb-6 lg:border-x border-fg/30">{col(['lead', 'centre'])}</div>
        <div className="order-3 lg:w-1/4 min-w-0 flex flex-col gap-5 lg:pl-6 lg:pb-6">{col(['right'])}</div>
      </div>
      <IssueFooter issue={issue} issues={issues} />
    </>
  );
};

const IssueFooter: React.FC<{ issue: Issue; issues: Issue[] }> = ({ issue, issues }) => {
  const others = issues.filter((i) => i.number !== issue.number);
  return (
    <footer className="flex flex-col gap-3.5 border-t-[3px] border-double border-fg pt-4">
      {others.length > 0 && (
        <>
          <h2 className={`${SERIF} font-bold text-2xl`}>Past issues</h2>
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))]">
            {others.map((o) => {
              const lead = o.items.find((i) => i.slot === 'lead') ?? o.items[0];
              return (
                <Link key={o.number} to={`/newsletter/${o.number}`} className={`${CARD} flex flex-col gap-0.5`}>
                  <span className="text-xs text-fg/70">No. {issueNo(o.number)} · {o.date}</span>
                  <span className={`${SERIF} font-bold text-lg`}>{lead?.headline}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Court tip, correction, a court worth featuring or a story worth sharing?{' '}
          <a href="mailto:newsletter@racquetsandstrings.ca" className={`underline ${FOCUS}`}>newsletter@racquetsandstrings.ca</a>
        </p>
        <SubscribeLink />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-fg/70 border-t border-fg/30 pt-2.5">
        <span>Served Up is published by Racquets &amp; Strings, Toronto.</span>
        <span>{issue.credits.join(' · ')}</span>
      </div>
    </footer>
  );
};

// ── Item pages ───────────────────────────────────────────────────────────────

const ItemHeader: React.FC<{ item: Item }> = ({ item }) => (
  <header className="flex flex-col items-center gap-2.5 text-center max-w-[720px] mx-auto">
    <div className="flex items-center gap-2">{item.kind === 'article' && item.isNew && <NewPill />}<Kicker centred>{item.kicker}</Kicker></div>
    <h1 className={`${SERIF} font-bold text-2xl leading-tight text-balance`}>{item.headline}</h1>
    <p className={`${SERIF} italic text-lg leading-snug`}>{item.dek}</p>
  </header>
);

const FigureView: React.FC<{ fig: Figure; className?: string }> = ({ fig, className = '' }) => (
  <figure className="flex flex-col gap-2">
    <Photo fig={fig} eager className={`rounded-2xl ${className}`} />
    <figcaption className="text-xs text-fg/70 text-center">{fig.caption}</figcaption>
  </figure>
);

export const ArticleView: React.FC<{ a: Article }> = ({ a }) => (
  <>
    <ItemHeader item={a} />
    {a.image && <FigureView fig={a.image} className="max-h-[460px]" />}
    {a.facts && (
      <dl className="rounded-2xl bg-fg/5 p-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {a.facts.map(([k, v]) => (
          <div key={k} className="flex flex-col"><dt className={KICKER}>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    )}
    {a.sections.length > 0 && (
      <article className="max-w-[720px] w-full mx-auto border-t border-fg pt-5">
        {a.sections.map((s, i) => (
          <section key={i} className="mb-3.5">
            {s.heading && <h2 className={`${SERIF} font-bold text-lg leading-snug mb-1.5 break-after-avoid`}>{s.heading}</h2>}
            {s.paragraphs.map((p, j) => <p key={j} className="mb-3.5 leading-relaxed">{p}</p>)}
          </section>
        ))}
      </article>
    )}
    {a.quotes && (
      <section className="flex flex-col gap-4 border-t border-fg pt-5">
        {a.quotes.paragraphs.map((q, i) => (
          <blockquote key={i} className={`rounded-2xl bg-fg/5 p-4 ${SERIF} italic text-lg leading-snug`}>“{q}”</blockquote>
        ))}
        <p className="text-sm font-semibold text-center">{a.quotes.name} · <span className="text-fg/70 font-normal">{a.quotes.role}</span></p>
      </section>
    )}
    {a.figures && (
      <div className="grid gap-5 sm:grid-cols-2">
        {a.figures.map((f) => <FigureView key={f.src} fig={f} className="h-72" />)}
      </div>
    )}
    {a.links && (
      <div className="flex flex-wrap justify-center gap-3">
        {a.links.map((l) => l.href.startsWith('/')
          ? <Link key={l.href} to={l.href} className={`${BTN} bg-clay text-white`}>{l.label}</Link>
          : <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className={`${BTN} bg-fg/5 text-fg`}>{l.label} ↗</a>)}
      </div>
    )}
  </>
);

export const ImageView: React.FC<{ m: ImageItem }> = ({ m }) => (
  <figure className="mx-auto w-full max-w-[720px] flex flex-col gap-4">
    <div className="flex flex-col items-center gap-1.5 text-center">
      <Kicker centred>{m.kicker}</Kicker>
      <h1 className={`${SERIF} font-bold text-2xl leading-tight`}>{m.headline}</h1>
    </div>
    <img src={m.image.src} alt={m.image.alt} className="w-full rounded-2xl" />
    <figcaption className={`${SERIF} italic text-lg text-center`}>{m.image.caption}</figcaption>
  </figure>
);

export const TableView: React.FC<{ t: TableItem }> = ({ t }) => (
  <>
    <header className="flex flex-col items-center gap-1.5 text-center">
      <Kicker centred>{t.headline}</Kicker>
      <h1 className={`${SERIF} font-bold text-2xl leading-tight`}>{t.dek}</h1>
    </header>
    <section aria-label={t.headline} className="rounded-2xl bg-fg/5 px-5 pt-2 pb-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="text-xs uppercase tracking-[0.06em] text-fg/70">
              {t.columns.map((c) => <th key={c} className="py-3.5 pr-3 font-medium border-b border-fg">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((row) => (
              <tr key={row[1]}>
                {row.map((cell, i) => (
                  <td key={i} className={`py-3 pr-3 border-b border-fg/30 ${i === 1 ? `${SERIF} font-bold text-lg` : 'whitespace-nowrap'}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
    <p className="text-xs text-fg/70 text-center">{t.note}</p>
  </>
);

// ── The Tie Break ────────────────────────────────────────────────────────────

/** Clue numbers by "r-c": a cell starting an across or down word, numbered in reading order. */
export function numberCells(grid: string[]): Record<string, number> {
  const open = (r: number, c: number) => (grid[r]?.[c] ?? '#') !== '#';
  const out: Record<string, number> = {};
  let n = 0;
  grid.forEach((row, r) => [...row].forEach((_, c) => {
    if (!open(r, c)) return;
    const across = !open(r, c - 1) && open(r, c + 1);
    const down = !open(r - 1, c) && open(r + 1, c);
    if (across || down) out[`${r}-${c}`] = ++n;
  }));
  return out;
}

const Crossword: React.FC<{ p: PuzzleItem }> = ({ p }) => {
  const { grid } = p;
  const nums = numberCells(grid);
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [dir, setDir] = useState<'across' | 'down'>('across');
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const open = (r: number, c: number) => (grid[r]?.[c] ?? '#') !== '#';
  const focus = (r: number, c: number) => refs.current[`${r}-${c}`]?.focus();
  const step = (r: number, c: number, dr: number, dc: number) => {
    for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < grid.length && cc >= 0 && cc < grid[0].length; rr += dr, cc += dc) {
      if (open(rr, cc)) { focus(rr, cc); return; }
    }
  };

  const onInput = (r: number, c: number, value: string) => {
    const ch = value.slice(-1).toUpperCase().replace(/[^A-Z]/g, '');
    setChecked(false);
    setLetters((l) => ({ ...l, [`${r}-${c}`]: ch }));
    if (ch) (dir === 'across' ? step(r, c, 0, 1) : step(r, c, 1, 0));
  };

  const onKey = (r: number, c: number, e: React.KeyboardEvent) => {
    const moves: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    if (moves[e.key]) {
      e.preventDefault();
      setDir(e.key === 'ArrowUp' || e.key === 'ArrowDown' ? 'down' : 'across');
      step(r, c, ...moves[e.key]);
    } else if (e.key === 'Backspace' && !letters[`${r}-${c}`]) {
      e.preventDefault();
      dir === 'across' ? step(r, c, 0, -1) : step(r, c, -1, 0);
    }
  };

  const reveal = () => {
    const all: Record<string, string> = {};
    grid.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '#') all[`${r}-${c}`] = ch; }));
    setLetters(all);
    setChecked(false);
  };

  const solved = grid.every((row, r) => [...row].every((ch, c) => ch === '#' || letters[`${r}-${c}`] === ch));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="grid gap-1 w-fit" style={{ gridTemplateColumns: `repeat(${grid[0].length}, 44px)`, gridAutoRows: '44px' }}>
          {grid.flatMap((row, r) => [...row].map((ch, c) => {
            const key = `${r}-${c}`;
            if (ch === '#') return <div key={key} aria-hidden="true" />;
            const wrong = checked && !!letters[key] && letters[key] !== ch;
            return (
              <label key={key} className="relative border-[1.5px] border-fg rounded">
                {nums[key] && <span className="absolute top-0.5 left-1 text-xs leading-none">{nums[key]}</span>}
                <input
                  ref={(el) => { refs.current[key] = el; }}
                  value={letters[key] ?? ''}
                  onChange={(e) => onInput(r, c, e.target.value)}
                  onKeyDown={(e) => onKey(r, c, e)}
                  onClick={(e) => { if (document.activeElement === e.currentTarget) setDir((d) => (d === 'across' ? 'down' : 'across')); }}
                  aria-label={`Row ${r + 1}, column ${c + 1}`}
                  autoComplete="off"
                  autoCapitalize="characters"
                  className={`w-full h-full bg-transparent text-center text-lg font-bold uppercase pt-1 rounded ${FOCUS} ${wrong ? 'text-badge-loss' : 'text-fg'}`}
                />
              </label>
            );
          }))}
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <div><span className={KICKER}>Across</span>{p.across.map((x) => <p key={x.num}>{x.num}. {x.clue}</p>)}</div>
          <div><span className={KICKER}>Down</span>{p.down.map((x) => <p key={x.num}>{x.num}. {x.clue}</p>)}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setChecked(true)} className={`${BTN} bg-clay text-white`}>Check</button>
        <button type="button" onClick={reveal} className={`${BTN} bg-fg/5 text-fg`}>Reveal</button>
        {solved && <span className="text-sm font-semibold text-badge-win">Solved!</span>}
      </div>
    </div>
  );
};

export const PuzzleView: React.FC<{ p: PuzzleItem }> = ({ p }) => {
  const [shown, setShown] = useState(false);
  return (
    <>
      <ItemHeader item={{ ...p, dek: 'Trivia & a mini crossword' }} />
      <section className="rounded-2xl bg-fg/5 p-4 flex flex-col gap-3">
        <span className={KICKER}>Trivia</span>
        <p className={`${SERIF} font-bold text-lg leading-snug`}>{p.trivia.question}</p>
        {shown
          ? <p className="text-sm font-semibold">{p.trivia.answer}</p>
          : <button type="button" onClick={() => setShown(true)} className={`${BTN} self-start bg-fg/10 text-fg`}>Reveal answer</button>}
      </section>
      <section className="rounded-2xl bg-fg/5 p-4 flex flex-col gap-3">
        <span className={KICKER}>Mini crossword</span>
        <Crossword p={p} />
      </section>
    </>
  );
};

export const NotFound: React.FC<{ to: string }> = ({ to }) => (
  <p className="text-sm text-center py-10">
    That page isn&apos;t in Served Up.{' '}
    <Link to={to} className={`underline font-semibold ${FOCUS}`}>Back to the front page</Link>
  </p>
);
