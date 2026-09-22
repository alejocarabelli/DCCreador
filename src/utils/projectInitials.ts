// Connectives carry no identity: without skipping them every "Sistema de …"
// project collapsed to the same "SD" cover.
const INITIALS_STOPWORDS = new Set([
  'a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'lo', 'los',
  'o', 'para', 'por', 'u', 'un', 'una', 'y',
]);

export const projectInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  const meaningful = words.filter((word) => !INITIALS_STOPWORDS.has(word.toLocaleLowerCase()));
  const source = meaningful.length > 0 ? meaningful : words;
  if (source.length === 1) return source[0].slice(0, 2).toLocaleUpperCase();
  return `${source[0][0]}${source[source.length - 1][0]}`.toLocaleUpperCase();
};
