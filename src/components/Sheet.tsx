import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { registerOverlay } from '../lib/overlayStack';

type Props = {
  onClose: () => void;
  /** Optional left-aligned title rendered in a sticky header. Modals with their own header can omit it. */
  title?: string;
  /**
   * Accessible name for the dialog when no visible `title` is drawn. Without one, a titleless
   * sheet reaches screen readers as an unnamed dialog.
   */
  ariaLabel?: string;
  maxWidthClassName?: string;
  children: React.ReactNode;
};

/**
 * Responsive sheet: a bottom sheet that slides up (drag-the-handle to dismiss) on mobile,
 * and a centered dialog on desktop. Replaces the old centered ModalShell / ad-hoc overlays.
 *
 * Enter/exit animation is driven by wrapping the usage in <AnimatePresence> at the call site.
 */
export const Sheet: React.FC<Props> = ({ onClose, title, ariaLabel, maxWidthClassName = 'max-w-md', children }) => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  );
  const dragControls = useDragControls();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Track viewport so drag-to-dismiss is mobile-only.
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const panel = panelRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    panel?.addEventListener('keydown', onKeyDown);
    return () => {
      panel?.removeEventListener('keydown', onKeyDown);
      openerRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Lock background scroll + close on Escape while open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const unregister = registerOverlay(onClose);
    return () => {
      document.body.style.overflow = prevOverflow;
      unregister();
    };
  }, [onClose]);

  // Portalled to <body> — a scrolled Navbar picks up `backdrop-blur` (a `backdrop-filter`),
  // which creates a new containing block for `position: fixed` descendants. Rendered inline,
  // that pins this sheet to the navbar's box instead of the viewport once the page is scrolled.
  return createPortal(
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:px-4"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-tennis-dark/80 backdrop-blur-md"
        />

        {/* Panel — bottom sheet on mobile, centered dialog on desktop */}
        <motion.div
          initial={{ opacity: 0, y: isMobile ? 96 : 24, scale: isMobile ? 1 : 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: isMobile ? 96 : 24, scale: isMobile ? 1 : 0.96 }}
          transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          drag={isMobile ? 'y' : false}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.5 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 100 || info.velocity.y > 500) onClose();
          }}
          className={`relative w-full ${maxWidthClassName} bg-tennis-surface
                    rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl
                    max-h-[92vh] sm:max-h-[90vh] overflow-y-auto`}
          ref={panelRef}
          tabIndex={-1}
        >
          {/* Drag handle — mobile only; the sole drag trigger so form scrolling isn't hijacked */}
          <div
            className="sm:hidden sticky top-0 z-20 flex justify-center pt-2.5 pb-1 bg-tennis-surface cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => dragControls.start(e)}
          >
            <span className="h-1.5 w-10 rounded-full bg-fg/20" />
          </div>

          {title && (
            <div className="sticky top-0 sm:top-0 z-10 flex items-center justify-between gap-4 bg-tennis-surface px-6 pt-3 sm:pt-6 pb-3 border-b border-fg/5">
              <h2 className="text-lg font-bold text-fg">{title}</h2>
            </div>
          )}

          {/* Close button (top-right) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3.5 right-4 sm:top-5 sm:right-5 z-30 w-11 h-11 bg-fg/10 hover:bg-fg/20 rounded-full flex items-center justify-center text-fg transition-colors focus-visible"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-6 pt-3 space-y-4">{children}</div>
        </motion.div>
      </div>
      ,
    </AnimatePresence>,
    document.body,
  );
};
