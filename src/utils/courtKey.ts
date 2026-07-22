// A stable, URL/doc-id-safe key for a court. Courts have no numeric id in the source CSV — the
// `dropdown` field (already the de-facto unique key used across the map code) is the input.
export const courtKey = (dropdown: string): string =>
  dropdown
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
