import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Mail, MessageCircle, MessageSquare, Phone } from 'lucide-react';

// North-America phone (the regular Phone field's format) → E.164 for tel:/sms:/wa.me links.
// Only used for Text/Call, and as the WhatsApp fallback when no dedicated whatsapp_contact is set.
const toE164Phone = (phone?: string): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
};

type Channel = { key: string; label: string; href: string; icon: React.ComponentType<{ className?: string }> };

// Only one Contact dropdown open at a time, even across independent instances scattered through
// a list (opponents, group cards, etc). No shared provider needed — a lightweight window event
// tells every other instance to close when one opens.
const CONTACT_OPEN_EVENT = 'contact-dropdown-open';

// Shared pill shape for small buttons that sit inline together in a row (Contact, Schedule on
// Matchdays, Submit Score, …) — same size/shape/text everywhere they're placed side by side.
export const pillButtonCls = (size: 'sm' | 'md', variant: 'outline' | 'white' | 'clay') => {
  const base = `inline-flex items-center gap-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${
    size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
  }`;
  if (variant === 'white') return `${base} bg-white text-ink border border-fg/10 hover:bg-white/90`;
  if (variant === 'clay') return `${base} bg-clay text-white hover:bg-clay-dark`;
  return `${base} border-2 border-clay text-clay hover:bg-clay hover:text-white`;
};

const btnCls = (size: 'sm' | 'md', variant: 'outline' | 'white') => pillButtonCls(size, variant);

export const ContactOpponentButton: React.FC<{
  name: string;
  phone?: string;
  email?: string;
  whatsappContact?: string;
  whatsappSameAsPhone?: boolean;
  size?: 'sm' | 'md';
  variant?: 'outline' | 'white';
  className?: string;
}> = ({ name, phone, email, whatsappContact, size = 'md', variant = 'outline', className }) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Close this dropdown if a different instance just opened.
  useEffect(() => {
    const onOtherOpen = (e: Event) => {
      if ((e as CustomEvent).detail !== id) setOpen(false);
    };
    window.addEventListener(CONTACT_OPEN_EVENT, onOtherOpen);
    return () => window.removeEventListener(CONTACT_OPEN_EVENT, onOtherOpen);
  }, [id]);

  // Portalled to <body> (see Sheet.tsx for why), so it must track the trigger's screen position
  // itself rather than relying on `absolute` inside a normal-flow parent — that also means it
  // overlays any scrollable card/sheet it lives in instead of being clipped by it.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setCoords({ top: r.bottom + 4, left: Math.min(r.right - 160, window.innerWidth - 168) });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const toggleOpen = () => {
    setOpen((v) => {
      const next = !v;
      if (next) window.dispatchEvent(new CustomEvent(CONTACT_OPEN_EVENT, { detail: id }));
      return next;
    });
  };

  const phoneE164 = toE164Phone(phone);
  const waNumber = whatsappContact || phoneE164;

  const channels: Channel[] = [];
  if (waNumber) channels.push({ key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${waNumber.replace('+', '')}`, icon: MessageCircle });
  if (phoneE164) {
    channels.push({ key: 'text', label: 'Text (SMS)', href: `sms:${phoneE164}`, icon: MessageSquare });
    channels.push({ key: 'call', label: 'Call', href: `tel:${phoneE164}`, icon: Phone });
  }
  if (email) channels.push({ key: 'email', label: 'Email', href: `mailto:${email}`, icon: Mail });

  if (channels.length === 0) return null;

  if (channels.length === 1) {
    const c = channels[0];
    return (
      <a href={c.href} target={c.key === 'whatsapp' ? '_blank' : undefined} rel="noopener noreferrer" title={`Contact ${name}`} className={`${btnCls(size, variant)} ${className ?? ''}`}>
        <c.icon className="w-3.5 h-3.5" />Contact
      </a>
    );
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggleOpen} title={`Contact ${name}`} className={`${btnCls(size, variant)} ${className ?? ''}`}>
        <MessageCircle className="w-3.5 h-3.5" />Contact<ChevronDown className="w-3 h-3" />
      </button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left }}
          className="z-[200] min-w-[10rem] max-h-56 overflow-y-auto bg-tennis-surface border border-fg/10 rounded-xl shadow-2xl"
        >
          {channels.map((c) => (
            <a
              key={c.key}
              href={c.href}
              target={c.key === 'whatsapp' ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-fg/80 hover:bg-clay/20 hover:text-fg transition-colors"
            >
              <c.icon className="w-4 h-4 shrink-0" />{c.label}
            </a>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};
