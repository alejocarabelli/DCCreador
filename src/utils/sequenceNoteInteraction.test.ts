import { describe, expect, it } from 'vitest';
import { hasMeaningfulSequenceNoteDrag, resolveSequenceNoteDragPosition } from './sequenceNoteInteraction';

describe('sequence note pointer interaction', () => {
  it('keeps canvas coordinates stable across zoom and horizontal/vertical scroll', () => {
    expect(resolveSequenceNoteDragPosition(
      { x: 120, y: 80 },
      { clientX: 100, clientY: 200, scrollLeft: 40, scrollTop: 20 },
      { clientX: 130, clientY: 230, scrollLeft: 70, scrollTop: 50 },
      0.5,
    )).toEqual({ x: 240, y: 200 });

    expect(resolveSequenceNoteDragPosition(
      { x: 120, y: 80 },
      { clientX: 100, clientY: 200, scrollLeft: 40, scrollTop: 20 },
      { clientX: 130, clientY: 225, scrollLeft: 25, scrollTop: 10 },
      1.5,
    )).toEqual({ x: 130, y: 90 });
  });

  it('does not turn a click into a drag, but accepts a real short movement', () => {
    const start = { clientX: 100, clientY: 100 };
    expect(hasMeaningfulSequenceNoteDrag(start, { clientX: 101, clientY: 101 })).toBe(false);
    expect(hasMeaningfulSequenceNoteDrag(start, { clientX: 102, clientY: 102 })).toBe(true);
  });
});
