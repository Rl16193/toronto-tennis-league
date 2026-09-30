import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Mail, MessageCircle } from 'lucide-react';

// Every site-wide link and contact detail, plus the components that render them.
// Mirrored in index.html and functions/lib/constants.js — change all three together.
export const SITE_URL = 'https://www.racquetsandstrings.ca';
/** Bare host, for display in the footer line. Keep in step with SITE_URL. */
export const SITE_HOST = 'racquetsandstrings.ca';
export const CONTACT_EMAIL = 'events@racquetsandstrings.ca';
export const INSTAGRAM_URL = 'https://www.instagram.com/racqnstringstoronto';
export const WHATSAPP_URL = 'https://chat.whatsapp.com/Bh7OVww9e08GP4TuoFF5NX';
/** Donation destination, for the Donate button still to be added above Subscribe in the
 *  homepage's floating stack (FloatingCtaStack, pages/home/HomeElements.tsx). Nothing reads this
 *  yet. Drop the payment link in here (Stripe/PayPal/etc.) when that button lands. */
export const DONATE_URL = '';

const linkCls = (className: string) =>
  `inline-flex items-center gap-1.5 hover:text-clay transition-colors ${className}`;

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

/**
 * One-line site footer: host - city, the three legal/contact routes, and Instagram.
 * Lives here because every link it renders is already a constant in this file.
 * `/privacy` and `/contact` have no other public entry point, so this is their way in.
 */
export const SiteFooterLine: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex flex-col items-center gap-2 text-xs font-semibold text-fg/70 ${className}`}>
    <span className="uppercase tracking-widest">
      {SITE_HOST} &middot; Toronto
    </span>
    <nav className="flex items-center gap-3" aria-label="Site information">
      <Link to="/terms" className="hover:text-clay transition-colors">Terms</Link>
      <span aria-hidden="true">&middot;</span>
      <Link to="/privacy" className="hover:text-clay transition-colors">Privacy</Link>
      <span aria-hidden="true">&middot;</span>
      <Link to="/contact" className="hover:text-clay transition-colors">Contact</Link>
      <span aria-hidden="true">&middot;</span>
      <InstagramLink />
    </nav>
  </div>
);
