import { describe, expect, it } from 'vitest';
import type { ClassDiagramArtifact, ClassSequenceDiagramArtifact, DesignArtifact, DiagramProject, SequenceDiagramArtifact, UseCaseFlowArtifact } from '../types/diagram';
import { createEmptySequenceDiagramContent } from './sequenceDiagram';
import { normalizeUseCaseFlowContent } from './diagramNormalization';
import { getLinkedArtifacts, importArtifactIntoProjects, moveArtifactsBetweenProjects } from './artifactTransfer';

const dates = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const model: ClassDiagramArtifact = {
  ...dates, id: 'model', type: 'class-diagram', name: 'Clases', content: {
    nodes: [{ id: 'person', type: 'classNode', position: { x: 120, y: 160 }, data: {
      name: 'Persona', attributes: [{ id: 'name', name: 'nombre', type: 'String' }],
      methods: [{ id: 'greet', name: 'saludar', visibility: '+', parameters: '', returnType: 'void' }],
    } }], edges: [],
  },
};
const flow: UseCaseFlowArtifact = { ...dates, id: 'flow', type: 'use-case-flow', name: 'Flujo', content: { ...normalizeUseCaseFlowContent(undefined), classDiagramArtifactId: model.id } };
const reference: SequenceDiagramArtifact = { ...dates, id: 'reference', type: 'sequence-diagram', name: 'Referencia', content: createEmptySequenceDiagramContent() };
const sequence: SequenceDiagramArtifact = { ...dates, id: 'sequence', type: 'sequence-diagram', name: 'Secuencia', content: {
  ...createEmptySequenceDiagramContent(), classDiagramArtifactId: 'class-sequence', flowArtifactId: flow.id,
  participants: [{ id: 'actor', kind: 'object', name: 'cliente', classifierName: 'Persona', classifierNodeId: 'person', x: 120 }],
  items: [{ id: 'fragment', kind: 'fragment', operator: 'ref', name: 'Referencia', interactionArtifactId: reference.id, operands: [{ id: 'operand', guard: '', items: [
    { id: 'message', kind: 'message', type: 'synchronous', sourceId: 'actor', targetId: 'actor', name: 'saludar', arguments: '', parameterValues: '', returnType: 'void', flowReference: '1', operationMethodId: 'greet' },
  ] }] }],
  notes: [{ id: 'note', text: 'Mantener esta nota', x: 450, y: 250, width: 180, height: 90, anchorKind: 'message', anchorId: 'message' }],
} };
const classSequence: ClassSequenceDiagramArtifact = { ...dates, id: 'class-sequence', type: 'class-sequence-diagram', name: 'Clases de secuencias', content: { ...model.content, version: 1, linkedSequenceDiagramIds: [sequence.id] } };
const unrelated: DesignArtifact = { ...dates, id: 'use-cases', type: 'use-case-model', name: 'Casos de uso', content: { nodes: [], edges: [] } };
const project = (id: string, artifacts: DesignArtifact[], activeArtifactId = artifacts[0].id): DiagramProject => ({ ...dates, id, name: id, activeArtifactId, artifacts });
const source = project('source', [model, flow, sequence, reference, classSequence, unrelated], sequence.id);
const destination = project('destination', [{ ...unrelated, id: 'destination-use-cases' }]);

describe('artifact import into an existing project', () => {
  it('appends and activates a copy without replacing existing artifacts or mutating the input', () => {
    const before = structuredClone(destination);
    const [result] = importArtifactIntoProjects([destination], destination.id, model);
    expect(destination).toEqual(before);
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts[0]).toEqual(destination.artifacts[0]);
    const imported = result.artifacts[1];
    expect(imported.id).not.toBe(model.id);
    expect(imported.content).toEqual(model.content);
    expect(result.activeArtifactId).toBe(imported.id);
    expect(imported.createdAt).toBe(model.createdAt);
  });

  it('allocates a fresh ID on every import', () => {
    const once = importArtifactIntoProjects([destination], destination.id, model);
    const twice = importArtifactIntoProjects(once, destination.id, model);
    expect(new Set(twice[0].artifacts.map((artifact) => artifact.id)).size).toBe(3);
  });

  it('detaches external links even if destination IDs match, preserving messages, texts and local note anchors', () => {
    const [result] = importArtifactIntoProjects([project('destination', [model, flow, reference])], 'destination', sequence);
    const imported = result.artifacts.at(-1) as SequenceDiagramArtifact;
    // The model it pointed at does not travel: that is a choice of "Sin vincular", not a blank.
    expect(imported.content.classDiagramArtifactId).toBeNull();
    expect(imported.content.flowArtifactId).toBeUndefined();
    expect(imported.content.participants[0].classifierNodeId).toBeUndefined();
    expect(imported.content.participants[0].classifierName).toBe('Persona');
    const fragment = imported.content.items[0];
    if (fragment.kind !== 'fragment') throw new Error('Expected fragment');
    expect(fragment.interactionArtifactId).toBeUndefined();
    expect(fragment.operands[0].items[0]).toMatchObject({ name: 'saludar', operationMethodId: undefined, flowReference: '1' });
    expect(imported.content.notes).toEqual(sequence.content.notes);
  });

  it('does nothing if the destination no longer exists', () => {
    const projects = [destination];
    expect(importArtifactIntoProjects(projects, 'missing', model)).toBe(projects);
  });

  it('imports a flow that pointed at another diagram as "Sin referencia", not as the only local diagram', () => {
    const local = project('destination', [{ ...model, id: 'local-model' }]);
    const [result] = importArtifactIntoProjects([local], local.id, flow);
    expect((result.artifacts.at(-1) as UseCaseFlowArtifact).content.classDiagramArtifactId).toBeNull();
  });

  it('keeps an explicit "Sin referencia" on import and a never-chosen flow never chosen', () => {
    const local = project('destination', [{ ...model, id: 'local-model' }]);
    const none = { ...flow, content: { ...flow.content, classDiagramArtifactId: null } };
    const never = { ...flow, content: { ...flow.content, classDiagramArtifactId: undefined } };
    const [withNone] = importArtifactIntoProjects([local], local.id, none);
    const [withNever] = importArtifactIntoProjects([local], local.id, never);
    expect((withNone.artifacts.at(-1) as UseCaseFlowArtifact).content.classDiagramArtifactId).toBeNull();
    expect((withNever.artifacts.at(-1) as UseCaseFlowArtifact).content.classDiagramArtifactId).toBeUndefined();
  });
});

describe('moving artifacts between projects', () => {
  it('finds incoming, outgoing and nested links but excludes unrelated artifacts', () => {
    expect(getLinkedArtifacts(source, sequence.id).map((artifact) => artifact.id)).toEqual(['model', 'flow', 'sequence', 'reference', 'class-sequence']);
  });

  it('moves a linked group preserving all content and references, and opens the chosen artifact at the destination', () => {
    const before = structuredClone(source);
    const result = moveArtifactsBetweenProjects([source, destination], source.id, destination.id, sequence.id, true);
    expect(source).toEqual(before);
    expect(result.projects[0].artifacts).toEqual([unrelated]);
    expect(result.projects[0].activeArtifactId).toBe(unrelated.id);
    expect(result.projects[1].artifacts).toHaveLength(6);
    expect(result.projects[1].activeArtifactId).toBe(sequence.id);
    for (const original of source.artifacts.filter((artifact) => artifact !== unrelated)) {
      expect(result.projects[1].artifacts.find((artifact) => artifact.id === original.id)?.content).toEqual(original.content);
    }
  });

  it('keeps a sequence without a model without one at the destination', () => {
    const unlinked = { ...sequence, content: { ...sequence.content, classDiagramArtifactId: undefined } };
    const original = project('source', [model, unlinked]);
    const target = project('destination', [{ ...classSequence, id: 'different-model', content: { ...classSequence.content, linkedSequenceDiagramIds: [] } }]);
    const result = moveArtifactsBetweenProjects([original, target], original.id, target.id, unlinked.id, true);
    const moved = result.projects[1].artifacts.at(-1) as SequenceDiagramArtifact;
    expect(moved.content.classDiagramArtifactId).toBeUndefined();
    expect(moved.content.participants[0].classifierNodeId).toBeUndefined();
  });

  it('keeps a sequence unlinked on purpose (null) as null at the destination', () => {
    const none = { ...sequence, content: { ...sequence.content, classDiagramArtifactId: null } };
    const original = project('source', [model, none]);
    const target = project('destination', [{ ...classSequence, id: 'different-model', content: { ...classSequence.content, linkedSequenceDiagramIds: [] } }]);
    const result = moveArtifactsBetweenProjects([original, target], original.id, target.id, none.id, true);
    expect((result.projects[1].artifacts.at(-1) as SequenceDiagramArtifact).content.classDiagramArtifactId).toBeNull();
  });

  it('preserves the implicit class model used by a flow at a destination with several models', () => {
    const implicit = { ...flow, content: { ...flow.content, classDiagramArtifactId: undefined } };
    const original = project('source', [model, implicit]);
    const target = project('destination', [{ ...model, id: 'different-model' }]);
    const result = moveArtifactsBetweenProjects([original, target], original.id, target.id, implicit.id, true);
    expect(result.idMap.size).toBe(2);
    const moved = result.projects[1].artifacts.at(-1) as UseCaseFlowArtifact;
    expect(moved.content.classDiagramArtifactId).toBe(model.id);
  });

  it('keeps an explicit "Sin referencia" when the flow moves alone, even if the destination has one diagram', () => {
    const none = { ...flow, content: { ...flow.content, classDiagramArtifactId: null } };
    const original = project('source', [model, none]);
    const target = project('destination', [{ ...model, id: 'different-model' }]);
    const result = moveArtifactsBetweenProjects([original, target], original.id, target.id, none.id, false);
    expect((result.projects[1].artifacts.at(-1) as UseCaseFlowArtifact).content.classDiagramArtifactId).toBeNull();
  });

  it('does not pull a "Sin referencia" flow along when its model moves', () => {
    const none = { ...flow, content: { ...flow.content, classDiagramArtifactId: null } };
    const original = project('source', [model, none]);
    const result = moveArtifactsBetweenProjects([original, destination], original.id, destination.id, model.id, true);
    expect(result.idMap.size).toBe(1);
    expect(result.projects[1].artifacts.map((artifact) => artifact.id)).not.toContain(none.id);
    expect(result.projects[0].artifacts.find((artifact) => artifact.id === none.id)?.content).toEqual(none.content);
  });

  it('turns a choice whose diagram does not come along into "Sin referencia" instead of re-picking another diagram', () => {
    const original = project('source', [model, flow]);
    const target = project('destination', [{ ...model, id: 'different-model' }]);
    const result = moveArtifactsBetweenProjects([original, target], original.id, target.id, flow.id, false);
    expect((result.projects[1].artifacts.at(-1) as UseCaseFlowArtifact).content.classDiagramArtifactId).toBeNull();
  });

  it('turns a stale reference into "Sin referencia" at the destination', () => {
    const stale = { ...flow, content: { ...flow.content, classDiagramArtifactId: 'previously-deleted-model' } };
    const original = project('source', [model, stale]);
    const target = project('destination', [{ ...model, id: 'different-model' }]);
    const result = moveArtifactsBetweenProjects([original, target], original.id, target.id, stale.id, false);
    expect((result.projects[1].artifacts.at(-1) as UseCaseFlowArtifact).content.classDiagramArtifactId).toBeNull();
  });

  it('leaves the flow at the source as "Sin referencia" when its model moves away alone', () => {
    const original = project('source', [model, flow]);
    const result = moveArtifactsBetweenProjects([original, destination], original.id, destination.id, model.id, false);
    const remainingFlow = result.projects[0].artifacts.find((artifact) => artifact.id === flow.id) as UseCaseFlowArtifact;
    expect(remainingFlow.content.classDiagramArtifactId).toBeNull();
  });

  it('keeps the content of unrelated artifacts at the source and only drops a stale model link', () => {
    const broken = { ...sequence, content: { ...sequence.content, classDiagramArtifactId: 'previously-missing-model', flowArtifactId: undefined, items: [] } };
    const original = project('source', [model, broken]);
    const result = moveArtifactsBetweenProjects([original, destination], original.id, destination.id, model.id, false);
    expect(result.projects[0].artifacts[0].content).toEqual({ ...broken.content, classDiagramArtifactId: undefined });
  });

  it('remaps colliding artifact IDs and every transferred link without attaching to destination artifacts', () => {
    const collision = project('destination', [model, flow, sequence, reference, classSequence]);
    const result = moveArtifactsBetweenProjects([source, collision], source.id, collision.id, sequence.id, true);
    const artifacts = result.projects[1].artifacts;
    expect(new Set(artifacts.map((artifact) => artifact.id)).size).toBe(artifacts.length);
    const moved = artifacts.find((artifact) => artifact.id === result.idMap.get(sequence.id)) as SequenceDiagramArtifact;
    expect(moved.content.classDiagramArtifactId).toBe(result.idMap.get(classSequence.id));
    expect(moved.content.flowArtifactId).toBe(result.idMap.get(flow.id));
    expect(moved.content.items[0]).toMatchObject({ interactionArtifactId: result.idMap.get(reference.id) });
    const movedModel = artifacts.find((artifact) => artifact.id === result.idMap.get(classSequence.id)) as ClassSequenceDiagramArtifact;
    expect(movedModel.content.linkedSequenceDiagramIds).toEqual([result.idMap.get(sequence.id)]);
    expect(artifacts.slice(0, 5)).toEqual(collision.artifacts);
  });

  it('moves a sequence alone, cleans incoming links and keeps its internal structure', () => {
    const result = moveArtifactsBetweenProjects([source, destination], source.id, destination.id, sequence.id, false);
    expect(result.idMap.size).toBe(1);
    const remainingModel = result.projects[0].artifacts.find((artifact) => artifact.id === classSequence.id) as ClassSequenceDiagramArtifact;
    expect(remainingModel.content.linkedSequenceDiagramIds).toEqual([]);
    const moved = result.projects[1].artifacts.at(-1) as SequenceDiagramArtifact;
    // The model stays behind: the sequence arrives as "Sin vincular" (null), not as never-chosen.
    expect(moved.content.classDiagramArtifactId).toBeNull();
    expect(moved.content.flowArtifactId).toBeUndefined();
    expect(moved.content.items[0]).toMatchObject({ id: 'fragment', interactionArtifactId: undefined });
    expect(moved.content.notes).toEqual(sequence.content.notes);
  });

  it('moving a sequence model alone detaches its sequences at the source without deleting their data', () => {
    const result = moveArtifactsBetweenProjects([source, destination], source.id, destination.id, classSequence.id, false);
    const remaining = result.projects[0].artifacts.find((artifact) => artifact.id === sequence.id) as SequenceDiagramArtifact;
    // The model left: the sequence stays "Sin vincular" (null), like a flow whose diagram left.
    expect(remaining.content.classDiagramArtifactId).toBeNull();
    expect(remaining.content.participants[0].classifierNodeId).toBeUndefined();
    expect(remaining.content.participants[0].classifierName).toBe('Persona');
    expect(remaining.content.flowArtifactId).toBe(flow.id);
    const movedModel = result.projects[1].artifacts.at(-1) as ClassSequenceDiagramArtifact;
    expect(movedModel.content.linkedSequenceDiagramIds).toEqual([]);
    expect(movedModel.content.nodes).toEqual(model.content.nodes);
  });

  it('keeps a project usable after moving its last artifact', () => {
    const last = project('source', [model]);
    const result = moveArtifactsBetweenProjects([last, destination], last.id, destination.id, model.id, false);
    const placeholder = result.projects[0].artifacts[0];
    expect(placeholder.type).toBe('class-diagram');
    expect(placeholder.id).not.toBe(model.id);
    expect(placeholder.content).toEqual({ nodes: [], edges: [] });
    expect(result.projects[0].activeArtifactId).toBe(placeholder.id);
  });

  it.each([['source', 'source', 'model'], ['missing', 'destination', 'model'], ['source', 'missing', 'model'], ['source', 'destination', 'missing']])('ignores an invalid move: %s → %s, %s', (from, to, artifactId) => {
    const projects = [source, destination];
    const result = moveArtifactsBetweenProjects(projects, from, to, artifactId, true);
    expect(result.projects).toBe(projects);
    expect(result.idMap.size).toBe(0);
  });
});
