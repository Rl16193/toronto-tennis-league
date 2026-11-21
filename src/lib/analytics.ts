import { logEvent, setDefaultEventParameters, setUserId, setUserProperties } from 'firebase/analytics';
import { analyticsPromise } from './firebase';

// `?internal=1` once marks this device as the team's own (GA's Internal Traffic filter
// matches traffic_type); `?internal=0` clears it. Runs before analytics initialises.
try {
  const flag = new URLSearchParams(window.location.search).get('internal');
  if (flag === '1') localStorage.setItem('ga_internal', '1');
  if (flag === '0') localStorage.removeItem('ga_internal');
  if (localStorage.getItem('ga_internal') === '1') setDefaultEventParameters({ traffic_type: 'internal' });
} catch { /* storage blocked: count as a normal visitor */ }

/** One stable GA page name and content group per route. Never a member's name or uid. */
const PAGES: [RegExp, string, string][] = [
  [/^\/$/, 'Home', 'Home'],
  [/^\/(login|signup)$/, 'Sign In', 'Account'],
  [/^\/events$/, 'Events', 'Community'],
  [/^\/leagues$/, 'Leaderboard', 'Play'],
  [/^\/(matches|tournament|friendlies|challenges)$/, 'Matches', 'Play'],
  [/^\/history$/, 'History', 'Play'],
  [/^\/tasks$/, 'Tasks', 'Community'],
  [/^\/profile$/, 'My Profile', 'Account'],
  [/^\/notifications$/, 'Notifications', 'Account'],
  [/^\/players\/[^/]+$/, 'Player Profile', 'Play'],
  [/^\/marketplace$/, 'Marketplace', 'Market'],
  [/^\/courts$/, 'Court Finder', 'Courts'],
  [/^\/newsletter$/, 'Served Up', 'Community'],
  [/^\/newsletter\/[^/]+$/, 'Served Up Issue', 'Community'],
  [/^\/newsletter\/[^/]+\/[^/]+$/, 'Served Up Article', 'Community'],
  [/^\/about$/, 'About Us', 'Info'],
  [/^\/(how-it-works|terms|privacy|contact)$/, 'Info Page', 'Info'],
];

const VIEW_NAMES: Record<string, string> = {
  tournament: 'Tournament', challenges: 'Challenges', rallies: 'Rallies', friendlies: 'Rallies',
  player: 'Player Dash', provider: 'Provider Dash', organizer: 'Organizer Dash',
};

export const pageInfo = (pathname: string, search: string) => {
  const path = pathname.replace(/^\/players\/[^/]+/, '/players/:id');
  const hit = PAGES.find(([re]) => re.test(pathname));
  const params = new URLSearchParams(search);
  const view = VIEW_NAMES[params.get('mode') ?? params.get('dash') ?? ''];
  const name = hit ? hit[1] : 'Not Found';
  return {
    page_title: pathname === '/matches' && view ? view : pathname === '/profile' && view ? view : name,
    page_path: path,
    page_location: `${window.location.origin}${path}${search}`,
    content_group: hit ? hit[2] : 'Other',
  };
};

/** Name the page for every later event too (scrolls, engagement), then log the view. */
export const trackPageView = (pathname: string, search: string) =>
  analyticsPromise.then((analytics) => {
    if (!analytics) return;
    const page = pageInfo(pathname, search);
    setDefaultEventParameters(page);
    logEvent(analytics, 'page_view', page);
  });

/** Fire a GA4 event once analytics is ready (no-op if unsupported). */
export const track = (name: string, params?: Record<string, any>) =>
  analyticsPromise.then((analytics) => {
    if (analytics) logEvent(analytics, name, params);
  });

/**
 * Set GA4 User-ID after authentication and, optionally, non-PII user
 * properties. Uses the User-ID API only — never register the UID as a property.
 */
export const setAnalyticsUser = (uid: string, props?: Record<string, any>) =>
  analyticsPromise.then((analytics) => {
    if (!analytics) return;
    setUserId(analytics, uid);
    if (props) setUserProperties(analytics, props);
  });

/** Clear GA4 User-ID at logout. */
export const clearAnalyticsUser = () =>
  analyticsPromise.then((analytics) => {
    if (analytics) setUserId(analytics, null);
  });
