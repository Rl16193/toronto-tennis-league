import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Member, useMemberRoster } from './useMemberRoster';

/** `memberId: null` means the name was typed by hand for someone who isn't on the app. */
export type MemberPick = { name: string; memberId: string | null };

type Props = {
  label: string;
  /** Current selection, or null when nothing is picked yet. */
  value: MemberPick | null;
  onChange: (pick: MemberPick | null) => void;
  /** Drop one member from the results — usually the signed-in user. */
  excludeId?: string;
  /**
   * Allow a name that isn't an app member. Off means the field only accepts a real account.
   * When on, whatever is typed can be submitted as a `guest` pick.
   */
  allowGuest?: boolean;
  placeholder?: string;
  /** Shown under the field when nothing is selected. */
  hint?: string;
};

const MAX_RESULTS = 8;

/**
 * Name field with member autosearch, plus an optional free-text fallback for someone who isn't
 * on the app.
 *
 * Extracted from the inline search in ClaimModal's ambassador flow so the doubles partner fields
 * can use it too — those are free text today, and a typo there silently breaks team pairing,
 * because a doubles team is only recognised when both partners name each other exactly.
 */
export const MemberSearchInput: React.FC<Props> = ({
  label,
  value,
  onChange,
  excludeId,
  allowGuest = false,
  placeholder = 'Search members…',
  hint,
}) => {
  const members = useMemberRoster(excludeId);
  const [search, setSearch] = useState('');

  const matches = useMemo((): Member[] => {
    const q = search.trim().toLowerCase();
    if (!q) return members.slice(0, MAX_RESULTS);
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
  }, [members, search]);

  const typed = search.trim();
  const exactMatch = matches.some((m) => m.name.toLowerCase() === typed.toLowerCase());
  const canUseGuest = allowGuest && typed.length >= 3 && !exactMatch;

  if (value) {
    return (
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-fg uppercase tracking-widest">{label}</label>
        <div className="flex items-center justify-between rounded-2xl bg-clay/15 px-4 py-2.5">
          <span className="min-w-0 text-sm font-bold text-fg truncate">
            {value.name}
            {value.memberId === null && <span className="ml-1.5 font-medium text-fg">(not on the app)</span>}
          </span>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              onChange(null);
            }}
            className="shrink-0 ml-3 text-xs font-bold text-fg hover:text-clay"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-fg uppercase tracking-widest">{label}</label>
      <div className="relative">
        <Search className="w-4 h-4 text-fg absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-fg/25 w-full rounded-2xl bg-tennis-surface/50 pl-10 pr-4 py-2.5 text-sm text-fg placeholder-gray-500 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20"
        />
      </div>

      {(matches.length > 0 || canUseGuest) && (
        <div className="max-h-40 overflow-y-auto rounded-2xl bg-tennis-dark/60 p-1">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange({ name: m.name, memberId: m.id })}
              className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-fg hover:bg-clay/20 transition-colors"
            >
              {m.name}
            </button>
          ))}
          {canUseGuest && (
            <button
              type="button"
              onClick={() => onChange({ name: typed, memberId: null })}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-fg hover:bg-clay/20 transition-colors"
            >
              Use “<span className="font-semibold text-fg">{typed}</span>” — not on the app
            </button>
          )}
        </div>
      )}

      {hint && <p className="text-[11px] text-fg">{hint}</p>}
    </div>
  );
};
