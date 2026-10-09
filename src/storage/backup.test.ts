import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preserveRecoveryCopy, readLastBackupAt, writeBackup } from './backup';
import { createMemoryStorage, stubBrowser } from '../hooks/testHookHarness';
import type { DiagramProject } from '../types/diagram';

const projects: DiagramProject[] = [{
  id: 'p', name: 'Proyecto', createdAt: '', updatedAt: '', artifacts: [{
    id: 'a', type: 'class-diagram', name: 'Clases', createdAt: '', updatedAt: '', content: { nodes: [], edges: [] },
  }],
}];

describe('disk backups', () => {
  const postMessage = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    stubBrowser({ __modeladorNativeBackup: true, __modeladorBridges: { backup: { postMessage } } });
    postMessage.mockReset().mockResolvedValue({ path: '/backup/file.json', directory: '/backup' });
  });

  it('does not write or rotate identical snapshots, including after the interval', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(900000);
    await writeBackup(projects);
    expect(readLastBackupAt()).toBe(1000);
    const hash = localStorage.getItem('design-projects:last-backup-hash');
    expect(hash).not.toBeNull();
    const duplicate = await writeBackup(structuredClone(projects));
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(readLastBackupAt()).toBe(1000);
    expect(duplicate.at).toBe(1000);
    expect(localStorage.getItem('design-projects:last-backup-hash')).toBe(hash);
    vi.restoreAllMocks();
  });

  it('writes changed snapshots and retries a failed write', async () => {
    await writeBackup(projects);
    const changed = [{ ...projects[0], name: 'Cambio' }];
    postMessage.mockRejectedValueOnce(new Error('internal-code/path'));
    expect((await writeBackup(changed)).error).not.toContain('internal-code');
    expect((await writeBackup(changed)).error).toBeNull();
    expect(postMessage).toHaveBeenCalledTimes(3);
  });

  it('preserves the exact raw text outside the snapshot rotation and bookkeeping', async () => {
    const raw = '{broken';
    expect(await preserveRecoveryCopy(raw)).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ action: 'preserve', payload: raw });
    expect(localStorage.length).toBe(0);
    postMessage.mockRejectedValueOnce(new Error('disk full'));
    expect(await preserveRecoveryCopy(raw)).toBe(false);
  });

  it('reports that recovery could not be preserved without a bridge', async () => {
    stubBrowser();
    expect(await preserveRecoveryCopy('{broken')).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('uses the macOS bridge for preservation too', async () => {
    stubBrowser({ __modeladorNativeBackup: true, webkit: { messageHandlers: { modeladorBackup: { postMessage } } } });
    expect(await preserveRecoveryCopy('{broken')).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ action: 'preserve', payload: '{broken' });
  });

  it('reports unserializable data and allows subsequent backups', async () => {
    const cyclic = structuredClone(projects);
    Object.assign(cyclic[0], { cycle: cyclic });
    expect((await writeBackup(cyclic)).error).not.toBeNull();
    expect(postMessage).not.toHaveBeenCalled();
    expect((await writeBackup(projects)).error).toBeNull();
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('still backs up when local bookkeeping is full', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect((await writeBackup(projects)).error).toBeNull();
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
