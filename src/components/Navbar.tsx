import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Calendar, Trophy, Medal, User, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { Button } from './Button';

const ALL_NAV_LINKS = [
  { name: 'Events', path: '/events', icon: Calendar },
  { name: 'Draw', path: '/tournament', icon: Trophy },
  { name: 'Leagues', path: '/leagues', icon: Medal },
] as const;

export const Navbar: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Desktop: all main links for logged-in, nothing for logged-out (they use auth buttons)
  const desktopNavLinks = user ? ALL_NAV_LINKS : [];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-tennis-dark/90 backdrop-blur-md py-2 shadow-xl border-b border-white/5'
          : 'bg-transparent py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between relative">

          {/* Logo */}
          <Link to={user ? '/profile' : '/'} className="flex items-center shrink-0">
            <span className="text-lg md:text-xl font-bold font-['Montserrat'] tracking-tight">
              <span className="text-white">RACQUETS</span>
              <span className="text-clay"> &</span>
              <span className="text-white"> STRINGS</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {desktopNavLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-colors hover:text-clay ${
                  location.pathname === link.path ? 'text-clay' : 'text-white'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Desktop Auth */}
          <div className="hidden md:flex items-center gap-4 shrink-0">
            {user ? (
              <>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white hover:text-white">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
                <Link to="/profile">
                  <div className="w-9 h-9 rounded-full border-2 border-clay p-0.5 overflow-hidden hover:scale-105 transition-transform">
                    <img
                      src={profile?.user.avatar || `https://ui-avatars.com/api/?name=${profile?.user.name || user.email}&background=C25E44&color=fff`}
                      alt="Profile"
                      className="w-full h-full rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">Login</Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">Sign Up</Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Nav */}
          <div className="md:hidden flex items-center gap-2 shrink-0" ref={menuRef}>
            {user ? (
              <>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-white hover:text-red-400 hover:bg-red-500/5 transition-colors"
                  aria-label="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
                <Link to="/profile">
                  <div className="w-8 h-8 rounded-full border-2 border-clay p-0.5 overflow-hidden hover:scale-105 transition-transform">
                    <img
                      src={profile?.user.avatar || `https://ui-avatars.com/api/?name=${profile?.user.name || user.email}&background=C25E44&color=fff`}
                      alt="Profile"
                      className="w-full h-full rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </Link>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="p-2 rounded-xl text-white hover:bg-white/5 transition-colors"
                  aria-label="Menu"
                >
                  {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>

                {menuOpen && (
                  <div className="absolute top-full right-4 mt-2 w-48 rounded-2xl bg-tennis-dark border border-white/10 shadow-xl overflow-hidden z-50">
                    {ALL_NAV_LINKS.map((link) => (
                      <Link
                        key={link.path}
                        to={link.path}
                        className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/5 ${location.pathname === link.path ? 'text-clay' : 'text-white'}`}
                      >
                        <link.icon className="w-4 h-4 shrink-0" />
                        {link.name}
                      </Link>
                    ))}
                    <Link
                      to="/profile"
                      className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/5 border-t border-white/5 ${location.pathname === '/profile' ? 'text-clay' : 'text-white'}`}
                    >
                      <User className="w-4 h-4 shrink-0" />
                      Profile
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="text-sm px-3">Login</Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm" className="text-sm px-3">Sign Up</Button>
                </Link>
              </>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
};
