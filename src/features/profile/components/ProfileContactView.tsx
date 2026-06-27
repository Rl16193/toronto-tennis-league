import React from 'react';

interface Profile {
  user: { name: string; email: string; phone: string };
  stats: { skill_level: number };
}

interface Props {
  profile: Profile;
}

export const ProfileContactView: React.FC<Props> = ({ profile }) => (
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
  </div>
);
