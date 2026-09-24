import type { UseCaseNodeKind } from '../types/diagram';

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };

/** The actor figure (72×92) sits centred at the top of its node, above the name. */
export const ACTOR_FIGURE = { width: 72, height: 92 } as const;

/**
 * The part of a node a relation line should touch: the whole ellipse of a use
 * case, and only the stick figure of an actor (never its name underneath).
 */
export const anchorBoxForUseCaseNode = (kind: UseCaseNodeKind | undefined, node: Box): Box => {
  if (kind !== 'actor') return node;
  const width = Math.min(ACTOR_FIGURE.width, node.width);
  return {
    x: node.x + (node.width - width) / 2,
    y: node.y,
    width,
    height: Math.min(ACTOR_FIGURE.height, node.height),
  };
};

export const boxCenter = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/**
 * Where the straight line from the centre of `box` towards `toward` leaves the
 * shape: the ellipse inscribed in the box for use cases, the box itself for
 * actors. Lines therefore start and end on the outline and fan out naturally
 * instead of all leaving from one fixed handle.
 */
export const outlinePoint = (kind: UseCaseNodeKind | undefined, box: Box, toward: Point): Point => {
  const center = boxCenter(box);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const rx = box.width / 2;
  const ry = box.height / 2;

  if (kind === 'use-case') {
    const t = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
    return { x: center.x + dx * t, y: center.y + dy * t };
  }

  const t = Math.min(dx === 0 ? Infinity : rx / Math.abs(dx), dy === 0 ? Infinity : ry / Math.abs(dy));
  return { x: center.x + dx * t, y: center.y + dy * t };
};

/** The two ends of a floating relation between two nodes. */
export const floatingEndpoints = (
  source: { kind: UseCaseNodeKind | undefined; box: Box },
  target: { kind: UseCaseNodeKind | undefined; box: Box },
): { source: Point; target: Point } => {
  const sourceBox = anchorBoxForUseCaseNode(source.kind, source.box);
  const targetBox = anchorBoxForUseCaseNode(target.kind, target.box);
  return {
    source: outlinePoint(source.kind, sourceBox, boxCenter(targetBox)),
    target: outlinePoint(target.kind, targetBox, boxCenter(sourceBox)),
  };
};

/**
 * The side a relation leaves from, stored as the edge's handle so the first
 * version of the app (which draws from fixed handles) keeps drawing it well.
 */
export const facingSide = (from: Box, to: Box): 'top' | 'right' | 'bottom' | 'left' => {
  const a = boxCenter(from);
  const b = boxCenter(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
};

/** Whether the centre of `inner` lies inside `outer` (a node inside the system boundary). */
export const isInside = (inner: Box, outer: Box): boolean => {
  const center = boxCenter(inner);
  return center.x >= outer.x && center.x <= outer.x + outer.width && center.y >= outer.y && center.y <= outer.y + outer.height;
};
