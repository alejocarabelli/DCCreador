/** Per-sketch undo stack: snapshots of the shape list, kept in memory only. */
export type SketchHistory<T> = { past: T[]; future: T[] };

export const SKETCH_HISTORY_LIMIT = 100;

export const emptySketchHistory = <T>(): SketchHistory<T> => ({ past: [], future: [] });

/** Records `previous` (the value before an edit) and drops the redo branch. */
export const recordSketchChange = <T>(history: SketchHistory<T>, previous: T): SketchHistory<T> => ({
  past: [...history.past, previous].slice(-SKETCH_HISTORY_LIMIT),
  future: [],
});

export const undoSketch = <T>(
  history: SketchHistory<T>,
  current: T,
): { history: SketchHistory<T>; value: T } | null => {
  if (history.past.length === 0) return null;
  const value = history.past[history.past.length - 1];
  return { value, history: { past: history.past.slice(0, -1), future: [...history.future, current] } };
};

export const redoSketch = <T>(
  history: SketchHistory<T>,
  current: T,
): { history: SketchHistory<T>; value: T } | null => {
  if (history.future.length === 0) return null;
  const value = history.future[history.future.length - 1];
  return {
    value,
    history: { past: [...history.past, current].slice(-SKETCH_HISTORY_LIMIT), future: history.future.slice(0, -1) },
  };
};
