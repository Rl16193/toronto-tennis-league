import React, { useEffect, useRef, useState } from 'react';
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

const outlineCls = (size: 'sm' | 'md') =>
  `inline-flex items-center gap-1.5 rounded-lg font-bold border-2 border-clay text-clay hover:bg-clay hover:text-white transition-colors whitespace-nowrap ${
    size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
  }`;

export const ContactOpponentButton: React.FC<{
  name: string;
  phone?: string;
  email?: string;
  whatsappContact?: string;
  whatsappSameAsPhone?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}> = ({ name, phone, email, whatsappContact, size = 'md', className }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

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
      <a href={c.href} target={c.key === 'whatsapp' ? '_blank' : undefined} rel="noopener noreferrer" title={`Contact ${name}`} className={`${outlineCls(size)} ${className ?? ''}`}>
        <c.icon className="w-3.5 h-3.5" />Contact
      </a>
    );
  }

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} title={`Contact ${name}`} className={outlineCls(size)}>
        <MessageCircle className="w-3.5 h-3.5" />Contact<ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 min-w-[10rem] bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl overflow-hidden">
          {channels.map((c) => (
            <a
              key={c.key}
              href={c.href}
              target={c.key === 'whatsapp' ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:bg-clay/20 hover:text-white transition-colors"
            >
              <c.icon className="w-4 h-4 shrink-0" />{c.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
