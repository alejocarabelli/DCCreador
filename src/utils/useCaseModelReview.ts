import type { UseCaseModelContent } from '../types/diagram';

export type UseCaseModelIssue = { id: string; kind: 'error' | 'review'; message: string; nodeId: string };

/** The canvas saves "Sin nombre" when a name is left empty after editing: it is still no name. */
const PLACEHOLDER_NAME = 'sin nombre';
const normalizeName = (name: string): string => {
  const key = name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return key === PLACEHOLDER_NAME ? '' : key;
};

/**
 * Minimal, false-alarm-free checks of a use case model: names and loose elements.
 * System boundaries are containers, not part of the checks.
 */
export function reviewUseCaseModel(content: UseCaseModelContent): UseCaseModelIssue[] {
  const issues: UseCaseModelIssue[] = [];
  const related = new Set<string>();
  for (const edge of content.edges) {
    related.add(edge.source);
    related.add(edge.target);
  }
  const kinds = [
    { kind: 'actor' as const, unnamed: 'Este actor todavía no tiene nombre.', plural: 'actores', unrelated: 'Este actor no tiene ninguna relación con un caso de uso.' },
    { kind: 'use-case' as const, unnamed: 'Este caso de uso todavía no tiene nombre.', plural: 'casos de uso', unrelated: 'Este caso de uso no tiene ninguna relación.' },
  ];
  for (const { kind, unnamed, plural, unrelated } of kinds) {
    const byName = new Map<string, { name: string; ids: string[] }>();
    for (const node of content.nodes) {
      if (node.data.kind !== kind) continue;
      const key = normalizeName(node.data.name);
      if (!key) {
        issues.push({ id: `unnamed:${node.id}`, kind: 'error', nodeId: node.id, message: unnamed });
        continue;
      }
      const entry = byName.get(key) ?? { name: node.data.name.trim(), ids: [] };
      entry.ids.push(node.id);
      byName.set(key, entry);
    }
    for (const { name, ids } of byName.values()) if (ids.length > 1) for (const nodeId of ids) issues.push({
      id: `name:${nodeId}`, kind: 'review', nodeId,
      message: `Hay ${ids.length} ${plural} llamados «${name}». Revisá si son el mismo.`,
    });
    for (const node of content.nodes) {
      if (node.data.kind === kind && !related.has(node.id)) issues.push({
        id: `unrelated:${node.id}`, kind: 'review', nodeId: node.id, message: unrelated,
      });
    }
  }
  return issues;
}
