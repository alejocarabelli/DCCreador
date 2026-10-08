import { describe, expect, it } from 'vitest';
import { shortcutLabel } from './shortcutLabel';

describe('shortcutLabel', () => {
  it('leaves Mac hints untouched on a Mac', () => {
    expect(shortcutLabel('Rehacer (⇧⌘Z)', true)).toBe('Rehacer (⇧⌘Z)');
  });

  it('rewrites modifiers in the Windows order', () => {
    expect(shortcutLabel('⇧⌘Z', false)).toBe('Ctrl+Mayús+Z');
    expect(shortcutLabel('⌃⇧Tab', false)).toBe('Ctrl+Mayús+Tab');
    expect(shortcutLabel('⌥↑', false)).toBe('Alt+↑');
    expect(shortcutLabel('⌘1…⌘8', false)).toBe('Ctrl+1…Ctrl+8');
  });

  it('joins a modifier to the gesture that follows it', () => {
    expect(shortcutLabel('⌘ clic', false)).toBe('Ctrl+clic');
    expect(shortcutLabel('⇧ Enter guardar', false)).toBe('Mayús+Enter guardar');
  });

  it('names the Mac-only keys and keeps the surrounding text', () => {
    expect(shortcutLabel('Marcá desde dónde se toma con ⌘⇧A o en la columna Ref.', false))
      .toBe('Marcá desde dónde se toma con Ctrl+Mayús+A o en la columna Ref.');
    expect(shortcutLabel('⌘↵', false)).toBe('Ctrl+Enter');
    expect(shortcutLabel('⌫', false)).toBe('Retroceso');
    expect(shortcutLabel('usá «Desempaquetar» (Cmd+Shift+U).', false)).toBe('usá «Desempaquetar» (Ctrl+Mayús+U).');
  });
});
