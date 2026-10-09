import { useCallback, useEffect, useState } from 'react';
import { APP_VERSION } from '../constants/appInfo';
import { readUiPreference, writeUiPreference } from '../storage/uiPreferences';
import { checkForUpdate, fetchLatestRelease, isNewerRelease, recordAutoCheck, type LatestRelease } from '../utils/appUpdate';

/** Last release found, so the notice survives a relaunch inside the 24 h wait. Empty when none. */
export const UPDATE_FOUND_KEY = 'modelador.update-found';
/** Version the notice was hidden for. A later version shows again. */
export const UPDATE_DISMISSED_KEY = 'modelador.update-dismissed';

export type AppUpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error';

const parseFound = (raw: string | null): LatestRelease | null => {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const { version, url } = data as Record<string, unknown>;
    if (typeof version !== 'string' || typeof url !== 'string' || !url.startsWith('https://github.com/')) return null;
    return isNewerRelease(version, APP_VERSION) ? { version, url } : null;
  } catch {
    return null;
  }
};

const storeFound = (release: LatestRelease | null): void => {
  writeUiPreference(UPDATE_FOUND_KEY, release ? JSON.stringify(release) : '');
};

/**
 * Looks for a newer release once when the app opens (the daily limit lives in
 * checkForUpdate). `checkNow` asks again right away, for «Buscar actualizaciones»:
 * there a failed request is told apart from «no newer release», and keeps what was found.
 */
export const useAppUpdate = () => {
  const [update, setUpdate] = useState<LatestRelease | null>(() => parseFound(readUiPreference(UPDATE_FOUND_KEY)));
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => readUiPreference(UPDATE_DISMISSED_KEY));
  const [status, setStatus] = useState<AppUpdateStatus>('idle');

  useEffect(() => {
    checkForUpdate(APP_VERSION)
      .then((release) => {
        if (release === null) return;
        storeFound(release);
        setUpdate(release);
      })
      .catch(() => undefined);
  }, []);

  const checkNow = useCallback(async (): Promise<void> => {
    setStatus('checking');
    const storage = (() => { try { return localStorage; } catch { return null; } })();
    recordAutoCheck(Date.now(), storage);
    const latest = await fetchLatestRelease().catch(() => null);
    if (latest === null) {
      setStatus('error');
      return;
    }
    const release = isNewerRelease(latest.version, APP_VERSION) ? latest : null;
    storeFound(release);
    setUpdate(release);
    setStatus(release ? 'available' : 'up-to-date');
  }, []);

  const dismissUpdate = useCallback((): void => {
    if (update === null) return;
    writeUiPreference(UPDATE_DISMISSED_KEY, update.version);
    setDismissedVersion(update.version);
  }, [update]);

  return {
    /** The newest release found, shown in the dialog even when its banner was hidden. */
    update,
    /** What the sidebar shows: the release, unless its version was hidden. */
    visibleUpdate: update !== null && update.version !== dismissedVersion ? update : null,
    status,
    checkNow,
    dismissUpdate,
  };
};
