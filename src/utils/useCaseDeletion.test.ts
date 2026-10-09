import { describe, expect, it } from 'vitest';
import type { UseCaseModelContent, UseCaseModelEdge, UseCaseModelNode } from '../types/diagram';
import { deleteUseCaseSelection } from './useCaseDeletion';

const node = (id: string, kind: UseCaseModelNode['data']['kind'] = 'actor'): UseCaseModelNode => ({
  id,
  type: kind === 'actor' ? 'useCaseActor' : 'useCaseOval',
  position: { x: 0, y: 0 },
  data: { kind, name: id },
});

const relation = (id: string, source: string, target: string): UseCaseModelEdge => ({
  id,
  source,
  target,
  type: 'useCaseRelation',
  data: { relationType: 'association', label: '' },
});

const content: UseCaseModelContent = {
  nodes: [node('actor-1'), node('actor-2'), node('uc-1', 'use-case'), node('uc-2', 'use-case')],
  edges: [
    relation('e-1', 'actor-1', 'uc-1'),
    relation('e-2', 'actor-2', 'uc-2'),
    relation('e-3', 'actor-2', 'uc-1'),
    relation('e-4', 'uc-1', 'uc-2'),
  ],
};

describe('deleteUseCaseSelection', () => {
  it('removes every selected node and the relations that touch them', () => {
    const result = deleteUseCaseSelection(content, { nodeIds: ['actor-1', 'actor-2'], edgeIds: [] });

    expect(result.nodes.map((item) => item.id)).toEqual(['uc-1', 'uc-2']);
    expect(result.edges.map((item) => item.id)).toEqual(['e-4']);
  });

  it('removes every selected relation and keeps the nodes when only relations are selected', () => {
    const result = deleteUseCaseSelection(content, { nodeIds: [], edgeIds: ['e-1', 'e-4'] });

    expect(result.nodes).toHaveLength(4);
    expect(result.edges.map((item) => item.id)).toEqual(['e-2', 'e-3']);
  });

  it('removes selected nodes and selected relations together in one result', () => {
    const result = deleteUseCaseSelection(content, { nodeIds: ['uc-2'], edgeIds: ['e-3'] });

    expect(result.nodes.map((item) => item.id)).toEqual(['actor-1', 'actor-2', 'uc-1']);
    expect(result.edges.map((item) => item.id)).toEqual(['e-1']);
  });

  it('leaves the content unchanged when nothing selected exists', () => {
    const result = deleteUseCaseSelection(content, { nodeIds: ['missing'], edgeIds: ['missing'] });

    expect(result).toEqual(content);
  });

  it('does not change the content it receives', () => {
    const copy = JSON.parse(JSON.stringify(content)) as UseCaseModelContent;
    deleteUseCaseSelection(content, { nodeIds: ['actor-1'], edgeIds: ['e-2'] });

    expect(content).toEqual(copy);
  });
});
