type OverlayEntry = { id: number; close: () => void };

const overlays: OverlayEntry[] = [];
let nextId = 1;
let listening = false;

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  overlays.at(-1)?.close();
};

const ensureListener = () => {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('keydown', onKeyDown);
  listening = true;
};

export const registerOverlay = (close: () => void) => {
  ensureListener();
  const id = nextId++;
  overlays.push({ id, close });
  return () => {
    const index = overlays.findIndex((entry) => entry.id === id);
    if (index >= 0) overlays.splice(index, 1);
    if (overlays.length === 0 && listening && typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
      listening = false;
    }
  };
};
