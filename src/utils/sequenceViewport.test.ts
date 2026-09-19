import { describe, expect, it } from 'vitest';
import { centerSequenceViewportOnTarget, expandSequenceViewportAtEdge } from './sequenceViewport';

describe('sequence viewport contract', () => {
  it('centers a search target without changing document coordinates', () => {
    expect(centerSequenceViewportOnTarget({
      target: { x: 400, y: 300, width: 100, height: 60 },
      viewportWidth: 800,
      viewportHeight: 500,
      zoom: 1,
    })).toEqual({ left: 90, top: 120 });
  });

  it('expands only local viewport space when reaching an edge', () => {
    expect(expandSequenceViewportAtEdge({
      currentWidth: 1200,
      currentHeight: 900,
      scrollWidth: 1200,
      scrollHeight: 900,
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 800,
      clientHeight: 500,
    })).toMatchObject({ width: 1200, height: 900, expanded: false });

    expect(expandSequenceViewportAtEdge({
      currentWidth: 1200,
      currentHeight: 900,
      scrollWidth: 1200,
      scrollHeight: 900,
      scrollLeft: 390,
      scrollTop: 390,
      clientWidth: 800,
      clientHeight: 500,
    })).toMatchObject({ width: 2400, height: 2100, expanded: true });
  });
});
