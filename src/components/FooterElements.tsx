import React from 'react';
import { Instagram, Mail, MessageCircle } from 'lucide-react';

// Every site-wide link and contact detail, plus the components that render them.
// Mirrored in index.html and functions/lib/constants.js — change all three together.
export const SITE_NAME = 'Racquets & Strings';
export const SITE_URL = 'https://www.racquetsandstrings.ca';
export const CONTACT_EMAIL = 'events@racquetsandstrings.ca';
export const INSTAGRAM_URL = 'https://www.instagram.com/racqnstringstoronto';
export const WHATSAPP_URL = 'https://chat.whatsapp.com/Bh7OVww9e08GP4TuoFF5NX';

const linkCls = (className: string) =>
  `inline-flex items-center gap-1.5 hover:text-clay-fg transition-colors ${className}`;

export const InstagramLink: React.FC<{ className?: string }> = ({ className = '' }) => (
  <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={linkCls(className)}>
    <Instagram className="w-3.5 h-3.5 shrink-0" />
    Instagram
  </a>
);

export const WhatsAppLink: React.FC<{ className?: string }> = ({ className = '' }) => (
  <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={linkCls(className)}>
    <MessageCircle className="w-3.5 h-3.5 shrink-0" />
    WhatsApp
  </a>
);

/** `label` lets the Contact page show the address instead of the word "Contact". */
export const ContactLink: React.FC<{ className?: string; label?: string }> = ({
  className = '',
  label = 'Contact',
}) => (
  <a href={`mailto:${CONTACT_EMAIL}`} className={linkCls(className)}>
    <Mail className="w-3.5 h-3.5 shrink-0" />
    {label}
  </a>
);
