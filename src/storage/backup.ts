import type { DiagramProject } from '../types/diagram';

type BackupReply = { path?: string; directory?: string };

type BackupBridge = {
  postMessage: (message: { action: 'write' | 'reveal' | 'preserve'; payload?: string }) => Promise<BackupReply>;
};

declare global {
  interface Window {
    __modeladorNativeBackup?: boolean;
    webkit?: { messageHandlers?: { modeladorBackup?: BackupBridge } };
    /** The Windows shell (src-tauri) puts its bridges here instead of faking `webkit`. */
    __modeladorBridges?: { backup?: BackupBridge; windows?: { postMessage: (message: unknown) => Promise<unknown> } };
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
const LAST_BACKUP_HASH_KEY = 'design-projects:last-backup-hash';

/** At most one snapshot every ten minutes of actual editing. */
export const BACKUP_INTERVAL_MS = 10 * 60 * 1000;

const bridge = (): BackupBridge | null => {
  if (typeof window === 'undefined' || window.__modeladorNativeBackup !== true) return null;
  return window.__modeladorBridges?.backup ?? window.webkit?.messageHandlers?.modeladorBackup ?? null;
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

const payloadHash = (payload: string): string => {
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < payload.length; index += 1) {
    const code = payload.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${payload.length}:${first >>> 0}:${second >>> 0}`;
};

const rememberBackupAt = (at: number, hash: string): void => {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(at));
    localStorage.setItem(LAST_BACKUP_HASH_KEY, hash);
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

  let payload: string;
  try {
    payload = JSON.stringify({ version: 2, projects });
  } catch {
    return { path: null, directory: null, at: null, error: 'No se pudo preparar la copia de seguridad. Exportá tu proyecto para conservar el trabajo.' };
  }
  const hash = payloadHash(payload);
  try {
    if (localStorage.getItem(LAST_BACKUP_HASH_KEY) === hash) {
      return { path: null, directory: null, at: readLastBackupAt(), error: null };
    }
  } catch {
    // A missing hash only means that the snapshot may be repeated.
  }

  try {
    const reply = await handler.postMessage({ action: 'write', payload });
    rememberBackupAt(at, hash);
    return { path: reply?.path ?? null, directory: reply?.directory ?? null, at, error: null };
  } catch {
    return { path: null, directory: null, at: null, error: 'No se pudo guardar la copia en disco. Reintentá o exportá tu proyecto.' };
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

export const preserveRecoveryCopy = async (raw: string): Promise<boolean> => {
  const handler = bridge();
  if (handler === null) return false;
  try {
    await handler.postMessage({ action: 'preserve', payload: raw });
    return true;
  } catch {
    return false;
  }
};
