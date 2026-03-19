import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Trophy, Calendar, User as UserIcon, Activity, Menu, X, Medal, MapPin } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState } from 'react';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Events', path: '/events', icon: Calendar },
    { name: 'Tournament', path: '/tournament', icon: Trophy },
    { name: 'League', path: '/league', icon: Medal },
    { name: 'Locator', path: '/locator', icon: MapPin },
  ];

  return (
    <nav className="bg-rg-green shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center gap-2">
              <img src="/logo.png" alt="CTL Community Tennis League" className="h-12 w-auto bg-white rounded-md p-1" />
            </Link>
          </div>

          {/* Desktop Menu */}
          <div className="hidden sm:flex sm:items-center sm:space-x-8">
            {user && navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.name}
                  to={link.path}
                  className={cn(
                    "inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-clay text-white"
                      : "border-transparent text-slate-200 hover:border-clay/50 hover:text-white"
                  )}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {link.name}
                </Link>
              );
            })}
          </div>

          <div className="hidden sm:flex sm:items-center sm:space-x-4">
            {user ? (
              <div className="flex items-center gap-4">
                <Link
                  to="/profile"
                  className="flex items-center gap-2 text-sm font-medium text-slate-200 hover:text-white"
                >
                  <img
                    src={user.avatar}
                    alt={user.displayName}
                    className="w-8 h-8 rounded-full border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                  <span>{user.displayName}</span>
                </Link>
                <button
                  onClick={logout}
                  className="text-sm font-medium text-rose-400 hover:text-rose-300 transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link
                  to="/login"
                  className="text-sm font-medium text-slate-200 hover:text-white"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-clay hover:bg-clay-dark transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden gap-2">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-slate-200 hover:text-white hover:bg-rg-deep focus:outline-none"
            >
              <span className="sr-only">Open main menu</span>
              {isMobileMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="sm:hidden border-t border-white/10">
          <div className="pt-2 pb-3 space-y-1">
            {user && navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.name}
                  to={link.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center pl-3 pr-4 py-2 border-l-4 text-base font-medium",
                    isActive
                      ? "bg-rg-deep border-clay text-white"
                      : "border-transparent text-slate-200 hover:bg-rg-deep hover:border-clay/50 hover:text-white"
                  )}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {link.name}
                </Link>
              );
            })}
          </div>
          <div className="pt-4 pb-3 border-t border-white/10">
            {user ? (
              <>
                <div className="flex items-center px-4">
                  <div className="flex-shrink-0">
                    <img
                      className="h-10 w-10 rounded-full"
                      src={user.avatar}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="ml-3">
                    <div className="text-base font-medium text-white">{user.name}</div>
                    <div className="text-sm font-medium text-slate-200">{user.email}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Link
                    to="/profile"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-4 py-2 text-base font-medium text-slate-200 hover:text-white hover:bg-rg-deep"
                  >
                    Your Profile
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-base font-medium text-rose-400 hover:text-rose-300 hover:bg-rg-deep"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-3 space-y-1 px-4">
                <Link
                  to="/signup"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block w-full text-center px-4 py-2 border border-transparent rounded-full shadow-sm text-base font-medium text-white bg-clay hover:bg-clay-dark"
                >
                  Sign Up
                </Link>
                <Link
                  to="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block w-full text-center mt-2 px-4 py-2 border border-clay/50 rounded-full shadow-sm text-base font-medium text-slate-200 bg-transparent hover:bg-rg-deep"
                >
                  Login
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};
