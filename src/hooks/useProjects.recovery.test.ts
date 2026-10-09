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
