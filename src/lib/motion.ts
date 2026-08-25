// Shared motion presets so cards/lists/buttons animate consistently across the app.

export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: 'easeOut' as const },
};

export const tapScale = {
  whileTap: { scale: 0.96 },
  transition: { type: 'spring' as const, stiffness: 400, damping: 25 },
};

// Caps stagger delay so long lists don't take forever to finish animating in.
export const staggerDelay = (i: number, base = 0.04, max = 8) => Math.min(i, max) * base;
