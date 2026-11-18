import { useCallback, useEffect, useRef, useState } from 'react';

/** Two taps instead of window.confirm: the first arms (the caller shows a "sure?" label), the
 *  second runs. It disarms itself after 4 seconds. */
export function useTwoTap(): [armed: boolean, tap: (run: () => void) => void] {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const tap = useCallback((run: () => void) => {
    window.clearTimeout(timer.current);
    if (armed) { setArmed(false); run(); return; }
    setArmed(true);
    timer.current = window.setTimeout(() => setArmed(false), 4000);
  }, [armed]);
  return [armed, tap];
}
