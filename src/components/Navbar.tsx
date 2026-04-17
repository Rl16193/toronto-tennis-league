import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, LogOut, User, Calendar, Home } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { Button } from './Button';
import { motion, AnimatePresence } from 'motion/react';

export const Navbar: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navLinks = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Events', path: '/events', icon: Calendar },
    ...(user ? [{ name: 'Profile', path: '/profile', icon: User }] : []),
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-tennis-dark/90 backdrop-blur-md py-3 shadow-xl border-b border-white/5' : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <Link to="/" className="flex items-center group">
            <img
              src="https://firebasestorage.googleapis.com/v0/b/toronto-tennis-league.firebasestorage.app/o/LandingPage%2FLogo.jpg?alt=media&token=b5a4d010-e93c-423a-b823-24c01c8918ce"
              alt="Toronto Tennis League logo"
              className={`h-16 md:h-20 lg:h-24 w-auto max-w-[260px] object-contain group-hover:scale-105 transition-all duration-300 ${
                scrolled ? 'opacity-80 saturate-90' : 'opacity-95'
              }`}
              referrerPolicy="no-referrer"
            />
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-colors hover:text-clay ${
                  location.pathname === link.path ? 'text-clay' : 'text-gray-300'
                }`}
              >
                {link.name}
              </Link>
            ))}
            {user ? (
              <div className="flex items-center space-x-4">
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-400 hover:text-white">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
                <Link to="/profile">
                  <div className="w-10 h-10 rounded-full border-2 border-clay p-0.5 overflow-hidden hover:scale-105 transition-transform">
                    <img
                      src={profile?.user.avatar || `https://ui-avatars.com/api/?name=${profile?.user.name || user.email}&background=C25E44&color=fff`}
                      alt="Profile"
                      className="w-full h-full rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </Link>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link to="/login">
                  <Button variant="ghost" size="sm">Login</Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">Sign Up</Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden bg-tennis-surface border-b border-white/5 shadow-2xl"
          >
            <div className="px-4 pt-2 pb-6 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-base font-medium ${
                    location.pathname === link.path ? 'bg-clay/10 text-clay' : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <link.icon className="w-5 h-5" />
                  <span>{link.name}</span>
                </Link>
              ))}
              <div className="pt-4 border-t border-white/5 space-y-2">
                {user ? (
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center space-x-3 px-4 py-3 rounded-xl text-base font-medium text-red-400 hover:bg-red-500/10"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
                  </button>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setIsOpen(false)}
                      className="block px-4 py-3 rounded-xl text-base font-medium text-gray-300 hover:bg-white/5"
                    >
                      Login
                    </Link>
                    <Link
                      to="/signup"
                      onClick={() => setIsOpen(false)}
                      className="block px-4 py-3 rounded-xl text-base font-medium text-white bg-clay text-center"
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
