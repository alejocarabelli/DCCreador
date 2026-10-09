import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ProjectHome } from './ProjectHome';
import type { BackupState } from '../storage/backup';
import type { DiagramProject } from '../types/diagram';
import { createExampleProject } from '../utils/exampleProject';

const backup: BackupState = { path: null, directory: null, at: null, error: null };

const renderHome = (projects: DiagramProject[]): string => renderToString(
  <ProjectHome
    backup={backup}
    backupAvailable={false}
    projects={projects}
    onCreateProject={vi.fn()}
    onExploreExample={vi.fn()}
    onImportProject={vi.fn()}
    onImportProjects={vi.fn(() => ({ imported: 0, recovered: 0, skipped: 0 }))}
    onOpenProject={vi.fn()}
    onRetryBackup={vi.fn()}
    onRevealBackups={vi.fn()}
  />,
);

describe('ProjectHome empty state', () => {
  it('welcomes a new user with the three actions in order of importance', () => {
    const html = renderHome([]);

    expect(html).toContain('Te damos la bienvenida al Modelador de Sistemas');
    const newProject = html.indexOf('Nuevo proyecto');
    const example = html.indexOf('Explorar un ejemplo');
    const importProject = html.indexOf('Importar proyecto…');
    expect(newProject).toBeGreaterThan(-1);
    expect(example).toBeGreaterThan(newProject);
    expect(importProject).toBeGreaterThan(example);
  });

  it('keeps the saved-project hint at the foot and drops the old migration text', () => {
    const html = renderHome([]);

    expect(html).toContain('¿Tenés un proyecto guardado? Importalo desde un archivo .json.');
    expect(html).not.toContain('versión anterior');
    expect(html.indexOf('Qué podés modelar')).toBeLessThan(html.indexOf('¿Tenés un proyecto guardado?'));
  });
});

describe('ProjectHome with projects', () => {
  it('offers the example next to Importar in the header', () => {
    const html = renderHome([createExampleProject()]);

    const example = html.indexOf('Explorar un ejemplo');
    expect(example).toBeGreaterThan(-1);
    expect(example).toBeLessThan(html.indexOf('Importar…'));
    expect(html.indexOf('Importar…')).toBeLessThan(html.indexOf('Nuevo proyecto'));
  });
});
