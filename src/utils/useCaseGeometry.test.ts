import { describe, expect, it } from 'vitest';
import { facingSide, floatingEndpoints, isInside, outlinePoint, anchorBoxForUseCaseNode } from './useCaseGeometry';

const oval = { x: 0, y: 0, width: 200, height: 100 };

describe('use case geometry', () => {
  it('ends a line on the ellipse of a use case', () => {
    expect(outlinePoint('use-case', oval, { x: 500, y: 50 })).toEqual({ x: 200, y: 50 });
    expect(outlinePoint('use-case', oval, { x: 100, y: -300 })).toEqual({ x: 100, y: 0 });
    const diagonal = outlinePoint('use-case', oval, { x: 300, y: 250 });
    // On the ellipse: ((x-100)/100)^2 + ((y-50)/50)^2 = 1
    expect(((diagonal.x - 100) / 100) ** 2 + ((diagonal.y - 50) / 50) ** 2).toBeCloseTo(1);
  });

  it('touches only the stick figure of an actor, not its name', () => {
    const actorNode = { x: 0, y: 0, width: 110, height: 124 };
    expect(anchorBoxForUseCaseNode('actor', actorNode)).toEqual({ x: 19, y: 0, width: 72, height: 92 });
    const ends = floatingEndpoints(
      { kind: 'actor', box: actorNode },
      { kind: 'use-case', box: { x: 400, y: -4, width: 200, height: 100 } },
    );
    expect(ends.source.x).toBeCloseTo(91);
    expect(ends.target.x).toBeCloseTo(400);
  });

  it('picks the side facing the other node', () => {
    expect(facingSide(oval, { x: 400, y: 0, width: 10, height: 10 })).toBe('right');
    expect(facingSide(oval, { x: -400, y: 0, width: 10, height: 10 })).toBe('left');
    expect(facingSide(oval, { x: 90, y: 400, width: 10, height: 10 })).toBe('bottom');
  });

  it('knows what lies inside the system boundary', () => {
    const boundary = { x: 0, y: 0, width: 500, height: 300 };
    expect(isInside({ x: 100, y: 100, width: 200, height: 100 }, boundary)).toBe(true);
    expect(isInside({ x: 450, y: 100, width: 200, height: 100 }, boundary)).toBe(false);
  });
});
