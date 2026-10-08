import { describe, expect, it } from 'vitest';
import {
  SKETCH_HISTORY_LIMIT,
  emptySketchHistory,
  recordSketchChange,
  redoSketch,
  undoSketch,
} from './sketchHistory';

describe('sketch history', () => {
  it('has nothing to undo or redo at first', () => {
    const history = emptySketchHistory<string>();
    expect(undoSketch(history, 'now')).toBeNull();
    expect(redoSketch(history, 'now')).toBeNull();
  });

  it('undoes and redoes in order', () => {
    let history = recordSketchChange(emptySketchHistory<string>(), 'a');
    history = recordSketchChange(history, 'b');
    const undone = undoSketch(history, 'c');
    expect(undone?.value).toBe('b');
    const twice = undoSketch(undone!.history, 'b');
    expect(twice?.value).toBe('a');
    const redone = redoSketch(twice!.history, 'a');
    expect(redone?.value).toBe('b');
    expect(redoSketch(redone!.history, 'b')?.value).toBe('c');
  });

  it('a new change drops the redo branch', () => {
    const history = recordSketchChange(emptySketchHistory<string>(), 'a');
    const undone = undoSketch(history, 'b')!;
    expect(undone.history.future).toEqual(['b']);
    expect(recordSketchChange(undone.history, 'a').future).toEqual([]);
  });

  it('keeps the most recent snapshots only', () => {
    let history = emptySketchHistory<number>();
    for (let i = 0; i < SKETCH_HISTORY_LIMIT + 20; i += 1) history = recordSketchChange(history, i);
    expect(history.past).toHaveLength(SKETCH_HISTORY_LIMIT);
    expect(history.past[history.past.length - 1]).toBe(SKETCH_HISTORY_LIMIT + 19);
  });
});
