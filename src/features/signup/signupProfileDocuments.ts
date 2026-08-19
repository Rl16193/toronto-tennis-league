export type SignupProfileInput = {
  uid: string;
  email: string;
  name: string;
  phone: string;
  skillLevel: number;
  league: '' | "Men's" | "Women's";
  retiredPro: boolean;
  juniors: boolean;
  preferredCourts: string[];
  preferredZone: string;
  schedulingPreference: 'I will schedule matches on my own' | 'Tell me more about matchdays';
};

export const buildSignupProfileDocuments = (input: SignupProfileInput, now: string) => {
  const ageCategory = input.retiredPro ? ' Retired Pro' : input.juniors ? ' Juniors' : '';
  const leagueValue = input.league ? `${input.league}${ageCategory}` : '';
  return {
    user: { name: input.name },
    contact: {
      email: input.email,
      phone: input.phone,
      contactable: !!input.phone,
      updated_at: now,
    },
    stats: {
      name: input.name,
      skill_level: input.skillLevel,
      ...(leagueValue ? { league: leagueValue } : {}),
    },
    preferences: {
      preferred_courts: input.preferredCourts,
      preferred_zone: input.preferredZone,
      scheduling_preference: input.schedulingPreference,
    },
  };
};
