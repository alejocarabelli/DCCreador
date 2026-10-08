import type { SketchShape } from '../../types/diagram';

/** All coordinates are logical units: a sketch is 1000 wide. */
export const SKETCH_WIDTH = 1000;
/** Text size in logical units (about 14 px at the default sheet width). */
export const SKETCH_TEXT_SIZE = 42;
const TEXT_LINE_HEIGHT = 1.2;
const TEXT_CHAR_WIDTH = 0.56;
/** Alphabetic baseline below the top of a text box whose line-height is 1. */
const TEXT_BASELINE = 0.875;
const ARROW_HEAD_LENGTH = 36;
const ARROW_HEAD_ANGLE = (28 * Math.PI) / 180;

export type Point = { x: number; y: number };
export type Bounds = { x1: number; y1: number; x2: number; y2: number };

const fmt = (value: number): string => String(Math.round(value * 10) / 10);

/**
 * Freehand stroke as a path through quadratic Béziers: every sample is a
 * control point and the curve passes through the midpoints between them.
 */
export const smoothPath = (points: number[]): string => {
  const count = Math.floor(points.length / 2);
  if (count === 0) return '';
  const x = (i: number) => points[i * 2];
  const y = (i: number) => points[i * 2 + 1];
  if (count === 1) return `M${fmt(x(0))} ${fmt(y(0))}h0.01`;
  if (count === 2) return `M${fmt(x(0))} ${fmt(y(0))}L${fmt(x(1))} ${fmt(y(1))}`;
  let d = `M${fmt(x(0))} ${fmt(y(0))}`;
  for (let i = 1; i < count - 1; i += 1) {
    d += `Q${fmt(x(i))} ${fmt(y(i))} ${fmt((x(i) + x(i + 1)) / 2)} ${fmt((y(i) + y(i + 1)) / 2)}`;
  }
  return `${d}L${fmt(x(count - 1))} ${fmt(y(count - 1))}`;
};

/** Straight line plus an open arrowhead (two short strokes) at the end. */
export const arrowPath = (x1: number, y1: number, x2: number, y2: number): string => {
  const line = `M${fmt(x1)} ${fmt(y1)}L${fmt(x2)} ${fmt(y2)}`;
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 1) return line;
  const head = Math.min(ARROW_HEAD_LENGTH, length * 0.5);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const wing = (sign: number) =>
    `M${fmt(x2 - head * Math.cos(angle + sign * ARROW_HEAD_ANGLE))} ${fmt(y2 - head * Math.sin(angle + sign * ARROW_HEAD_ANGLE))}L${fmt(x2)} ${fmt(y2)}`;
  return `${line}${wing(1)}${wing(-1)}`;
};

export const clampPoint = (point: Point, height: number): Point => ({
  x: Math.min(SKETCH_WIDTH, Math.max(0, point.x)),
  y: Math.min(height, Math.max(0, point.y)),
});

/** Snaps the end of a line to the nearest multiple of 45 degrees (Shift). */
export const snapAngle = (from: Point, to: Point): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return to;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + length * Math.cos(angle), y: from.y + length * Math.sin(angle) };
};

/** A rectangle from two corners, with positive size; `square` keeps it square (Shift). */
export const rectFromCorners = (a: Point, b: Point, square = false) => {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  return {
    x: Math.min(a.x, a.x + dx),
    y: Math.min(a.y, a.y + dy),
    w: Math.abs(dx),
    h: Math.abs(dy),
  };
};

const textLines = (text: string): string[] => text.split('\n');

export const textBounds = (shape: Extract<SketchShape, { kind: 'text' }>): Bounds => {
  const lines = textLines(shape.text);
  const longest = Math.max(...lines.map((line) => line.length), 1);
  return {
    x1: shape.x,
    y1: shape.y,
    x2: shape.x + longest * SKETCH_TEXT_SIZE * TEXT_CHAR_WIDTH,
    y2: shape.y + lines.length * SKETCH_TEXT_SIZE * TEXT_LINE_HEIGHT,
  };
};

/** First baseline of a text shape and the distance between lines. */
export const textMetrics = (shape: Extract<SketchShape, { kind: 'text' }>) => ({
  lines: textLines(shape.text),
  baseline: shape.y + SKETCH_TEXT_SIZE * TEXT_BASELINE,
  lineHeight: SKETCH_TEXT_SIZE * TEXT_LINE_HEIGHT,
});

export const shapeBounds = (shape: SketchShape): Bounds => {
  switch (shape.kind) {
    case 'pen': {
      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
      for (let i = 0; i + 1 < shape.points.length; i += 2) {
        x1 = Math.min(x1, shape.points[i]);
        x2 = Math.max(x2, shape.points[i]);
        y1 = Math.min(y1, shape.points[i + 1]);
        y2 = Math.max(y2, shape.points[i + 1]);
      }
      return Number.isFinite(x1) ? { x1, y1, x2, y2 } : { x1: 0, y1: 0, x2: 0, y2: 0 };
    }
    case 'arrow':
      return {
        x1: Math.min(shape.x1, shape.x2),
        y1: Math.min(shape.y1, shape.y2),
        x2: Math.max(shape.x1, shape.x2),
        y2: Math.max(shape.y1, shape.y2),
      };
    case 'rect':
      return { x1: shape.x, y1: shape.y, x2: shape.x + shape.w, y2: shape.y + shape.h };
    case 'text':
      return textBounds(shape);
  }
};

export const unionBounds = (list: Bounds[]): Bounds | null => {
  if (list.length === 0) return null;
  return list.reduce((acc, b) => ({
    x1: Math.min(acc.x1, b.x1),
    y1: Math.min(acc.y1, b.y1),
    x2: Math.max(acc.x2, b.x2),
    y2: Math.max(acc.y2, b.y2),
  }));
};

export const boundsIntersect = (a: Bounds, b: Bounds): boolean =>
  a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;

/** Lowest edge of the drawing: a sketch should not shrink above it. */
export const contentBottom = (shapes: readonly SketchShape[]): number =>
  shapes.reduce((bottom, shape) => Math.max(bottom, shapeBounds(shape).y2), 0);

export const distanceToSegment = (
  px: number, py: number, x1: number, y1: number, x2: number, y2: number,
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

/** True when (x, y) is within `tolerance` of the shape's ink (text and rectangles: outline / box). */
export const hitShape = (shape: SketchShape, x: number, y: number, tolerance: number): boolean => {
  switch (shape.kind) {
    case 'pen': {
      const { points } = shape;
      if (points.length === 2) return Math.hypot(x - points[0], y - points[1]) <= tolerance;
      for (let i = 0; i + 3 < points.length; i += 2) {
        if (distanceToSegment(x, y, points[i], points[i + 1], points[i + 2], points[i + 3]) <= tolerance) return true;
      }
      return false;
    }
    case 'arrow':
      return distanceToSegment(x, y, shape.x1, shape.y1, shape.x2, shape.y2) <= tolerance;
    case 'rect': {
      const { x: rx, y: ry, w, h } = shape;
      return (
        distanceToSegment(x, y, rx, ry, rx + w, ry) <= tolerance ||
        distanceToSegment(x, y, rx + w, ry, rx + w, ry + h) <= tolerance ||
        distanceToSegment(x, y, rx + w, ry + h, rx, ry + h) <= tolerance ||
        distanceToSegment(x, y, rx, ry + h, rx, ry) <= tolerance
      );
    }
    case 'text': {
      const b = textBounds(shape);
      return x >= b.x1 - tolerance && x <= b.x2 + tolerance && y >= b.y1 - tolerance && y <= b.y2 + tolerance;
    }
  }
};

/** The topmost shape under the point (later shapes are drawn over earlier ones). */
export const topShapeAt = (
  shapes: readonly SketchShape[], x: number, y: number, tolerance: number,
): SketchShape | undefined => {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    if (hitShape(shapes[i], x, y, tolerance)) return shapes[i];
  }
  return undefined;
};

/** Ids of the shapes touched by a pointer swept from `a` to `b` (eraser). */
export const shapesTouchedBySegment = (
  shapes: readonly SketchShape[], a: Point, b: Point, radius: number,
): string[] => {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(radius / 2, 1)));
  const ids: string[] = [];
  for (const shape of shapes) {
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      if (hitShape(shape, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radius)) {
        ids.push(shape.id);
        break;
      }
    }
  }
  return ids;
};

/** Moves a shape; offsets are rounded so stored coordinates stay integers. */
export const translateShape = (shape: SketchShape, dx: number, dy: number): SketchShape => {
  const mx = Math.round(dx);
  const my = Math.round(dy);
  switch (shape.kind) {
    case 'pen':
      return { ...shape, points: shape.points.map((value, i) => value + (i % 2 === 0 ? mx : my)) };
    case 'arrow':
      return { ...shape, x1: shape.x1 + mx, y1: shape.y1 + my, x2: shape.x2 + mx, y2: shape.y2 + my };
    case 'rect':
    case 'text':
      return { ...shape, x: shape.x + mx, y: shape.y + my };
  }
};

/** Limits an offset so the moved bounds stay inside the sheet. */
export const clampDelta = (bounds: Bounds, dx: number, dy: number, height: number): Point => ({
  x: Math.min(SKETCH_WIDTH - bounds.x2, Math.max(-bounds.x1, dx)),
  y: Math.min(height - bounds.y2, Math.max(-bounds.y1, dy)),
});
