import type { ArtifactNotebook, NotebookBlock, SketchColor, SketchShape } from '../types/diagram';
import { createId } from './id';

export const NOTEBOOK_LOGICAL_WIDTH = 1000;
export const DEFAULT_SKETCH_HEIGHT = 660;
export const MIN_SKETCH_HEIGHT = 240;
export const MAX_SKETCH_HEIGHT = 3000;

/** Points are x,y pairs. */
export const MAX_STROKE_POINTS = 400;
export const MAX_NOTEBOOK_POINTS = 20000;
export const MAX_SHAPES_PER_SKETCH = 600;
export const MAX_TEXT_LENGTH = 20000;
export const MAX_BLOCKS = 500;

const SKETCH_COLORS: readonly SketchColor[] = ['ink', 'accent', 'red'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Rounds to an integer and never yields -0, so JSON round-trips stay equal. */
const toInt = (value: number): number => Math.round(value) + 0;

const isSketchColor = (value: unknown): value is SketchColor =>
  typeof value === 'string' && (SKETCH_COLORS as readonly string[]).includes(value);

type Pt = readonly [number, number];

const perpendicularDistance = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.sqrt(lengthSquared);
};

/** Iterative Ramer-Douglas-Peucker; keeps the first and last point. */
const douglasPeucker = (points: Pt[], tolerance: number): Pt[] => {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = perpendicularDistance(points[i], points[start], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
};

const toPairs = (points: number[]): Pt[] => {
  const pairs: Pt[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    pairs.push([points[i], points[i + 1]]);
  }
  return pairs;
};

const dropConsecutiveDuplicates = (points: Pt[]): Pt[] =>
  points.filter((point, i) => i === 0 || point[0] !== points[i - 1][0] || point[1] !== points[i - 1][1]);

/**
 * Reduces a freehand stroke (flat [x0, y0, x1, y1, ...] in logical units) to
 * integer points, never more than MAX_STROKE_POINTS pairs.
 */
export const simplifyStroke = (points: number[], tolerance = 1.5): number[] => {
  const rounded = dropConsecutiveDuplicates(
    toPairs(points.filter(isFiniteNumber))
      .map(([x, y]): Pt => [toInt(x), toInt(y)]),
  );
  if (rounded.length <= 1) return rounded.flatMap(([x, y]) => [x, y]);

  let currentTolerance = Math.max(tolerance, 0);
  let result = dropConsecutiveDuplicates(douglasPeucker(rounded, currentTolerance));
  while (result.length > MAX_STROKE_POINTS) {
    currentTolerance = Math.max(currentTolerance, 0.5) * 1.6;
    result = dropConsecutiveDuplicates(douglasPeucker(rounded, currentTolerance));
  }
  return result.flatMap(([x, y]) => [x, y]);
};

/** Keeps a valid, unused id; otherwise makes a new one. */
const takeId = (value: unknown, usedIds: Set<string>): string => {
  let id = typeof value === 'string' && value.length > 0 && !usedIds.has(value) ? value : createId();
  while (usedIds.has(id)) id = createId();
  usedIds.add(id);
  return id;
};

const normalizeShape = (value: unknown, usedIds: Set<string>): SketchShape | null => {
  if (!isRecord(value) || !isSketchColor(value.color)) return null;
  const color = value.color;
  const id = takeId(value.id, usedIds);

  if (value.kind === 'pen') {
    if (!Array.isArray(value.points) || !value.points.every(isFiniteNumber)) return null;
    const evenLength = value.points.length - (value.points.length % 2);
    let points = value.points.slice(0, evenLength).map(toInt);
    if (points.length === 0) return null;
    if (points.length / 2 > MAX_STROKE_POINTS) points = simplifyStroke(points);
    return { id, kind: 'pen', color, points };
  }

  if (value.kind === 'arrow') {
    const { x1, y1, x2, y2 } = value;
    if (!isFiniteNumber(x1) || !isFiniteNumber(y1) || !isFiniteNumber(x2) || !isFiniteNumber(y2)) return null;
    return { id, kind: 'arrow', color, x1: toInt(x1), y1: toInt(y1), x2: toInt(x2), y2: toInt(y2) };
  }

  if (value.kind === 'rect') {
    const { x, y, w, h } = value;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) return null;
    return { id, kind: 'rect', color, x: toInt(x), y: toInt(y), w: toInt(w), h: toInt(h) };
  }

  if (value.kind === 'text') {
    const { x, y, text } = value;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || typeof text !== 'string') return null;
    if (text.trim().length === 0) return null;
    return { id, kind: 'text', color, x: toInt(x), y: toInt(y), text: text.slice(0, MAX_TEXT_LENGTH) };
  }

  return null;
};

const normalizeBlock = (value: unknown, usedIds: Set<string>): NotebookBlock | null => {
  if (!isRecord(value)) return null;

  if (value.kind === 'text' || value.kind === 'question') {
    if (typeof value.text !== 'string') return null;
    const id = takeId(value.id, usedIds);
    const text = value.text.slice(0, MAX_TEXT_LENGTH);
    return value.kind === 'text'
      ? { id, kind: 'text', text }
      : { id, kind: 'question', text, resolved: value.resolved === true };
  }

  if (value.kind === 'sketch') {
    const id = takeId(value.id, usedIds);
    const height = isFiniteNumber(value.height)
      ? Math.min(MAX_SKETCH_HEIGHT, Math.max(MIN_SKETCH_HEIGHT, toInt(value.height)))
      : DEFAULT_SKETCH_HEIGHT;
    const shapes: SketchShape[] = [];
    const shapeIds = new Set<string>();
    if (Array.isArray(value.shapes)) {
      for (const rawShape of value.shapes) {
        if (shapes.length >= MAX_SHAPES_PER_SKETCH) break;
        const shape = normalizeShape(rawShape, shapeIds);
        if (shape !== null) shapes.push(shape);
      }
    }
    return { id, kind: 'sketch', height, shapes };
  }

  return null;
};

/** Repairs a loaded notebook, dropping what is broken. Idempotent. */
export const normalizeArtifactNotebook = (value: unknown): ArtifactNotebook | undefined => {
  if (!isRecord(value) || !Array.isArray(value.blocks)) return undefined;

  const usedIds = new Set<string>();
  const blocks: NotebookBlock[] = [];
  for (const rawBlock of value.blocks) {
    if (blocks.length >= MAX_BLOCKS) break;
    const block = normalizeBlock(rawBlock, usedIds);
    if (block !== null) blocks.push(block);
  }

  return blocks.length > 0 ? { version: 1, blocks } : undefined;
};

export const countPendingQuestions = (notebook: ArtifactNotebook | undefined): number =>
  notebook === undefined
    ? 0
    : notebook.blocks.filter((block) => block.kind === 'question' && !block.resolved && block.text.trim().length > 0).length;

export const countResolvedQuestions = (notebook: ArtifactNotebook | undefined): number =>
  notebook === undefined
    ? 0
    : notebook.blocks.filter((block) => block.kind === 'question' && block.resolved).length;

/** Total pen point pairs across the notebook. */
export const countNotebookPoints = (notebook: ArtifactNotebook | undefined): number => {
  if (notebook === undefined) return 0;
  let total = 0;
  for (const block of notebook.blocks) {
    if (block.kind !== 'sketch') continue;
    for (const shape of block.shapes) {
      if (shape.kind === 'pen') total += shape.points.length / 2;
    }
  }
  return total;
};

export const isNotebookBlockEmpty = (block: NotebookBlock): boolean =>
  block.kind === 'sketch' ? block.shapes.length === 0 : block.text.trim().length === 0;

export const createNotebookBlock = (kind: NotebookBlock['kind']): NotebookBlock => {
  const id = createId();
  if (kind === 'text') return { id, kind: 'text', text: '' };
  if (kind === 'question') return { id, kind: 'question', text: '', resolved: false };
  return { id, kind: 'sketch', height: DEFAULT_SKETCH_HEIGHT, shapes: [] };
};

export const isNotebookEmpty = (notebook: ArtifactNotebook | undefined): boolean =>
  notebook === undefined || notebook.blocks.every(isNotebookBlockEmpty);
