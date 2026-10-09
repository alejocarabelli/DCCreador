import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, runtime } from './testHookHarness';
import { APP_VERSION } from '../constants/appInfo';
import { checkForUpdate, fetchLatestRelease } from '../utils/appUpdate';
import { UPDATE_DISMISSED_KEY, UPDATE_FOUND_KEY, useAppUpdate } from './useAppUpdate';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { runtime: hooks } = await import('./testHookHarness');
  return { ...actual, ...hooks.api };
});

// The network is never touched: the check is replaced by a stub.
vi.mock('../utils/appUpdate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/appUpdate')>()),
  checkForUpdate: vi.fn(),
  fetchLatestRelease: vi.fn(),
}));

const release = { version: '9.9.9', url: 'https://github.com/alejocarabelli/Modelador-de-Sistemas/releases/tag/v9.9.9' };
const newer = { version: '9.9.10', url: 'https://github.com/alejocarabelli/Modelador-de-Sistemas/releases/tag/v9.9.10' };

const useAppUpdateOnMount = () => {
  runtime.begin();
  return useAppUpdate();
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
  vi.mocked(checkForUpdate).mockReset();
  vi.mocked(checkForUpdate).mockResolvedValue(null);
  vi.mocked(fetchLatestRelease).mockReset();
  vi.mocked(fetchLatestRelease).mockResolvedValue({ version: APP_VERSION, url: release.url });
});

afterEach(() => {
  runtime.reset();
  vi.unstubAllGlobals();
});

describe('useAppUpdate', () => {
  it('checks once on open, with the installed version and without forcing', () => {
    useAppUpdateOnMount();
    useAppUpdateOnMount();

    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(checkForUpdate).toHaveBeenCalledWith(APP_VERSION);
  });

  it('shows the release it finds and keeps it for the next launch inside the daily wait', async () => {
    vi.mocked(checkForUpdate).mockResolvedValueOnce(release);
    useAppUpdateOnMount();
    await settle();
    expect(useAppUpdateOnMount().visibleUpdate).toEqual(release);

    // A second launch inside the daily wait: checkForUpdate answers null without asking GitHub.
    runtime.reset();
    const nextLaunch = useAppUpdateOnMount();
    await settle();

    expect(nextLaunch.update).toEqual(release);
    expect(useAppUpdateOnMount().visibleUpdate).toEqual(release);
  });

  it('ignores a kept release once the installed version is that one or newer', () => {
    localStorage.setItem(UPDATE_FOUND_KEY, JSON.stringify({ version: APP_VERSION, url: release.url }));

    expect(useAppUpdateOnMount().visibleUpdate).toBeNull();
  });

  it('ignores a kept record that is unreadable or does not point to GitHub', () => {
    localStorage.setItem(UPDATE_FOUND_KEY, '{not json');
    expect(useAppUpdateOnMount().update).toBeNull();

    localStorage.setItem(UPDATE_FOUND_KEY, JSON.stringify({ version: '9.9.9', url: 'https://example.com/x' }));
    expect(useAppUpdateOnMount().update).toBeNull();
  });

  it('a manual check forces the request and reports up to date when there is no newer release', async () => {
    useAppUpdateOnMount();
    const pending = useAppUpdateOnMount().checkNow();

    expect(useAppUpdateOnMount().status).toBe('checking');
    await pending;

    expect(fetchLatestRelease).toHaveBeenCalledTimes(1);
    expect(useAppUpdateOnMount().status).toBe('up-to-date');
    expect(useAppUpdateOnMount().update).toBeNull();
  });

  it('a manual check that cannot reach GitHub says so and keeps the release already found', async () => {
    vi.mocked(checkForUpdate).mockResolvedValueOnce(release);
    useAppUpdateOnMount();
    await settle();
    vi.mocked(fetchLatestRelease).mockResolvedValueOnce(null);
    await useAppUpdateOnMount().checkNow();

    expect(useAppUpdateOnMount().status).toBe('error');
    expect(useAppUpdateOnMount().update).toEqual(release);
  });

  it('a manual check reports a newer release as available', async () => {
    useAppUpdateOnMount();
    vi.mocked(fetchLatestRelease).mockResolvedValueOnce(release);
    await useAppUpdateOnMount().checkNow();

    expect(useAppUpdateOnMount().status).toBe('available');
    expect(useAppUpdateOnMount().visibleUpdate).toEqual(release);
  });

  it('hiding a release saves its version, hides it, and shows a later one again', async () => {
    vi.mocked(checkForUpdate).mockResolvedValueOnce(release);
    useAppUpdateOnMount();
    await settle();
    useAppUpdateOnMount().dismissUpdate();

    expect(localStorage.getItem(UPDATE_DISMISSED_KEY)).toBe(release.version);
    expect(useAppUpdateOnMount().visibleUpdate).toBeNull();

    runtime.reset();
    expect(useAppUpdateOnMount().visibleUpdate).toBeNull();
    expect(useAppUpdateOnMount().update).toEqual(release);

    runtime.reset();
    vi.mocked(checkForUpdate).mockResolvedValueOnce(newer);
    useAppUpdateOnMount();
    await settle();
    expect(useAppUpdateOnMount().visibleUpdate).toEqual(newer);
  });

  it('keeps a hidden release available to the dialog', async () => {
    localStorage.setItem(UPDATE_DISMISSED_KEY, release.version);
    localStorage.setItem(UPDATE_FOUND_KEY, JSON.stringify(release));

    const hook = useAppUpdateOnMount();

    expect(hook.visibleUpdate).toBeNull();
    expect(hook.update).toEqual(release);
  });
});
