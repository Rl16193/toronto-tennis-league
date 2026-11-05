import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { doc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { PRIVACY_EFFECTIVE } from './FooterElements';

// Asks a signed-in member to agree when contacts.consent_at is null or older than PRIVACY_EFFECTIVE.
// Closing only hides it until the next load. Not shown on signup (its own tick box) or the policy pages.
const SKIP = ['/login', '/signup', '/terms', '/privacy'];

export const ConsentSheet: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth();
  const { pathname } = useLocation();
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);

  const consentAt = profile?.contacts?.consent_at?.toMillis?.() ?? 0;
  if (!user || !profile || hidden || SKIP.includes(pathname) || consentAt >= PRIVACY_EFFECTIVE.getTime()) return null;

  const agree = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'contacts', user.uid), { consent_at: Timestamp.now() });
      await refreshProfile(user);
    } catch {
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={() => setHidden(true)} title="Privacy Policy updated">
      <div className="p-6 space-y-4">
        <p className="text-sm text-fg leading-relaxed">
          It now says what we collect, what is public, how long we keep it, and how to delete your account.
        </p>
        <p className="text-sm text-fg">By agreeing you also confirm you are 17 or older.</p>
        <p className="text-sm text-fg">
          Read the <Link to="/privacy" className="text-clay hover:underline">Privacy Policy</Link> and{' '}
          <Link to="/terms" className="text-clay hover:underline">Terms of Service</Link>.
        </p>
        <Button onClick={agree} isLoading={saving} className="w-full">I agree</Button>
      </div>
    </Sheet>
  );
};
