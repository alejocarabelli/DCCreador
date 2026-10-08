export const readUiPreference = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeUiPreference = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const NOTEBOOK_OPEN_KEY = 'modelador.notebook-open';
const NOTEBOOK_WIDTH_KEY = 'modelador.notebook-width';

export const NOTEBOOK_WIDTH_DEFAULT = 340;
export const NOTEBOOK_WIDTH_MIN = 280;
export const NOTEBOOK_WIDTH_MAX = 520;

export const clampNotebookWidth = (width: number): number =>
  Number.isFinite(width)
    ? Math.min(NOTEBOOK_WIDTH_MAX, Math.max(NOTEBOOK_WIDTH_MIN, Math.round(width)))
    : NOTEBOOK_WIDTH_DEFAULT;

/** Whether Apuntes was left open. Global, not per artifact: switching tabs shows the other artifact's notes. */
export const readNotebookOpen = (): boolean => readUiPreference(NOTEBOOK_OPEN_KEY) === 'true';

export const writeNotebookOpen = (open: boolean): boolean => writeUiPreference(NOTEBOOK_OPEN_KEY, String(open));

export const readNotebookWidth = (): number => {
  const stored = readUiPreference(NOTEBOOK_WIDTH_KEY);
  return stored === null ? NOTEBOOK_WIDTH_DEFAULT : clampNotebookWidth(Number(stored));
};

export const writeNotebookWidth = (width: number): boolean => writeUiPreference(NOTEBOOK_WIDTH_KEY, String(clampNotebookWidth(width)));
