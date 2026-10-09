import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectBackupWarning } from './ProjectBackupWarning';

describe('backup warning in an open project', () => {
  it('shows the backup failure even if local changes are saved, with both recovery actions', () => {
    const html = renderToStaticMarkup(<ProjectBackupWarning error="internal-path:code" saveStatus="saved" onRetry={() => undefined} onExport={() => undefined} />);
    expect(html).toContain('No se pudo guardar la copia en disco');
    expect(html).toContain('Los cambios están guardados en este dispositivo');
    expect(html).toContain('Reintentar respaldo');
    expect(html).toContain('Exportar proyecto');
    expect(html).not.toContain('internal-path:code');
  });

  it('does not promise local saving when that save also failed', () => {
    const html = renderToStaticMarkup(<ProjectBackupWarning error="failed" saveStatus="error" onRetry={() => undefined} onExport={() => undefined} />);
    expect(html).not.toContain('Los cambios están guardados');
    expect(html).toContain('Exportá el proyecto');
  });

  it('hides the notice when the backup error is cleared', () => {
    expect(renderToStaticMarkup(<ProjectBackupWarning error={null} saveStatus="saved" onRetry={() => undefined} onExport={() => undefined} />)).toBe('');
  });

  it('connects retry and export to the supplied project actions', () => {
    const onRetry = vi.fn();
    const onExport = vi.fn();
    const element = ProjectBackupWarning({ error: 'failed', saveStatus: 'saved', onRetry, onExport });
    const children = element?.props.children as ReactElement<{ onClick: () => void }>[];
    children[1].props.onClick();
    children[2].props.onClick();
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledOnce();
  });
});
