import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ShortcutsDialog } from './ShortcutsDialog';
import { APP_VERSION } from '../constants/appInfo';

const release = { version: '9.9.9', url: 'https://github.com/alejocarabelli/Modelador-de-Sistemas/releases/tag/v9.9.9' };

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

  it('shows the installed version and a search button at the end', () => {
    const html = renderToString(<ShortcutsDialog onClose={vi.fn()} onCheckUpdate={vi.fn()} />);

    expect(html).toContain(`Modelador de Sistemas v${APP_VERSION}`);
    expect(html).toContain('Buscar actualizaciones');
    expect(html.indexOf('Buscar actualizaciones')).toBeGreaterThan(html.indexOf('Diagrama de secuencia'));
    expect(html).not.toContain('Buscando…');
    expect(html).not.toContain('Tenés la última versión.');
  });

  it('shows the version line without a search button when no handler is given', () => {
    const html = renderToString(<ShortcutsDialog onClose={vi.fn()} />);

    expect(html).toContain(`Modelador de Sistemas v${APP_VERSION}`);
    expect(html).not.toContain('Buscar actualizaciones');
  });

  it('says a search is running and does not restart it from the button', () => {
    const html = renderToString(<ShortcutsDialog onClose={vi.fn()} onCheckUpdate={vi.fn()} updateStatus="checking" />);

    expect(html).toContain('Buscando…');
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Buscar actualizaciones<\/button>/);
  });

  it('says the search failed instead of claiming the version is the latest', () => {
    const html = renderToString(<ShortcutsDialog onClose={vi.fn()} onCheckUpdate={vi.fn()} updateStatus="error" />);

    expect(html).toContain('No se pudo consultar. Probá más tarde.');
    expect(html).not.toContain('Tenés la última versión.');
  });

  it('says the installed version is the latest after a search that found nothing', () => {
    const html = renderToString(<ShortcutsDialog onClose={vi.fn()} onCheckUpdate={vi.fn()} updateStatus="up-to-date" />);

    expect(html).toContain('Tenés la última versión.');
    expect(html).not.toContain('Hay una versión nueva');
  });

  it('names a newer release with a link that opens outside the app', () => {
    const html = renderToString(
      <ShortcutsDialog onClose={vi.fn()} onCheckUpdate={vi.fn()} update={release} updateStatus="available" />,
    );

    expect(html).toContain('Hay una versión nueva (9.9.9). ');
    expect(html).toContain(`href="${release.url}"`);
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toContain('target=');
    expect(html).not.toContain('Tenés la última versión.');
  });

  it('names a release found on open even before a search', () => {
    const html = renderToString(<ShortcutsDialog onClose={vi.fn()} update={release} />);

    expect(html).toContain('Hay una versión nueva (9.9.9). ');
  });
});
