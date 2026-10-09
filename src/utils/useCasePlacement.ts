import type { XYPosition } from 'reactflow';

/** Distances are screen pixels, as the person sees them, whatever the zoom. */
export const NEW_ELEMENT_EDGE_MARGIN = 48;
/** Closer than this to another element (on both axes) and the spot is taken. */
export const NEW_ELEMENT_CLEARANCE = 24;
/** Each retry moves the candidate this far right and down. */
export const NEW_ELEMENT_CASCADE_STEP = 32;
export const NEW_ELEMENT_MAX_ATTEMPTS = 10;

export type PlacementRect = { x: number; y: number; width: number; height: number };

export type PlacementRequest = {
  /** The visible part of the canvas, in screen pixels. */
  canvas: { width: number; height: number };
  viewport: { x: number; y: number; zoom: number };
  /** The new element's size in canvas units. */
  size: { width: number; height: number };
  /** Existing elements in canvas units. */
  occupied: PlacementRect[];
};

const wrap = (value: number, min: number, max: number): number => {
  const span = max - min;
  return span <= 0 ? min : min + ((((value - min) % span) + span) % span);
};

/** True when two rectangles (screen pixels) are less than the clearance apart on both axes. */
const isTooClose = (a: PlacementRect, b: PlacementRect, clearance: number): boolean => {
  const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
  const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
  return gapX < clearance && gapY < clearance;
};

/**
 * Where an element created from the toolbar lands: in the middle of what the
 * person sees, at least the edge margin away from every side. If that spot is
 * taken, it cascades right and down until it finds room, up to a few tries.
 * Failing that, it takes the tried spot with the least overlap with what is there.
 */
export const placeNewElement = ({ canvas, viewport, size, occupied }: PlacementRequest): XYPosition => {
  const zoom = viewport.zoom > 0 ? viewport.zoom : 1;
  const width = size.width * zoom;
  const height = size.height * zoom;
  const busy = occupied.map((rect) => ({
    x: rect.x * zoom + viewport.x,
    y: rect.y * zoom + viewport.y,
    width: rect.width * zoom,
    height: rect.height * zoom,
  }));

  const minX = NEW_ELEMENT_EDGE_MARGIN;
  const minY = NEW_ELEMENT_EDGE_MARGIN;
  // When the element is bigger than the visible area it cannot keep the margin on both sides; the top-left margin wins.
  const maxX = Math.max(minX, canvas.width - NEW_ELEMENT_EDGE_MARGIN - width);
  const maxY = Math.max(minY, canvas.height - NEW_ELEMENT_EDGE_MARGIN - height);
  const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
  const start = {
    x: clamp((canvas.width - width) / 2, minX, maxX),
    y: clamp((canvas.height - height) / 2, minY, maxY),
  };

  const toCanvas = (point: { x: number; y: number }): XYPosition => ({
    x: Math.round((point.x - viewport.x) / zoom),
    y: Math.round((point.y - viewport.y) / zoom),
  });

  const overlapArea = (a: PlacementRect, b: PlacementRect): number =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

  let leastOverlap = { point: start, area: Number.POSITIVE_INFINITY };
  for (let attempt = 0; attempt < NEW_ELEMENT_MAX_ATTEMPTS; attempt += 1) {
    const candidate = {
      x: wrap(start.x + attempt * NEW_ELEMENT_CASCADE_STEP, minX, maxX),
      y: wrap(start.y + attempt * NEW_ELEMENT_CASCADE_STEP, minY, maxY),
    };
    const frame = { ...candidate, width, height };
    if (busy.every((rect) => !isTooClose(frame, rect, NEW_ELEMENT_CLEARANCE))) {
      return toCanvas(candidate);
    }
    const area = busy.reduce((sum, rect) => sum + overlapArea(frame, rect), 0);
    if (area < leastOverlap.area) leastOverlap = { point: candidate, area };
  }

  // Every retry is taken: the tried spot that overlaps the least, never one exactly on top of another element.
  return toCanvas(leastOverlap.point);
};
