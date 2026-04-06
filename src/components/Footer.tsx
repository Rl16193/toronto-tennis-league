import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Mail, MapPin } from 'lucide-react';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-tennis-dark border-t border-white/5 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="space-y-6">
            <Link to="/" className="inline-block text-lg font-display font-bold tracking-tight text-white hover:text-clay transition-colors">
              Toronto Tennis League
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              Toronto Tennis League is a community-driven, non-profit platform designed to help players connect and participate in matches, meetups, and tournaments.
            </p>
            <div className="flex items-center space-x-4">
              <a href="https://www.instagram.com/tbtc.to/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:bg-clay hover:text-white transition-all">
                <Instagram className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-6">
            <h4 className="text-white font-bold uppercase tracking-wider text-xs">Quick Links</h4>
            <ul className="space-y-4">
              <li><Link to="/events" className="text-gray-400 hover:text-clay text-sm transition-colors">Events</Link></li>
              <li><Link to="/profile" className="text-gray-400 hover:text-clay text-sm transition-colors">My Profile</Link></li>
              <li><Link to="/rules" className="text-gray-400 hover:text-clay text-sm transition-colors">League Rules</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-6">
            <h4 className="text-white font-bold uppercase tracking-wider text-xs">Legal</h4>
            <ul className="space-y-4">
              <li><Link to="/terms" className="text-gray-400 hover:text-clay text-sm transition-colors">Terms of Service</Link></li>
              <li><Link to="/privacy" className="text-gray-400 hover:text-clay text-sm transition-colors">Privacy Policy</Link></li>
              <li><Link to="/contact" className="text-gray-400 hover:text-clay text-sm transition-colors">Contact Us</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-6">
            <h4 className="text-white font-bold uppercase tracking-wider text-xs">Contact Us</h4>
            <ul className="space-y-4">
              <li className="flex items-start space-x-3 text-gray-400 text-sm">
                <Mail className="w-5 h-5 text-clay shrink-0" />
                <span>tenniscommunity.tbtc@gmail.com</span>
              </li>
              <li className="flex items-start space-x-3 text-gray-400 text-sm">
                <MapPin className="w-5 h-5 text-clay shrink-0" />
                <span>Toronto, ON, Canada</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <p className="text-gray-500 text-xs">
            © {currentYear} Toronto Tennis League. All rights reserved.
          </p>
          <div className="flex items-center space-x-6">
            <span className="text-gray-500 text-xs flex items-center">
              Made with <span className="text-clay mx-1">❤</span> in Toronto
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
