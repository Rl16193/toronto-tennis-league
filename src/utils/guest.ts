// A doubles partner who is not on the app: `partner_uid` is `guest_` + a random 12-char id
// ('' still means "looking for a partner"). A guest has no users/contacts doc and is never a member.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export const guestUid = () =>
  `guest_${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => ALPHABET[b % ALPHABET.length]).join('')}`;

export const isGuest = (uid?: string | null) => !!uid && uid.startsWith('guest_');
