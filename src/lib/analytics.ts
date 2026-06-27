import { logEvent, setUserId, setUserProperties } from 'firebase/analytics';
import { analyticsPromise } from './firebase';

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
