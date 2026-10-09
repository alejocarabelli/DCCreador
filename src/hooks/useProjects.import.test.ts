import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassDiagramArtifact, DiagramProject } from '../types/diagram';
import { createMemoryStorage, runtime, stubBrowser } from './testHookHarness';

vi.mock('react', async () => (await import('./testHookHarness')).runtime.api);
const { useProjects } = await import('../hooks/useProjects');
const { saveProjects } = await import('../storage/projectsStorage');
const { normalizeDiagramProject } = await import('../utils/diagramNormalization');
const { extractImportableProjects } = await import('../utils/projectImport');

const hookUnderTest = useProjects;
const renderHook = (): ReturnType<typeof useProjects> => {
  runtime.begin();
  return hookUnderTest();
};

const dates = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };
const artifact = (name: string): ClassDiagramArtifact => ({ ...dates, id: `${name}-art`, type: 'class-diagram', name, content: { nodes: [], edges: [] } });
const project = (id: string, artifactName: string): DiagramProject => ({
  ...dates, id, name: `Proyecto ${id}`, activeArtifactId: `${artifactName}-art`, artifacts: [artifact(artifactName)],
});

describe('A6: importar un respaldo de varios proyectos con IDs existentes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runtime.reset();
    stubBrowser();
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  it('el respaldo restaura el contenido anterior de proyectos que siguen existiendo', () => {
    saveProjects([normalizeDiagramProject(project('p1', 'Clases actuales')), normalizeDiagramProject(project('p2', 'Casos actuales'))]);
    renderHook();

    const backupFile = { version: 2, projects: [project('p1', 'Clases antiguas'), project('p2', 'Casos antiguos')] };
    const incoming = extractImportableProjects(JSON.parse(JSON.stringify(backupFile)));
    expect(incoming).not.toBeNull();

    const hook = renderHook();
    const result = hook.importProjects(incoming ?? []);
    const after = renderHook();

    const artifactNames = after.projects.flatMap((item) => item.artifacts.map((artifactItem) => artifactItem.name));
    expect(result.imported + result.recovered + result.skipped).toBe(2);
    expect(artifactNames).toContain('Clases antiguas');
  });

  it('recovers changed projects as copies', () => {
    saveProjects([normalizeDiagramProject(project('p1', 'Clases actuales')), normalizeDiagramProject(project('p2', 'Casos actuales'))]);
    renderHook();
    const incoming = extractImportableProjects({ version: 2, projects: [project('p1', 'Clases antiguas'), project('p2', 'Casos antiguos')] }) ?? [];
    const result = renderHook().importProjects(incoming);
    expect(result).toEqual({ imported: 0, recovered: 2, skipped: 0 });
  });
});

describe('project import conflicts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runtime.reset();
    stubBrowser();
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  it('skips identical content regardless of modification dates or JSON key order', () => {
    const original = normalizeDiagramProject(project('p1', 'Clases'));
    saveProjects([original]);
    renderHook();
    const same = { ...original, updatedAt: '2026-10-08', artifacts: original.artifacts.map((item) => item.type === 'class-diagram'
      ? { ...item, content: { edges: [], nodes: [] }, updatedAt: '2026-10-08' }
      : { ...item, updatedAt: '2026-10-08' }) };
    expect(renderHook().importProjects([same])).toEqual({ imported: 0, recovered: 0, skipped: 1 });
    expect(renderHook().projects).toHaveLength(1);
  });

  it('counts imports, recovered copies and skipped projects separately', () => {
    saveProjects([normalizeDiagramProject(project('p1', 'Clases')), normalizeDiagramProject(project('p2', 'Actual'))]);
    renderHook();
    const result = renderHook().importProjects([project('p1', 'Clases'), project('p2', 'Anterior'), project('p3', 'Nuevo')]);
    expect(result).toEqual({ imported: 1, recovered: 1, skipped: 1 });
    const after = renderHook().projects;
    const copy = after.find((item) => item.name === 'Proyecto p2 (recuperado)');
    expect(copy).toBeDefined();
    expect(copy?.id).not.toBe('p2');
    expect(copy?.artifacts[0].id).not.toBe('Anterior-art');
    expect(copy?.activeArtifactId).toBe(copy?.artifacts[0].id);
    expect(after.find((item) => item.id === 'p2')?.artifacts[0].name).toBe('Actual');
  });

  it('uses independent artifact ids when importing an individual project copy too', () => {
    saveProjects([normalizeDiagramProject(project('p1', 'Clases'))]);
    renderHook();
    renderHook().importProject(project('p1', 'Clases'));
    const after = renderHook().projects;
    expect(new Set(after.map((item) => item.id)).size).toBe(2);
    expect(new Set(after.flatMap((item) => item.artifacts.map((entry) => entry.id))).size).toBe(2);
  });
});
