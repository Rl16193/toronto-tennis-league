import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

type Props = {
  message: string | null;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. */
  duration?: number;
};

/**
 * Transient notification pinned above the bottom nav. Portalled to <body> for the same reason
 * Sheet is — a scrolled Navbar's `backdrop-blur` creates a containing block that would otherwise
 * pin this to the navbar's box instead of the viewport.
 *
 * Render it unconditionally with a null `message` when there's nothing to show; the exit
 * animation needs the component to stay mounted.
 */
export const Toast: React.FC<Props> = ({ message, onDismiss, duration = 5000 }) => {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);

  return createPortal(
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          className="fixed inset-x-4 bottom-24 sm:bottom-8 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2
                     z-[110] sm:w-[22rem] flex items-center gap-3 rounded-2xl
                     bg-tennis-surface shadow-2xl px-4 py-3"
        >
          <p className="flex-1 text-sm font-semibold text-fg">{message}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="shrink-0 text-fg hover:text-clay transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
