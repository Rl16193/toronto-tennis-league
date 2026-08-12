import React from 'react';
import { pillButtonCls } from './ContactOpponentButton';

// Notify-only — mirrors the existing "Ask organizer to schedule" button. Clicking it just flags
// the participant doc; the organizer follows up with the player outside the app and moves them
// manually if they agree. No in-app approve/deny step.
export const RequestZoneChangeButton: React.FC<{
  requested: boolean;
  onRequest: () => void;
}> = ({ requested, onRequest }) => {
  if (requested) {
    return <span className={`${pillButtonCls('sm', 'outline')} opacity-60 pointer-events-none`}>Request sent</span>;
  }
  return (
    <button type="button" className={pillButtonCls('sm', 'outline')} onClick={onRequest}>
      Request Zone Change
    </button>
  );
};
