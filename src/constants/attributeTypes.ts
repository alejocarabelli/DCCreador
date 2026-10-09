export const ATTRIBUTE_TYPES = ['string', 'int', 'number', 'boolean', 'date', 'datetime', 'void', 'custom'] as const;

export const INLINE_ATTRIBUTE_TYPE_SUGGESTIONS = ['string', 'int', 'number', 'boolean', 'date', 'datetime', 'void'] as const;

/**
 * A suggestion takes the capitalization of the first letter the user typed:
 * "Str" → "String", "str" → "string". The app never changes what the user writes.
 */
export const suggestionWithTypedCase = (typed: string, suggestion: string): string => {
  const firstTyped = typed.trimStart().charAt(0);

  if (firstTyped === '' || firstTyped === firstTyped.toLowerCase()) {
    return suggestion;
  }

  return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
};

/**
 * For a native suggestion list, which replaces the whole value on selection:
 * when the new value is an exact lowercase suggestion, it keeps the capitalization
 * of what was typed before. Any other value, including anything with a capital, is returned as is.
 */
export const typeInputWithTypedCase = (previous: string, next: string): string => {
  // Typing one more letter is the user's own text, not a pick from the list.
  if (next.startsWith(previous) && next.length - previous.length <= 1) return next;
  // Any capital letter makes the value the user's own text, as written.
  if (next !== next.toLowerCase()) return next;
  // Only an exact lowercase suggestion can come from picking the list.
  const suggestion = INLINE_ATTRIBUTE_TYPE_SUGGESTIONS.find((type) => type === next);
  if (suggestion === undefined) return next;
  // The same word already typed in capitals: the lowercase pick is taken as is.
  if (previous.toLowerCase() === suggestion) return suggestion;

  return suggestionWithTypedCase(previous, suggestion);
};
