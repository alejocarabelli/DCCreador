import { describe, expect, it } from 'vitest';
import type { ClassDiagramNode, LegacyDiagramProject, UseCaseFlowContent } from '../types/diagram';
import { normalizeDiagramContent, normalizeDiagramProject, normalizeUseCaseFlowContent } from './diagramNormalization';

const dates = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('diagram normalization', () => {
  it('migrates a legacy project to a class diagram artifact', () => {
    const legacyProject: LegacyDiagramProject = {
      id: 'legacy-project',
      name: 'Proyecto anterior',
      ...dates,
      content: { nodes: [], edges: [] },
    };

    const normalized = normalizeDiagramProject(legacyProject);

    expect(normalized.artifacts).toHaveLength(1);
    expect(normalized.artifacts[0].type).toBe('class-diagram');
    expect(normalized.activeArtifactId).toBe(normalized.artifacts[0].id);
  });

  it('replaces duplicate node and flow ids without losing content', () => {
    const node = {
      id: 'duplicate',
      type: 'classNode',
      position: { x: 0, y: 0 },
      data: { name: 'Caso', attributes: [], methods: [] },
    } as ClassDiagramNode;
    const diagram = normalizeDiagramContent({ nodes: [node, { ...node, data: { ...node.data, name: 'Estado' } }] });

    expect(new Set(diagram.nodes.map((currentNode) => currentNode.id)).size).toBe(2);
    expect(diagram.nodes.map((currentNode) => currentNode.data.name)).toEqual(['Caso', 'Estado']);

    const flow = normalizeUseCaseFlowContent({
      basicFlow: [
        { id: 'duplicate', actor: '1. Iniciar', system: '', ref: '' },
        { id: 'duplicate', actor: '', system: '2. Responder', ref: '' },
      ],
    });
    expect(new Set(flow.basicFlow.map((step) => step.id)).size).toBe(2);
  });

  it('fills missing use case flow fields without discarding valid values', () => {
    const partial = {
      description: { useCaseName: 'Tomar Caso', priority: 'C' },
      basicFlow: [{ actor: '1. Iniciar CU' }],
    } as Partial<UseCaseFlowContent>;

    const normalized = normalizeUseCaseFlowContent(partial);

    expect(normalized.description.useCaseName).toBe('Tomar Caso');
    expect(normalized.description.priority).toBe('C');
    expect(normalized.description.finalState).toBe('');
    expect(normalized.basicFlow[0].actor).toBe('1. Iniciar CU');
    expect(normalized.basicFlow[0].system).toBe('');
  });
});
