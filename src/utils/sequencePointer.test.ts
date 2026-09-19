import { describe, expect, it } from 'vitest';
import { sequencePointerToCanvas } from './sequencePointer';

describe('sequencePointerToCanvas', () => {
  it.each([0.3, 1, 1.5])('keeps pointer conversion coherent at %s zoom', (zoom) => {
    const point = sequencePointerToCanvas(
      { clientX: 260, clientY: 170 },
      { left: 100, top: 50 },
      zoom,
    );

    expect(point.x).toBeCloseTo(160 / zoom);
    expect(point.y).toBeCloseTo(120 / zoom);
  });

  it('falls back to unit zoom for invalid values', () => {
    expect(sequencePointerToCanvas({ clientX: 160, clientY: 120 }, { left: 10, top: 20 }, 0))
      .toEqual({ x: 150, y: 100 });
  });
});
