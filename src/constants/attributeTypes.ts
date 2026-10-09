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
 * when the new value is a suggestion (ignoring case), it keeps the capitalization
 * of what was typed before. Any other value is returned as is.
 */
export const typeInputWithTypedCase = (previous: string, next: string): string => {
  // Typing one more letter is the user's own text, not a pick from the list.
  if (next.startsWith(previous) && next.length - previous.length <= 1) return next;
  const suggestion = INLINE_ATTRIBUTE_TYPE_SUGGESTIONS.find((type) => type === next.toLowerCase());

  return suggestion === undefined ? next : suggestionWithTypedCase(previous, suggestion);
};
