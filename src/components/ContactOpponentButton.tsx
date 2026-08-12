import React from 'react';
import { Mail, MessageSquare } from 'lucide-react';

// WhatsApp's own mark. lucide ships no brand logos, and a generic speech bubble made the WhatsApp
// action indistinguishable from SMS once the buttons lost their text labels.
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true" focusable="false">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488" />
  </svg>
);

// North-America phone (the regular Phone field's format) → E.164 for tel:/sms:/wa.me links.
// Only used for Text/Call, and as the WhatsApp fallback when no dedicated whatsapp_contact is set.
const toE164Phone = (phone?: string): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
};

export type Channel = { key: string; label: string; href: string; icon: React.ComponentType<{ className?: string }> };

// Shared pill shape for small buttons that sit inline together in a row (Contact, Schedule on
// Matchdays, Submit Score, …) — same size/shape/text everywhere they're placed side by side.
export const pillButtonCls = (size: 'sm' | 'md', variant: 'outline' | 'white' | 'clay') => {
  const base = `inline-flex items-center gap-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${
    size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
  }`;
  if (variant === 'white') return `${base} bg-white text-ink hover:bg-white/90`;
  if (variant === 'clay') return `${base} bg-clay text-white hover:bg-clay-dark`;
  return `${base} border-2 border-clay text-clay hover:bg-clay hover:text-white`;
};

/**
 * The contact channels for one person, in the order they're offered everywhere. The app carries no
 * messaging of its own, so this is the single place deciding which channels exist and how each
 * link is built.
 */
export const contactChannels = (c: {
  phone?: string; email?: string; whatsappContact?: string;
}): Channel[] => {
  const phoneE164 = toE164Phone(c.phone);
  const waNumber = c.whatsappContact || phoneE164;
  const out: Channel[] = [];
  if (c.email) out.push({ key: 'email', label: 'Email', href: `mailto:${c.email}`, icon: Mail });
  if (phoneE164) out.push({ key: 'text', label: 'SMS', href: `sms:${phoneE164}`, icon: MessageSquare });
  if (waNumber) out.push({ key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${waNumber.replace('+', '')}`, icon: WhatsAppIcon });
  return out;
};

/**
 * Every way to reach one person, as separate icon buttons — Email, SMS, WhatsApp.
 *
 * Icon-only, deliberately and everywhere: three labelled pills don't fit a stat tile or a compact
 * player row, and one control rendering two different widths is what made rows drift apart before.
 * Each link keeps a title and aria-label, so the channel is still announced.
 *
 * Renders nothing when there are no channels — a missing or permission-denied `contacts` read is
 * the normal case for someone you aren't connected to, not an error.
 */
export const ContactOpponentButton: React.FC<{
  name: string;
  phone?: string;
  email?: string;
  whatsappContact?: string;
  whatsappSameAsPhone?: boolean;
  size?: 'sm' | 'md';
  variant?: 'outline' | 'white';
  className?: string;
}> = ({ name, phone, email, whatsappContact, size = 'sm', variant = 'white', className }) => {
  const channels = contactChannels({ phone, email, whatsappContact });
  if (channels.length === 0) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      {channels.map((c) => (
        <a
          key={c.key}
          href={c.href}
          target={c.key === 'whatsapp' ? '_blank' : undefined}
          rel="noopener noreferrer"
          title={`${c.label} ${name}`}
          aria-label={`${c.label} ${name}`}
          className={`${pillButtonCls(size, variant)} !px-1.5`}
        >
          <c.icon className="w-3.5 h-3.5" />
        </a>
      ))}
    </span>
  );
};
