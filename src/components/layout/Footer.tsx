import React from 'react';
import { Link } from 'react-router-dom';

export const Footer = () => {
  return (
    <footer className="bg-rg-green border-t border-white/10 mt-auto">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex justify-center md:justify-start space-x-6 md:order-2">
            <Link to="/#about" className="text-sm text-slate-200 hover:text-white cursor-pointer">About</Link>
            <Link to="/rules" className="text-sm text-slate-200 hover:text-white cursor-pointer">Rules</Link>
            <Link to="/terms" className="text-sm text-slate-200 hover:text-white cursor-pointer">Terms</Link>
            <Link to="/privacy" className="text-sm text-slate-200 hover:text-white cursor-pointer">Privacy</Link>
            <span className="text-sm text-slate-200 hover:text-white cursor-pointer">Contact</span>
          </div>
          <div className="mt-8 md:mt-0 md:order-1">
            <p className="text-center text-sm text-slate-200">
              &copy; {new Date().getFullYear()} Community Tennis League Toronto. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
