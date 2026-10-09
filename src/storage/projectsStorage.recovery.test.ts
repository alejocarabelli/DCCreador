import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadProjects } from './projectsStorage';

const STORAGE_KEY = 'design-projects:v2';
const dates = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };
const validArtifact = { id: 'm', type: 'class-diagram', name: 'Clases', ...dates, content: { nodes: [], edges: [] } };

const createMemoryStorage = () => {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage;
};

const storedWith = (artifacts: unknown[]) => JSON.stringify({
  version: 2,
  projects: [{ id: 'p', name: 'Proyecto', ...dates, activeArtifactId: 'm', artifacts }],
});

describe('A2: corrupción parcial del almacenamiento', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  it('control: un almacenamiento íntegro carga sin advertencia ni suspensión', () => {
    localStorage.setItem(STORAGE_KEY, storedWith([validArtifact]));
    const loaded = loadProjects();
    expect(loaded.warning).toBeNull();
    expect(loaded.skipInitialSave).toBe(false);
  });

  it('un artefacto de tipo inválido no se descarta sin aviso ni copia de recuperación', () => {
    const unknownArtifact = { id: 'x', type: 'diagrama-de-otra-version', name: 'Futuro', ...dates, content: { nodes: [{ id: 'n1' }], edges: [] } };
    localStorage.setItem(STORAGE_KEY, storedWith([validArtifact, unknownArtifact]));

    const loaded = loadProjects();
    expect(loaded.warning).not.toBeNull();
    expect(loaded.skipInitialSave).toBe(true);
  });

  it('un diagrama cuyo nodes dejó de ser un array no se reduce sin aviso', () => {
    const broken = {
      ...validArtifact,
      content: { nodes: { n1: { id: 'n1', name: 'Cliente', attributes: [], methods: [], x: 0, y: 0 } }, edges: [] },
    };
    localStorage.setItem(STORAGE_KEY, storedWith([broken]));

    const loaded = loadProjects();
    expect(loaded.warning).not.toBeNull();
    expect(loaded.skipInitialSave).toBe(true);
  });

  it('retains the readable project and protects the original when artifacts are dropped', () => {
    const unknownArtifact = { id: 'x', type: 'diagrama-de-otra-version', name: 'Futuro', ...dates, content: { nodes: [{ id: 'n1' }], edges: [] } };
    localStorage.setItem(STORAGE_KEY, storedWith([validArtifact, unknownArtifact]));
    const loaded = loadProjects();
    expect(loaded.projects[0].artifacts.map((artifact) => artifact.id)).toEqual(['m']);
    expect(loaded.warning).not.toBeNull();
    expect(loaded.skipInitialSave).toBe(true);
  });
});

describe('content loss detection', () => {
  beforeEach(() => vi.stubGlobal('localStorage', createMemoryStorage()));

  it('keeps readable projects when another project cannot be normalized', () => {
    const healthy = JSON.parse(storedWith([validArtifact])).projects[0];
    const raw = JSON.stringify({ version: 2, projects: [healthy, null] });
    localStorage.setItem(STORAGE_KEY, raw);
    const loaded = loadProjects();
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0].name).toBe('Proyecto');
    expect(loaded.recoveryRaw).toBe(raw);
    expect(loaded.skipInitialSave).toBe(true);
  });

  it.each(['nodes', 'edges'] as const)('warns when normalization removes %s', (key) => {
    const broken = { ...validArtifact, content: { nodes: [], edges: [], [key]: key === 'nodes' ? [null] : [{ id: 'r', source: 'missing', target: 'missing' }] } };
    const raw = storedWith([broken]);
    localStorage.setItem(STORAGE_KEY, raw);
    const loaded = loadProjects();
    expect(loaded.recoveryRaw).toBe(raw);
    expect(loaded.skipInitialSave).toBe(true);
  });

  it('detects lost messages inside a malformed sequence fragment', () => {
    const sequence = { ...validArtifact, type: 'sequence-diagram', content: {
      participants: [], items: [{ kind: 'unknown-fragment', operands: [{ items: [{ kind: 'message', id: 'lost' }] }] }],
    } };
    localStorage.setItem(STORAGE_KEY, storedWith([sequence]));
    expect(loadProjects().skipInitialSave).toBe(true);
  });

  it('does not report loss for healthy populated diagrams or legacy arrays', () => {
    const nodes = ['a', 'b'].map((id) => ({ id, type: 'classNode', position: { x: 0, y: 0 }, data: { name: id, attributes: [], methods: [] } }));
    const content = { nodes, edges: [{ id: 'r', source: 'a', target: 'b' }] };
    localStorage.setItem(STORAGE_KEY, storedWith([{ ...validArtifact, content }]));
    expect(loadProjects().warning).toBeNull();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem('class-diagram-projects:v1', JSON.stringify([{ id: 'p', name: 'Anterior', ...dates, content }]));
    expect(loadProjects().warning).toBeNull();
  });
});
