import type { XYPosition } from 'reactflow';

/** Footprint assumed for a class that React Flow has not measured yet. */
export const DEFAULT_CLASS_SIZE = { width: 240, height: 150 };

const SLOT_GAP = 48;
const MAX_RINGS = 24;

type Rect = { x: number; y: number; width: number; height: number };

type ClassLikeData = {
  name?: string;
  attributes?: Array<{ name: string; type: string }>;
  methods?: Array<{ name: string; parameters: string; returnType: string }>;
};

/** Any canvas node: React Flow fills width and height once it has measured it. */
export type PlacedNode = { position: XYPosition; width?: number | null; height?: number | null; data?: unknown };

// Class boxes grow with their longest line, so a fixed footprint let a class
// with a long signature spill over its neighbours. ~7px per character matches
// the 13px member text closely enough for placement.
const CHAR_WIDTH = 7;
const LINE_HEIGHT = 24;

export const estimateClassSize = (data: ClassLikeData): { width: number; height: number } => {
  const attributes = data.attributes ?? [];
  const methods = data.methods ?? [];
  const lines = [
    `${data.name ?? ''}`,
    ...attributes.map((attribute) => `- ${attribute.name}: ${attribute.type}`),
    ...methods.map((method) => `+ ${method.name}(${method.parameters})${method.returnType ? ` : ${method.returnType}` : ''}`),
  ];
  const longest = Math.max(0, ...lines.map((line) => line.length));
  return {
    width: Math.max(DEFAULT_CLASS_SIZE.width, Math.round(longest * CHAR_WIDTH + 40)),
    height: Math.max(DEFAULT_CLASS_SIZE.height, 96 + (Math.max(1, attributes.length) + Math.max(1, methods.length)) * LINE_HEIGHT),
  };
};

const nodeRect = (node: PlacedNode): Rect => {
  const estimate = node.data !== null && typeof node.data === 'object' && 'methods' in node.data
    ? estimateClassSize(node.data as ClassLikeData)
    : DEFAULT_CLASS_SIZE;
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? estimate.width,
    height: node.height ?? estimate.height,
  };
};

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width + SLOT_GAP
  && a.x + a.width + SLOT_GAP > b.x
  && a.y < b.y + b.height + SLOT_GAP
  && a.y + a.height + SLOT_GAP > b.y;

/**
 * Returns the free slot closest to `preferred`, scanning rings of a grid sized
 * to one class plus a gap. New classes never land on top of an existing one,
 * which is how two quick "Crear clase" clicks used to stack a class under the
 * previous one.
 */
export const findFreeClassPosition = (
  occupied: PlacedNode[],
  preferred: XYPosition,
  size: { width: number; height: number } = DEFAULT_CLASS_SIZE,
): XYPosition => {
  const rects = occupied.map(nodeRect);
  const stepX = size.width + SLOT_GAP;
  const stepY = size.height + SLOT_GAP;
  const isFree = (position: XYPosition): boolean =>
    !rects.some((rect) => overlaps({ ...position, ...size }, rect));

  for (let ring = 0; ring <= MAX_RINGS; ring += 1) {
    const candidates: XYPosition[] = [];
    for (let row = -ring; row <= ring; row += 1) {
      for (let column = -ring; column <= ring; column += 1) {
        if (Math.max(Math.abs(row), Math.abs(column)) !== ring) continue;
        candidates.push({ x: preferred.x + column * stepX, y: preferred.y + row * stepY });
      }
    }
    // Reading order inside a ring: prefer right, then below, before left or above.
    candidates.sort((a, b) =>
      Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y)
      || b.x - a.x
      || b.y - a.y);
    const free = candidates.find(isFree);
    if (free !== undefined) return free;
  }

  const bottom = Math.max(preferred.y, ...rects.map((rect) => rect.y + rect.height));
  return { x: preferred.x, y: bottom + SLOT_GAP };
};
