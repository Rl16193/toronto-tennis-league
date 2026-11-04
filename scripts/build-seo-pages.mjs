// Build step (after `vite build`): one HTML file per public route, so crawlers that don't run
// JavaScript (and Google before it renders) see each page's own title, description, canonical and
// text instead of the homepage's. See "SEO pages at build" in CLAUDE.md.
//
// Output, served by firebase.json (cleanUrls):
//   dist/index.html, dist/courts.html, dist/newsletter/1/unspoken-rules.html, …  public pages
//   dist/app.html   signed-in routes (rewrites), noindex, no canonical
//   dist/404.html   every other URL, noindex, served with a real 404 status
//   dist/sitemap.xml  the public pages above
//
// Run standalone (after a vite build) with: node scripts/build-seo-pages.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(root, 'dist');
const SITE = 'https://www.racquetsandstrings.ca';
const BRAND = 'Racquets & Strings';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Evaluates TypeScript source with no runtime imports as an ES module.
const evalTs = (source) => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);

// Imports a .ts data module by transpiling it, so issues.ts stays the one copy.
const importTs = (file) => evalTs(readFileSync(path.join(root, file), 'utf8'));


// Reads one top-level `const NAME = <literal>` out of a .tsx file. The literal must not reference
// other identifiers (FAQ and ABOUT_TABS don't); importing the component file would boot Firebase.
async function literalFrom(file, name) {
  const src = ts.createSourceFile(file, readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.ES2022, true);
  let init;
  src.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const d of node.declarationList.declarations) if (d.name.getText() === name) init = d.initializer;
  });
  if (!init) throw new Error(`${name} not found in ${file}`);
  return (await evalTs(`export default ${init.getText()};`)).default;
}

// dist/index.html is rewritten below, so drop any text a previous run left in it (re-runs stay clean).
const template = readFileSync(path.join(DIST, 'index.html'), 'utf8').replace(/\n<main id="static-content">[\s\S]*?<\/main>/g, '');

// Replacements are functions throughout: a replacement string would treat "$" in copy (prices) as a pattern.
const setMeta = (html, attr, key, value) => html.replace(
  new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`), (_, a, b) => a + esc(value) + b);

// page: { path, title, description, robots?, image?, body } → full HTML document.
function render(page) {
  let html = template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(page.title)}</title>`)
    .replace(/(<meta name="robots" content=")[^"]*(")/, (_, a, b) => a + (page.robots ?? 'index, follow') + b);
  for (const [attr, key, value] of [
    ['name', 'description', page.description],
    ['property', 'og:title', page.title],
    ['property', 'og:description', page.description],
    ['property', 'og:url', `${SITE}${page.path ?? '/'}`],
    ['name', 'twitter:title', page.title],
    ['name', 'twitter:description', page.description],
    ...(page.image ? [['property', 'og:image', page.image], ['name', 'twitter:image', page.image]] : []),
  ]) html = setMeta(html, attr, key, value);
  html = page.path
    ? html.replace(/(<link rel="canonical" href=")[^"]*(")/, (_, a, b) => a + SITE + page.path + b)
    : html.replace(/\s*<link rel="canonical"[^>]*>/, '');
  // Structured data goes after the site-wide Organization block in index.html.
  for (const s of page.schema ?? []) {
    html = html.replace('</head>', () => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...s }).replace(/</g, '\\u003c')}</script>\n</head>`);
  }
  // React's createRoot replaces everything in #root on mount, so this text never shows alongside the app.
  return page.body ? html.replace('<div id="root">', () => `<div id="root">\n<main id="static-content">${page.body}</main>`) : html;
}

function write(file, html) {
  const out = path.join(DIST, file);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, html);
}

const links = (items) => `<ul>${items.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul>`;
const NAV = links([['/', 'Home'], ['/events', 'Events'], ['/courts', 'Find a tennis court'],
  ['/newsletter', 'Served Up newsletter'], ['/marketplace', 'Marketplace'], ['/about', 'About us'], ['/contact', 'Contact']]);

// ---- Content sources -------------------------------------------------------------------------
const FAQ = await literalFrom('src/pages/home/HomeElements.tsx', 'FAQ');
const ABOUT_TABS = await literalFrom('src/pages/StaticPages.tsx', 'ABOUT_TABS');
const { ISSUES } = await importTs('src/pages/newsletter/issues.ts');
const courts = Object.values(JSON.parse(readFileSync(path.join(root, 'functions', 'courts.json'), 'utf8')));
const torontoCourts = courts.filter((c) => c.city === 'Toronto');
// "<li>North York: 34 locations</li>…", largest first.
const byZone = (list, key) => `<ul>${Object.entries(list.reduce((m, c) => ({ ...m, [c[key]]: (m[c[key]] ?? 0) + 1 }), {}))
  .sort((a, b) => b[1] - a[1]).map(([z, n]) => `<li>${esc(z)}: ${n} location${n === 1 ? '' : 's'}</li>`).join('')}</ul>`;

// ---- Pages -----------------------------------------------------------------------------------
// Titles here must match each page's document.title, or Google sees two titles for one URL.
const pages = [
  {
    file: 'index.html', path: '/',
    title: `${BRAND} · Toronto Tennis Leagues & Community`,
    description: "Racquets & Strings is Toronto's tennis community. Join leagues and tournaments on public courts, find a tennis court near you, and connect with other players.",
    body: `<h1>${esc(BRAND)}: Toronto's tennis community</h1>
<p>Tournaments, round robins, league ladders and social meetups played on Toronto's public tennis courts, with a court finder for ${torontoCourts.length} Toronto locations and ${courts.length - torontoCourts.length} more across the GTA.</p>
${NAV}
<h2>Frequently asked questions</h2>
${FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('\n')}`,
    schema: [{
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    }],
  },
  {
    file: 'courts.html', path: '/courts',
    title: `Toronto Tennis Court Finder · ${BRAND}`,
    description: `Find public tennis courts in Toronto and the GTA: ${courts.length} locations on one map, with lights, club public hours, programs and how busy each court is.`,
    body: `<h1>Find a tennis court in Toronto</h1>
<p>A map of ${torontoCourts.length} tennis court locations in Toronto and ${courts.length - torontoCourts.length} across the GTA, with lights, club public hours, City of Toronto tennis programs and how many members play at each court.</p>
<h2>Toronto courts by zone</h2>
${byZone(torontoCourts, 'zone')}
<h2>GTA courts by city</h2>
${byZone(courts.filter((c) => c.city !== 'Toronto'), 'city')}
${NAV}`,
  },
  {
    file: 'events.html', path: '/events',
    title: `Tennis Events & Tournaments in Toronto · ${BRAND}`,
    description: 'Upcoming tennis tournaments, round robins, league ladders, coaching clinics and weekly meetups in Toronto, open to every level.',
    body: `<h1>Tennis events in Toronto</h1>
<p>Singles and doubles tournaments, round robins, the league ladder, coaching clinics and weekly social meetups, played on public courts across Toronto. Draws are set by skill level, zone and preferred courts.</p>
${NAV}`,
  },
  {
    file: 'marketplace.html', path: '/marketplace',
    title: `Marketplace · ${BRAND}`,
    description: 'Buy, sell, rent and trade used tennis racquets and gear with players in Toronto.',
    body: `<h1>Tennis marketplace</h1><p>Buy, sell, rent and trade used racquets and tennis gear with other Toronto players.</p>${NAV}`,
  },
  {
    file: 'about.html', path: '/about',
    title: `About Us · ${BRAND}`,
    description: ABOUT_TABS[0].body,
    body: `<h1>About ${esc(BRAND)}</h1>
${ABOUT_TABS.map((t) => `<h2>${esc(t.label)}</h2><p>${esc(t.body)}</p>`).join('\n')}
${NAV}`,
  },
  {
    file: 'contact.html', path: '/contact',
    title: `Contact · ${BRAND}`,
    description: 'Get in touch with Racquets & Strings, the Toronto tennis community.',
    body: `<h1>Contact ${esc(BRAND)}</h1>${NAV}`,
  },
  {
    file: 'terms.html', path: '/terms',
    title: `Terms of Service · ${BRAND}`,
    description: 'The terms of service for Racquets & Strings.',
    body: `<h1>Terms of Service</h1>${NAV}`,
  },
  {
    file: 'privacy.html', path: '/privacy',
    title: `Privacy Policy · ${BRAND}`,
    description: 'How Racquets & Strings collects, uses and protects your information.',
    body: `<h1>Privacy Policy</h1>${NAV}`,
  },
];

// Served Up: the latest issue at /newsletter, every issue at /newsletter/N, every item at /newsletter/N/slug.
const abs = (src) => (src.startsWith('http') ? src : `${SITE}${src}`);
function itemBody(item) {
  const head = `<p>${esc(item.kicker)}</p><h1>${esc(item.headline)}</h1><p>${esc(item.dek)}</p>`;
  const fig = (f) => `<figure><img src="${esc(f.src)}" alt="${esc(f.alt)}"><figcaption>${esc(f.caption)}</figcaption></figure>`;
  if (item.kind === 'article') {
    return head + (item.image ? fig(item.image) : '')
      + item.sections.map((s) => (s.heading ? `<h2>${esc(s.heading)}</h2>` : '') + s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')).join('')
      + (item.facts ? `<dl>${item.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '')
      + (item.quotes ? `<h2>${esc(item.quotes.name)}, ${esc(item.quotes.role)}</h2>${item.quotes.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}` : '')
      + (item.figures ?? []).map(fig).join('');
  }
  if (item.kind === 'table') {
    return `${head}<table><thead><tr>${item.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
      item.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table><p>${esc(item.note)}</p>`;
  }
  if (item.kind === 'image') return head + fig(item.image);
  return `${head}<p>${esc(item.trivia.question)}</p>`;
}
for (const [i, issue] of ISSUES.entries()) {
  const front = {
    title: `Served Up · ${BRAND}`,
    description: `Served Up, the Toronto tennis newsletter from ${BRAND}. ${issue.date}: ${issue.items.map((it) => it.headline).join(', ')}.`,
    body: `<h1>Served Up</h1><p>Issue ${issue.number}, ${esc(issue.date)}. ${esc(issue.tagline)}</p>
${links(issue.items.map((it) => [`/newsletter/${issue.number}/${it.slug}`, it.headline]))}
${NAV}`,
  };
  // The latest issue lives at /newsletter; /newsletter/N for it would be a duplicate, so it points there.
  if (i === 0) pages.push({ ...front, file: 'newsletter.html', path: '/newsletter' });
  pages.push({ ...front, file: `newsletter/${issue.number}.html`, path: i === 0 ? '/newsletter' : `/newsletter/${issue.number}` });
  // "Words & edit — Rahul Tirath Lal" is the issue's credit; an issue is dated the 1st of its month.
  const author = issue.credits.find((c) => /^words/i.test(c))?.split('—')[1]?.trim();
  const published = new Date(`${issue.date} 1 UTC`).toISOString().slice(0, 10);
  for (const item of issue.items) {
    const url = `${SITE}/newsletter/${issue.number}/${item.slug}`;
    pages.push({
      file: `newsletter/${issue.number}/${item.slug}.html`,
      path: `/newsletter/${issue.number}/${item.slug}`,
      title: `${item.headline} · Served Up · ${BRAND}`,
      description: item.dek,
      image: item.image ? abs(item.image.src) : undefined,
      body: `${itemBody(item)}\n${NAV}`,
      schema: item.kind === 'article' ? [{
        '@type': 'Article',
        headline: item.headline,
        description: item.dek,
        datePublished: published,
        ...(author ? { author: { '@type': 'Person', name: author } } : {}),
        ...(item.image ? { image: abs(item.image.src) } : {}),
        isPartOf: { '@type': 'PublicationIssue', issueNumber: issue.number, name: `Served Up, Issue ${issue.number}` },
        publisher: { '@type': 'Organization', name: BRAND, url: SITE },
        mainEntityOfPage: url,
      }] : undefined,
    });
  }
}

for (const p of pages) write(p.file, render(p));
write('app.html', render({ title: BRAND, description: pages[0].description, robots: 'noindex' }));
write('404.html', render({ title: `Page not found · ${BRAND}`, description: pages[0].description, robots: 'noindex',
  body: `<h1>Page not found</h1>${NAV}` }));

const urls = [...new Set(pages.map((p) => p.path))];
writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}
</urlset>
`);

// /llms.txt (llmstxt.org): a plain-text guide for AI assistants. The wording was approved by the owner.
const articles = ISSUES.flatMap((issue) => issue.items.filter((it) => it.kind === 'article')
  .map((it) => `- [${it.headline}](${SITE}/newsletter/${issue.number}/${it.slug}): ${it.dek} (${issue.date})`));
writeFileSync(path.join(DIST, 'llms.txt'), `# ${BRAND}

> ${BRAND} (racquetsandstrings.ca) is Toronto's tennis community. It runs singles and doubles tournaments, round robins, a league ladder, coaching clinics and weekly social meetups on Toronto's public tennis courts, and keeps a free map of ${torontoCourts.length} tennis court locations in Toronto and ${courts.length - torontoCourts.length} across the GTA.

A one stop shop for everything tennis, from tournaments, socials, and winter court bookings to a marketplace for used equipment, equipment rentals, information on coaches, racquet stringers and a local newsletter.

It is a community drive Tennis platform allowing player to document court conditions and provide queue updates to track user activity.

Event locations: Toronto, Trinity Bellwoods Park, Ramsden Park, Eglinton Flats, Dovercourt Park, Cedarvale Park, Stanley Park.

Contact: events@racquetsandstrings.ca.
Instagram: https://www.instagram.com/racqnstringstoronto.

## Key pages

- [Home](${SITE}/): what the community offers, with the rules FAQ
- [Events](${SITE}/events): upcoming tournaments, round robins, the league ladder, clinics and meetups
- [Court finder](${SITE}/courts): map of every court, club public hours and City of Toronto programs
- [Served Up](${SITE}/newsletter): the Toronto tennis newsletter
- [Marketplace](${SITE}/marketplace): Find Racquet Stringers and Tennis Coaches, Buy, sell, rent and trade used tennis gear
- [About us](${SITE}/about): vision and mission

## Served Up articles

${articles.join('\n')}

## Rules and FAQ

${FAQ.map((f) => `- **${f.q}** ${f.a}`).join('\n')}
`);

console.log(`SEO pages: ${pages.length} pages, ${urls.length} sitemap URLs, plus app.html and 404.html.`);
