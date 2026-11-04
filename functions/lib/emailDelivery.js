/**
 * Whether an email may actually be sent (same module as Racquets-And-Strings). Production delivers;
 * the emulator and any other project never do, so tests and local runs can't mail real members.
 * Helpers only (see notify.js for why).
 */
const PRODUCTION_PROJECT = 'toronto-tennis-league';

// An unknown project id delivers: production must never go silent because an env var moved.
function emailDeliveryDecision({ projectId, emulator = false }) {
  if (emulator) return { deliver: false, reason: 'emulator' };
  if (projectId && projectId !== PRODUCTION_PROJECT) return { deliver: false, reason: 'non-production' };
  return { deliver: true, reason: 'production' };
}

module.exports = { emailDeliveryDecision };
