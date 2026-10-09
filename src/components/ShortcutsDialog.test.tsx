import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ShortcutsDialog } from './ShortcutsDialog';

describe('ShortcutsDialog artifact guide', () => {
  it('offers the AI guide as a quiet line at the end when a handler is given', () => {
    const html = renderToString(<ShortcutsDialog onClose={vi.fn()} onDownloadArtifactGuide={vi.fn()} />);

    expect(html).toContain('¿Usás una IA para armar artefactos?');
    expect(html).toContain('Descargá la guía de formato (.md)');
    expect(html.indexOf('Descargá la guía')).toBeGreaterThan(html.indexOf('Diagrama de secuencia'));
  });

  it('shows nothing about the guide when no handler is given', () => {
    const html = renderToString(<ShortcutsDialog onClose={vi.fn()} />);

    expect(html).not.toContain('¿Usás una IA');
    expect(html).not.toContain('Descargá la guía');
  });
});
