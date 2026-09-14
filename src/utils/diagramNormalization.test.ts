import { describe, expect, it } from 'vitest';
import type { ClassDiagramContent, ClassDiagramNode, LegacyDiagramProject, UseCaseFlowContent } from '../types/diagram';
import {
  normalizeClassNode,
  normalizeDiagramContent,
  normalizeDiagramProject,
  normalizeUseCaseFlowContent,
} from './diagramNormalization';
import { createEmptySequenceDiagramContent } from './sequenceDiagram';

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

  it('keeps sequence diagram artifacts when importing a project', () => {
    const normalized = normalizeDiagramProject({
      id: 'sequence-project',
      name: 'Secuencia',
      ...dates,
      activeArtifactId: 'sequence',
      artifacts: [{
        id: 'sequence',
        type: 'sequence-diagram',
        name: 'Asentar Resultado',
        ...dates,
        content: createEmptySequenceDiagramContent(),
      }],
    });

    expect(normalized.artifacts).toHaveLength(1);
    expect(normalized.artifacts[0].type).toBe('sequence-diagram');
    expect(normalized.activeArtifactId).toBe('sequence');
  });

  it('repairs malformed class data and removes transient React Flow state', () => {
    const malformedContent = {
      nodes: [
        {
          id: null,
          type: 'unknown',
          position: { x: Number.NaN, y: 40 },
          selected: true,
          dragging: true,
          width: 320,
          height: 160,
          positionAbsolute: { x: 10, y: 20 },
          data: {
            name: 42,
            attributes: [{ id: null, name: null, type: 'int' }],
            methods: [{ id: '', visibility: 'private', name: 'guardar' }],
            parametricValues: [{ value: null }],
            parametricValuesNoteHandle: 'diagonal',
          },
        },
      ],
      edges: [],
    } as unknown as Partial<ClassDiagramContent>;

    const normalized = normalizeDiagramContent(malformedContent);
    const node = normalized.nodes[0];

    expect(node.id).not.toBe('');
    expect(node.position).toEqual({ x: 0, y: 40 });
    expect(node.data.name).toBe('');
    expect(node.data.attributes[0]).toMatchObject({ name: '', type: 'int' });
    expect(node.data.methods[0]).toMatchObject({ visibility: '', name: 'guardar', parameters: '', returnType: '' });
    expect(node.data.parametricValues?.[0].value).toBe('');
    expect(node.data.parametricValuesNoteHandle).toBe('bottom');
    expect(node.data.parametricValuesNoteConnectionMode).toBe('automatic');
    expect(node).not.toHaveProperty('selected');
    expect(node).not.toHaveProperty('dragging');
    expect(node).not.toHaveProperty('positionAbsolute');
    expect(node).not.toHaveProperty('width');
    expect(node).not.toHaveProperty('height');
  });

  it('keeps legacy parametric notes manual and new explicit notes automatic', () => {
    const legacyNode = normalizeClassNode({
      id: 'legacy',
      type: 'classNode',
      position: { x: 0, y: 0 },
      data: {
        name: 'Estado',
        attributes: [],
        methods: [],
        hasParametricValuesNote: true,
        parametricValuesNoteHandle: 'left',
        parametricValuesNoteTargetHandle: 'right',
      },
    });
    const automaticNode = normalizeClassNode({
      ...legacyNode,
      id: 'automatic',
      data: { ...legacyNode.data, parametricValuesNoteConnectionMode: 'automatic' },
    });

    expect(legacyNode.data.parametricValuesNoteConnectionMode).toBe('manual');
    expect(automaticNode.data.parametricValuesNoteConnectionMode).toBe('automatic');
  });

  it('drops dangling associations and normalizes invalid association values', () => {
    const content = {
      nodes: [
        { id: 'class-a', type: 'classNode', position: { x: 0, y: 0 }, data: { name: 'A' } },
        { id: 'class-b', type: 'classNode', position: { x: 200, y: 0 }, data: { name: 'B' } },
      ],
      edges: [
        {
          id: 'valid',
          source: 'class-a',
          target: 'class-b',
          selected: true,
          data: { navigability: 'invalid', relationType: 'invalid', sourceMultiplicity: 1 },
        },
        { id: 'dangling', source: 'class-a', target: 'missing' },
      ],
    } as unknown as Partial<ClassDiagramContent>;

    const normalized = normalizeDiagramContent(content);

    expect(normalized.edges).toHaveLength(1);
    expect(normalized.edges[0].data?.navigability).toBe('none');
    expect(normalized.edges[0].data?.relationType).toBe('association');
    expect(normalized.edges[0].data?.sourceMultiplicity).toBe('');
    expect(normalized.edges[0]).not.toHaveProperty('selected');
  });
});
