import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Sheet } from '../../../components/Sheet';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { AlertMessage } from '../../../components/AlertMessage';
import { deleteAccount, usesPassword } from '../services/profileService';

// Profile → Delete account. Two taps, never window.confirm. The work is the deleteAccount callable.
export const DeleteAccountSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!user) return null;
  const needsPassword = usesPassword(user);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteAccount(user, password);
      // A full load, not navigate(): Profile's PrivateRoute redirects to /login on sign-out before a
      // router transition to / commits. The reload also drops every listener and cached profile.
      window.location.replace('/');
    } catch (err: any) {
      const code = String(err?.code || '');
      setError(code.includes('wrong-password') || code.includes('invalid-credential') ? 'That password is not right.'
        : code.includes('popup') ? 'Sign in again to confirm it is you.'
          : err?.message || 'Could not delete your account just now.');
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Sheet onClose={busy ? () => {} : onClose} title="Delete account">
      <div className="p-6 space-y-4 text-sm text-fg">
        <div className="space-y-1">
          <p className="font-bold">Deleted</p>
          <p className="text-fg/70">Your profile, contact details, preferences, photos, listings, newsletter sign-up and sign-in.</p>
        </div>
        <div className="space-y-1">
          <p className="font-bold">Kept as "Former member"</p>
          <p className="text-fg/70">Played results and league points, so other players' records stay right. Bookings and claims stay too, without your name.</p>
        </div>
        <p className="text-fg/70">Your unplayed tournament matches become walkovers for your opponents. This cannot be undone.</p>

        {needsPassword && (
          <Input
            label="Password" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy}
          />
        )}
        {error && <AlertMessage tone="error">{error}</AlertMessage>}

        {confirming ? (
          <Button variant="clay" className="w-full" isLoading={busy} onClick={run}>Yes, delete my account</Button>
        ) : (
          <Button variant="outline" className="w-full" disabled={needsPassword && !password} onClick={() => setConfirming(true)}>
            Delete my account
          </Button>
        )}
      </div>
    </Sheet>
  );
};
