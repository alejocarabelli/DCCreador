import type { DiagramProject } from '../types/diagram';

type BackupReply = { path?: string; directory?: string };

type BackupBridge = {
  postMessage: (message: { action: 'write' | 'reveal'; payload?: string }) => Promise<BackupReply>;
};

declare global {
  interface Window {
    __modeladorNativeBackup?: boolean;
    webkit?: { messageHandlers?: { modeladorBackup?: BackupBridge } };
  }
}

export type BackupState = {
  /** Absolute path of the newest snapshot, or null if none has been written. */
  path: string | null;
  /** Folder that holds the rotation, for "revelar en Finder". */
  directory: string | null;
  at: number | null;
  error: string | null;
};

const LAST_BACKUP_KEY = 'design-projects:last-backup';

/** At most one snapshot every ten minutes of actual editing. */
export const BACKUP_INTERVAL_MS = 10 * 60 * 1000;

const bridge = (): BackupBridge | null => {
  if (typeof window === 'undefined' || window.__modeladorNativeBackup !== true) return null;
  return window.webkit?.messageHandlers?.modeladorBackup ?? null;
};

/**
 * Projects live in the WKWebView's localStorage, which macOS can clear without
 * warning. When the native shell is present we mirror them to a rotating file
 * in ~/Documents, which also rides along with iCloud Drive if the user has it.
 * In a plain browser there is no bridge and this is a no-op by design — the
 * fallback there is the manual JSON export the app already has.
 */
export const isBackupAvailable = (): boolean => bridge() !== null;

export const readLastBackupAt = (): number | null => {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const rememberBackupAt = (at: number): void => {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(at));
  } catch {
    // A failed bookkeeping write must not fail the backup itself.
  }
};

export const writeBackup = async (projects: DiagramProject[]): Promise<BackupState> => {
  const handler = bridge();
  const at = Date.now();

  if (handler === null) {
    return { path: null, directory: null, at: null, error: null };
  }

  if (projects.length === 0) {
    return { path: null, directory: null, at: null, error: null };
  }

  try {
    const reply = await handler.postMessage({
      action: 'write',
      payload: JSON.stringify({ version: 2, projects }),
    });
    rememberBackupAt(at);
    return { path: reply?.path ?? null, directory: reply?.directory ?? null, at, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo escribir el respaldo.';
    return { path: null, directory: null, at: null, error: message };
  }
};

export const revealBackups = async (): Promise<string | null> => {
  const handler = bridge();
  if (handler === null) return null;

  try {
    const reply = await handler.postMessage({ action: 'reveal' });
    return reply?.directory ?? reply?.path ?? null;
  } catch {
    return null;
  }
};
