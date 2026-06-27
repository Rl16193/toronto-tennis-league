import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';

export type OpponentRow = {
  round: string;
  name: string;
  userId: string;
  email: string;
  phone: string;
  skill: number | null;
  wins: number;
  losses: number;
};

type Props = {
  opponent: OpponentRow;
  nextMatchOpponents: OpponentRow[];
};

const ProfileLink: React.FC<{ userId: string }> = ({ userId }) =>
  userId ? (
    <Link
      to={`/players/${userId}`}
      className="inline-flex items-center px-3 py-1.5 rounded-lg bg-clay text-white text-xs font-bold hover:bg-clay/80 transition-colors whitespace-nowrap"
    >
      View Profile
    </Link>
  ) : null;

/** Single row in the desktop table view */
const TableRow: React.FC<{ row: OpponentRow; isPotential?: boolean }> = ({ row, isPotential }) => (
  <tr className="border-b border-white/5 last:border-0">
    <td className="py-3 pr-4 whitespace-nowrap">
      <span className={`text-sm font-bold ${isPotential ? 'text-white/50' : 'text-clay'}`}>
        {row.round}
        {isPotential && <span className="ml-1 text-[10px] uppercase tracking-widest font-semibold">(Potential)</span>}
      </span>
    </td>
    <td className="py-3 pr-4 text-white font-semibold text-sm whitespace-nowrap">{row.name}</td>
    <td className="py-3 pr-4 text-white/70 text-sm">{row.phone || '—'}</td>
    <td className="py-3 pr-4 text-white/70 text-sm break-all">{row.email || '—'}</td>
    <td className="py-3 pr-4 text-white/70 text-sm hidden md:table-cell">
      {row.skill != null ? row.skill.toFixed(1) : '—'}
    </td>
    <td className="py-3 pr-4 text-white/70 text-sm hidden md:table-cell">
      {row.wins}–{row.losses}
    </td>
    <td className="py-3">
      <ProfileLink userId={row.userId} />
    </td>
  </tr>
);

/** Single card in the mobile stacked view */
const MobileCard: React.FC<{ row: OpponentRow; isPotential?: boolean }> = ({ row, isPotential }) => (
  <div className={`rounded-2xl p-4 border ${isPotential ? 'border-white/5 bg-white/5' : 'border-white/10 bg-tennis-dark/40'}`}>
    <div className="flex items-start justify-between gap-3 mb-3">
      <div>
        <span className={`text-xs font-bold uppercase tracking-widest ${isPotential ? 'text-white/40' : 'text-clay'}`}>
          {row.round}{isPotential && ' · Potential'}
        </span>
        <p className="text-white font-bold text-base mt-0.5">{row.name}</p>
      </div>
      <ProfileLink userId={row.userId} />
    </div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {row.phone && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">Phone</p>
          <p className="text-white/80 font-medium">{row.phone}</p>
        </div>
      )}
      {row.email && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">Email</p>
          <p className="text-white/80 font-medium break-all">{row.email}</p>
        </div>
      )}
      {row.skill != null && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">Skill (NTRP)</p>
          <p className="text-white/80 font-medium">{row.skill.toFixed(1)}</p>
        </div>
      )}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">Record</p>
        <p className="text-white/80 font-medium">{row.wins}W – {row.losses}L</p>
      </div>
    </div>
  </div>
);

export const OpponentCard: React.FC<Props> = ({ opponent, nextMatchOpponents }) => {
  const hasPotential = nextMatchOpponents.length > 0;
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <span className="text-xs uppercase tracking-widest text-white/50 font-bold">Your Matches</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors" />
          : <ChevronDown className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors" />}
      </button>

      {open && (
      <>
      {/* ── Mobile: stacked cards (hidden on sm+) ── */}
      <div className="flex flex-col gap-3 sm:hidden">
        <MobileCard row={opponent} />
        {hasPotential && (
          <>
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-bold pt-1">
              Potential Next Round
            </p>
            {nextMatchOpponents.map((p) => (
              <MobileCard key={p.userId || p.name} row={p} isPotential />
            ))}
          </>
        )}
      </div>

      {/* ── Desktop: table (hidden below sm) ── */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl bg-tennis-dark/40 border border-white/10 px-4">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="py-3 pr-4 text-left text-[10px] uppercase tracking-widest text-white/40 font-bold">Round</th>
              <th className="py-3 pr-4 text-left text-[10px] uppercase tracking-widest text-white/40 font-bold">Opponent</th>
              <th className="py-3 pr-4 text-left text-[10px] uppercase tracking-widest text-white/40 font-bold">Phone</th>
              <th className="py-3 pr-4 text-left text-[10px] uppercase tracking-widest text-white/40 font-bold">Email</th>
              <th className="py-3 pr-4 text-left text-[10px] uppercase tracking-widest text-white/40 font-bold hidden md:table-cell">Skill</th>
              <th className="py-3 pr-4 text-left text-[10px] uppercase tracking-widest text-white/40 font-bold hidden md:table-cell">W–L</th>
              <th className="py-3 text-left text-[10px] uppercase tracking-widest text-white/40 font-bold">Profile</th>
            </tr>
          </thead>
          <tbody>
            <TableRow row={opponent} />
            {hasPotential && nextMatchOpponents.map((p) => (
              <TableRow key={p.userId || p.name} row={p} isPotential />
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
  );
};
