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

  it('always lets the bridge check the files on disk, ignoring old persisted hashes', async () => {
    localStorage.setItem('design-projects:last-backup-hash', 'old-hash');
    const first = await writeBackup(projects);
    const duplicate = await writeBackup(structuredClone(projects));
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(duplicate.path).toBe(first.path);
    expect(readLastBackupAt()).toBe(duplicate.at);
    expect(localStorage.getItem('design-projects:last-backup-hash')).toBe('old-hash');
  });

  it('does not persist a content hash for future sessions', async () => {
    await writeBackup(projects);
    expect(localStorage.getItem('design-projects:last-backup-hash')).toBeNull();
    postMessage.mockResolvedValueOnce({ path: '/backup/recreated.json', directory: '/backup' });
    expect((await writeBackup(projects)).path).toBe('/backup/recreated.json');
    expect(postMessage).toHaveBeenCalledTimes(2);
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
    expect(await preserveRecoveryCopy(raw)).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(2);
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
