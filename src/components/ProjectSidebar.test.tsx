import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ProjectSidebar } from './ProjectSidebar';
import { APP_VERSION } from '../constants/appInfo';

const release = { version: '9.9.9', url: 'https://github.com/alejocarabelli/Modelador-de-Sistemas/releases/tag/v9.9.9' };

const render = (overrides: Partial<Parameters<typeof ProjectSidebar>[0]> = {}) => {
  const handler = vi.fn();
  return renderToString(
    <ProjectSidebar
      activeArtifactId={null}
      activeProjectId={null}
      isCollapsed={false}
      isHome
      onCreateArtifact={handler}
      onCreateProject={handler}
      onDeleteArtifact={handler}
      onDeleteProject={handler}
      onExportArtifact={handler}
      onExportProject={handler}
      onImportArtifact={handler}
      onMoveArtifact={handler}
      onOpenHome={handler}
      onOpenShortcuts={handler}
      onRenameArtifact={handler}
      onRenameProject={handler}
      onSelectArtifact={handler}
      onSelectProject={handler}
      onThemePreferenceChange={handler}
      onToggleCollapsed={handler}
      projects={[]}
      themePreference="system"
      {...overrides}
    />,
  );
};

describe('ProjectSidebar version and update notice', () => {
  it('shows the installed version in the expanded footer', () => {
    const html = render();

    expect(html).toContain(`v${APP_VERSION}`);
    expect(html).toContain('title="Versión instalada"');
    expect(html).not.toContain('Hay una versión nueva');
  });

  it('shows no version when the sidebar is collapsed', () => {
    const html = render({ isCollapsed: true });

    expect(html).not.toContain('Versión instalada');
    expect(html).not.toContain(`v${APP_VERSION}`);
  });

  it('announces a newer release above the footer controls, with a link out and a hide button', () => {
    const html = render({ update: release, onDismissUpdate: vi.fn() });

    expect(html).toContain('Hay una versión nueva (9.9.9)');
    expect(html).toContain(`href="${release.url}"`);
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toContain('target=');
    expect(html).toContain('title="Ocultar"');
    expect(html.indexOf('Hay una versión nueva')).toBeLessThan(html.indexOf('v2-sidebar-footer"'));
  });

  it('marks the collapsed rail with a dot instead of a banner', () => {
    const html = render({ isCollapsed: true, update: release });

    expect(html).toContain('title="Hay una versión nueva (9.9.9)"');
    expect(html).not.toContain('Descargar');
  });

  it('shows no notice and no dot when there is no release to announce', () => {
    expect(render({ isCollapsed: true, update: null })).not.toContain('v2-update-dot');
    expect(render({ update: null })).not.toContain('v2-sidebar-update');
  });
});
