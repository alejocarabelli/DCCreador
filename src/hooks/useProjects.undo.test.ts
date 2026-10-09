import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ClassMethod,
  ClassSequenceDiagramArtifact,
  ClassSequenceDiagramContent,
  DesignArtifact,
  DiagramProject,
  SequenceDiagramArtifact,
  SequenceDiagramContent,
} from '../types/diagram';
import appSource from '../App.tsx?raw';
import { createMemoryStorage, runtime, stubBrowser } from './testHookHarness';

vi.mock('react', async () => (await import('./testHookHarness')).runtime.api);
const { useProjects } = await import('./useProjects');
const { saveProjects } = await import('../storage/projectsStorage');
const { normalizeClassSequenceDiagramContent, normalizeDiagramProject } = await import('../utils/diagramNormalization');
const { createEmptySequenceDiagramContent, createSequenceMessage } = await import('../utils/sequenceDiagram');

const hookUnderTest = useProjects;
const renderHook = (): ReturnType<typeof useProjects> => {
  runtime.begin();
  return hookUnderTest();
};

type Hook = { current: () => ReturnType<typeof useProjects> };

const OLD = '2026-01-02T00:00:00.000Z';
const dates = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: OLD };

// Class "Cliente" with method "buscar" (ids c1 / m1), linked to sequence "seq".
const method: ClassMethod = { id: 'm1', visibility: '+', name: 'buscar', parameters: '', returnType: '' };
const modelContent = (): ClassSequenceDiagramContent => normalizeClassSequenceDiagramContent({
  nodes: [{
    id: 'c1', type: 'classNode', position: { x: 0, y: 0 },
    data: { name: 'Cliente', attributes: [], methods: [method] },
  }],
  edges: [],
  linkedSequenceDiagramIds: ['seq'],
});

const model: ClassSequenceDiagramArtifact = {
  ...dates, id: 'model', type: 'class-sequence-diagram', name: 'Clases de secuencias', content: modelContent(),
};

// Sequence linked to the model: p1 is Cliente (c1); the message p2 -> p1 is buscar (m1).
const sequenceContent = (): SequenceDiagramContent => ({
  ...createEmptySequenceDiagramContent(),
  classDiagramArtifactId: 'model',
  participants: [
    { id: 'p1', kind: 'object', name: '', classifierName: 'Cliente', classifierNodeId: 'c1', x: 0 },
    { id: 'p2', kind: 'object', name: '', classifierName: 'Pedido', x: 300 },
  ],
  items: [{ ...createSequenceMessage('synchronous', 'p2', 'p1'), name: 'buscar', operationMethodId: 'm1' }],
});

const sequence: SequenceDiagramArtifact = {
  ...dates, id: 'seq', type: 'sequence-diagram', name: 'Alta de pedido', content: sequenceContent(),
};

const seed = (): DiagramProject => ({
  ...dates, id: 'p', name: 'Proyecto', activeArtifactId: 'seq', artifacts: [model, sequence] as DesignArtifact[],
});

const mount = (): Hook => {
  saveProjects([normalizeDiagramProject(seed())]);
  renderHook();
  return { current: renderHook };
};

const artifactOf = (hook: Hook, id: string): DesignArtifact =>
  hook.current().projects[0].artifacts.find((artifact) => artifact.id === id)!;
const sequenceOf = (hook: Hook): SequenceDiagramContent => (artifactOf(hook, 'seq') as SequenceDiagramArtifact).content;
const modelOf = (hook: Hook): ClassSequenceDiagramContent => (artifactOf(hook, 'model') as ClassSequenceDiagramArtifact).content;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// An ordinary edit: moves p2 in the sequence, as dragging does.
const moveP2 = (hook: Hook, x: number): void => {
  const content = sequenceOf(hook);
  hook.current().updateProjectArtifactContent('p', 'seq', {
    ...clone(content),
    participants: content.participants.map((participant) => (participant.id === 'p2' ? { ...participant, x } : participant)),
  }, { alreadyNormalized: true });
};

// Renames the class and its method in "Clases de secuencias" (propagates to the linked sequence).
const renameInModel = (hook: Hook): void => {
  const content = modelOf(hook);
  hook.current().updateProjectArtifactContent('p', 'model', {
    ...clone(content),
    nodes: content.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        name: 'Socio',
        methods: node.data.methods.map((candidate) => ({ ...candidate, name: 'consultar' })),
      },
    })),
  }, { alreadyNormalized: true });
};

describe('B3: deshacer y rehacer en una secuencia vinculada', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runtime.reset();
    stubBrowser();
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    runtime.reset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('deshacer un movimiento después de un renombre conserva los nombres del modelo', () => {
    const hook = mount();
    // App keeps the content before a change as history.
    const historyEntry = clone(sequenceOf(hook));
    moveP2(hook, 420);
    renameInModel(hook);

    // Precondition: the rename reached the sequence before the undo.
    expect(sequenceOf(hook).participants[0]).toMatchObject({ classifierName: 'Socio', classifierNodeId: 'c1' });
    expect(sequenceOf(hook).items[0]).toMatchObject({ name: 'consultar', operationMethodId: 'm1' });

    // App.handleUndo replays the history entry.
    hook.current().updateProjectArtifactContent('p', 'seq', clone(historyEntry), { alreadyNormalized: true, fromHistory: true });

    expect(sequenceOf(hook).participants[1].x).toBe(300);
    expect(sequenceOf(hook).participants[0]).toMatchObject({ classifierName: 'Socio', classifierNodeId: 'c1' });
    expect(sequenceOf(hook).items[0]).toMatchObject({ name: 'consultar', operationMethodId: 'm1' });
  });

  it('rehacer después de un renombre no vuelve a poner los nombres anteriores', () => {
    const hook = mount();
    const historyEntry = clone(sequenceOf(hook));
    moveP2(hook, 420);
    // App keeps the undone content as the redo entry, with the names it had then.
    const redoEntry = clone(sequenceOf(hook));

    // Undo before the rename: the moved content goes to "future" with the old names.
    hook.current().updateProjectArtifactContent('p', 'seq', clone(historyEntry), { alreadyNormalized: true, fromHistory: true });
    renameInModel(hook);

    // Precondition: the redo entry still carries the old names.
    expect(redoEntry.participants[0]).toMatchObject({ classifierName: 'Cliente' });
    expect(redoEntry.items[0]).toMatchObject({ name: 'buscar' });

    // App.handleRedo replays the redo entry.
    hook.current().updateProjectArtifactContent('p', 'seq', clone(redoEntry), { alreadyNormalized: true, fromHistory: true });

    expect(sequenceOf(hook).participants[1].x).toBe(420);
    expect(sequenceOf(hook).participants[0]).toMatchObject({ classifierName: 'Socio', classifierNodeId: 'c1' });
    expect(sequenceOf(hook).items[0]).toMatchObject({ name: 'consultar', operationMethodId: 'm1' });
  });

  it('deshacer y rehacer un movimiento conserva argumentos embebidos y etiquetas personalizadas', () => {
    const hook = mount();
    const content = clone(sequenceOf(hook));
    content.participants[0].classifierName = 'Cliente VIP';
    content.items[0] = { ...content.items[0], name: 'buscar(id)', arguments: '' } as typeof content.items[0];
    hook.current().updateProjectArtifactContent('p', 'seq', content, { alreadyNormalized: true });
    const history = clone(sequenceOf(hook));
    moveP2(hook, 420);
    const redo = clone(sequenceOf(hook));
    hook.current().updateProjectArtifactContent('p', 'seq', history, { alreadyNormalized: true, fromHistory: true });
    expect(sequenceOf(hook)).toEqual(history);
    hook.current().updateProjectArtifactContent('p', 'seq', redo, { alreadyNormalized: true, fromHistory: true });
    expect(sequenceOf(hook)).toEqual(redo);
  });

  it('un renombre real al restaurar conserva argumentos y texto personalizado', () => {
    const hook = mount();
    const content = clone(sequenceOf(hook));
    content.participants[0].classifierName = 'Cliente VIP';
    content.items[0] = { ...content.items[0], name: 'buscar(id)', arguments: '' } as typeof content.items[0];
    hook.current().updateProjectArtifactContent('p', 'seq', content, { alreadyNormalized: true });
    const history = clone(sequenceOf(hook));
    moveP2(hook, 420);
    renameInModel(hook);
    expect(sequenceOf(hook).items[0]).toMatchObject({ name: 'consultar(id)', arguments: '' });
    hook.current().updateProjectArtifactContent('p', 'seq', history, { alreadyNormalized: true, fromHistory: true });
    expect(sequenceOf(hook).participants[0].classifierName).toBe('Cliente VIP');
    expect(sequenceOf(hook).items[0]).toMatchObject({ name: 'consultar(id)', arguments: '' });
  });

  it('una edición normal conserva el texto de un participante vinculado', () => {
    const hook = mount();
    const content = sequenceOf(hook);
    // A label typed while linked may read another name on purpose.
    hook.current().updateProjectArtifactContent('p', 'seq', {
      ...clone(content),
      participants: content.participants.map((participant) => (participant.id === 'p1' ? { ...participant, classifierName: 'Cliente VIP' } : participant)),
    }, { alreadyNormalized: true });

    moveP2(hook, 420);

    expect(sequenceOf(hook).participants[0]).toMatchObject({ classifierName: 'Cliente VIP', classifierNodeId: 'c1' });
  });

  it('deshacer y rehacer un renombre en Clases de secuencias lleva los nombres a la secuencia', () => {
    const hook = mount();
    const modelBefore = clone(modelOf(hook));
    renameInModel(hook);
    const modelRenamed = clone(modelOf(hook));
    expect(sequenceOf(hook).participants[0]).toMatchObject({ classifierName: 'Socio' });

    // The model's undo and redo are plain content updates: the renames are carried by their diff.
    hook.current().updateProjectArtifactContent('p', 'model', clone(modelBefore), { alreadyNormalized: true });
    expect(sequenceOf(hook).participants[0]).toMatchObject({ classifierName: 'Cliente', classifierNodeId: 'c1' });
    expect(sequenceOf(hook).items[0]).toMatchObject({ name: 'buscar', operationMethodId: 'm1' });

    hook.current().updateProjectArtifactContent('p', 'model', clone(modelRenamed), { alreadyNormalized: true });
    expect(sequenceOf(hook).participants[0]).toMatchObject({ classifierName: 'Socio', classifierNodeId: 'c1' });
    expect(sequenceOf(hook).items[0]).toMatchObject({ name: 'consultar', operationMethodId: 'm1' });
  });

  it('App pide la restauración con fromHistory en deshacer y en rehacer', () => {
    expect(appSource).toMatch(/cloneContentForType\(activeArtifact\.type, previousContent\), \{ alreadyNormalized: true, fromHistory: true \}\)/);
    expect(appSource).toMatch(/cloneContentForType\(activeArtifact\.type, nextContent\), \{ alreadyNormalized: true, fromHistory: true \}\)/);
  });
});
