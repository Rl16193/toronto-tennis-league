const PRODUCTION_PROJECT = 'toronto-tennis-league';

/**
 * Email delivery policy shared by notification code and unit tests.
 * Production may deliver normally; emulators and non-production projects require an explicit
 * enable flag plus an exact recipient allowlist so staging cannot mail real users by accident.
 */
function emailDeliveryDecision({
  projectId,
  recipient,
  emulator = false,
  enabled = false,
  allowlist = [],
  productionProject = PRODUCTION_PROJECT,
}) {
  if (emulator || projectId === 'rands-local') return { deliver: false, reason: 'emulator' };
  if (!projectId) return { deliver: false, reason: 'missing-project' };
  if (projectId === productionProject) return { deliver: true, reason: 'production' };
  if (!enabled) return { deliver: false, reason: 'non-production-disabled' };
  if (!allowlist.includes(recipient)) return { deliver: false, reason: 'recipient-not-allowlisted' };
  return { deliver: true, reason: 'non-production-allowlisted' };
}

module.exports = { PRODUCTION_PROJECT, emailDeliveryDecision };
