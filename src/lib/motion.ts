// Shared motion presets so cards/lists/buttons animate consistently across the app.
// One curve everywhere: a strong ease-out (starts fast, settles slowly). The built-in 'easeOut'
// and uniform springs read as template motion. Hover zoom is deliberately absent: touch screens
// leave it stuck on.

export const easeOut = [0.23, 1, 0.32, 1] as const;

export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: easeOut },
};

export const tapScale = {
  whileTap: { scale: 0.97 },
  transition: { duration: 0.16, ease: easeOut },
};

// Caps stagger delay so long lists don't take forever to finish animating in.
export const staggerDelay = (i: number, base = 0.04, max = 8) => Math.min(i, max) * base;
