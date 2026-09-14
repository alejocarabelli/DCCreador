import { describe, expect, it } from 'vitest';
import { Position } from 'reactflow';
import { buildAssociationPath } from './associationRouting';
import { routeAroundObstacles, segmentCrossesObstacle } from './obstacleRouting';

const obstacle = { x: 340, y: 60, width: 220, height: 134 };
const source = { x: 299, y: 147 };
const target = { x: 601, y: 167 };
const obstacles = [
  { x: 82, y: 82, width: 216, height: 130 },
  { x: 602, y: 102, width: 216, height: 130 },
  obstacle,
];

describe('obstacle routing', () => {
  it('takes a clear orthogonal detour while preserving endpoints and their outward directions', () => {
    const route = routeAroundObstacles(source, target, { x: 1, y: 0 }, { x: -1, y: 0 }, obstacles);
    expect(route).not.toBeNull();
    expect(route![0]).toEqual(source);
    expect(route!.at(-1)).toEqual(target);
    expect(route![1].x).toBeGreaterThan(source.x);
    expect(route!.at(-2)!.x).toBeLessThan(target.x);
    for (let i = 1; i < route!.length; i++) {
      const a = route![i - 1]; const b = route![i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
      expect(obstacles.some(rect => segmentCrossesObstacle(a, b, rect))).toBe(false);
    }
  });
  it('detects a diagonal crossing and allows boundary contact', () => {
    expect(segmentCrossesObstacle({ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 40, y: 40, width: 20, height: 20 })).toBe(true);
    expect(segmentCrossesObstacle({ x: 0, y: 40 }, { x: 100, y: 40 }, { x: 40, y: 40, width: 20, height: 20 })).toBe(false);
  });
  it('leaves a deliberately straight line straight even with an obstacle', () => {
    const result = buildAssociationPath({ sourceX: source.x, sourceY: source.y, targetX: target.x, targetY: target.y, sourcePosition: Position.Right, targetPosition: Position.Left, lineStyle: 'straight', obstacles });
    expect(result.style).toBe('straight');
  });
  it('falls back without crashing when overlapping classes block the starting point', () => {
    const result = buildAssociationPath({ sourceX: source.x, sourceY: source.y, targetX: target.x, targetY: target.y, sourcePosition: Position.Right, targetPosition: Position.Left, lineStyle: 'automatic', obstacles: [{ x: 200, y: 0, width: 800, height: 800 }] });
    expect(result.path).not.toContain('NaN');
    expect(result.path).toContain('M');
  });
});
