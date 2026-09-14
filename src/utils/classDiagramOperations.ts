import type { ClassDiagramContent, ClassDiagramNode } from '../types/diagram';
import { createId } from './id';
import { normalizeAssociationEdge } from './association';
import { normalizeClassNode } from './diagramNormalization';

export type ClassArrangement = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'horizontal' | 'vertical';
export type ClassSize = { width: number; height: number };

export const moveClass = (node: ClassDiagramNode, position: { x: number; y: number }): ClassDiagramNode => {
  const note = node.data.parametricValuesNotePosition;
  return {
    ...node,
    position,
    data: note === undefined ? node.data : {
      ...node.data,
      parametricValuesNotePosition: {
        x: note.x + position.x - node.position.x,
        y: note.y + position.y - node.position.y,
      },
    },
  };
};

export function arrangeClasses(
  nodes: ClassDiagramNode[],
  selectedIds: readonly string[],
  action: ClassArrangement,
  sizes: ReadonlyMap<string, ClassSize>,
): ClassDiagramNode[] {
  const selected = new Set(selectedIds);
  const group = nodes.filter(node => selected.has(node.id));
  const distributing = action === 'horizontal' || action === 'vertical';
  if (group.length < (distributing ? 3 : 2)) return nodes;
  const size = (node: ClassDiagramNode) => sizes.get(node.id) ?? { width: 220, height: 100 };
  const horizontal = ['left', 'center', 'right', 'horizontal'].includes(action);
  const axis = horizontal ? 'x' : 'y';
  const dimension = horizontal ? 'width' : 'height';
  const start = Math.min(...group.map(node => node.position[axis]));
  const end = Math.max(...group.map(node => node.position[axis] + size(node)[dimension]));
  const positions = new Map<string, number>();
  if (distributing) {
    const ordered = [...group].sort((a, b) => a.position[axis] - b.position[axis]);
    const totalSize = group.reduce((sum, node) => sum + size(node)[dimension], 0);
    // Keep the outer classes in place when there is room; otherwise spread without overlapping.
    const gap = Math.max(0, (end - start - totalSize) / (group.length - 1));
    let cursor = start;
    for (const node of ordered) {
      positions.set(node.id, cursor);
      cursor += size(node)[dimension] + gap;
    }
  } else {
    for (const node of group) {
      const value = action === 'left' || action === 'top' ? start
        : action === 'right' || action === 'bottom' ? end - size(node)[dimension]
          : (start + end - size(node)[dimension]) / 2;
      positions.set(node.id, value);
    }
  }
  let changed = false;
  const result = nodes.map(node => {
    const value = positions.get(node.id);
    if (value === undefined || value === node.position[axis]) return node;
    changed = true;
    return moveClass(node, { ...node.position, [axis]: value });
  });
  return changed ? result : nodes;
}

export function duplicateClasses(content: ClassDiagramContent, selectedIds: readonly string[]) {
  const selected = new Set(selectedIds);
  const idMap = new Map<string, string>();
  const names = new Set(content.nodes.map(node => node.data.name));
  const copies = content.nodes.filter(node => selected.has(node.id)).map(node => {
    const id = createId();
    idMap.set(node.id, id);
    const base = `${node.data.name || 'Clase sin nombre'} Copia`;
    let name = base;
    for (let index = 2; names.has(name); index += 1) name = `${base} ${index}`;
    names.add(name);
    const moved = moveClass(node, { x: node.position.x + 36, y: node.position.y + 36 });
    return normalizeClassNode({
      ...moved, id,
      data: {
        ...moved.data, name,
        attributes: node.data.attributes.map(attribute => ({ ...attribute, id: createId() })),
        methods: node.data.methods.map(method => ({ ...method, id: createId() })),
        parametricValues: (node.data.parametricValues ?? []).map(value => ({ ...value, id: createId() })),
      },
    });
  });
  const edges = content.edges.filter(edge => idMap.has(edge.source) && idMap.has(edge.target)).map(edge =>
    normalizeAssociationEdge({
      ...edge, id: createId(), source: idMap.get(edge.source)!, target: idMap.get(edge.target)!,
      data: edge.data ? {
        ...edge.data,
        waypoints: edge.data.waypoints?.map(point => ({ x: point.x + 36, y: point.y + 36 })),
      } : undefined,
    }),
  );
  return { content: { nodes: [...content.nodes, ...copies], edges: [...content.edges, ...edges] }, ids: copies.map(node => node.id) };
}
