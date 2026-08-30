import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const rules = await readFile(resolve(here, '../../firestore.rules'), 'utf8');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rands-local',
    firestore: { rules },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const dbFor = (uid) => testEnv.authenticatedContext(uid).firestore();
const anonDb = () => testEnv.unauthenticatedContext().firestore();

const seedDoc = async (path, data) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
};

describe('expanded Firestore authorization matrix', () => {
  test('court check-ins and attendance bind identity, distance, and immutable records', async () => {
    const owner = dbFor('member-a');
    const valid = {
      type: 'check-in',
      uid: 'member-a',
      court_key: 'synthetic-court',
      dist_m: 25,
      created_at: '2026-08-19T00:00:00.000Z',
    };

    await assertSucceeds(setDoc(doc(owner, 'courts/member-a_check-in'), valid));
    await assertSucceeds(
      setDoc(doc(owner, 'courts/member-a_attendance'), {
        ...valid,
        type: 'attendance',
      }),
    );
    await assertFails(setDoc(doc(owner, 'courts/member-b_check-in'), valid));
    await assertFails(setDoc(doc(owner, 'courts/member-a_far'), { ...valid, dist_m: 401 }));
    await assertFails(
      setDoc(doc(owner, 'courts/member-a_impersonated'), {
        ...valid,
        uid: 'member-b',
      }),
    );
    await assertFails(updateDoc(doc(owner, 'courts/member-a_check-in'), { dist_m: 10 }));
    await assertFails(deleteDoc(doc(owner, 'courts/member-a_check-in')));
    await assertFails(getDoc(doc(anonDb(), 'courts/member-a_check-in')));
  });

  test('court reports allow bounded approved submissions without granting mutation', async () => {
    const report = {
      type: 'condition',
      uid: 'member-a',
      court_key: 'synthetic-court',
      photo_paths: ['court_reports/member-a/report.png'],
      note: 'Dry surface',
      status: 'approved',
    };

    await assertSucceeds(setDoc(doc(dbFor('member-a'), 'courts/report-a'), report));
    await assertSucceeds(
      setDoc(doc(anonDb(), 'courts/report-anon'), {
        ...report,
        uid: 'no_account',
      }),
    );
    await assertFails(setDoc(doc(dbFor('member-b'), 'courts/report-impersonated'), report));
    await assertFails(setDoc(doc(anonDb(), 'courts/report-anon-member'), report));
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'courts/report-empty'), {
        ...report,
        note: '',
      }),
    );
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'courts/report-pending'), {
        ...report,
        status: 'pending',
      }),
    );
  });

  test('mailing-list capture validates its bounded contract and hides entries from members', async () => {
    await assertSucceeds(
      setDoc(doc(anonDb(), 'mailing_list/signup-a'), {
        email: 'member-a@example.invalid',
      }),
    );
    await assertFails(setDoc(doc(anonDb(), 'mailing_list/signup-empty'), { email: '' }));
    await assertFails(setDoc(doc(anonDb(), 'mailing_list/signup-long'), { email: 'x'.repeat(320) }));
    await assertFails(setDoc(doc(anonDb(), 'mailing_list/signup-wrong-type'), { email: 42 }));
    await assertFails(getDoc(doc(dbFor('member-a'), 'mailing_list/signup-a')));
    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'mailing_list/signup-a'), {
        email: 'changed@example.invalid',
      }),
    );
  });

  test('notifications are recipient-scoped and only read markers are client mutable', async () => {
    await seedDoc('notifications/notification-a', {
      uid: 'member-a',
      type: 'synthetic',
      title: 'Synthetic notification',
      read: false,
    });

    await assertSucceeds(getDoc(doc(dbFor('member-a'), 'notifications/notification-a')));
    await assertFails(getDoc(doc(dbFor('member-b'), 'notifications/notification-a')));
    await assertFails(getDoc(doc(anonDb(), 'notifications/notification-a')));
    await assertSucceeds(
      updateDoc(doc(dbFor('member-a'), 'notifications/notification-a'), {
        read: true,
        read_at: '2026-08-19T00:01:00.000Z',
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'notifications/notification-a'), {
        title: 'Forged title',
      }),
    );
    await assertFails(updateDoc(doc(dbFor('member-b'), 'notifications/notification-a'), { read: true }));
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'notifications/forged'), {
        uid: 'member-a',
        read: false,
      }),
    );
    await assertFails(deleteDoc(doc(dbFor('member-b'), 'notifications/notification-a')));
    await assertSucceeds(deleteDoc(doc(dbFor('member-a'), 'notifications/notification-a')));
  });

  test('offers are owner-readable and server-only writable', async () => {
    await seedDoc('offers/member-a', { uid: 'member-a', pointsSpent: 3, balance: 12 });

    await assertSucceeds(getDoc(doc(dbFor('member-a'), 'offers/member-a')));
    await assertFails(getDoc(doc(dbFor('member-b'), 'offers/member-a')));
    await assertFails(getDoc(doc(anonDb(), 'offers/member-a')));
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'offers/member-b'), {
        uid: 'member-b',
        pointsSpent: 0,
      }),
    );
    await assertFails(updateDoc(doc(dbFor('member-a'), 'offers/member-a'), { balance: 999 }));
    await assertFails(deleteDoc(doc(dbFor('member-a'), 'offers/member-a')));
  });

  test('marketplace listings bind ownership and preserve it across updates', async () => {
    const owner = dbFor('member-a');
    const listing = {
      uid: 'member-a',
      kind: 'sell',
      status: 'available',
      title: 'Synthetic racquet',
    };

    await assertSucceeds(setDoc(doc(owner, 'listings/listing-a'), listing));
    await assertFails(setDoc(doc(dbFor('member-b'), 'listings/listing-b'), listing));
    await assertFails(setDoc(doc(owner, 'listings/listing-c'), { ...listing, kind: 'gift' }));
    await assertFails(setDoc(doc(owner, 'listings/listing-d'), { ...listing, status: 'sold' }));
    await assertSucceeds(updateDoc(doc(owner, 'listings/listing-a'), { status: 'sold' }));
    await assertFails(updateDoc(doc(dbFor('member-b'), 'listings/listing-a'), { status: 'sold' }));
    await assertFails(updateDoc(doc(owner, 'listings/listing-a'), { uid: 'member-b' }));
    await assertFails(deleteDoc(doc(dbFor('member-b'), 'listings/listing-a')));
    await assertSucceeds(deleteDoc(doc(owner, 'listings/listing-a')));
    await assertSucceeds(getDoc(doc(anonDb(), 'listings/listing-a')));
  });

  test('task claims are self-authored pending intents and not self-approved', async () => {
    const claim = {
      uid: 'member-a',
      type: 'volunteer',
      status: 'pending',
      note: 'Synthetic claim',
    };

    await assertSucceeds(setDoc(doc(dbFor('member-a'), 'task_claims/claim-a'), claim));
    await assertSucceeds(getDoc(doc(dbFor('member-a'), 'task_claims/claim-a')));
    await assertFails(getDoc(doc(dbFor('member-b'), 'task_claims/claim-a')));
    await assertSucceeds(getDoc(doc(dbFor('7PvfzNtDmsOq5GLMieId7QRT7wH3'), 'task_claims/claim-a')));
    await assertSucceeds(getDocs(query(collection(dbFor('member-a'), 'task_claims'), where('uid', '==', 'member-a'))));
    await assertFails(getDocs(collection(dbFor('member-b'), 'task_claims')));
    await assertSucceeds(getDocs(collection(dbFor('7PvfzNtDmsOq5GLMieId7QRT7wH3'), 'task_claims')));
    await assertFails(setDoc(doc(dbFor('member-b'), 'task_claims/claim-b'), claim));
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'task_claims/claim-c'), {
        ...claim,
        type: 'reward',
      }),
    );
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'task_claims/claim-d'), {
        ...claim,
        status: 'approved',
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'task_claims/claim-a'), {
        status: 'approved',
      }),
    );
    await assertFails(deleteDoc(doc(dbFor('member-a'), 'task_claims/claim-a')));
    await assertFails(getDoc(doc(anonDb(), 'task_claims/claim-a')));
  });

  test('ambassador claims allow only one active inviter per invitee', async () => {
    const claimFor = (uid, userName) => ({
      uid,
      user_name: userName,
      type: 'ambassador',
      invitee_id: 'member-c',
      invitee_name: 'Member C',
      status: 'pending',
      created_at: '2026-08-23T00:00:00.000Z',
    });
    const claimRef = doc(dbFor('member-a'), 'task_claims/ambassador_member-c');

    await assertSucceeds(setDoc(claimRef, claimFor('member-a', 'Member A')));
    await assertFails(
      setDoc(doc(dbFor('member-b'), 'task_claims/ambassador_member-c'), claimFor('member-b', 'Member B')),
    );
    await assertFails(setDoc(doc(dbFor('member-b'), 'task_claims/random-id'), claimFor('member-b', 'Member B')));
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'task_claims/ambassador_member-a'), {
        ...claimFor('member-a', 'Member A'),
        invitee_id: 'member-a',
        invitee_name: 'Member A',
      }),
    );

    await assertSucceeds(
      updateDoc(doc(dbFor('7PvfzNtDmsOq5GLMieId7QRT7wH3'), 'task_claims/ambassador_member-c'), {
        status: 'rejected',
        reviewer_note: 'Synthetic rejection',
      }),
    );
    await assertSucceeds(
      setDoc(doc(dbFor('member-b'), 'task_claims/ambassador_member-c'), claimFor('member-b', 'Member B')),
    );
    await assertFails(setDoc(claimRef, claimFor('member-a', 'Member A')));
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'task_claims/ambassador_reserved'), {
        uid: 'member-a',
        type: 'volunteer',
        status: 'pending',
      }),
    );
  });

  test('group lesson rosters are public projections with server-only writes', async () => {
    await seedDoc('group_lessons/2026-08', {
      month: '2026-08',
      participants: [{ uid: 'member-a', name: 'Member A' }],
    });

    await assertSucceeds(getDoc(doc(anonDb(), 'group_lessons/2026-08')));
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'group_lessons/2026-09'), {
        month: '2026-09',
        participants: [],
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'group_lessons/2026-08'), {
        participants: [],
      }),
    );
    await assertFails(deleteDoc(doc(dbFor('member-a'), 'group_lessons/2026-08')));
  });

  test('score submission documents are no longer client-writable; official outcomes use callables', async () => {
    await seedDoc('events/event-a', {
      id: 'event-a',
      creator_id: 'organizer-a',
      title: 'Synthetic tournament',
    });
    await seedDoc('matches/official-match-a', {
      id: 'official-match-a',
      event_id: 'event-a',
      category: 'singles',
      tournament_choice: 'Singles',
      player_1_uid: 'member-a',
      player_2_uid: 'member-b',
      status: 'scheduled',
    });
    const submission = {
      category: 'score_submission',
      event_id: 'event-a',
      match_id: 'official-match-a',
      match_round: 1,
      draw_label: 'Synthetic draw',
      player_1_uid: 'member-a',
      player_2_uid: 'member-b',
      player_1_name: 'Member A',
      player_2_name: 'Member B',
      submitted_by: 'member-a',
      submitted_by_name: 'Member A',
      walkover: false,
      claimed_winner_uid: 'member-a',
      claimed_winner_name: 'Member A',
      set_1_player_1: 6,
      set_1_player_2: 4,
      set_2_player_1: 6,
      set_2_player_2: 3,
      set_3_player_1: 0,
      set_3_player_2: 0,
      created_at: '2026-08-19T00:00:00.000Z',
    };

    await assertFails(setDoc(doc(dbFor('member-a'), 'matches/submission-a'), submission));
    await assertFails(
      setDoc(doc(dbFor('outsider'), 'matches/submission-outsider'), {
        ...submission,
        submitted_by: 'outsider',
        submitted_by_name: 'Outsider',
      }),
    );
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'matches/submission-wrong-match'), {
        ...submission,
        match_id: 'missing-match',
      }),
    );
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'matches/submission-wrong-winner'), {
        ...submission,
        claimed_winner_uid: 'outsider',
        claimed_winner_name: 'Outsider',
      }),
    );
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'matches/submission-score-overflow'), {
        ...submission,
        set_1_player_1: 8,
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'matches/submission-a'), {
        status: 'resolved',
        applied_at: '2026-08-19T00:01:00.000Z',
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'matches/official-match-a'), {
        status: 'completed',
        winner_uid: 'member-a',
      }),
    );
  });
});
