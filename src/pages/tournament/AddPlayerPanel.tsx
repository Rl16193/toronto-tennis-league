import React, { useEffect, useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '../../components/Button';
import { DrawConfig } from './types';

type AvailableUser = { id: string; name: string; email: string };

type Props = {
  availableUsers: AvailableUser[];
  currentDraw: DrawConfig | undefined;
  addPlayerLocked: boolean;
  onAdd: (userId: string, partnerName?: string, divisionOverride?: string) => Promise<void>;
};

const DOUBLES_DIVISIONS = ["Men's", "Women's", 'Mixed Doubles'];

export const AddPlayerPanel: React.FC<Props> = ({
  availableUsers, currentDraw, addPlayerLocked, onAdd,
}) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [divisionOverride, setDivisionOverride] = useState("Men's");
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!currentDraw) return null;

  const isDoubles = currentDraw.tournamentChoice === 'Doubles';
  const needsDivisionPicker = currentDraw.division === 'All';

  const filtered = availableUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedUser = availableUsers.find((u) => u.id === selectedUserId);

  const handleAdd = async () => {
    if (!selectedUserId) return;
    setAdding(true);
    try {
      await onAdd(
        selectedUserId,
        isDoubles && partnerName ? partnerName : undefined,
        needsDivisionPicker ? divisionOverride : undefined,
      );
      setSelectedUserId('');
      setPartnerName('');
      setSearch('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-tennis-surface/40 p-4">
      <div className="flex items-center gap-2 mb-4">
        <UserPlus className="w-4 h-4 text-clay" />
        <span className="text-sm font-bold text-gray-300 uppercase tracking-widest">Add Player</span>
      </div>

      {addPlayerLocked ? (
        <p className="text-sm text-amber-400">Draw is finalized and full — no open slots available.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[200px]" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="w-full text-left px-3 py-2 rounded-xl bg-tennis-surface/60 border border-white/10 text-sm text-gray-200 hover:border-clay/50 transition-colors"
            >
              {selectedUser ? selectedUser.name : <span className="text-gray-500">Select player…</span>}
            </button>
            {open && (
              <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl overflow-hidden">
                <div className="p-2 border-b border-white/10">
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                  />
                </div>
                <ul className="max-h-52 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-gray-500">No users found</li>
                  ) : (
                    filtered.map((u) => (
                      <li
                        key={u.id}
                        onClick={() => { setSelectedUserId(u.id); setOpen(false); setSearch(''); }}
                        className="px-3 py-2 text-sm text-gray-200 hover:bg-clay/20 cursor-pointer"
                      >
                        <span className="font-semibold">{u.name}</span>
                        <span className="text-gray-500 ml-2 text-xs">{u.email}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>

          {needsDivisionPicker && (
            <select
              value={divisionOverride}
              onChange={(e) => setDivisionOverride(e.target.value)}
              className="px-3 py-2 rounded-xl bg-tennis-surface/60 border border-white/10 text-sm text-gray-200"
            >
              {DOUBLES_DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}

          {isDoubles && (
            <input
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder="Partner name…"
              className="flex-1 min-w-[160px] px-3 py-2 rounded-xl bg-tennis-surface/60 border border-white/10 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-clay/50 transition-colors"
            />
          )}

          <Button onClick={handleAdd} disabled={!selectedUserId} isLoading={adding} size="md">
            <UserPlus className="w-4 h-4 mr-2" />
            Add
          </Button>
        </div>
      )}
    </div>
  );
};
