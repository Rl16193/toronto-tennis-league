---
name: run-toronto-tennis-league
description: Run, start, drive and screenshot the Racquets & Strings (toronto-tennis-league) web app. Use when asked to run the app, open a page, take a screenshot of a page (home, courts map, events, marketplace), check a page renders at a mobile viewport, or check the browser console for errors. Signed-out, read-only against production.
---

Vite + React SPA, served on port 3000. Drive it headless with the zero-dependency driver
`.claude/skills/run-toronto-tennis-league/driver.mjs`. It launches the system Chrome and sends it
DevTools-protocol commands through Node's built-in `WebSocket`, so there is nothing to install.
Paths below are relative to the repo root.

**Production data, signed out only.** `npm run dev` reads the live Firestore. The driver uses a
fresh Chrome profile each run, so it is never signed in. Keep it that way: don't script a login,
and don't submit any form (Subscribe, Volunteer, Submit a Report all write to prod). The owner
approved signed-out, read-only runs only. `CLAUDE.md` otherwise says not to start a dev server.

## Prerequisites

Node 24 (built-in `WebSocket`) and Chrome or Edge installed. The driver finds Chrome at
`C:/Program Files/Google/Chrome/...`, falls back to Edge and the Linux/macOS paths, and
`CHROME_PATH` overrides both. `npm install` has been run.

## Run (agent path)

1. Start the dev server. In the Claude desktop app, use `preview_start {name: "dev"}` (from
   `.claude/launch.json`), not Bash. Check it's serving:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

2. Pipe a script to the driver, one command per line:

```bash
node .claude/skills/run-toronto-tennis-league/driver.mjs <<'EOF'
nav http://localhost:3000/
wait-for text=Subscribe
screenshot home
viewport 390 844
nav http://localhost:3000/courts
wait-for canvas.maplibregl-canvas 30000
wait-gone text=Loading locations 30000
click text=59 courts ▴
sleep 1000
screenshot courts-mobile-list
nav http://localhost:3000/events
wait-for text=October Slam 2026
sleep 1000
screenshot events-mobile
errors
EOF
```

Screenshots are written to `%TEMP%\ttl-shots\<name>.png` (set `SHOTS_DIR` to change that), and
the driver prints each path. The exit code is 1 if any command failed. Always open the PNG and
look at it.

| command | what it does |
|---|---|
| `nav <url>` | navigate, wait for `<body>` |
| `wait-for <css>\|text=<t> [ms]` | poll until the selector or text is present (default 20000 ms) |
| `wait-gone <css>\|text=<t> [ms]` | poll until it is absent |
| `click <css>\|text=<exact label>` | JS click. With `text=`, the shortest visible element whose `innerText` equals the label |
| `fill <css> <value>` | focus and insert text (fires React `onChange`). Search boxes only, never submit |
| `press Enter\|Escape\|Tab` | key event |
| `viewport <w> <h>` | emulate a size. Under 768 wide also sets mobile |
| `sleep <ms>` | wait for animations to finish |
| `eval <js>` | print the JSON result of an expression |
| `text [n]` | print the first n characters of `body.innerText` |
| `screenshot [name]` | PNG of the viewport |
| `errors` | console errors and uncaught exceptions collected so far |
| `quit` | stop early |

Public routes (signed out): `/`, `/courts`, `/events`, `/marketplace`, `/about`
(`/how-it-works` redirects there). Member-only pages such as `/profile` redirect to `/login`.

Stop the server with `preview_stop` using the serverId returned by `preview_start`.

## Test

```bash
npm run lint
```

`tsc --noEmit`, which exits 0 on a clean tree. It is the project's only static check.

## Gotchas

- **The courts map takes about 10s**, and `wait-gone text=Loading locations` alone passes
  immediately: the lazy route shows a bare spinner *before* that text exists. Wait for
  `canvas.maplibregl-canvas` first, then for the loading text to go. WebGL works in headless Chrome
  as is.
- **`position: fixed` elements have `offsetParent === null`**, so the bottom sheet toggle
  (`59 courts ▴`) and the nav read as hidden to an `offsetParent` check. The driver tests
  visibility with `getClientRects()`.
- **Animations catch screenshots mid-way.** The homepage stats count up (a shot showed 88 players
  while the text already said 160), and event cards fade in through `motion`. Add a `sleep 1000`
  after the `wait-for` before a screenshot, and read numbers with `text`, not from the image.
- **Labels carry live counts.** `59 courts ▴` changes as courts are added, so check it with
  `eval [...document.querySelectorAll('button')].map(b=>b.innerText.trim())` before scripting a
  click.

## Troubleshooting

- **`ERROR click: no element for text=…`** while the button is visibly on screen: the label
  isn't an exact match (count changed, or trailing glyph). List the button texts with the `eval`
  above.
