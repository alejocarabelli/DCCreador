import { describe, expect, it } from 'vitest';
import { CLASS_GROUP_COLORS } from '../constants/classGroupColors';
import { normalizeClassNode, normalizeDiagramContent } from './diagramNormalization';
import { duplicateClasses } from './classDiagramOperations';
import type { ClassDiagramNode } from '../types/diagram';

const node: ClassDiagramNode = {
  id: 'class', type: 'classNode', position: { x: 10, y: 20 },
  data: { name: 'Cliente', attributes: [{ id: 'attr', name: 'nombre', type: 'string' }], methods: [] },
};

describe('optional class group colors', () => {
  it('keeps old diagrams uncolored', () => {
    const normalized = normalizeClassNode(node);
    expect(normalized.data).not.toHaveProperty('groupColor');
    expect(normalized.data.attributes).toEqual(node.data.attributes);
  });
  it.each(CLASS_GROUP_COLORS)('preserves $id in a JSON round trip and duplicates', color => {
    const colored = { ...node, data: { ...node.data, groupColor: color.id } };
    const content = normalizeDiagramContent(JSON.parse(JSON.stringify({ nodes: [colored], edges: [] })));
    expect(content.nodes[0].data.groupColor).toBe(color.id);
    expect(duplicateClasses(content, ['class']).content.nodes[1].data.groupColor).toBe(color.id);
    expect(content.nodes[0].data.attributes).toEqual(node.data.attributes);
  });
  it('ignores invalid imported values and removes the color without changing contents', () => {
    const invalid = { ...node, data: { ...node.data, groupColor: 'not-a-color' } } as unknown as ClassDiagramNode;
    expect(normalizeClassNode(invalid)).toEqual(normalizeClassNode(node));
    expect(normalizeClassNode({ ...node, data: { ...node.data, groupColor: undefined } })).toEqual(normalizeClassNode(node));
  });
  it('preserves display preferences while stripping transient callbacks', () => {
    const content = normalizeDiagramContent({ nodes: [{ ...node, data: { ...node.data, hideAttributes: true, hideMethods: true } }], edges: [{
      id: 'self', source: 'class', target: 'class', data: {
        name: '', sourceMultiplicity: '1', targetMultiplicity: '*', sourceRole: '', targetRole: '', navigability: 'none',
        labelOffset: { x: 15, y: -30 }, onUpdateLabel: () => {}, routingObstacles: [{ x: 0, y: 0, width: 20, height: 20 }],
      },
    }] });
    expect(content.nodes[0].data).toMatchObject({ hideAttributes: true, hideMethods: true });
    expect(content.edges[0].data?.labelOffset).toEqual({ x: 15, y: -30 });
    expect(content.edges[0].data).not.toHaveProperty('onUpdateLabel');
    expect(content.edges[0].data).not.toHaveProperty('routingObstacles');
  });
});
