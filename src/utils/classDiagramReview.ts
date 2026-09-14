import type { ClassDiagramContent } from '../types/diagram';

export type DiagramIssue = { id: string; kind: 'error' | 'review'; message: string; nodeId?: string; edgeId?: string };

export function isValidMultiplicity(value: string): boolean {
  // UML also permits disjoint ranges, e.g. 1, 3..5.
  return value.split(',').every(part => {
    const text = part.trim();
    if (/^(\d+|\*)$/.test(text)) return true;
    const range = /^(\d+)\.\.(\d+|\*)$/.exec(text);
    return range !== null && (range[2] === '*' || Number(range[1]) <= Number(range[2]));
  });
}

export function reviewClassDiagram(content: ClassDiagramContent): DiagramIssue[] {
  const issues: DiagramIssue[] = [];
  const names = new Map<string, string[]>();
  for (const node of content.nodes) {
    const name = node.data.name.trim();
    if (!name) issues.push({ id: `unnamed:${node.id}`, kind: 'review', nodeId: node.id, message: 'Esta clase todavía no tiene nombre.' });
    else names.set(name, [...(names.get(name) ?? []), node.id]);
    const attributes = new Set<string>();
    for (const attribute of node.data.attributes) {
      const attributeName = attribute.name.trim();
      if (attributeName && attributes.has(attributeName)) issues.push({
        id: `attribute:${node.id}:${attribute.id}`, kind: 'error', nodeId: node.id,
        message: `${name || 'Clase sin nombre'} tiene más de un atributo llamado «${attributeName}».`,
      });
      attributes.add(attributeName);
    }
  }
  for (const [name, ids] of names) if (ids.length > 1) for (const nodeId of ids) issues.push({
    id: `name:${nodeId}`, kind: 'review', nodeId, message: `Hay ${ids.length} clases llamadas «${name}». Revisá si representan el mismo concepto.`,
  });
  const parents = new Map<string, Array<{ parent: string; edgeId: string }>>();
  for (const edge of content.edges) {
    if (edge.data?.relationType === 'generalization') {
      const parent = edge.data.diamondEnd === 'source' ? edge.source : edge.target;
      const child = parent === edge.source ? edge.target : edge.source;
      parents.set(child, [...(parents.get(child) ?? []), { parent, edgeId: edge.id }]);
    } else {
      for (const end of ['source', 'target'] as const) {
        const value = edge.data?.[`${end}Multiplicity`]?.trim() ?? '';
        const label = end === 'source' ? 'origen' : 'destino';
        if (!value || !isValidMultiplicity(value)) issues.push({
          id: `multiplicity:${edge.id}:${end}`, kind: value ? 'error' : 'review', edgeId: edge.id,
          message: value ? `Multiplicidad inválida en ${label}: «${value}».` : `Falta definir la multiplicidad en ${label}.`,
        });
      }
    }
  }
  // A relation belongs to a cycle iff its parent can reach its child.
  for (const [child, links] of parents) for (const link of links) {
    const pending = [link.parent];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === child) {
        issues.push({ id: `cycle:${link.edgeId}`, kind: 'error', edgeId: link.edgeId, message: 'Esta herencia forma un ciclo: una clase termina heredando de sí misma.' });
        break;
      }
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(parents.get(current) ?? []).map(item => item.parent));
    }
  }
  return issues;
}
