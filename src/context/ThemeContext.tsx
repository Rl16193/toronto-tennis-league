import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'rs-theme';
// When the stored theme stops applying: the next sunrise or sunset. index.html reads both keys.
const UNTIL_KEY = 'rs-theme-until';

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

// Toronto sunrise/sunset (the SunCalc formula: sun 0.833° below the horizon, same as published times).
const RAD = Math.PI / 180;
const LAT = 43.6532 * RAD;
const LW = 79.3832 * RAD; // west longitude
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;

const sunTimes = (day: Date): [number, number] => {
  const d = day.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
  const n = Math.round(d - 0.0009 - LW / (2 * Math.PI));
  const ds = 0.0009 + LW / (2 * Math.PI) + n;
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(RAD * 23.4397));
  const transit = (x: number) => J2000 + x + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const w = Math.acos((Math.sin(RAD * -0.833) - Math.sin(LAT) * Math.sin(dec)) / (Math.cos(LAT) * Math.cos(dec)));
  const set = transit(0.0009 + (w + LW) / (2 * Math.PI) + n);
  const rise = transit(ds) - (set - transit(ds));
  const toMs = (j: number) => (j + 0.5 - J1970) * DAY_MS;
  return [toMs(rise), toMs(set)];
};

/** Sunrises and sunsets from yesterday to tomorrow, oldest first. */
const boundaries = (now: number) => {
  const base = new Date(now);
  return [-1, 0, 1].flatMap((offset) => {
    const [rise, set] = sunTimes(new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, 12));
    return [{ at: rise, theme: 'dark' as Theme }, { at: set, theme: 'light' as Theme }];
  });
};

/** Dark by day, light from sunset to sunrise; `until` is the next switch. */
const scheduled = (now: number): { theme: Theme; until: number } => {
  const all = boundaries(now);
  const last = all.filter((b) => b.at <= now).pop();
  const next = all.find((b) => b.at > now);
  return { theme: last ? last.theme : 'light', until: next ? next.at : now + DAY_MS };
};

// A stored theme holds until its `until`: the schedule's own, or a toggle's (until the next switch).
const readInitial = (): { theme: Theme; until: number } => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const until = Number(localStorage.getItem(UNTIL_KEY));
    if ((stored === 'light' || stored === 'dark') && until > Date.now()) return { theme: stored, until };
  } catch { /* localStorage unavailable (private mode, etc.) */ }
  return scheduled(Date.now());
};

// Site-wide light/dark theme. Sets `data-theme` on <html>, which every themed CSS variable in
// index.css reads from. It follows Toronto's sun: dark by day, light after sunset. A tap on the
// toggle holds until the next sunrise or sunset, then the schedule takes over again.
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState(readInitial);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
    try {
      localStorage.setItem(STORAGE_KEY, state.theme);
      localStorage.setItem(UNTIL_KEY, String(state.until));
    } catch { /* best-effort */ }
    // Switch at the next sunrise/sunset, and re-check when a backgrounded tab comes back.
    const due = () => { if (Date.now() >= state.until) setState(scheduled(Date.now())); };
    const timer = setTimeout(due, Math.min(Math.max(state.until - Date.now(), 0) + 1000, DAY_MS));
    document.addEventListener('visibilitychange', due);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', due); };
  }, [state]);

  const toggleTheme = () => setState((s) => ({
    theme: s.theme === 'dark' ? 'light' : 'dark',
    until: scheduled(Date.now()).until,
  }));

  return <ThemeContext.Provider value={{ theme: state.theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};
