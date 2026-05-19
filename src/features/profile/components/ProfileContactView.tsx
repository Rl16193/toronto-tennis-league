import React from 'react';
import { Button } from '../../../components/Button';

interface Profile {
  user: { name: string; email: string; phone: string };
  stats: { skill_level: number };
}

interface Props {
  profile: Profile;
  hasGoogleProvider?: boolean;
  onLinkGoogle: () => void;
  linkingGoogle: boolean;
}

export const ProfileContactView: React.FC<Props> = ({ profile, hasGoogleProvider, onLinkGoogle, linkingGoogle }) => (
  <div className="space-y-5">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
      <div className="space-y-1">
        <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Name</p>
        <p className="text-lg font-bold text-clay">{profile.user.name || '—'}</p>
      </div>
      <div className="space-y-1 min-w-0">
        <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Email</p>
        <p className="text-lg font-bold text-clay break-all">{profile.user.email}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Phone</p>
        <p className="text-lg font-bold text-clay">{profile.user.phone || '—'}</p>
      </div>
    </div>

    <div className="space-y-1">
      <p className="text-xs font-bold text-white/50 uppercase tracking-widest">NTRP Skill</p>
      <p className="text-lg font-bold text-clay">{profile.stats.skill_level}</p>
    </div>

    {!hasGoogleProvider && (
      <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-sm">
        <p className="font-bold text-white">Want Google sign-in later?</p>
        <p className="mt-1 text-white/60">Link your Google account now so you can use it for future sign-ins.</p>
        <Button variant="clay" size="sm" className="mt-3" onClick={onLinkGoogle} isLoading={linkingGoogle}>
          Connect Google
        </Button>
      </div>
    )}
  </div>
);
