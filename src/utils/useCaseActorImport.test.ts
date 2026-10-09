import { describe, expect, it } from 'vitest';
import { extractImportableArtifacts } from './artifactFile';
import { normalizeUseCaseModelContent } from './diagramNormalization';

// Hallazgo B1: un actor con data.name numérico pasa la validación y llega
// al inspector, que hace name.trim() y revienta.
describe('B1 - actor con data.name numérico', () => {
  it('importar un modelo de casos de uso con actor name=123 no deja un name que no sea string', () => {
    const json = {
      id: 'uc-1',
      type: 'use-case-model',
      name: 'Modelo',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      content: {
        nodes: [
          { id: 'actor-1', type: 'useCaseActor', position: { x: 100, y: 350 }, data: { kind: 'actor', name: 123 } },
        ],
        edges: [],
      },
    };
    const imported = extractImportableArtifacts(JSON.parse(JSON.stringify(json)) as unknown);
    const artifact = imported?.[0] as unknown as { content: { nodes: { data: { name: unknown } }[] } } | undefined;
    const name = artifact?.content.nodes[0]?.data.name;
    // The number is kept as its text, so the inspector can trim it.
    expect(name).toBe('123');
  });

  it('a non-text name becomes empty and a numeric relation label becomes text', () => {
    const content = normalizeUseCaseModelContent({
      nodes: [
        { id: 'actor-1', type: 'useCaseActor', position: { x: 0, y: 0 }, data: { kind: 'actor', name: { texto: 'x' } } },
      ],
      edges: [
        { id: 'edge-1', source: 'actor-1', target: 'uc-1', data: { relationType: 'association', label: 7 } },
      ],
    } as unknown as Parameters<typeof normalizeUseCaseModelContent>[0]);

    expect(content.nodes[0].data.name).toBe('');
    expect(content.edges[0].data?.label).toBe('7');
  });
});
