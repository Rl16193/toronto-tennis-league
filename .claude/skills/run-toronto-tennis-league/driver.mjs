// Zero-dependency headless-Chrome driver (Chrome DevTools Protocol over Node's built-in WebSocket).
// Reads one command per line from stdin; see SKILL.md for the command table.
// Fresh temp profile every run, so the app is always SIGNED OUT — keep it that way (prod data).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const SHOTS = process.env.SHOTS_DIR || join(tmpdir(), 'ttl-shots');
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chromePath = CANDIDATES.find(p => existsSync(p));
if (!chromePath) { console.error('No Chrome found; set CHROME_PATH'); process.exit(2); }

mkdirSync(SHOTS, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'ttl-chrome-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,900', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const port = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', d => {
    buf += d;
    const m = buf.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
    if (m) res(m[1]);
  });
  chrome.on('exit', c => rej(new Error(`chrome exited ${c}: ${buf}`)));
  setTimeout(() => rej(new Error('chrome did not start in 15s')), 15000);
});
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));

let seq = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push(`${msg.params.entry.text} ${msg.params.entry.url || ''}`.trim());
  }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Finds an element by CSS selector, or by visible text with a `text=` prefix.
const findExpr = target => target.startsWith('text=')
  ? `[...document.querySelectorAll('a,button,[role=button],[role=tab],label,input,h1,h2,h3,span,div')]
       .filter(e => e.getClientRects().length && e.innerText?.trim() === ${JSON.stringify(target.slice(5))})
       .sort((a, b) => a.innerText.length - b.innerText.length)[0]`
  : `document.querySelector(${JSON.stringify(target)})`;

async function waitFor(target, timeoutMs = 20000, gone = false) {
  const expr = target.startsWith('text=')
    ? `!!document.body?.innerText.includes(${JSON.stringify(target.slice(5))})`
    : `!!document.querySelector(${JSON.stringify(target)})`;
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { if (await evaluate(expr) !== gone) return; await sleep(250); }
  throw new Error(`${gone ? 'wait-gone' : 'wait-for'} timed out: ${target}`);
}
const parseWait = arg => { const [t, ms] = arg.split(/\s+(?=\d+$)/); return [t, ms ? +ms : undefined]; };

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

const commands = {
  async nav(url) { await send('Page.navigate', { url }); await waitFor('body'); },
  async 'wait-for'(arg) { await waitFor(...parseWait(arg)); },
  async 'wait-gone'(arg) { const [t, ms] = parseWait(arg); await waitFor(t, ms, true); },
  async click(target) {
    const ok = await evaluate(`(() => { const el = ${findExpr(target)}; if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`);
    if (!ok) throw new Error(`click: no element for ${target}`);
  },
  async fill(arg) {
    const [sel, ...rest] = arg.split(' ');
    const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.focus(); el.select?.(); return true; })()`);
    if (!ok) throw new Error(`fill: no element for ${sel}`);
    await send('Input.insertText', { text: rest.join(' ') }); // goes through React's onChange
  },
  async press(key) {
    const code = { Enter: 13, Escape: 27, Tab: 9 }[key];
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, windowsVirtualKeyCode: code });
  },
  async viewport(arg) {
    const [width, height] = arg.split(/\s+/).map(Number);
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  },
  async sleep(ms) { await sleep(+ms); },
  async eval(expr) { console.log(JSON.stringify(await evaluate(expr))); },
  async text(n) { console.log((await evaluate('document.body.innerText')).slice(0, +n || 1500)); },
  async screenshot(name) {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = join(SHOTS, `${name || `shot-${Date.now()}`}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`screenshot -> ${file}`);
  },
  async errors() { console.log(errors.length ? `console errors (${errors.length}):\n  ${errors.join('\n  ')}` : 'console errors: none'); },
};

let failed = false;
for await (const raw of createInterface({ input: process.stdin })) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const [cmd, ...rest] = line.split(' ');
  if (cmd === 'quit') break;
  console.log(`> ${line}`);
  try {
    if (!commands[cmd]) throw new Error(`unknown command ${cmd}`);
    await commands[cmd](rest.join(' '));
  } catch (e) { console.log(`  ERROR ${e.message}`); failed = true; }
}

ws.close();
chrome.kill();
await new Promise(r => chrome.once('exit', r));
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a lock on Windows */ }
process.exit(failed ? 1 : 0);
