import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Mail, MapPin } from 'lucide-react';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-tennis-dark border-t border-white/5 pt-10 pb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div className="space-y-3 md:col-span-1">
            <Link to="/" className="inline-block text-lg font-display font-bold tracking-tight text-white hover:text-clay transition-colors">
              <span className="text-white">RACQUETS</span>
              <span className="text-clay"> &</span>
              <span className="text-white"> STRINGS</span>
            </Link>
            <p className="text-white/60 text-sm leading-relaxed">
              A community-driven platform to help players connect, join meetups and tournaments. A new approach to finding your hitting partner and spending more time on the court. Join for free!
            </p>
          </div>

          {/* Quick Links + Legal side by side */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-white font-bold uppercase tracking-wider text-xs">Quick Links</h4>
              <ul className="space-y-2">
                <li><Link to="/profile" className="text-white/60 hover:text-clay text-sm transition-colors">My Profile</Link></li>
                <li><Link to="/rules" className="text-white/60 hover:text-clay text-sm transition-colors">League Rules</Link></li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="text-white font-bold uppercase tracking-wider text-xs">Legal</h4>
              <ul className="space-y-2">
                <li><Link to="/terms" className="text-white/60 hover:text-clay text-sm transition-colors">Terms of Service</Link></li>
                <li><Link to="/privacy" className="text-white/60 hover:text-clay text-sm transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-3">
            <h4 className="text-white font-bold uppercase tracking-wider text-xs">Contact Us</h4>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-white/60 text-sm">
                <Mail className="w-4 h-4 text-clay shrink-0" />
                <a href="mailto:tenniscommunity.tbtc@gmail.com" className="hover:text-clay transition-colors break-all">
                  tenniscommunity.tbtc@gmail.com
                </a>
              </li>
              <li className="flex items-center gap-2 text-white/60 text-sm">
                <Instagram className="w-4 h-4 text-clay shrink-0" />
                <a href="https://www.instagram.com/racquetsnstrings.to/" target="_blank" rel="noopener noreferrer" className="hover:text-clay transition-colors">
                  @racquetsnstrings.to
                </a>
              </li>
              <li className="flex items-center gap-2 text-white/60 text-sm">
                <MapPin className="w-4 h-4 text-clay shrink-0" />
                <span>Toronto, ON, Canada</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 pt-4 text-center text-xs text-white/40">
          © {currentYear} Racquets &amp; Strings. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
