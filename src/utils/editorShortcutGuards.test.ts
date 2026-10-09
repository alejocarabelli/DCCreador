import { describe, expect, it, vi } from 'vitest';
import { hasCommandModifier, isModalOpen, isToolMenuOpen, shouldIgnoreEditorShortcut } from './editorShortcutGuards';

describe('editor shortcut guards', () => {
  it.each(['dialog[open]', '[role="dialog"][aria-modal="true"]', '[role="alertdialog"]'])('detects %s anywhere in the document', (selector) => {
    const root = { querySelector: (query: string) => query.split(', ').includes(selector) ? {} : null };
    expect(isModalOpen(root)).toBe(true);
    expect(shouldIgnoreEditorShortcut({ defaultPrevented: false }, root)).toBe(true);
  });

  it('allows shortcuts when there is no open modal', () => {
    const root = { querySelector: () => null };
    expect(isModalOpen(root)).toBe(false);
    expect(shouldIgnoreEditorShortcut({ defaultPrevented: false }, root)).toBe(false);
  });

  it('respects events already handled even after a modal closes', () => {
    const root = { querySelector: vi.fn(() => null) };
    expect(shouldIgnoreEditorShortcut({ defaultPrevented: true }, root)).toBe(true);
    expect(root.querySelector).not.toHaveBeenCalled();
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('recognizes %s as a command modifier', (modifier) => {
    expect(hasCommandModifier({ ctrlKey: false, metaKey: false, altKey: false, [modifier]: true })).toBe(true);
  });

  it('allows letters without command modifiers, including with Shift', () => {
    expect(hasCommandModifier({ ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
  });

  it('detects an open toolbar menu, which takes Escape first', () => {
    expect(isToolMenuOpen({ querySelector: (query: string) => (query === 'details.v2-menu[open]' ? {} : null) })).toBe(true);
    expect(isToolMenuOpen({ querySelector: () => null })).toBe(false);
  });
});
