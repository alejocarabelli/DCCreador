import { describe, expect, it } from 'vitest';
import { isValidMultiplicity, reviewClassDiagram } from './classDiagramReview';
import type { ClassDiagramContent } from '../types/diagram';
import { normalizeAssociationData } from './association';

const content: ClassDiagramContent = {
  nodes: ['a', 'b', 'c'].map(id => ({ id, position: { x: 0, y: 0 }, type: 'classNode', data: { name: id, attributes: [], methods: [] } })),
  edges: [],
};
const inheritance = (id: string, source: string, target: string, diamondEnd: 'source' | 'target' = 'target') => ({
  id, source, target, data: normalizeAssociationData({ relationType: 'generalization', diamondEnd }),
});

describe('class diagram review', () => {
  it.each(['1', '0..1', '*', '1..*', '0..*', '2..5', '1, 3..5'])('accepts multiplicity %s', value => expect(isValidMultiplicity(value)).toBe(true));
  it.each(['', '2..1', '..*', '-1', 'muchos', '1..2..3', '1,'])('rejects multiplicity %s', value => expect(isValidMultiplicity(value)).toBe(false));
  it('reports only the inheritance edges in a cycle, respecting triangle direction', () => {
    const issues = reviewClassDiagram({ ...content, edges: [inheritance('ab','a','b'), inheritance('ba','a','b','source'), inheritance('bc','b','c')] });
    expect(issues.map(issue => issue.edgeId).sort()).toEqual(['ab', 'ba']);
  });
  it('accepts diamond inheritance without mistaking it for a cycle', () => {
    expect(reviewClassDiagram({ ...content, edges: [inheritance('ab','a','b'), inheritance('ac','a','c'), inheritance('bc','b','c')] })).toEqual([]);
  });
  it('reports self-inheritance', () => expect(reviewClassDiagram({ ...content, edges: [inheritance('aa','a','a')] })).toHaveLength(1));
  it('distinguishes a missing multiplicity from an invalid one', () => {
    const issues = reviewClassDiagram({ ...content, edges: [{ id: 'ab', source: 'a', target: 'b', data: normalizeAssociationData({ sourceMultiplicity: '', targetMultiplicity: '3..1' }) }] });
    expect(issues.map(issue => issue.kind)).toEqual(['review', 'error']);
  });
  it('reports duplicate names as review items, not automatic corrections', () => {
    const nodes = content.nodes.map(node => ({ ...node, data: { ...node.data, name: 'Duplicada' } }));
    expect(reviewClassDiagram({ nodes, edges: [] }).map(issue => issue.kind)).toEqual(['review', 'review', 'review']);
    expect(nodes[0].data.name).toBe('Duplicada');
  });
});
