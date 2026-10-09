import { describe, expect, it, vi } from 'vitest';
import { importProjectFiles, projectImportFeedback } from './projectBackupImport';
import { normalizeDiagramProject } from './diagramNormalization';
import { copyProject } from './projectRecovery';
import type { DiagramProject, UseCaseFlowArtifact } from '../types/diagram';

const project = normalizeDiagramProject({ id: 'p', name: 'Proyecto', content: { nodes: [], edges: [] } });
const file = (value: unknown): Pick<File, 'text'> => ({ text: async () => JSON.stringify(value) });

describe('backup file import', () => {
  it('imports a one-project backup through the conflict-aware batch path', async () => {
    const individual = vi.fn();
    const batch = vi.fn(() => ({ imported: 0, recovered: 1, skipped: 0 }));
    const result = await importProjectFiles([file({ version: 2, projects: [project] })], individual, batch);
    expect(individual).not.toHaveBeenCalled();
    expect(batch).toHaveBeenCalledWith([project]);
    expect(result.recovered).toBe(1);
  });

  it('retains the individual project import behavior', async () => {
    const individual = vi.fn();
    const batch = vi.fn();
    expect(await importProjectFiles([file(project)], individual, batch)).toEqual({ imported: 1, recovered: 0, skipped: 0, unreadable: 0 });
    expect(individual).toHaveBeenCalledWith(project);
    expect(batch).not.toHaveBeenCalled();
  });

  it('counts unreadable files even if every valid project was skipped', async () => {
    const batch = vi.fn(() => ({ imported: 0, recovered: 0, skipped: 1 }));
    const result = await importProjectFiles([file(project), { text: async () => '{bad' }, { text: async () => { throw new Error('unreadable'); } }], vi.fn(), batch);
    expect(result).toEqual({ imported: 0, recovered: 0, skipped: 1, unreadable: 2 });
    const feedback = projectImportFeedback(result);
    expect(feedback.tone).toBe('error');
    expect(feedback.message).toContain('2 archivos ilegibles');
    expect(feedback.message).toContain('1 omitido por ser idéntico');
  });

  it('reports partial imports with every count and an error tone', async () => {
    const result = await importProjectFiles([file([project, project]), file({ unrelated: true })], vi.fn(), () => ({ imported: 1, recovered: 1, skipped: 0 }));
    expect(projectImportFeedback(result)).toEqual({ tone: 'error', message: '1 proyecto importado; 1 recuperado como copia; 0 omitidos por ser idénticos; 1 archivo ilegible.' });
  });

  it('reports wholly unreadable files without calling an importer', async () => {
    const batch = vi.fn();
    const result = await importProjectFiles([file({ unrelated: true })], vi.fn(), batch);
    expect(result.unreadable).toBe(1);
    expect(batch).not.toHaveBeenCalled();
    expect(projectImportFeedback(result).tone).toBe('error');
  });
});

describe('recovered copy links', () => {
  it('remaps cross-artifact references into the independent copy', () => {
    const original = normalizeDiagramProject({
      ...project,
      artifacts: [project.artifacts[0], {
        id: 'flow', type: 'use-case-flow', name: 'Flujo', createdAt: '', updatedAt: '',
        content: { classDiagramArtifactId: project.artifacts[0].id },
      }] as DiagramProject['artifacts'],
      activeArtifactId: 'flow',
    });
    const copy = copyProject(original, `${original.name} (recuperado)`);
    const model = copy.artifacts[0];
    const flow = copy.artifacts[1] as UseCaseFlowArtifact;
    expect(flow.content.classDiagramArtifactId).toBe(model.id);
    expect(flow.id).not.toBe('flow');
    expect(model.id).not.toBe(original.artifacts[0].id);
    expect(copy.activeArtifactId).toBe(flow.id);
    expect(original.artifacts[1].id).toBe('flow');
  });
});
