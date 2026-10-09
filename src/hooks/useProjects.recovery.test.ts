import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, runtime, stubBrowser } from './testHookHarness';

vi.mock('react', async () => (await import('./testHookHarness')).runtime.api);
const { useProjects } = await import('../hooks/useProjects');

const hookUnderTest = useProjects;
const renderHook = (): ReturnType<typeof useProjects> => {
  runtime.begin();
  return hookUnderTest();
};

const STORAGE_KEY = 'design-projects:v2';
const CORRUPT = '{"version":2,"projects":[{"id":"p1","name":"Mi proyecto" ';

describe('A3: crear un proyecto sobre almacenamiento corrupto sin copia de recuperación', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runtime.reset();
    stubBrowser();
    const storage = createMemoryStorage();
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string) => {
      if (key.startsWith('design-projects:recovery:')) throw new DOMException('quota', 'QuotaExceededError');
      setItem(key, value);
    };
    vi.stubGlobal('localStorage', storage);
  });

  it('el JSON original no se reemplaza al crear un proyecto', () => {
    localStorage.setItem(STORAGE_KEY, CORRUPT);

    renderHook();
    renderHook().createProject('Nuevo');
    renderHook();
    vi.advanceTimersByTime(300);

    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
  });
});

describe('recovery decisions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runtime.reset();
    stubBrowser();
    vi.stubGlobal('localStorage', createMemoryStorage());
    localStorage.setItem(STORAGE_KEY, CORRUPT);
  });

  it('protects the original across repeated edits, pagehide and unmount', async () => {
    renderHook().createProject('Nuevo');
    let hook = renderHook();
    await vi.advanceTimersByTimeAsync(300);
    hook.renameProject(hook.projects[0].id, 'Otra edición');
    hook = renderHook();
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(1000);
    runtime.unmount();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
    expect(hook.recoveryPending).toBe(true);
    expect(localStorage.length).toBe(1);
  });

  it('unblocks only after the native bridge finishes preserving the raw text', async () => {
    let finish!: (reply: object) => void;
    const postMessage = vi.fn(() => new Promise<object>((resolve) => { finish = resolve; }));
    stubBrowser({ __modeladorNativeBackup: true, __modeladorBridges: { backup: { postMessage } } });
    renderHook().createProject('Nuevo');
    renderHook();
    await vi.advanceTimersByTimeAsync(500);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
    expect(postMessage).toHaveBeenCalledWith({ action: 'preserve', payload: CORRUPT });
    finish({ path: '/backup/recuperacion.json' });
    await Promise.resolve();
    await Promise.resolve();
    const hook = renderHook();
    expect(hook.recoveryPending).toBe(false);
    expect(hook.storageWarning).toContain('Documentos › Modelador de Sistemas › Respaldos');
    await vi.advanceTimersByTimeAsync(300);
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Nuevo');
  });

  it('keeps every save blocked if preservation fails', async () => {
    const postMessage = vi.fn().mockRejectedValue(new Error('internal-disk-error'));
    stubBrowser({ __modeladorNativeBackup: true, __modeladorBridges: { backup: { postMessage } } });
    renderHook().createProject('Nuevo');
    renderHook();
    await vi.advanceTimersByTimeAsync(300);
    expect(renderHook().recoveryPending).toBe(true);
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('unblocks after the explicit decision to continue without a copy', async () => {
    renderHook().createProject('Nuevo');
    renderHook().continueWithoutRecovery();
    expect(renderHook().recoveryPending).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Nuevo');
  });

  it('keeps the original when the native download is cancelled or fails', async () => {
    const nativeSave = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('failed'));
    stubBrowser({ __modeladorNativeSave: nativeSave });
    renderHook().createProject('Nuevo');
    await renderHook().downloadRecoveryCopy();
    expect(renderHook().recoveryPending).toBe(true);
    await renderHook().downloadRecoveryCopy();
    renderHook();
    await vi.advanceTimersByTimeAsync(300);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
  });

  it('downloads the exact raw bytes and unblocks after a successful native save', async () => {
    const nativeSave = vi.fn().mockResolvedValue('/downloads/recuperacion.json');
    stubBrowser({ __modeladorNativeSave: nativeSave });
    renderHook().createProject('Nuevo');
    await renderHook().downloadRecoveryCopy();
    expect(new TextDecoder().decode(nativeSave.mock.calls[0][1])).toBe(CORRUPT);
    renderHook();
    await vi.advanceTimersByTimeAsync(300);
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Nuevo');
  });

  it('waits for confirmation of an unverified browser download', async () => {
    stubBrowser();
    const click = vi.fn();
    vi.stubGlobal('document', { createElement: () => ({ click }), addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    renderHook().createProject('Nuevo');
    expect(await renderHook().downloadRecoveryCopy()).toBe(true);
    renderHook();
    await vi.advanceTimersByTimeAsync(300);
    expect(click).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(CORRUPT);
    renderHook().confirmRecoveryDownload();
    renderHook();
    await vi.advanceTimersByTimeAsync(300);
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Nuevo');
    vi.restoreAllMocks();
  });
});


describe('inaccessible storage', () => {
  const WARNING = 'No se pudo abrir el almacenamiento de la app. Tus cambios de esta sesión se guardan solo en los respaldos de Documentos.';
  let storage: ReturnType<typeof createMemoryStorage>;
  let inaccessible: boolean;
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    runtime.reset();
    inaccessible = true;
    storage = createMemoryStorage();
    const getItem = storage.getItem.bind(storage);
    vi.spyOn(storage, 'getItem').mockImplementation((key) => {
      if (inaccessible) throw new Error('unavailable');
      return getItem(key);
    });
    postMessage = vi.fn().mockResolvedValue({ path: '/backup/file.json' });
    stubBrowser({ __modeladorNativeBackup: true, __modeladorBridges: { backup: { postMessage } } });
    vi.stubGlobal('localStorage', storage);
  });

  it('backs up session edits and keeps the retry notice while storage is inaccessible', async () => {
    renderHook().createProject('Sesión');
    let hook = renderHook();
    await vi.advanceTimersByTimeAsync(300);
    expect(postMessage).toHaveBeenCalledWith({ action: 'write', payload: expect.stringContaining('Sesión') });
    expect(hook.recoveryPending).toBe(false);
    expect(hook.storageUnavailable).toBe(true);
    expect(hook.storageWarning).toBe(WARNING);
    hook.retryStorage();
    hook = renderHook();
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(1);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(hook.storageWarning).toBe(WARNING);
    inaccessible = false;
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps scheduling disk backups during an inaccessible session', async () => {
    renderHook().createProject('Sesión');
    renderHook();
    await vi.advanceTimersByTimeAsync(300);
    const project = renderHook().projects[0];
    renderHook().renameProject(project.id, 'Edición pendiente');
    renderHook();
    await vi.advanceTimersByTimeAsync(300);
    expect(postMessage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenLastCalledWith({ action: 'write', payload: expect.stringContaining('Edición pendiente') });
    runtime.unmount();
    inaccessible = false;
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('resumes local saving on retry when storage is empty, keeping session work', async () => {
    renderHook().createProject('Sesión');
    renderHook();
    inaccessible = false;
    renderHook().retryStorage();
    const hook = renderHook();
    expect(hook.storageUnavailable).toBe(false);
    expect(hook.projects[0].name).toBe('Sesión');
    expect(hook.storageWarning).toBeNull();
    await vi.advanceTimersByTimeAsync(300);
    expect(storage.getItem(STORAGE_KEY)).toContain('Sesión');
  });

  it('loads stored projects on retry without replacing them with session projects', async () => {
    const stored = JSON.stringify({ version: 2, projects: [{
      id: 'stored', name: 'Guardado', createdAt: '', updatedAt: '', artifacts: [{
        id: 'a', type: 'class-diagram', name: 'Clases', createdAt: '', updatedAt: '', content: { nodes: [], edges: [] },
      }],
    }] });
    storage.setItem(STORAGE_KEY, stored);
    renderHook().createProject('Sesión');
    renderHook();
    inaccessible = false;
    renderHook().retryStorage();
    const hook = renderHook();
    expect(hook.projects.map((project) => project.name)).toEqual(['Guardado', 'Sesión']);
    expect(storage.getItem(STORAGE_KEY)).toBe(stored);
    await vi.advanceTimersByTimeAsync(300);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).projects).toHaveLength(2);
  });

  it('keeps a separate copy of session work if a stored project has the same id', async () => {
    renderHook().createProject('Sesión');
    const sessionProject = renderHook().projects[0];
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, projects: [{ ...sessionProject, name: 'Guardado' }] }));
    inaccessible = false;
    renderHook().retryStorage();
    const hook = renderHook();
    expect(hook.projects.map((project) => project.name)).toEqual(['Guardado', 'Sesión']);
    expect(hook.projects[0].id).toBe(sessionProject.id);
    expect(hook.projects[1].id).not.toBe(sessionProject.id);
    await vi.advanceTimersByTimeAsync(300);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).projects).toHaveLength(2);
  });

  it('protects data found on retry until native preservation finishes', async () => {
    storage.setItem(STORAGE_KEY, CORRUPT);
    renderHook().createProject('Sesión');
    renderHook();
    await vi.advanceTimersByTimeAsync(300);
    let finish!: (reply: object) => void;
    postMessage.mockImplementationOnce(() => new Promise<object>((resolve) => { finish = resolve; }));
    inaccessible = false;
    renderHook().retryStorage();
    const hook = renderHook();
    expect(hook.storageUnavailable).toBe(false);
    expect(hook.recoveryPending).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    window.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem(STORAGE_KEY)).toBe(CORRUPT);
    expect(postMessage).toHaveBeenLastCalledWith({ action: 'preserve', payload: CORRUPT });
    finish({ path: '/backup/recovery.json' });
    await vi.advanceTimersByTimeAsync(1);
    expect(renderHook().recoveryPending).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(storage.getItem(STORAGE_KEY)).toContain('Sesión');
  });

  it('uses the notebook loss detector on retry and leaves originals untouched if preservation fails', async () => {
    const raw = JSON.stringify({ version: 2, projects: [{
      id: 'stored', name: 'Guardado', createdAt: '', updatedAt: '', artifacts: [{
        id: 'a', type: 'class-diagram', name: 'Clases', createdAt: '', updatedAt: '', content: { nodes: [], edges: [] },
        notebook: { version: 1, blocks: [null] },
      }],
    }] });
    storage.setItem(STORAGE_KEY, raw);
    renderHook().createProject('Sesión');
    renderHook();
    await vi.advanceTimersByTimeAsync(300);
    postMessage.mockRejectedValueOnce(new Error('disk full'));
    inaccessible = false;
    renderHook().retryStorage();
    renderHook();
    await vi.advanceTimersByTimeAsync(300);
    expect(renderHook().recoveryPending).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    expect(postMessage).toHaveBeenLastCalledWith({ action: 'preserve', payload: raw });
  });
});
