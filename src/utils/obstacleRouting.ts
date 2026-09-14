import type { XYPosition } from 'reactflow';

export type RoutingObstacle = { x: number; y: number; width: number; height: number };

export function segmentCrossesObstacle(a: XYPosition, b: XYPosition, rect: RoutingObstacle): boolean {
  // Clip to the open interior, so a route may run along a rectangle's boundary.
  const epsilon = 0.01;
  const min = { x: rect.x + epsilon, y: rect.y + epsilon };
  const max = { x: rect.x + rect.width - epsilon, y: rect.y + rect.height - epsilon };
  let enter = 0;
  let leave = 1;
  for (const axis of ['x', 'y'] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < epsilon) {
      if (a[axis] < min[axis] || a[axis] > max[axis]) return false;
    } else {
      const t1 = (min[axis] - a[axis]) / delta;
      const t2 = (max[axis] - a[axis]) / delta;
      enter = Math.max(enter, Math.min(t1, t2));
      leave = Math.min(leave, Math.max(t1, t2));
      if (enter > leave) return false;
    }
  }
  return true;
}

const compact = (points: XYPosition[]): XYPosition[] => {
  const result: XYPosition[] = [];
  for (const point of points) {
    const last = result.at(-1);
    if (last?.x === point.x && last.y === point.y) continue;
    result.push(point);
  }
  return result;
};

export function routeAroundObstacles(
  source: XYPosition,
  target: XYPosition,
  sourceDirection: XYPosition,
  targetDirection: XYPosition,
  obstacles: RoutingObstacle[],
): XYPosition[] | null {
  const a = { x: source.x + sourceDirection.x * 28, y: source.y + sourceDirection.y * 28 };
  const b = { x: target.x + targetDirection.x * 28, y: target.y + targetDirection.y * 28 };
  const candidates: XYPosition[][] = [
    [source, a, { x: a.x, y: b.y }, b, target],
    [source, a, { x: b.x, y: a.y }, b, target],
  ];
  const xs = new Set([(a.x + b.x) / 2, ...obstacles.flatMap(rect => [rect.x - 12, rect.x + rect.width + 12])]);
  const ys = new Set([(a.y + b.y) / 2, ...obstacles.flatMap(rect => [rect.y - 12, rect.y + rect.height + 12])]);
  for (const x of xs) candidates.push([source, a, { x, y: a.y }, { x, y: b.y }, b, target]);
  for (const y of ys) candidates.push([source, a, { x: a.x, y }, { x: b.x, y }, b, target]);
  let best: XYPosition[] | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const points = compact(candidate);
    let score = 0;
    let valid = true;
    let previousDirection: XYPosition | null = null;
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      if (obstacles.some(rect => segmentCrossesObstacle(from, to, rect))) { valid = false; break; }
      const direction = { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
      // Reject retracing a segment, including a turn back through an endpoint marker.
      if (previousDirection && direction.x === -previousDirection.x && direction.y === -previousDirection.y) {
        valid = false; break;
      }
      const turns = previousDirection && (direction.x !== previousDirection.x || direction.y !== previousDirection.y);
      score += Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + (turns ? 20 : 0);
      previousDirection = direction;
    }
    if (valid && score < bestScore) { best = points; bestScore = score; }
  }
  return best;
}
