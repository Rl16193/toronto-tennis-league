import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { logEvent } from 'firebase/analytics';
import { MotionConfig } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { analyticsPromise } from './lib/firebase';
import { Layout } from './components/Layout';

// Route-level code splitting: each page loads as its own chunk on demand,
// so the initial bundle stays small (faster first paint, esp. in-app browsers).
const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })));
const Signup = lazy(() => import('./pages/Signup').then((m) => ({ default: m.Signup })));
const Events = lazy(() => import('./pages/Events').then((m) => ({ default: m.Events })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const PlayerProfile = lazy(() => import('./pages/PlayerProfile').then((m) => ({ default: m.PlayerProfile })));
const Leagues = lazy(() => import('./pages/Leagues').then((m) => ({ default: m.Leagues })));
const Tasks = lazy(() => import('./pages/Tasks').then((m) => ({ default: m.Tasks })));
const CourtMap = lazy(() => import('./pages/CourtMap').then((m) => ({ default: m.CourtMap })));
const History = lazy(() => import('./pages/History').then((m) => ({ default: m.History })));
const Matches = lazy(() => import('./pages/Matches').then((m) => ({ default: m.Matches })));
const Notifications = lazy(() => import('./pages/Notifications').then((m) => ({ default: m.Notifications })));
const About = lazy(() => import('./pages/StaticPages').then((m) => ({ default: m.About })));
const HowItWorks = lazy(() => import('./pages/StaticPages').then((m) => ({ default: m.HowItWorks })));
const Terms = lazy(() => import('./pages/StaticPages').then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import('./pages/StaticPages').then((m) => ({ default: m.Privacy })));
const Contact = lazy(() => import('./pages/StaticPages').then((m) => ({ default: m.Contact })));

const RouteFallback: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="w-14 h-14 border-4 border-clay border-t-transparent rounded-full animate-spin" />
  </div>
);

const ScrollToTop: React.FC = () => {
  const location = useLocation();

  React.useEffect(() => {
    const { history } = window;
    const previousScrollRestoration = history.scrollRestoration;

    history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    analyticsPromise.then((analytics) => {
      if (analytics) {
        logEvent(analytics, 'page_view', {
          page_path: location.pathname,
          page_search: location.search,
          page_location: window.location.href,
        });
      }
    });

    return () => {
      history.scrollRestoration = previousScrollRestoration;
    };
  }, [location.pathname, location.search]);

  return null;
};

// The Tournament tab merged into Matches (?mode=tournament) — old /tournament?event=X links
// (History, bookmarks) still need to land on the right event, so forward the `event` param too.
const TournamentRedirect: React.FC = () => {
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event');
  const to = eventId ? `/matches?mode=tournament&event=${eventId}` : '/matches?mode=tournament';
  return <Navigate to={to} replace />;
};

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-tennis-dark">
        <div className="w-16 h-16 border-4 border-clay border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" />;
};

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <ScrollToTop />
          <Layout>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Signup />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/events" element={<Events />} />
                <Route path="/tournament" element={<PrivateRoute><TournamentRedirect /></PrivateRoute>} />
                <Route path="/leagues" element={<Leagues />} />
                <Route path="/tasks" element={<PrivateRoute><Tasks /></PrivateRoute>} />
                <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
                <Route path="/history" element={<PrivateRoute><History /></PrivateRoute>} />
                <Route path="/matches" element={<PrivateRoute><Matches /></PrivateRoute>} />
                <Route path="/friendlies" element={<Navigate to="/matches" replace />} />
                <Route path="/challenges" element={<Navigate to="/matches" replace />} />
                <Route path="/notifications" element={<PrivateRoute><Notifications /></PrivateRoute>} />
                <Route path="/players/:userId" element={<PrivateRoute><PlayerProfile /></PrivateRoute>} />
                <Route path="/courts" element={<CourtMap />} />
                <Route path="/about" element={<About />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Suspense>
          </Layout>
        </Router>
      </AuthProvider>
    </ThemeProvider>
    </MotionConfig>
  );
}
