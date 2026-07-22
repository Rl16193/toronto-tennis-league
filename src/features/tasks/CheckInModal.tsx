import React, { useState } from 'react';
import { MapPin, CheckCircle2, Loader2 } from 'lucide-react';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import { useAuth } from '../../context/AuthContext';
import {
  CHECKIN_RADIUS_M, NearbyCourt, VISIT_TYPES, VisitType,
  checkIn, checkZoneComplete, findNearbyCourts, getCurrentPosition, hasCheckedIn, logAttendance,
} from './checkinService';
import { bumpCounter, setTaskDone } from './useTasks';

type Step = 'start' | 'locating' | 'pick' | 'success' | 'error';

// Court passport check-in. Location is requested only when the player taps "Check in" — never
// on page load — and only the nearest court within CHECKIN_RADIUS_M can actually be stamped.
export const CheckInModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user, profile } = useAuth();
  const [step, setStep] = useState<Step>('start');
  const [error, setError] = useState('');
  const [nearby, setNearby] = useState<NearbyCourt[]>([]);
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [checkedInto, setCheckedInto] = useState<NearbyCourt | null>(null);
  const [wasNewStamp, setWasNewStamp] = useState(false);
  const [visitType, setVisitType] = useState<VisitType>('Visit');

  const locate = async () => {
    setStep('locating');
    setError('');
    try {
      const pos = await getCurrentPosition();
      const { latitude: lat, longitude: lng } = pos.coords;
      setCoords({ lat, lng });
      const courts = await findNearbyCourts(lat, lng);
      setNearby(courts);
      setStep('pick');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setStep('error');
    }
  };

  const doCheckIn = async (court: NearbyCourt) => {
    if (!user || !coords || busy) return;
    setBusy(true);
    setError('');
    try {
      const name = profile?.user.name || '';
      const full = { ...coords, distM: court.distM };
      const firstVisit = !(await hasCheckedIn(user.uid, court));
      setWasNewStamp(firstVisit);

      // Always log daily attendance — this is the repeatable signal (feeds Matchday + zone sweeps).
      // The passport stamp below is once-per-court-forever, so it only runs on the first visit.
      await logAttendance(user.uid, name, court, full, visitType);

      if (firstVisit) {
        await checkIn(user.uid, name, court, full, visitType);
        // Best-effort local extras: the zone-complete tier and unlocking the courtVisit Initiation
        // task. courtsVisited itself is awarded server-side (see functions/taskPoints.js).
        setTaskDone(user.uid, name, 'courtVisit', true).catch(() => {});
        const zone = profile?.preferences.preferred_zone || court.zone;
        checkZoneComplete(user.uid, zone)
          .then((done) => { if (done) bumpCounter(user.uid, name, 'zoneComplete', 1).catch(() => {}); })
          .catch(() => {});
      }
      setCheckedInto(court);
      setStep('success');
    } catch {
      setError('Could not check in right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} title="Court Check-In" maxWidthClassName="max-w-md">
      <div className="p-6 pt-2 space-y-5">
        {step === 'start' && (
          <div className="text-center space-y-4 py-6">
            <div className="w-16 h-16 bg-clay/10 rounded-full flex items-center justify-center mx-auto">
              <MapPin className="w-8 h-8 text-clay" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Stamp your passport</h3>
              <p className="text-white/60 text-sm px-2">
                We’ll ask for your location to confirm you’re actually at the court.
              </p>
            </div>
            <Button onClick={locate} className="w-full">Use my location</Button>
          </div>
        )}

        {step === 'locating' && (
          <div className="text-center py-10">
            <Loader2 className="w-8 h-8 text-clay animate-spin mx-auto mb-3" />
            <p className="text-white/60 text-sm">Finding your location…</p>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center space-y-4 py-6">
            <p className="text-red-400 text-sm">{error}</p>
            <Button variant="outline" onClick={locate} className="w-full">Try again</Button>
          </div>
        )}

        {step === 'pick' && (
          <div className="space-y-2">
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            {/* What are you here for? — captured on the check-in so we know the activity type. */}
            <div className="space-y-2 pb-1">
              <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Type</p>
              <div className="flex flex-wrap gap-2">
                {VISIT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setVisitType(t)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                      visitType === t ? 'bg-clay text-white border-clay' : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {nearby.length === 0 ? (
              <p className="text-white/50 text-sm text-center py-8">No courts nearby.</p>
            ) : (
              nearby.slice(0, 6).map((c) => {
                const here = c.distM <= CHECKIN_RADIUS_M;
                return (
                  <div key={c.dropdown} className="rounded-2xl border border-white/10 bg-tennis-surface/40 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{c.dropdown}</p>
                      <p className="text-white/40 text-xs">{Math.round(c.distM)} m away</p>
                    </div>
                    {here ? (
                      <Button size="sm" onClick={() => doCheckIn(c)} isLoading={busy}>Check in</Button>
                    ) : (
                      <span className="text-[11px] text-white/30 shrink-0">Get closer</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {step === 'success' && checkedInto && (
          <div className="text-center space-y-4 py-6">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">{wasNewStamp ? 'Stamped!' : 'Checked in!'}</h3>
              <p className="text-white/60 text-sm">
                {wasNewStamp
                  ? `${checkedInto.dropdown} is now in your passport.`
                  : `You’re checked in at ${checkedInto.dropdown}.`}
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </Sheet>
  );
};
