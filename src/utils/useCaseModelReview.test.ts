import { describe, expect, it } from 'vitest';
import type { UseCaseModelContent, UseCaseNodeKind } from '../types/diagram';
import { reviewUseCaseModel } from './useCaseModelReview';

const node = (id: string, kind: UseCaseNodeKind, name: string) => ({
  id, type: kind === 'actor' ? 'useCaseActor' : kind === 'use-case' ? 'useCaseOval' : 'systemBoundary',
  position: { x: 0, y: 0 }, data: { kind, name },
}) as UseCaseModelContent['nodes'][number];
const edge = (id: string, source: string, target: string) => ({ id, source, target, data: { relationType: 'association' } }) as UseCaseModelContent['edges'][number];

describe('reviewUseCaseModel', () => {
  it('reports nothing for a connected, named model', () => {
    expect(reviewUseCaseModel({
      nodes: [node('a', 'actor', 'Cliente'), node('u', 'use-case', 'Comprar'), node('b', 'system-boundary', '')],
      edges: [edge('e', 'a', 'u')],
    })).toEqual([]);
  });

  it('flags unnamed actors and use cases as errors', () => {
    const issues = reviewUseCaseModel({
      nodes: [node('a', 'actor', '  '), node('u', 'use-case', ''), node('v', 'use-case', 'Pagar')],
      edges: [edge('e1', 'a', 'u'), edge('e2', 'a', 'v')],
    });
    expect(issues.filter(issue => issue.kind === 'error').map(issue => issue.nodeId)).toEqual(['a', 'u']);
  });

  it('treats the saved placeholder "Sin nombre" as unnamed, not as a repeated name', () => {
    const issues = reviewUseCaseModel({
      nodes: [node('a', 'actor', 'Sin nombre'), node('b', 'actor', 'Sin nombre'), node('u', 'use-case', 'Pagar')],
      edges: [edge('e1', 'a', 'u'), edge('e2', 'b', 'u')],
    });
    expect(issues.map(issue => [issue.nodeId, issue.kind])).toEqual([['a', 'error'], ['b', 'error']]);
  });

  it('flags repeated names ignoring case and outer spaces', () => {
    const issues = reviewUseCaseModel({
      nodes: [node('a1', 'actor', 'Cliente'), node('a2', 'actor', ' cliente '), node('u1', 'use-case', 'Pagar'), node('u2', 'use-case', 'PAGAR')],
      edges: [edge('e1', 'a1', 'u1'), edge('e2', 'a2', 'u2')],
    });
    expect(issues.map(issue => issue.nodeId).sort()).toEqual(['a1', 'a2', 'u1', 'u2']);
    expect(issues.every(issue => issue.kind === 'review')).toBe(true);
  });

  it('does not mix actors with use cases of the same name', () => {
    expect(reviewUseCaseModel({
      nodes: [node('a', 'actor', 'Pago'), node('u', 'use-case', 'Pago')],
      edges: [edge('e', 'a', 'u')],
    })).toEqual([]);
  });

  it('flags actors and use cases without any relation', () => {
    const issues = reviewUseCaseModel({
      nodes: [node('a', 'actor', 'Cliente'), node('u', 'use-case', 'Comprar'), node('v', 'use-case', 'Pagar')],
      edges: [edge('e', 'a', 'u')],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ nodeId: 'v', kind: 'review' });
  });

  it('counts include/extend between use cases as a relation', () => {
    expect(reviewUseCaseModel({
      nodes: [node('a', 'actor', 'Cliente'), node('u', 'use-case', 'Comprar'), node('v', 'use-case', 'Pagar')],
      edges: [edge('e', 'a', 'u'), edge('f', 'u', 'v')],
    })).toEqual([]);
  });
});
