import { MAX_TEXT_LENGTH } from '../../utils/artifactNotebook';

export const TEXT_LIMIT_HINT = 'Llegaste al máximo de texto. Podés seguir en otro bloque.';
export const TEXT_PASTE_HINT = 'Se pegó hasta el máximo de texto. El resto no se agregó.';

export const limitTextChange = (previous: string, next: string): string =>
  next.length > Math.max(MAX_TEXT_LENGTH, previous.length) ? previous : next;

export const limitTextPaste = (value: string, start: number, end: number, pasted: string) => {
  const available = Math.max(0, MAX_TEXT_LENGTH - (value.length - (end - start)));
  let inserted = pasted.slice(0, available);
  // Do not cut a Unicode surrogate pair at the boundary.
  if (inserted.length < pasted.length && /[\uD800-\uDBFF]$/.test(inserted)) inserted = inserted.slice(0, -1);
  return {
    value: value.slice(0, start) + inserted + value.slice(end),
    caret: start + inserted.length,
    truncated: inserted.length < pasted.length,
  };
};
