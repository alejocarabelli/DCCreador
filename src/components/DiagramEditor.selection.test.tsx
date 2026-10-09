import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { shortcutLabel } from '../utils/shortcutLabel';
import { MULTI_SELECT_HINT, MultiSelectionInspector } from './DiagramEditor';

const render = (count: number, collapsed = false): string => renderToString(
  <MultiSelectionInspector collapsed={collapsed} count={count} onDelete={vi.fn()} onToggleCollapsed={vi.fn()} />,
);

describe('multi-selection inspector', () => {
  it('names how many elements are selected and how to move them together', () => {
    const html = render(3);
    expect(html).toContain('3 elementos seleccionados');
    expect(html).toContain('Arrastrá cualquiera para moverlos juntos.');
  });

  it('deletes the whole selection with one button, not a single class', () => {
    const html = render(2);
    expect(html).toContain('aria-label="Eliminar 2 elementos"');
    expect(html).not.toContain('Eliminar clase');
  });

  it('folds to the rail without its body or its delete button', () => {
    const html = render(2, true);
    expect(html).not.toContain('Arrastrá cualquiera');
    expect(html).not.toContain('Eliminar 2 elementos');
  });
});

describe('multi-selection hint', () => {
  it('reads ⌘ clic as Ctrl+clic on Windows and keeps the Mac wording', () => {
    expect(shortcutLabel(MULTI_SELECT_HINT, false))
      .toBe('Consejo: con Mayús+clic o Ctrl+clic sumás elementos a la selección.');
    expect(shortcutLabel(MULTI_SELECT_HINT, true)).toBe(MULTI_SELECT_HINT);
  });
});
