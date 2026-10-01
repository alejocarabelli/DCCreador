import { describe, expect, it } from 'vitest';
import type { Rect } from 'reactflow';
import { getDiagramImageExportBounds } from './diagramImageExport';

const nodes = { x: 100, y: 200, width: 640, height: 100 };
const viewport = (rects: Rect[], zoom = 1): Parameters<typeof getDiagramImageExportBounds>[0] => ({
  getBoundingClientRect: () => ({ left: 300, top: 150 }),
  querySelectorAll: () => rects.map((rect) => ({
    getBoundingClientRect: () => ({ left: 300 + rect.x * zoom, top: 150 + rect.y * zoom, width: rect.width * zoom, height: rect.height * zoom }),
  })),
} as unknown as Parameters<typeof getDiagramImageExportBounds>[0]);

describe('class diagram image export bounds', () => {
  it.each([0.5, 1, 2])('includes a label outside the nodes at viewport zoom %s', (zoom) => {
    const label = { x: 1900, y: 500, width: 200, height: 30 };

    expect(getDiagramImageExportBounds(viewport([label], zoom), nodes, zoom))
      .toEqual({ x: 100, y: 200, width: 2000, height: 330 });
  });

  it('includes labels moved above and to the left of all nodes', () => {
    const label = { x: -600, y: -300, width: 200, height: 30 };

    expect(getDiagramImageExportBounds(viewport([label]), nodes, 1))
      .toEqual({ x: -600, y: -300, width: 1340, height: 600 });
  });

  it('includes a horizontal edge outside the nodes even though its bounding height is zero', () => {
    const path = { x: -100, y: 700, width: 1200, height: 0 };

    expect(getDiagramImageExportBounds(viewport([path]), nodes, 1))
      .toEqual({ x: -100, y: 200, width: 1200, height: 500 });
  });

  it('ignores hidden or invalid elements and falls back to the node bounds', () => {
    const hidden = { x: 0, y: 0, width: 0, height: 0 };
    const invalid = { x: Number.NaN, y: 0, width: 10, height: 10 };

    expect(getDiagramImageExportBounds(viewport([hidden, invalid]), nodes, 1)).toEqual(nodes);
    expect(getDiagramImageExportBounds(viewport([]), nodes, 0)).toEqual(nodes);
  });
});
