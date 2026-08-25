import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

export const NotFound: React.FC = () => {
  useEffect(() => {
    document.title = 'Page not found · Racquets & Strings';
  }, []);

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <section className="max-w-md text-center space-y-5" aria-labelledby="not-found-title">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-clay/30 bg-clay/10 text-clay-fg">
          <AlertTriangle aria-hidden="true" className="h-7 w-7" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-fg/60">404</p>
        <h1 id="not-found-title" className="text-3xl font-black text-fg">
          This page went out of bounds
        </h1>
        <p className="text-sm leading-6 text-fg/70">The link may be stale, or the page has moved.</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-xl bg-clay px-4 py-3 text-sm font-bold text-white"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to home
        </Link>
      </section>
    </main>
  );
};
