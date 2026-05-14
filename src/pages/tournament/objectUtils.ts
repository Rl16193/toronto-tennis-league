export const deleteKey = <T extends Record<string, unknown>>(obj: T, key: string): T => {
  const next = { ...obj };
  delete next[key];
  return next;
};
