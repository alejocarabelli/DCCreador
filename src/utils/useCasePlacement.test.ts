import { describe, expect, it } from 'vitest';
import { NEW_ELEMENT_EDGE_MARGIN, NEW_ELEMENT_MAX_ATTEMPTS, placeNewElement, type PlacementRect } from './useCasePlacement';

const canvas = { width: 1000, height: 700 };
const useCase = { width: 226, height: 112 };
const origin = { x: 0, y: 0, zoom: 1 };

/** Where a canvas position lands on screen, as a rectangle. */
const onScreen = (position: { x: number; y: number }, size: { width: number; height: number }, viewport: typeof origin): PlacementRect => ({
  x: position.x * viewport.zoom + viewport.x,
  y: position.y * viewport.zoom + viewport.y,
  width: size.width * viewport.zoom,
  height: size.height * viewport.zoom,
});

const expectInsideMargin = (rect: PlacementRect): void => {
  expect(rect.x).toBeGreaterThanOrEqual(NEW_ELEMENT_EDGE_MARGIN);
  expect(rect.y).toBeGreaterThanOrEqual(NEW_ELEMENT_EDGE_MARGIN);
  expect(rect.x + rect.width).toBeLessThanOrEqual(canvas.width - NEW_ELEMENT_EDGE_MARGIN);
  expect(rect.y + rect.height).toBeLessThanOrEqual(canvas.height - NEW_ELEMENT_EDGE_MARGIN);
};

const overlaps = (a: PlacementRect, b: PlacementRect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('placeNewElement', () => {
  it('starts in the middle of an empty canvas', () => {
    const position = placeNewElement({ canvas, viewport: origin, size: useCase, occupied: [] });
    expect(position).toEqual({ x: Math.round((1000 - 226) / 2), y: Math.round((700 - 112) / 2) });
  });

  it('keeps the edge margin from every side, at any zoom and pan', () => {
    const views = [
      origin,
      { x: -300, y: -200, zoom: 0.5 },
      { x: 120, y: 60, zoom: 1.6 },
    ];
    for (const viewport of views) {
      const position = placeNewElement({ canvas, viewport, size: useCase, occupied: [] });
      expectInsideMargin(onScreen(position, useCase, viewport));
    }
  });

  it('cascades 32 px right and down past a taken spot', () => {
    const start = placeNewElement({ canvas, viewport: origin, size: useCase, occupied: [] });
    const second = placeNewElement({ canvas, viewport: origin, size: useCase, occupied: [{ ...start, ...useCase }] });
    // Overlapping on x until 226 px apart, and on y until 112 px: the first free step is 5 cascades away.
    expect(second).toEqual({ x: start.x + 160, y: start.y + 160 });
    expect(overlaps(onScreen(second, useCase, origin), onScreen(start, useCase, origin))).toBe(false);
  });

  it('counts an element 24 px or less away as taken, and one 24 px or more away as free', () => {
    const start = placeNewElement({ canvas, viewport: origin, size: useCase, occupied: [] });
    // Right of the spot, 20 px gap, same height: too close.
    const near = placeNewElement({ canvas, viewport: origin, size: useCase, occupied: [{ x: start.x + 226 + 20, y: start.y, width: 100, height: 112 }] });
    expect(near).not.toEqual(start);
    // 30 px gap: the spot is still free.
    const far = placeNewElement({ canvas, viewport: origin, size: useCase, occupied: [{ x: start.x + 226 + 30, y: start.y, width: 100, height: 112 }] });
    expect(far).toEqual(start);
  });

  it('returns the middle spot when every retry is taken', () => {
    // A canvas big enough that no retry wraps around the edge.
    const big = { width: 2000, height: 1500 };
    const start = placeNewElement({ canvas: big, viewport: origin, size: useCase, occupied: [] });
    const taken: PlacementRect[] = Array.from({ length: NEW_ELEMENT_MAX_ATTEMPTS }, (_, attempt) => ({
      x: start.x + attempt * 32,
      y: start.y + attempt * 32,
      ...useCase,
    }));
    expect(placeNewElement({ canvas: big, viewport: origin, size: useCase, occupied: taken })).toEqual(start);
  });

  it('keeps the top-left margin when the element does not fit the visible area', () => {
    const position = placeNewElement({ canvas: { width: 200, height: 150 }, viewport: origin, size: useCase, occupied: [] });
    expect(position).toEqual({ x: NEW_ELEMENT_EDGE_MARGIN, y: NEW_ELEMENT_EDGE_MARGIN });
  });

  it('measures the cascade in screen pixels, so it does not depend on zoom', () => {
    const viewport = { x: 40, y: 30, zoom: 0.5 };
    const start = placeNewElement({ canvas, viewport, size: useCase, occupied: [] });
    const second = placeNewElement({ canvas, viewport, size: useCase, occupied: [{ ...start, ...useCase }] });
    const firstScreen = onScreen(start, useCase, viewport);
    const secondScreen = onScreen(second, useCase, viewport);
    // On screen the element is 113x56 px: the first free step is the third cascade, 96 px.
    expect(secondScreen.x - firstScreen.x).toBeCloseTo(96, 0);
    expect(secondScreen.y - firstScreen.y).toBeCloseTo(96, 0);
    expectInsideMargin(secondScreen);
  });
});
