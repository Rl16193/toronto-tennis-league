import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { Button } from '../../components/Button';
import { MemberSearchInput, type MemberPick } from '../../features/members/MemberSearchInput';

type Props = {
  currentUserId?: string;
  saving: boolean;
  onSave: (partnerName: string, partnerInApp: 'yes' | 'no', combinedSkill: number | null) => void;
};

/**
 * Shown to a doubles participant whose registration has no partner recorded.
 *
 * This exists because registrations could previously be saved as Singles inside a Doubles event
 * (see the comment in JoinEventSheet) — the partner-name check was keyed on a different value
 * than the one being written, so it never fired and those signups landed with an empty partner.
 * Rather than making those players register again, they finish the pairing here.
 *
 * The skill field only appears for a partner who isn't on the app: a member's rating comes from
 * their own profile, so asking someone else to estimate it would be worse data.
 */
export const AddTeammatePanel: React.FC<Props> = ({ currentUserId, saving, onSave }) => {
  const [pick, setPick] = useState<MemberPick | null>(null);
  const [skill, setSkill] = useState('');
  const [error, setError] = useState('');

  const isGuest = !!pick && pick.memberId === null;

  const submit = () => {
    if (!pick) { setError('Please choose your teammate.'); return; }
    const name = pick.name.trim();
    // Same rules the join form applies, so both paths produce identical data.
    if (name.length < 3 || name.length > 80) { setError('Teammate name must be 3–80 characters.'); return; }
    if (/\d/.test(name)) { setError('Teammate name cannot contain numbers.'); return; }

    let combined: number | null = null;
    if (isGuest) {
      const n = Number(skill);
      if (!skill.trim() || !Number.isFinite(n) || n < 1 || n > 5) {
        setError('Enter your teammate’s skill level between 1 and 5.');
        return;
      }
      combined = n;
    }
    setError('');
    onSave(name, pick.memberId ? 'yes' : 'no', combined);
  };

  return (
    <div className="mb-6 rounded-3xl bg-tennis-surface/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-clay shrink-0" />
        <div>
          <p className="text-sm font-bold text-fg">Add your teammate</p>
          <p className="text-[11px] text-fg">
            You’re registered for doubles but we don’t have your partner yet.
          </p>
        </div>
      </div>

      <MemberSearchInput
        label="Teammate"
        value={pick}
        onChange={(p) => { setPick(p); setError(''); }}
        excludeId={currentUserId}
        allowGuest
        placeholder="Search for your teammate…"
        hint="Not on the app yet? Type their full name and pick “not on the app”."
      />

      {isGuest && (
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-fg uppercase tracking-widest" htmlFor="tm-skill">
            Their skill level (1–5)
          </label>
          <input
            id="tm-skill"
            type="number"
            min={1}
            max={5}
            step={0.5}
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="e.g. 3.5"
            className="border border-fg/25 w-full rounded-xl bg-tennis-dark/70 px-3 py-2.5 text-sm text-fg outline-none focus:border-clay"
          />
        </div>
      )}

      {error && <p className="text-[11px] text-badge-loss">{error}</p>}

      <Button variant="clay" isLoading={saving} onClick={submit} className="w-full">
        Save teammate
      </Button>
    </div>
  );
};
