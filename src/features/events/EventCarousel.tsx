import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * One event per screen on a phone, swiped sideways. On tablets and desktop this renders nothing of
 * its own — `children` come through as the ordinary stacked list.
 *
 * Built on native CSS scroll-snap rather than a drag library: the browser's own touch physics are
 * better than anything hand-rolled, it keeps working with a trackpad, a mouse wheel and a keyboard
 * for free, and it costs no dependency. The arrows are a hint that there is more to see — plenty of
 * people never think to swipe — and they scroll the same container rather than driving separate
 * state, so the two can never disagree about which card is showing.
 */

const MOBILE_QUERY = '(max-width: 767px)';

export const EventCarousel: React.FC<{
  count: number;
  /** Off when the track lives inside a panel rather than a page gutter. */
  fullBleed?: boolean;
  /** On when paging is the point rather than a phone affordance, so it survives a wide screen. */
  alwaysPager?: boolean;
  /** Noun for the arrows' accessible names. */
  itemLabel?: string;
  children: React.ReactNode;
}> = ({ count, fullBleed = true, alwaysPager = false, itemLabel = 'event', children }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Which card is showing, derived from the scroll position rather than tracked separately.
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const width = el.clientWidth || 1;
    setIndex(Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / width))));
  }, [count]);

  const go = (delta: number) => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(count - 1, index + delta));
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: next * el.clientWidth, behavior: still ? 'auto' : 'smooth' });
  };

  if (!isMobile && !alwaysPager) return <div className="space-y-4">{children}</div>;

  const atStart = index === 0;
  const atEnd = index >= count - 1;

  return (
    <div className="relative">
      {/* Full-bleed so a card can fill the screen edge to edge, with the page gutter given back as
          padding on each slide. Inside a panel that would burst the panel, so it is optional. */}
      <div className={fullBleed ? 'relative left-1/2 -ml-[50vw] w-screen' : 'relative w-full'}>
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory overscroll-x-contain"
        >
          {React.Children.map(children, (child) => (
            <div className={`snap-center shrink-0 ${fullBleed ? 'w-screen px-4 sm:px-6' : 'w-full'}`}>{child}</div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={atStart}
            aria-label={`Previous ${itemLabel}`}
            className="w-11 h-11 flex items-center justify-center rounded-2xl bg-fg/5 text-fg
                       transition-colors hover:bg-fg/10 disabled:opacity-50
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Position, as text rather than dots — dots stop being countable past about six, and
              this list has no fixed length. */}
          <span className="text-xs font-bold uppercase tracking-widest text-fg/70 tabular-nums" aria-live="polite">
            {index + 1} of {count}
          </span>

          <button
            type="button"
            onClick={() => go(1)}
            disabled={atEnd}
            aria-label={`Next ${itemLabel}`}
            className="w-11 h-11 flex items-center justify-center rounded-2xl bg-fg/5 text-fg
                       transition-colors hover:bg-fg/10 disabled:opacity-50
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
