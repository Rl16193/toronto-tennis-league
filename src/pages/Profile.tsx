import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Camera, MapPin } from 'lucide-react';
import { ContactLink, InstagramLink } from '../components/FooterElements';
import { useTasks } from '../features/tasks/useTasks';
import { useAuth } from '../context/AuthContext';
import { useProfileData } from '../features/profile/hooks/useProfileData';
import { useProfileActions } from '../features/profile/hooks/useProfileActions';
import { ProfileInfo } from '../features/profile/components/ProfileInfo';
import { DeleteAccountSheet } from '../features/profile/components/DeleteAccountSheet';
import { CheckInModal } from '../features/tasks/CheckInModal';
import { PhotoSubmitModal } from '../features/tasks/PhotoSubmitModal';
import { Button } from '../components/Button';
import { Toast } from '../components/Toast';
import { useBadgeToast } from '../features/tasks/useBadgeToast';
import { ScoreModal } from '../features/matches/ScoreModal';
import { usePlayerDash } from './profile/usePlayerDash';
import { PlayerDash, PlayerDashSwitch, useWideLayout } from './profile/PlayerDashElements';
import { useProviderDash } from './profile/useProviderDash';
import { useOrganizerDash } from './profile/useOrganizerDash';
import { ProviderDash } from './profile/ProviderDashElements';
import { OrganizerDash } from './profile/OrganizerDashElements';
import { FloatingCtaStack, SubscribeSheet } from './home/HomeElements';
import { subscribeVisitorToNewsletter, useMemberNewsletter } from '../lib/newsletter';

export const Profile: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { joinedEvents } = useProfileData();
  const { updateLoading, message, actions } = useProfileActions();
  const { points: rsPoints, progress, progressLoaded, counters } = useTasks();
  const [quickAction, setQuickAction] = useState<null | 'checkin' | 'photo'>(null);
  // Floating Subscribe, as on Home: shown until the member is on the list, never over a dash.
  const newsletter = useMemberNewsletter(user?.uid, user?.email, profile?.user.name ?? '');
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const onSubscribeClick = async () => {
    if (!user?.email) { setSubscribeOpen(true); return; }
    try { await newsletter.subscribe(); } catch { setSubscribeError('Could not sign you up just now. Please try again.'); }
  };
  // Which dash replaces the profile card. Both start off, so Profile opens on the card, and only one
  // is on at a time. Their data is mounted either way, because each switch shows a count.
  const [openDash, setOpenDash] = useState<null | 'player' | 'provider' | 'organizer'>(null);
  const dashOn = openDash !== null;
  const wide = useWideLayout();
  const dash = usePlayerDash({ joinedEvents, progress, counters, rsPoints });
  const providerDash = useProviderDash();
  const organizerDash = useOrganizerDash();
  const [searchParams] = useSearchParams();
  const dashParam = searchParams.get('dash');
  // A notification link (`?dash=player|provider`) opens that dash. An effect rather than the initial
  // state, because the provider role arrives with the profile. The param stays in the URL: changing
  // it re-runs ScrollToTop.
  useEffect(() => {
    if (dashParam === 'player') setOpenDash('player');
    else if (dashParam === 'provider' && providerDash.providerId) setOpenDash('provider');
    else if (dashParam === 'organizer' && organizerDash.isOrganizer) setOpenDash('organizer');
  }, [dashParam, providerDash.providerId, organizerDash.isOrganizer]);
  // With no `?dash=`, open the dash with the most action items (a tie goes to the Player Dash).
  // The counts load from several live reads, so this re-picks for the first few seconds, then
  // stops — and stops at once on any switch tap — so acting inside a dash never swaps it away.
  const [autoDash, setAutoDash] = useState(true);
  useEffect(() => { const t = setTimeout(() => setAutoDash(false), 5000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!autoDash || dashParam) return;
    const counts = [
      { dash: 'player' as const, n: dash.count },
      { dash: 'provider' as const, n: providerDash.providerId ? providerDash.count : 0 },
      { dash: 'organizer' as const, n: organizerDash.isOrganizer ? organizerDash.count : 0 },
    ];
    const best = counts.reduce((a, b) => (b.n > a.n ? b : a));
    if (best.n > 0) setOpenDash(best.dash);
  }, [autoDash, dashParam, dash.count, providerDash.providerId, providerDash.count, organizerDash.isOrganizer, organizerDash.count]);
  const chooseDash = (d: typeof openDash) => { setAutoDash(false); setOpenDash(d); };
  const { toast: badgeToast, dismissToast } = useBadgeToast(progress, counters, progressLoaded);

  useEffect(() => { document.title = 'My Profile · Racquets & Strings'; }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  const incompleteFields = profile ? [
    !profile.user.name.trim() ? 'name' : null,
    (profile.preferences.preferred_courts?.length ?? 0) + (profile.preferences.custom_courts?.length ?? 0) === 0 ? 'preferred courts' : null,
    (profile.preferences.favourite_players?.length ?? 0) === 0 ? 'favourite players' : null,
  ].filter(Boolean) as string[] : [];

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-clay border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-fg font-semibold">Profile loading, please wait...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-clay border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-fg font-semibold">Preparing your profile...</p>
          <p className="text-fg text-sm mt-2">This can take a moment right after sign-in.</p>
        </div>
      </div>
    );
  }

  return (
    // Widens from `xl` only while the dash is on, so its three columns fit. The profile card keeps
    // the narrow column it always had.
    <div className={`${dashOn ? 'max-w-2xl xl:max-w-6xl' : 'max-w-xl'} mx-auto px-4 sm:px-6 pb-20 pt-8 space-y-4`}>
      {incompleteFields.length > 0 && (
        <div className="px-1">
          <p className="text-sm text-clay font-bold mb-1">Profile incomplete</p>
          <p className="text-sm text-clay">Please add details for: {incompleteFields.join(', ')}.</p>
        </div>
      )}

      {/* Dash switches, above the quick actions. Turning one off returns to the profile card. The
          Provider Dash only shows for members linked to a stringing or coaching provider. */}
      {/* Two per row from `sm`: with all three switches that reads as 2 + 1. Stacked on a phone,
          where two of these side by side would leave no room for the hint. */}
      <div className="max-w-xl mx-auto grid gap-2 sm:grid-cols-2">
        <PlayerDashSwitch
          on={openDash === 'player'}
          count={dash.count}
          onChange={(on) => chooseDash(on ? 'player' : null)}
        />
        {providerDash.providerId && (
          <PlayerDashSwitch
            label="Provider Dash"
            hint="Your bookings in one place."
            on={openDash === 'provider'}
            count={providerDash.count}
            onChange={(on) => chooseDash(on ? 'provider' : null)}
          />
        )}
        {organizerDash.isOrganizer && (
          <PlayerDashSwitch
            label="Organizer Dash"
            hint="Your events in one place."
            on={openDash === 'organizer'}
            count={organizerDash.count}
            onChange={(on) => chooseDash(on ? 'organizer' : null)}
          />
        )}
      </div>

      {/* Quick actions — at the very top of the page, so opening anything below never pushes the
          two things people come here to do off the screen. Hidden while the dash is on. */}
      {!dashOn && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {/* `whitespace-nowrap` is load-bearing: without it the two-word label breaks at the space
              on a narrow phone and the button grows taller than the one beside it. The row wraps
              instead, which is what flex-wrap above is for. */}
          <Button variant="white" size="sm" className="whitespace-nowrap" onClick={() => setQuickAction('checkin')}>
            <MapPin className="w-4 h-4" />Record Activity
          </Button>
          <Button variant="clay" size="sm" className="whitespace-nowrap" onClick={() => setQuickAction('photo')}>
            <Camera className="w-4 h-4" />Submit a Report
          </Button>
        </div>
      )}

      {openDash === 'player' ? (
        <PlayerDash data={dash} profile={profile} actions={actions} saving={updateLoading} wide={wide} />
      ) : openDash === 'provider' ? (
        <ProviderDash data={providerDash} wide={wide} />
      ) : openDash === 'organizer' ? (
        <OrganizerDash data={organizerDash} wide={wide} />
      ) : (
        <ProfileInfo actions={actions} updateLoading={updateLoading} message={message} progress={progress} counters={counters} />
      )}

      {quickAction === 'checkin' && <CheckInModal onClose={() => setQuickAction(null)} />}
      {quickAction === 'photo' && <PhotoSubmitModal onClose={() => setQuickAction(null)} />}

      <Toast message={badgeToast} onDismiss={dismissToast} />
      <Toast message={subscribeError} onDismiss={() => setSubscribeError(null)} placement="top" />

      {!dashOn && newsletter.subscribed === false && createPortal(<FloatingCtaStack onSubscribe={onSubscribeClick} />, document.body)}
      {subscribeOpen && (
        <SubscribeSheet onClose={() => setSubscribeOpen(false)} onSubscribe={(email) => subscribeVisitorToNewsletter(email)} />
      )}

      {/* One score sheet for the dash: submitting, and correcting a recorded score. */}
      {dash.scoring.modalProps && <ScoreModal {...dash.scoring.modalProps} />}

      {/* Site links relocated here from the removed global footer. */}
      <div className="pt-6 mt-2 border-t border-fg/5">
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-fg/70">
          <Link to="/about" className="hover:text-clay transition-colors">About Us</Link>
          <Link to="/terms" className="hover:text-clay transition-colors">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-clay transition-colors">Privacy Policy</Link>
          <ContactLink />
          <InstagramLink />
          <button type="button" onClick={() => setDeleteOpen(true)} className="hover:text-clay transition-colors">Delete account</button>
        </div>
      </div>
      {deleteOpen && <DeleteAccountSheet onClose={() => setDeleteOpen(false)} />}
    </div>
  );
};
