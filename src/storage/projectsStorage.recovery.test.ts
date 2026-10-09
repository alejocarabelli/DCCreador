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

  it('keeps distinct class data when duplicate IDs are reassigned', () => {
    const node = { id: 'duplicate', type: 'classNode', position: { x: 0, y: 0 }, data: { name: 'Cliente', attributes: [], methods: [] } };
    localStorage.setItem(STORAGE_KEY, storedWith([{ ...validArtifact, content: {
      nodes: [node, { ...node, data: { ...node.data, attributes: [{ id: 'a', name: 'id', type: 'Integer' }] } }], edges: [],
    } }]));
    const loaded = loadProjects();
    expect(loaded).toMatchObject({ skipInitialSave: false, recoveryRaw: null, warning: null });
    const content = loaded.projects[0].artifacts[0].content;
    expect(content).toMatchObject({ nodes: [{ data: { attributes: [] } }, { data: { attributes: [{ id: 'a', name: 'id', type: 'Integer' }] } }] });
  });

  it('pairs duplicate artifact IDs by position before comparing their type and data', () => {
    localStorage.setItem(STORAGE_KEY, storedWith([
      validArtifact,
      { ...validArtifact, type: 'sequence-diagram', content: { participants: [], items: [], notes: [{
        id: 'note', text: 'Conservar', anchorKind: 'free', x: 0, y: 0, width: 160, height: 100,
      }] } },
    ]));
    expect(loadProjects()).toMatchObject({ skipInitialSave: false, recoveryRaw: null, warning: null });
  });

  it('still protects storage if a unique model reference is lost', () => {
    const raw = storedWith([{ ...validArtifact, type: 'class-sequence-diagram', content: {
      nodes: [], edges: [], linkedSequenceDiagramIds: ['missing', 'missing'],
    } }]);
    localStorage.setItem(STORAGE_KEY, raw);
    expect(loadProjects()).toMatchObject({ skipInitialSave: true, recoveryRaw: raw });
  });

  it('accepts duplicated model references when the complete link survives', () => {
    localStorage.setItem(STORAGE_KEY, storedWith([
      { ...validArtifact, type: 'class-sequence-diagram', content: { nodes: [], edges: [], linkedSequenceDiagramIds: ['seq', 'seq'] } },
      { ...validArtifact, id: 'seq', type: 'sequence-diagram', content: { participants: [], items: [], classDiagramArtifactId: 'm' } },
    ]));
    const loaded = loadProjects();
    expect(loaded).toMatchObject({ skipInitialSave: false, recoveryRaw: null, warning: null });
    expect(loaded.projects[0].artifacts[0].content).toMatchObject({ linkedSequenceDiagramIds: ['seq'] });
    expect(loaded.projects[0].artifacts[1].content).toMatchObject({ classDiagramArtifactId: 'm' });
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


describe('notebook loss detection', () => {
  beforeEach(() => vi.stubGlobal('localStorage', createMemoryStorage()));

  it.each([
    { version: 1, blocks: 'apuntes rotos' },
    { version: 1, blocks: { lost: { kind: 'text', text: 'Nota' } } },
    { version: 1, blocks: [null, { id: 't', kind: 'text', text: 'Legible' }] },
    { version: 1, blocks: [{ id: 's', kind: 'sketch', shapes: [null] }] },
    { version: 1, blocks: [{ id: 's', kind: 'sketch', shapes: 'figuras rotas' }] },
    { version: 1, blocks: [{ id: 't', kind: 'text', text: 42 }] },
  ])('protects the original when notebook content is discarded: %j', (notebook) => {
    const raw = storedWith([{ ...validArtifact, notebook }]);
    localStorage.setItem(STORAGE_KEY, raw);
    const loaded = loadProjects();
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.skipInitialSave).toBe(true);
    expect(loaded.recoveryRaw).toBe(raw);
  });

  it('keeps 601 valid figures without warning or loss', () => {
    const shapes = Array.from({ length: 601 }, (_, i) => ({ id: `s${i}`, kind: 'rect', color: 'ink', x: i, y: 0, w: 10, h: 10 }));
    const notebook = { version: 1, blocks: [{ id: 's', kind: 'sketch', height: 660, shapes }] };
    localStorage.setItem(STORAGE_KEY, storedWith([{ ...validArtifact, notebook }]));
    const loaded = loadProjects();
    expect(loaded.skipInitialSave).toBe(false);
    expect(loaded.recoveryRaw).toBeNull();
    expect(loaded.projects[0].artifacts[0].notebook).toEqual(notebook);
  });
});


describe('nested collection loss', () => {
  beforeEach(() => vi.stubGlobal('localStorage', createMemoryStorage()));

  const node = { id: 'c', type: 'classNode', position: { x: 0, y: 0 }, data: { name: 'Cliente' } };
  const note = { id: 'n', text: 'Conservar', anchorKind: 'free', x: 0, y: 0 };
  it.each([
    ['notes object', 'sequence-diagram', { participants: [], items: [], notes: { n: note } }],
    ['invalid note', 'sequence-diagram', { participants: [], items: [], notes: [note, null] }],
    ['attributes object', 'class-diagram', { nodes: [{ ...node, data: { ...node.data, attributes: { a: { id: 'a', name: 'id' } } } }], edges: [] }],
    ['methods object', 'class-diagram', { nodes: [{ ...node, data: { ...node.data, methods: { m: { id: 'm', name: 'buscar' } } } }], edges: [] }],
    ['invalid method', 'class-diagram', { nodes: [{ ...node, data: { ...node.data, methods: [null] } }], edges: [] }],
    ['nested items object', 'sequence-diagram', { participants: [], items: [{ kind: 'fragment', id: 'f', fragmentKind: 'loop', operands: [{ id: 'o', items: { m: { kind: 'message', id: 'm' } } }] }] }],
  ])('protects raw storage for %s', (_label, type, content) => {
    const raw = storedWith([{ ...validArtifact, type, content }]);
    localStorage.setItem(STORAGE_KEY, raw);
    const loaded = loadProjects();
    expect(loaded.recoveryRaw).toBe(raw);
    expect(loaded.skipInitialSave).toBe(true);
    expect(loaded.warning).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('accepts a typical 2.4.x project with absent optional collections and empty arrays', () => {
    const raw = storedWith([
      { ...validArtifact, content: { nodes: [node], edges: [] } },
      { ...validArtifact, id: 'seq', type: 'sequence-diagram', content: {
        participants: [{ id: 'p', kind: 'object', name: 'cliente', classifierName: 'Cliente', x: 0 }],
        items: [], notes: [], activations: [],
      } },
    ]);
    localStorage.setItem(STORAGE_KEY, raw);
    expect(loadProjects()).toMatchObject({ skipInitialSave: false, recoveryRaw: null, warning: null });
  });
});
