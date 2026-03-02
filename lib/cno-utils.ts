export function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function normalizeKey(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value)
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "");
}
