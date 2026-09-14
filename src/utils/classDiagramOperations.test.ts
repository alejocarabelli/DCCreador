import { describe, expect, it } from 'vitest';
import type { ClassDiagramContent, ClassDiagramNode } from '../types/diagram';
import { arrangeClasses, duplicateClasses, moveClass } from './classDiagramOperations';
import { normalizeAssociationData } from './association';
import { normalizeDiagramContent } from './diagramNormalization';

const node = (id: string, x: number, y: number): ClassDiagramNode => ({
  id, type: 'classNode', position: { x, y }, data: { name: id, attributes: [], methods: [] },
});

describe('class group operations', () => {
  it('aligns measured right edges, preserves other classes and does not mutate input', () => {
    const nodes = [node('a', 10, 20), node('b', 200, 100), node('c', 400, 300)];
    const sizes = new Map([['a', { width: 100, height: 80 }], ['b', { width: 200, height: 100 }]]);
    const result = arrangeClasses(nodes, ['a', 'b'], 'right', sizes);
    expect(result[0].position).toEqual({ x: 300, y: 20 });
    expect(result[1].position).toEqual({ x: 200, y: 100 });
    expect(result[2]).toBe(nodes[2]);
    expect(nodes[0].position).toEqual({ x: 10, y: 20 });
  });

  it('distributes equal gaps between unequal widths, preserving the outer bounds', () => {
    const nodes = [node('a', 0, 20), node('b', 100, 80), node('c', 600, 30)];
    const sizes = new Map([['a', { width: 100, height: 80 }], ['b', { width: 200, height: 80 }], ['c', { width: 100, height: 80 }]]);
    const result = arrangeClasses(nodes, ['a', 'b', 'c'], 'horizontal', sizes);
    expect(result.map(n => n.position.x)).toEqual([0, 250, 600]);
    expect(result.map(n => n.position.y)).toEqual([20, 80, 30]);
  });

  it('spreads overlapping classes without creating negative gaps', () => {
    const nodes = [node('a', 0, 0), node('b', 10, 0), node('c', 20, 0)];
    expect(arrangeClasses(nodes, ['a', 'b', 'c'], 'horizontal', new Map()).map(n => n.position.x)).toEqual([0, 220, 440]);
  });

  it('does nothing when too few classes are selected', () => {
    const nodes = [node('a', 10, 20), node('b', 200, 100)];
    expect(arrangeClasses(nodes, ['a'], 'top', new Map())).toBe(nodes);
    expect(arrangeClasses(nodes, ['a', 'b'], 'horizontal', new Map())).toBe(nodes);
  });

  it('moves an explicitly positioned note by the same delta as its class', () => {
    const original = node('a', 10, 20);
    original.data.parametricValuesNotePosition = { x: 100, y: 200 };
    expect(moveClass(original, { x: 30, y: 50 }).data.parametricValuesNotePosition).toEqual({ x: 120, y: 230 });
    expect(original.data.parametricValuesNotePosition).toEqual({ x: 100, y: 200 });
  });

  it('duplicates only internal relations with fresh IDs and independent nested data', () => {
    const a = node('a', 0, 0);
    a.data.attributes = [{ id: 'attribute', name: 'nombre', type: 'string' }];
    a.data.methods = [{ id: 'method', name: 'leer', visibility: '+', parameters: '', returnType: 'string' }];
    a.data.hasParametricValuesNote = true;
    a.data.parametricValuesNotePosition = { x: 20, y: 200 };
    a.data.parametricValues = [{ id: 'value', value: 'Activo' }];
    const content: ClassDiagramContent = {
      nodes: [a, node('b', 400, 0), node('c', 800, 0)],
      edges: [
        { id: 'ab', source: 'a', target: 'b', data: normalizeAssociationData({ name: 'tiene', sourceMultiplicity: '1', targetMultiplicity: '*', waypoints: [{ x: 300, y: 100 }] }) },
        { id: 'bc', source: 'b', target: 'c', data: normalizeAssociationData(undefined) },
      ],
    };
    const before = JSON.stringify(content);
    const result = duplicateClasses(content, ['a', 'b']);
    expect(result.content.nodes).toHaveLength(5);
    expect(result.content.edges).toHaveLength(3);
    expect(result.content.edges[2]).toMatchObject({ source: result.ids[0], target: result.ids[1], data: { name: 'tiene', sourceMultiplicity: '1', targetMultiplicity: '*', waypoints: [{ x: 336, y: 136 }] } });
    const copy = result.content.nodes[3];
    expect(copy.data.attributes[0].id).not.toBe('attribute');
    expect(copy.data.methods[0].id).not.toBe('method');
    expect(copy.data.parametricValues?.[0].id).not.toBe('value');
    expect(copy.data.parametricValuesNotePosition).toEqual({ x: 56, y: 236 });
    expect(JSON.stringify(content)).toBe(before);
    expect(normalizeDiagramContent(JSON.parse(JSON.stringify(result.content)))).toEqual(normalizeDiagramContent(result.content));
  });

  it('avoids duplicate copy names when duplicating the same class twice', () => {
    const first = duplicateClasses({ nodes: [node('a', 0, 0)], edges: [] }, ['a']);
    const second = duplicateClasses(first.content, ['a']);
    expect(second.content.nodes.map(n => n.data.name)).toEqual(['a', 'a Copia', 'a Copia 2']);
  });
});
