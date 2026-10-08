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

/** Grilla on/off, shared by the class and use-case canvases and the read-only window. */
export const CANVAS_GRID_KEY = 'class-diagram-grid-enabled';

export const readCanvasGridEnabled = (): boolean => readUiPreference(CANVAS_GRID_KEY) !== 'false';

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

const SIDEBAR_OTHERS_OPEN_KEY = 'modelador.sidebar-others-open';
const SIDEBAR_SPLIT_KEY = 'modelador.sidebar-split';

/** Share of the sidebar's project area given to the current project's pane; kept clear of the extremes. */
export const SIDEBAR_SPLIT_MIN = 0.15;
export const SIDEBAR_SPLIT_MAX = 0.85;

export const clampSidebarSplit = (fraction: number): number =>
  Number.isFinite(fraction) ? Math.min(SIDEBAR_SPLIT_MAX, Math.max(SIDEBAR_SPLIT_MIN, fraction)) : 0.5;

/** «Otros proyectos» starts folded: the open project is what you came for. */
export const readSidebarOthersOpen = (): boolean => readUiPreference(SIDEBAR_OTHERS_OPEN_KEY) === 'true';

export const writeSidebarOthersOpen = (open: boolean): boolean => writeUiPreference(SIDEBAR_OTHERS_OPEN_KEY, String(open));

/** The dragged split, or null while the layout is automatic (current project at its content height). */
export const readSidebarSplit = (): number | null => {
  const stored = readUiPreference(SIDEBAR_SPLIT_KEY);
  if (stored === null) return null;
  const value = Number.parseFloat(stored);
  return Number.isFinite(value) ? clampSidebarSplit(value) : null;
};

export const writeSidebarSplit = (fraction: number | null): boolean =>
  writeUiPreference(SIDEBAR_SPLIT_KEY, fraction === null ? '' : String(Number(clampSidebarSplit(fraction).toFixed(4))));
