import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassDiagramArtifact, DesignArtifact, DiagramProject } from '../types/diagram';
import { createMemoryStorage, runtime, stubBrowser } from './testHookHarness';
import { NOTEBOOK_SENTINEL, sampleNotebook } from '../utils/notebookTestData';

vi.mock('react', async () => (await import('./testHookHarness')).runtime.api);
const { useProjects } = await import('../hooks/useProjects');
const { saveProjects } = await import('../storage/projectsStorage');
const { normalizeDiagramProject } = await import('../utils/diagramNormalization');

const hookUnderTest = useProjects;
const renderHook = (): ReturnType<typeof useProjects> => {
  runtime.begin();
  return hookUnderTest();
};

const MINUTE = 60_000;
const dates = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };
const model: ClassDiagramArtifact = { ...dates, id: 'model', type: 'class-diagram', name: 'Clases', content: { nodes: [], edges: [] } };
const seed: DiagramProject = { ...dates, id: 'p', name: 'Proyecto', activeArtifactId: 'model', artifacts: [model] as DesignArtifact[] };

describe('A7: el respaldo pendiente no se programa para después', () => {
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    runtime.reset();
    postMessage = vi.fn(async () => ({ path: '/respaldos/respaldo.json', directory: '/respaldos' }));
    stubBrowser({ __modeladorNativeBackup: true, __modeladorBridges: { backup: { postMessage } } });
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  it('una edición dentro del intervalo se respalda al vencer el intervalo', async () => {
    saveProjects([normalizeDiagramProject(seed)]);
    renderHook();
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(MINUTE);
    renderHook().updateArtifactNotebook('p', 'model', sampleNotebook());
    renderHook();
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15 * MINUTE);

    expect(postMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastPayload = String(postMessage.mock.calls.at(-1)?.[0]?.payload ?? '');
    expect(lastPayload).toContain(NOTEBOOK_SENTINEL);
  });

  it('control: una edición posterior al intervalo sí dispara un respaldo', async () => {
    saveProjects([normalizeDiagramProject(seed)]);
    renderHook();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    renderHook().updateArtifactNotebook('p', 'model', sampleNotebook());
    renderHook();
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(11 * MINUTE);
    renderHook().updateArtifactNotebook('p', 'model', { version: 1, blocks: [{ id: 'z', kind: 'text', text: 'otra' }] });
    renderHook();
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(2);
  });
});

describe('backup scheduling and deletion snapshots', () => {
  let postMessage: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    runtime.reset();
    postMessage = vi.fn(async () => ({ path: '/respaldos/respaldo.json', directory: '/respaldos' }));
    stubBrowser({ __modeladorNativeBackup: true, __modeladorBridges: { backup: { postMessage } } });
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  it('backs up the most recent of several changes at the original deadline', async () => {
    saveProjects([normalizeDiagramProject(seed)]);
    renderHook();
    await vi.advanceTimersByTimeAsync(MINUTE);
    renderHook().renameProject('p', 'Primero');
    renderHook();
    await vi.advanceTimersByTimeAsync(MINUTE);
    renderHook().renameProject('p', 'Último');
    renderHook();
    await vi.advanceTimersByTimeAsync(8 * MINUTE - 1);
    expect(postMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls[1][0].payload).toContain('Último');
  });

  it('cleans up its timer and pagehide listener when unmounted', async () => {
    saveProjects([normalizeDiagramProject(seed)]);
    renderHook();
    await vi.advanceTimersByTimeAsync(MINUTE);
    renderHook().renameProject('p', 'Cambio');
    renderHook();
    await vi.advanceTimersByTimeAsync(300);
    runtime.unmount();
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(20 * MINUTE);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('forces the edited state before deleting a project, ignoring the interval', async () => {
    saveProjects([normalizeDiagramProject(seed)]);
    renderHook();
    await vi.advanceTimersByTimeAsync(MINUTE);
    renderHook().renameProject('p', 'Antes de borrar');
    renderHook();
    renderHook().deleteProject('p');
    expect(renderHook().projects).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(JSON.parse(postMessage.mock.calls[1][0].payload).projects[0].name).toBe('Antes de borrar');
  });

  it('forces the prior artifact state and delegates identical copies to disk', async () => {
    saveProjects([normalizeDiagramProject({ ...seed, artifacts: [model, { ...model, id: 'other', name: 'Otro' }] })]);
    renderHook();
    await vi.advanceTimersByTimeAsync(MINUTE);
    renderHook().renameArtifact('p', 'other', 'Trabajo que se borra');
    renderHook();
    renderHook().deleteArtifact('p', 'other');
    renderHook();
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(JSON.parse(postMessage.mock.calls[1][0].payload).projects[0].artifacts).toHaveLength(2);
    expect(postMessage.mock.calls[1][0].payload).toContain('Trabajo que se borra');
    await renderHook().runBackupNow();
    expect(postMessage).toHaveBeenCalledTimes(3);
    expect(JSON.parse(postMessage.mock.calls[2][0].payload).projects[0].artifacts).toHaveLength(1);
    await renderHook().runBackupNow();
    expect(postMessage).toHaveBeenCalledTimes(4);
  });

  it('queues the pre-deletion snapshot behind an in-flight backup', async () => {
    let finish!: (reply: object) => void;
    postMessage.mockImplementationOnce(() => new Promise<object>((resolve) => { finish = resolve; }));
    saveProjects([normalizeDiagramProject(seed)]);
    renderHook();
    await vi.advanceTimersByTimeAsync(1);
    renderHook().renameProject('p', 'Antes de borrar');
    renderHook();
    renderHook().deleteProject('p');
    renderHook();
    finish({ path: '/respaldos/respaldo.json' });
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(JSON.parse(postMessage.mock.calls[1][0].payload).projects[0].name).toBe('Antes de borrar');
  });

  it('keeps only one pagehide listener across edits and exposes retry after failure', async () => {
    saveProjects([normalizeDiagramProject(seed)]);
    renderHook();
    await vi.advanceTimersByTimeAsync(1);
    for (let index = 0; index < 5; index += 1) {
      renderHook().renameProject('p', `Cambio ${index}`);
      renderHook();
      await vi.advanceTimersByTimeAsync(1);
    }
    postMessage.mockRejectedValueOnce(new Error('disk full'));
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(renderHook().backup.error).not.toBeNull();
    await renderHook().runBackupNow();
    expect(postMessage).toHaveBeenCalledTimes(3);
    expect(renderHook().backup.error).toBeNull();
  });
});
