import { describe, expect, it } from 'vitest';
import type { SketchShape } from '../../types/diagram';
import {
  arrowPath,
  clampDelta,
  contentBottom,
  hitShape,
  rectFromCorners,
  shapeBounds,
  shapesTouchedBySegment,
  smoothPath,
  snapAngle,
  topShapeAt,
  translateShape,
} from './sketchGeometry';

const pen: SketchShape = { id: 'p', kind: 'pen', color: 'ink', points: [0, 0, 100, 0, 100, 100] };
const arrow: SketchShape = { id: 'a', kind: 'arrow', color: 'accent', x1: 200, y1: 200, x2: 400, y2: 200 };
const rect: SketchShape = { id: 'r', kind: 'rect', color: 'red', x: 500, y: 100, w: 200, h: 100 };
const label: SketchShape = { id: 't', kind: 'text', color: 'ink', x: 50, y: 300, text: 'hola' };

describe('smoothPath', () => {
  it('is empty without points and a dot for a single point', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([10, 20])).toBe('M10 20h0.01');
  });

  it('draws a straight segment for two points', () => {
    expect(smoothPath([0, 0, 10, 10])).toBe('M0 0L10 10');
  });

  it('curves through the midpoints with the samples as control points', () => {
    expect(smoothPath([0, 0, 10, 0, 10, 10])).toBe('M0 0Q10 0 10 5L10 10');
    expect(smoothPath([0, 0, 10, 0, 20, 10, 30, 10])).toBe('M0 0Q10 0 15 5Q20 10 25 10L30 10');
  });
});

describe('arrowPath', () => {
  it('is a line plus two short strokes ending at the tip (open head)', () => {
    const d = arrowPath(0, 0, 200, 0);
    expect(d.startsWith('M0 0L200 0')).toBe(true);
    expect(d.match(/M/g)).toHaveLength(3);
    expect(d.match(/L200 0/g)).toHaveLength(3);
  });

  it('shrinks the head on very short arrows and never breaks on zero length', () => {
    expect(arrowPath(5, 5, 5, 5)).toBe('M5 5L5 5');
    expect(arrowPath(0, 0, 10, 0)).toContain('L10 0');
  });
});

describe('rectFromCorners / snapAngle', () => {
  it('normalises any drag direction to a positive rectangle', () => {
    expect(rectFromCorners({ x: 100, y: 100 }, { x: 40, y: 20 })).toEqual({ x: 40, y: 20, w: 60, h: 80 });
  });

  it('squares on Shift, keeping the drag quadrant', () => {
    expect(rectFromCorners({ x: 100, y: 100 }, { x: 40, y: 150 }, true)).toEqual({ x: 40, y: 100, w: 60, h: 60 });
  });

  it('snaps to 45 degree steps', () => {
    const snapped = snapAngle({ x: 0, y: 0 }, { x: 100, y: 12 });
    expect(snapped.x).toBeCloseTo(Math.hypot(100, 12));
    expect(snapped.y).toBeCloseTo(0);
    const diagonal = snapAngle({ x: 0, y: 0 }, { x: 90, y: 100 });
    expect(diagonal.x).toBeCloseTo(diagonal.y);
  });
});

describe('hitShape', () => {
  it('hits a pen stroke near its segments only', () => {
    expect(hitShape(pen, 50, 4, 6)).toBe(true);
    expect(hitShape(pen, 50, 50, 6)).toBe(false);
  });

  it('hits a single-point dot', () => {
    expect(hitShape({ ...pen, points: [10, 10] }, 12, 10, 4)).toBe(true);
    expect(hitShape({ ...pen, points: [10, 10] }, 40, 10, 4)).toBe(false);
  });

  it('hits an arrow along its line', () => {
    expect(hitShape(arrow, 300, 203, 6)).toBe(true);
    expect(hitShape(arrow, 300, 230, 6)).toBe(false);
  });

  it('hits a rectangle by its outline, not its empty inside', () => {
    expect(hitShape(rect, 500, 150, 6)).toBe(true);
    expect(hitShape(rect, 600, 150, 6)).toBe(false);
  });

  it('hits text by its box', () => {
    expect(hitShape(label, 60, 320, 4)).toBe(true);
    expect(hitShape(label, 600, 320, 4)).toBe(false);
  });
});

describe('topShapeAt / shapesTouchedBySegment', () => {
  it('picks the shape drawn last', () => {
    const under: SketchShape = { id: 'under', kind: 'arrow', color: 'ink', x1: 0, y1: 0, x2: 100, y2: 0 };
    const over: SketchShape = { id: 'over', kind: 'arrow', color: 'ink', x1: 0, y1: 0, x2: 100, y2: 0 };
    expect(topShapeAt([under, over], 50, 0, 4)?.id).toBe('over');
    expect(topShapeAt([under, over], 50, 90, 4)).toBeUndefined();
  });

  it('erases every shape crossed by a fast sweep, not only those at the end points', () => {
    const ids = shapesTouchedBySegment([pen, arrow, rect, label], { x: 0, y: 200 }, { x: 800, y: 200 }, 8);
    expect(ids).toEqual(['a', 'r']);
  });
});

describe('translateShape / bounds', () => {
  it('moves every kind and keeps integers', () => {
    expect(translateShape(pen, 10.4, 5.6)).toMatchObject({ points: [10, 6, 110, 6, 110, 106] });
    expect(translateShape(arrow, 10, -10)).toMatchObject({ x1: 210, y1: 190, x2: 410, y2: 190 });
    expect(translateShape(rect, 1, 2)).toMatchObject({ x: 501, y: 102 });
    expect(translateShape(label, -50, 0)).toMatchObject({ x: 0, y: 300 });
  });

  it('computes bounds and the lowest edge', () => {
    expect(shapeBounds(pen)).toEqual({ x1: 0, y1: 0, x2: 100, y2: 100 });
    expect(shapeBounds(rect)).toEqual({ x1: 500, y1: 100, x2: 700, y2: 200 });
    expect(contentBottom([pen, rect])).toBe(200);
    expect(contentBottom([])).toBe(0);
  });

  it('keeps a moved selection inside the sheet', () => {
    const bounds = { x1: 100, y1: 100, x2: 300, y2: 200 };
    expect(clampDelta(bounds, -500, 5000, 660)).toEqual({ x: -100, y: 460 });
    expect(clampDelta(bounds, 5000, -500, 660)).toEqual({ x: 700, y: -100 });
  });
});
