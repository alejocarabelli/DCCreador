/** Anything that exposes `closest`, so the core can be tested without a DOM. */
type ClosestLike = { closest?: (selector: string) => unknown } | null | undefined;

const NOTEBOOK_SELECTOR = '[data-notebook]';

const isInside = (node: unknown): boolean => {
  const candidate = node as ClosestLike;
  return typeof candidate?.closest === 'function' && Boolean(candidate.closest(NOTEBOOK_SELECTOR));
};

/** Pure core of `isNotebookEvent`: the event target or the focused element is inside the sheet. */
export const isFromNotebook = (target: unknown, activeElement: unknown): boolean => isInside(target) || isInside(activeElement);

/**
 * True for key events that belong to the Apuntes sheet. The sheet is not an
 * input (its sketch is an SVG), so the editors' document/window key handlers
 * would otherwise act on the diagram: ⌘Z undoing it, Backspace deleting its
 * selection, letters toggling the sequence keyboard mode.
 */
export const isNotebookEvent = (event: Event): boolean =>
  isFromNotebook(event.target, typeof document === 'undefined' ? null : document.activeElement);

type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/** ⇧⌘E on Mac, Ctrl+Shift+E elsewhere (⇧⌘A is the flow editor's alternative path). */
export const isNotebookShortcut = (event: ShortcutEvent, isMac: boolean): boolean => {
  if (!event.shiftKey || event.altKey) return false;
  if (!(isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return false;
  return event.key.toLowerCase() === 'e' || (event.code === 'KeyE' && !/^[a-z]$/i.test(event.key));
};
