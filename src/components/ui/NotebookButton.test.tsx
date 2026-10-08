import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotebookContext, type NotebookContextValue } from '../notebook/NotebookContext';
import { NotebookButton } from './Toolbar';

const render = (value?: Partial<NotebookContextValue>): string =>
  renderToStaticMarkup(
    value === undefined
      ? <NotebookButton />
      : (
        <NotebookContext.Provider value={{ available: true, isOpen: false, toggle: () => undefined, pendingCount: 0, ...value }}>
          <NotebookButton />
        </NotebookContext.Provider>
      ),
  );

describe('NotebookButton', () => {
  it('does not render without the app context (read-only window, tests)', () => {
    expect(render()).toBe('');
  });

  it('is a labelled toggle with the shortcut in its tooltip', () => {
    const open = render({ isOpen: true });
    expect(open).toContain('aria-pressed="true"');
    expect(open).toContain('is-pressed');
    expect(open).toContain('aria-label="Apuntes"');
    expect(open).toMatch(/title="Apuntes \((?:⇧⌘E|Ctrl\+Mayús\+E)\)"/);
    expect(render({ isOpen: false })).toContain('aria-pressed="false"');
  });

  it('counts pending questions in a neutral counter and names them', () => {
    const two = render({ pendingCount: 2 });
    expect(two).toContain('aria-label="Apuntes: 2 dudas pendientes"');
    expect(two).toContain('<span class="v2-count">2</span>');
    expect(two).not.toContain('has-warnings');
    expect(render({ pendingCount: 1 })).toContain('aria-label="Apuntes: 1 duda pendiente"');
    expect(render({ pendingCount: 0 })).not.toContain('v2-count');
  });
});
