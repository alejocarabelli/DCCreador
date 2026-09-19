import { describe, expect, it } from 'vitest';
import { changeHistory, redoHistory, undoHistory } from './artifactHistory';

describe('artifact history', () => {
  it('round-trips one logical action through undo and redo', () => {
    const initial = { value: 'A' };
    const changed = changeHistory({ past: [], future: [] }, initial, true);
    const undone = undoHistory(changed, { value: 'B' });
    const redone = redoHistory(undone.history, undone.content!);

    expect(undone.content).toEqual(initial);
    expect(redone.content).toEqual({ value: 'B' });
  });

  it('keeps the complete redo target after a coalesced typing burst', () => {
    let history = changeHistory({ past: [], future: [] }, { text: '' }, false);
    history = changeHistory(history, { text: 'v' }, false);
    history = changeHistory(history, { text: 'va' }, false);
    const undone = undoHistory(history, { text: 'validar' });
    const redone = redoHistory(undone.history, undone.content!);

    expect(undone.content).toEqual({ text: '' });
    expect(redone.content).toEqual({ text: 'validar' });
  });

  it.each([
    'wrap',
    'unwrap',
    'add operand',
    'remove operand',
    'resize/composite operation',
    'block operation',
  ])('records %s as one atomic history intention', (operation) => {
    const before = { operation: 'before' };
    const after = { operation };
    const changed = changeHistory({ past: [], future: [] }, before, true);
    const undone = undoHistory(changed, after);
    const redone = redoHistory(undone.history, undone.content!);

    expect(changed.past).toEqual([before]);
    expect(undone.content).toEqual(before);
    expect(redone.content).toEqual(after);
  });

  it('round-trips participant creation as one save/reopen-compatible action', () => {
    const before = { participants: [] };
    const after = { participants: [{ id: 'p1', name: 'TramiteActual', classifierName: 'Tramite' }] };
    const changed = changeHistory({ past: [], future: [] }, before, true);
    const undone = undoHistory(changed, after);
    const redone = redoHistory(undone.history, undone.content!);

    expect(undone.content).toEqual(before);
    expect(redone.content).toEqual(after);
  });
});
