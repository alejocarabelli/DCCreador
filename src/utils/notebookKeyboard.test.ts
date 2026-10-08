import { describe, expect, it } from 'vitest';
import { isFromNotebook, isNotebookShortcut } from './notebookKeyboard';

const element = (insideNotebook: boolean) => ({ closest: (selector: string) => (selector === '[data-notebook]' && insideNotebook ? {} : null) });

describe('isFromNotebook', () => {
  it('is true when the event target is inside the sheet', () => {
    expect(isFromNotebook(element(true), element(false))).toBe(true);
  });

  it('is true when only the focused element is inside the sheet', () => {
    expect(isFromNotebook(null, element(true))).toBe(true);
    expect(isFromNotebook({}, element(true))).toBe(true);
  });

  it('is false for the diagram, for document and window targets, and for nothing', () => {
    expect(isFromNotebook(element(false), element(false))).toBe(false);
    expect(isFromNotebook({}, null)).toBe(false);
    expect(isFromNotebook(null, undefined)).toBe(false);
  });
});

describe('isNotebookShortcut', () => {
  const press = (init: Partial<Parameters<typeof isNotebookShortcut>[0]>) => ({
    key: 'e', code: 'KeyE', ctrlKey: false, metaKey: false, altKey: false, shiftKey: true, ...init,
  });

  it('is ⇧⌘E on Mac and Ctrl+Shift+E elsewhere', () => {
    expect(isNotebookShortcut(press({ metaKey: true, key: 'E' }), true)).toBe(true);
    expect(isNotebookShortcut(press({ ctrlKey: true, key: 'E' }), false)).toBe(true);
    expect(isNotebookShortcut(press({ ctrlKey: true }), true)).toBe(false);
    expect(isNotebookShortcut(press({ metaKey: true }), false)).toBe(false);
  });

  it('needs shift and ignores Alt and other letters', () => {
    expect(isNotebookShortcut(press({ metaKey: true, shiftKey: false }), true)).toBe(false);
    expect(isNotebookShortcut(press({ metaKey: true, altKey: true }), true)).toBe(false);
    expect(isNotebookShortcut(press({ metaKey: true, key: 'A', code: 'KeyA' }), true)).toBe(false);
  });

  it('falls back to the physical key when the layout does not produce a letter', () => {
    expect(isNotebookShortcut(press({ metaKey: true, key: 'Dead', code: 'KeyE' }), true)).toBe(true);
    expect(isNotebookShortcut(press({ metaKey: true, key: 'q', code: 'KeyE' }), true)).toBe(false);
  });
});
