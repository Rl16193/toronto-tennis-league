export type EventParticipantWrite = {
  uid: string;
  user_name: string;
  event_id: string;
  event_name: string;
  tournament_choice: string;
  doubles: string;
  partner_in_app: string;
  skill: number;
  dateselected: string[];
  created_at: string;
  division?: string;
  skill_group?: string;
  partner_uid?: string;
};

/**
 * Keep participant document shape in one place. Optional fields are omitted rather than written
 * as undefined because Firestore treats the two shapes differently during field validation.
 */
export const buildEventParticipantData = (input: EventParticipantWrite) => ({
  uid: input.uid,
  user_name: input.user_name,
  event_id: input.event_id,
  event_name: input.event_name,
  tournament_choice: input.tournament_choice,
  doubles: input.doubles,
  partner_in_app: input.partner_in_app,
  skill: input.skill,
  dateselected: input.dateselected,
  created_at: input.created_at,
  ...(input.division !== undefined ? { division: input.division } : {}),
  ...(input.skill_group !== undefined ? { skill_group: input.skill_group } : {}),
  ...(input.partner_uid !== undefined ? { partner_uid: input.partner_uid } : {}),
});
