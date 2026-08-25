const { HttpsError } = require('firebase-functions/v2/https');

const transitions = Object.freeze({
  drop: new Set(['lead']),
  requestCompletion: new Set(['in_progress']),
  confirmYes: new Set(['in_progress']),
  confirmNo: new Set(['in_progress']),
  cancelLead: new Set(['lead']),
});

function assertBookingStatus(status, transition) {
  const allowed = transitions[transition];
  if (!allowed) throw new Error(`Unknown booking transition: ${transition}`);
  if (!allowed.has(status)) {
    throw new HttpsError('failed-precondition', `This booking cannot be changed from ${status || 'unknown'}.`);
  }
}

function assertCompletionRequested(booking) {
  assertBookingStatus(booking?.status, 'confirmYes');
  if (typeof booking?.completion_requested_at !== 'string' || !booking.completion_requested_at) {
    throw new HttpsError('failed-precondition', 'The provider has not requested completion yet.');
  }
}

module.exports = { assertBookingStatus, assertCompletionRequested };
