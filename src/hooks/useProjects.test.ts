import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtifactNotebook, ClassDiagramArtifact, ClassSequenceDiagramArtifact, DesignArtifact, DiagramProject } from '../types/diagram';
import appSource from '../App.tsx?raw';
import { saveProjects } from '../storage/projectsStorage';
import { changeHistory, undoHistory } from '../utils/artifactHistory';
import { normalizeDiagramProject } from '../utils/diagramNormalization';
import { sampleNotebook } from '../utils/notebookTestData';

// The repo has no DOM renderer, so React hooks are replaced by a tiny slot-based
// runtime: enough to run the real useProjects code paths and read the result.
const runtime = vi.hoisted(() => {
  const slots: unknown[] = [];
  const state = { index: 0 };
  const sameDeps = (a: unknown[] | undefined, b: unknown[] | undefined): boolean =>
    a !== undefined && b !== undefined && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const memo = <T>(factory: () => T, deps: unknown[]): T => {
    const slot = state.index++;
    const previous = slots[slot] as { deps: unknown[]; value: T } | undefined;
    if (previous !== undefined && sameDeps(previous.deps, deps)) return previous.value;
    const next = { deps, value: factory() };
    slots[slot] = next;
    return next.value;
  };
  return {
    reset: () => { slots.length = 0; },
    begin: () => { state.index = 0; },
    api: {
      useState: <T>(initial: T | (() => T)): [T, (update: T | ((current: T) => T)) => void] => {
        const slot = state.index++;
        if (!(slot in slots)) {
          const box = { value: typeof initial === 'function' ? (initial as () => T)() : initial };
          slots[slot] = box;
        }
        const box = slots[slot] as { value: T; set?: (update: T | ((current: T) => T)) => void };
        box.set ??= (update) => {
          box.value = typeof update === 'function' ? (update as (current: T) => T)(box.value) : update;
        };
        return [box.value, box.set];
      },
      useRef: <T>(initial: T) => memo(() => ({ current: initial }), []),
      useMemo: memo,
      useCallback: <T>(callback: T, deps: unknown[]) => memo(() => callback, deps),
      useEffect: () => undefined,
    },
  };
});

vi.mock('react', () => runtime.api);

const { useProjects } = await import('./useProjects');

// Aliased so the hooks lint rule does not mistake the harness for a component.
const hookUnderTest = useProjects;
const renderHook = (): ReturnType<typeof useProjects> => {
  runtime.begin();
  return hookUnderTest();
};

const OLD = '2026-01-02T00:00:00.000Z';
const dates = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: OLD };
const model: ClassDiagramArtifact = {
  ...dates, id: 'model', type: 'class-diagram', name: 'Clases', content: { nodes: [], edges: [] },
};
const other: DesignArtifact = { ...dates, id: 'cases', type: 'use-case-model', name: 'Casos', content: { nodes: [], edges: [] } };
const seed = (artifacts: DesignArtifact[] = [model, other]): DiagramProject => ({
  ...dates, id: 'p', name: 'Proyecto', activeArtifactId: 'cases', artifacts,
});

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

const mount = (project: DiagramProject = seed()): { current: () => ReturnType<typeof useProjects> } => {
  vi.stubGlobal('localStorage', createMemoryStorage());
  runtime.reset();
  saveProjects([normalizeDiagramProject(project)]);
  renderHook();
  return { current: renderHook };
};

const artifactOf = (hook: { current: () => ReturnType<typeof useProjects> }, id: string): DesignArtifact =>
  hook.current().projects[0].artifacts.find((artifact) => artifact.id === id)!;

describe('useProjects notebook', () => {
  beforeEach(() => {
    runtime.reset();
  });

  it('sets the notes without touching content, links or the active artifact', () => {
    const hook = mount();
    const before = hook.current().projects[0];
    hook.current().updateArtifactNotebook('p', 'model', sampleNotebook());

    const after = hook.current().projects[0];
    const updated = artifactOf(hook, 'model');
    expect(updated.notebook).toEqual(sampleNotebook());
    expect(updated.content).toBe(before.artifacts[0].content);
    expect(updated.updatedAt).not.toBe(OLD);
    expect(after.updatedAt).not.toBe(OLD);
    expect(after.activeArtifactId).toBe('cases');
    expect(after.artifacts[1]).toBe(before.artifacts[1]);
  });

  it('is a no-op when the notes are deep-equal to the current ones', () => {
    const hook = mount();
    hook.current().updateArtifactNotebook('p', 'model', sampleNotebook());
    const first = hook.current().projects[0];
    hook.current().updateArtifactNotebook('p', 'model', structuredClone(sampleNotebook()));
    expect(hook.current().projects[0]).toBe(first);
  });

  it('is a no-op for unknown projects and artifacts', () => {
    const hook = mount();
    const first = hook.current().projects[0];
    hook.current().updateArtifactNotebook('p', 'missing', sampleNotebook());
    hook.current().updateArtifactNotebook('missing', 'model', sampleNotebook());
    expect(hook.current().projects[0]).toBe(first);
  });

  it('removes the key when the notes are undefined or empty', () => {
    const hook = mount();
    hook.current().updateArtifactNotebook('p', 'model', sampleNotebook());
    hook.current().updateArtifactNotebook('p', 'model', undefined);
    expect('notebook' in artifactOf(hook, 'model')).toBe(false);

    hook.current().updateArtifactNotebook('p', 'model', sampleNotebook());
    const emptyNotes: ArtifactNotebook = { version: 1, blocks: [{ id: 't', kind: 'text', text: '  ' }, { id: 's', kind: 'sketch', height: 660, shapes: [] }] };
    hook.current().updateArtifactNotebook('p', 'model', emptyNotes);
    expect('notebook' in artifactOf(hook, 'model')).toBe(false);

    const bare = hook.current().projects[0];
    hook.current().updateArtifactNotebook('p', 'model', emptyNotes);
    expect(hook.current().projects[0]).toBe(bare);
  });

  it('has a stable identity across renders', () => {
    const hook = mount();
    const first = hook.current().updateArtifactNotebook;
    hook.current().updateArtifactNotebook('p', 'model', sampleNotebook());
    expect(hook.current().updateArtifactNotebook).toBe(first);
  });

  it('keeps the notes when the content changes, and when undo replays old content', () => {
    const hook = mount();
    hook.current().updateArtifactNotebook('p', 'model', sampleNotebook());
    const previous = (artifactOf(hook, 'model') as ClassDiagramArtifact).content;
    const next = { nodes: [], edges: [], note: 'x' } as unknown as ClassDiagramArtifact['content'];

    // Same shape as App.tsx: the history holds content only.
    const history = changeHistory<ClassDiagramArtifact['content']>({ past: [], future: [] }, previous, true);
    hook.current().updateProjectArtifactContent('p', 'model', next);
    expect(artifactOf(hook, 'model').notebook).toEqual(sampleNotebook());

    hook.current().updateArtifactNotebook('p', 'model', { version: 1, blocks: [{ id: 'new', kind: 'text', text: 'nuevo apunte' }] });
    const undone = undoHistory(history, next);
    hook.current().updateProjectArtifactContent('p', 'model', undone.content!);
    expect(artifactOf(hook, 'model').content).toEqual(previous);
    expect(artifactOf(hook, 'model').notebook?.blocks).toEqual([{ id: 'new', kind: 'text', text: 'nuevo apunte' }]);
  });

  it('keeps the notes when a class diagram becomes a sequence model', () => {
    const hook = mount();
    hook.current().updateArtifactNotebook('p', 'model', sampleNotebook());
    hook.current().convertClassDiagramToSequenceModel('p', 'model');
    const converted = artifactOf(hook, 'model') as ClassSequenceDiagramArtifact;
    expect(converted.type).toBe('class-sequence-diagram');
    expect(converted.notebook).toEqual(sampleNotebook());
  });

  it('converts a class diagram without notes without adding the key', () => {
    const hook = mount();
    hook.current().convertClassDiagramToSequenceModel('p', 'model');
    const converted = artifactOf(hook, 'model');
    expect(converted.type).toBe('class-sequence-diagram');
    expect('notebook' in converted).toBe(false);
  });
});

describe('undo history stays content-only', () => {
  it('stores ArtifactContent snapshots in App.tsx, never whole artifacts', () => {
    expect(appSource).toMatch(/type ProjectHistory = ArtifactHistory<ArtifactContent>/);
  });
});
