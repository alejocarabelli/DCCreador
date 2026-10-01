import { describe, expect, it } from 'vitest';
import demo from '../../fixtures/demo-gestion-tramites.json';
import guide from '../../docs/artifact-json-guide.md?raw';
import { normalizeDiagramProject } from './diagramNormalization';
import type { ClassDiagramArtifact, ClassSequenceDiagramArtifact, SequenceDiagramArtifact, SequenceTimelineItem, UseCaseFlowArtifact, UseCaseModelArtifact } from '../types/diagram';
import { extractImportableArtifacts, serializeArtifact } from './artifactFile';
import { extractImportableProjects } from './projectImport';
import { getSequenceFlowOptions } from './sequenceMessageEditing';
import { buildSequenceLayout } from './sequenceDiagramLayout';
import { buildProjectSymbolIndex } from './projectSymbolIndex';
import { reviewUseCaseFlow } from './useCaseFlowReview';

const guideExamples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]));
const example = guideExamples.find((candidate) => candidate.type === 'class-diagram');
const project = normalizeDiagramProject(demo as unknown as Parameters<typeof normalizeDiagramProject>[0]);

describe('artifact JSON files', () => {
  it('documents one complete example for every supported artifact type', () => {
    expect(guideExamples.map((candidate) => candidate.type)).toEqual([
      'class-diagram', 'use-case-model', 'use-case-flow', 'sequence-diagram', 'class-sequence-diagram',
    ]);
  });

  it.each(guideExamples.map((candidate) => [candidate.type, candidate] as const))('imports and round trips the documented %s example', (_, candidate) => {
    const imported = extractImportableArtifacts(candidate);
    expect(imported).toHaveLength(1);
    expect(imported![0].id).toBe(candidate.id);
    expect(imported![0].type).toBe(candidate.type);
    expect(extractImportableArtifacts(JSON.parse(serializeArtifact(imported![0])))).toEqual(imported);
    if (imported![0].type === 'sequence-diagram') expect(imported![0].content.problems).toEqual([]);
  });

  it('keeps the documented use cases inside the boundary and actors outside it', () => {
    const model = extractImportableArtifacts(guideExamples.find((candidate) => candidate.type === 'use-case-model'))![0] as UseCaseModelArtifact;
    const boundary = model.content.nodes.find((node) => node.data.kind === 'system-boundary')!;
    const right = boundary.position.x + Number(boundary.style!.width);
    const bottom = boundary.position.y + Number(boundary.style!.height);
    for (const node of model.content.nodes.filter((candidate) => candidate.data.kind !== 'system-boundary')) {
      if (node.data.kind === 'actor') {
        expect(node.position.x + 130).toBeLessThan(boundary.position.x);
      } else {
        expect(node.position.x).toBeGreaterThan(boundary.position.x + 60);
        expect(node.position.y).toBeGreaterThan(boundary.position.y + 60);
        expect(node.position.x + 226).toBeLessThan(right - 60);
        expect(node.position.y + 112).toBeLessThan(bottom - 60);
      }
    }
    const nodeIds = new Set(model.content.nodes.map((node) => node.id));
    for (const edge of model.content.edges) {
      expect(nodeIds.has(edge.source) && nodeIds.has(edge.target)).toBe(true);
      expect(edge.source).not.toBe(boundary.id);
      expect(edge.target).not.toBe(boundary.id);
    }
  });

  it('assembles the documented linked project without broken classifier, method or flow references', () => {
    const artifacts = guideExamples.flatMap((candidate) => extractImportableArtifacts(candidate)!);
    const model = artifacts.find((artifact) => artifact.type === 'class-diagram') as ClassDiagramArtifact;
    const classSequence = artifacts.find((artifact) => artifact.type === 'class-sequence-diagram') as ClassSequenceDiagramArtifact;
    const flow = artifacts.find((artifact) => artifact.type === 'use-case-flow') as UseCaseFlowArtifact;
    const sequence = artifacts.find((artifact) => artifact.type === 'sequence-diagram') as SequenceDiagramArtifact;
    classSequence.content = { ...structuredClone(model.content), version: 1, sourceClassDiagramArtifactId: model.id, linkedSequenceDiagramIds: [sequence.id] };
    flow.content.classDiagramArtifactId = model.id;
    sequence.content.classDiagramArtifactId = classSequence.id;
    sequence.content.flowArtifactId = flow.id;
    const nodeByName = new Map(model.content.nodes.map((node) => [node.data.name, node]));
    sequence.content.participants.forEach((participant) => {
      participant.classifierNodeId = nodeByName.get(participant.classifierName)?.id;
    });
    const participantById = new Map(sequence.content.participants.map((participant) => [participant.id, participant]));
    const flowReferences: Record<string, string> = {
      'msg-crear-pedido': 'paso-1', 'msg-construir-pedido': 'paso-2', 'msg-confirmar': 'paso-4', 'msg-cancelar': 'ca1-paso-3',
    };
    const linkItems = (items: SequenceTimelineItem[]): void => items.forEach((item) => {
      if (item.kind === 'fragment') { item.operands.forEach((operand) => linkItems(operand.items)); return; }
      const receiver = participantById.get(item.targetId)!;
      item.operationMethodId = nodeByName.get(receiver.classifierName)?.data.methods.find((method) => method.name === item.name)?.id;
      item.flowReference = flowReferences[item.id] ?? '';
    });
    linkItems(sequence.content.items);
    const linkedProject = normalizeDiagramProject({ id: 'proyecto-pedidos', name: 'Pedidos', activeArtifactId: model.id, artifacts });
    expect(extractImportableProjects(linkedProject)).toHaveLength(1);
    expect(normalizeDiagramProject(JSON.parse(JSON.stringify(linkedProject)))).toEqual(linkedProject);
    expect(sequence.content.problems).toEqual([]);
    expect(reviewUseCaseFlow(flow.content, buildProjectSymbolIndex(model)).filter((issue) => issue.kind === 'error')).toEqual([]);
    const validFlowReferences = new Set(getSequenceFlowOptions([flow], flow.id).map((option) => option.value));
    const validateItems = (items: SequenceTimelineItem[]): void => items.forEach((item) => {
      if (item.kind === 'fragment') { item.operands.forEach((operand) => validateItems(operand.items)); return; }
      if (item.flowReference) expect(validFlowReferences.has(item.flowReference)).toBe(true);
      if (item.operationMethodId) {
        const receiver = participantById.get(item.targetId)!;
        expect(nodeByName.get(receiver.classifierName)?.data.methods.find((method) => method.id === item.operationMethodId)?.name).toBe(item.name);
      }
    });
    validateItems(sequence.content.items);
    const layout = buildSequenceLayout(sequence.content);
    expect(layout.messageLayouts.size).toBe(7);
    expect(layout.fragmentLayouts.size).toBe(1);
    expect(layout.noteLayouts.size).toBe(1);
    const ordered = sequence.content.participants.map((participant) => layout.participantLayouts.get(participant.id)!);
    ordered.slice(1).forEach((participant, index) => {
      expect(participant.x - participant.headerWidth / 2 - (ordered[index].x + ordered[index].headerWidth / 2)).toBeGreaterThanOrEqual(100);
    });
  });

  it('imports the complete example distributed to users without losing classes, relations, positions or navigability', () => {
    const [artifact] = extractImportableArtifacts(example)!;
    expect(artifact.type).toBe('class-diagram');
    if (artifact.type !== 'class-diagram') throw new Error('Expected class diagram');
    expect(artifact.content.nodes).toHaveLength(5);
    expect(artifact.content.edges).toHaveLength(4);
    artifact.content.nodes.forEach((node, index) => {
      expect(node.position).toEqual(example.content.nodes[index].position);
      expect(node.data.attributes).toEqual(example.content.nodes[index].data.attributes);
      expect(node.data.methods).toEqual(example.content.nodes[index].data.methods);
    });
    expect(artifact.content.edges.find((edge) => edge.id === 'rel-cliente-pedido')?.data?.navigability).toBe('source-to-target');
    expect(artifact.content.edges.find((edge) => edge.id === 'rel-cliente-entidad')?.data?.triangleEnd).toBe('target');
  });

  it('keeps the reserved rectangles of the guide example separated', () => {
    const rectangles = example.content.nodes.map((node: typeof example.content.nodes[number]) => {
      const data = node.data;
      const attributeLength = Math.max(0, ...data.attributes.flatMap((attribute: { name: string; type: string }) => [attribute.name.length, attribute.type.length]));
      const methodLength = Math.max(0, ...data.methods.map((method: { name: string; parameters: string; returnType: string; visibility: string }) => `${method.visibility} ${method.name}(${method.parameters}): ${method.returnType}`.length));
      return { ...node.position, width: Math.max(300, 40 + 10 * methodLength, 40 + 20 * attributeLength, 40 + 10 * data.name.length), height: 140 + 32 * (data.attributes.length + data.methods.length) };
    });
    rectangles.forEach((a: { x: number; y: number; width: number; height: number }, index: number) => {
      rectangles.slice(index + 1).forEach((b: typeof a) => {
        expect(a.x + a.width + 160 <= b.x || b.x + b.width + 160 <= a.x || a.y + a.height + 140 <= b.y || b.y + b.height + 140 <= a.y).toBe(true);
      });
    });
  });

  it.each(project.artifacts.map((artifact) => [artifact.type, artifact] as const))('round trips an exported %s artifact', (_, artifact) => {
    const parsed = JSON.parse(serializeArtifact(artifact));
    expect(extractImportableArtifacts(parsed)).toEqual([artifact]);
    expect(extractImportableProjects(parsed)).toBeNull();
  });

  it('offers every artifact in an exported project for selection', () => {
    expect(extractImportableArtifacts(project)).toEqual(project.artifacts);
  });

  it.each([null, [], 'text', {}, { ...example, type: 'unknown' }, { ...example, content: {} }, { ...example, name: ' ' }])('rejects unsupported or incomplete envelopes: %j', (value) => {
    expect(extractImportableArtifacts(value)).toBeNull();
  });

  it('rejects duplicate class IDs or missing edge endpoints instead of silently dropping content', () => {
    const duplicate = structuredClone(example);
    duplicate.content.nodes[1].id = duplicate.content.nodes[0].id;
    expect(extractImportableArtifacts(duplicate)).toBeNull();
    const dangling = structuredClone(example);
    dangling.content.edges[0].target = 'missing';
    expect(extractImportableArtifacts(dangling)).toBeNull();
  });

  it('rejects nonnumeric positions and malformed member arrays', () => {
    const position = structuredClone(example);
    position.content.nodes[0].position.x = '100';
    expect(extractImportableArtifacts(position)).toBeNull();
    const members = structuredClone(example);
    members.content.nodes[0].data.methods = [null];
    expect(extractImportableArtifacts(members)).toBeNull();
  });

  it('rejects padded IDs whose normalization would break their references', () => {
    const padded = structuredClone(example);
    padded.content.nodes[0].id = ' clase-entidad ';
    padded.content.edges[0].target = ' clase-entidad ';
    expect(extractImportableArtifacts(padded)).toBeNull();
  });

  it('rejects a malformed project without presenting a partial import as complete', () => {
    expect(extractImportableArtifacts({ artifacts: [example, { name: 'Broken', type: 'class-diagram', content: {} }] })).toBeNull();
  });
});
