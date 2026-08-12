import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'rs-theme';

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

const readInitialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* localStorage unavailable (private mode, etc.) */ }
  return 'dark'; // default for first-time visitors
};

// Site-wide light/dark toggle. Sets `data-theme` on <html>, which every themed CSS variable in
// index.css (bg-tennis-dark, bg-tennis-surface, text-fg, border-fg, …) reads from — so toggling
// re-themes the whole app with no per-component logic. Persisted to localStorage; an inline
// script in index.html applies the stored value before React mounts to avoid a flash.
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* best-effort */ }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};
