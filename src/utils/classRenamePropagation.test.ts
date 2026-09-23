import { describe, expect, it } from 'vitest';
import type {
  ClassDiagramNode,
  ClassMethod,
  DesignArtifact,
  SequenceDiagramContent,
  SequenceMessage,
  SequenceParticipant,
} from '../types/diagram';
import {
  applyClassModelRenamesToSequence,
  findClassModelRenames,
  isSequenceUsingClassModel,
} from './classRenamePropagation';
import { createEmptySequenceDiagramContent, createSequenceFragment, createSequenceMessage } from './sequenceDiagram';

const method = (id: string, name: string): ClassMethod => ({ id, name, parameters: '', returnType: '' } as ClassMethod);

const classNode = (id: string, name: string, methods: ClassMethod[] = []): ClassDiagramNode => ({
  id, type: 'classNode', position: { x: 0, y: 0 }, data: { name, attributes: [], methods },
});

const participant = (id: string, classifierName: string, classifierNodeId?: string): SequenceParticipant => ({
  id, kind: 'object', name: '', classifierName, classifierNodeId, x: 0,
});

const call = (name: string, operationMethodId?: string): SequenceMessage => ({
  ...createSequenceMessage('synchronous', 'a', 'b'), name, operationMethodId,
});

const sequence = (patch: Partial<SequenceDiagramContent>): SequenceDiagramContent => ({
  ...createEmptySequenceDiagramContent(),
  ...patch,
});

describe('findClassModelRenames', () => {
  it('matches classes and methods by id and ignores names cleared mid-typing', () => {
    const before = { nodes: [classNode('c1', 'Tramite', [method('m1', 'calcular'), method('m2', 'cerrar')])] };
    const after = { nodes: [classNode('c1', 'Expediente', [method('m1', 'calcularTotal'), method('m2', '')])] };

    const renames = findClassModelRenames(before, after);

    expect(renames.classes.get('c1')).toEqual({ from: 'Tramite', to: 'Expediente' });
    expect(renames.methods.get('m1')).toEqual({ from: 'calcular', to: 'calcularTotal' });
    expect(renames.methods.has('m2')).toBe(false);
  });
});

describe('applyClassModelRenamesToSequence', () => {
  const renames = findClassModelRenames(
    { nodes: [classNode('c1', 'Tramite', [method('m1', 'calcular')])] },
    { nodes: [classNode('c1', 'Expediente', [method('m1', 'calcularTotal')])] },
  );

  it('renames linked messages, including those nested in fragments, and leaves free text alone', () => {
    const fragment = createSequenceFragment('loop');
    fragment.operands[0].items = [call('calcular', 'm1')];
    const content = sequence({ items: [call('calcular', 'm1'), call('calcular'), fragment] });

    const next = applyClassModelRenamesToSequence(content, renames)!;

    expect(next.items[0]).toMatchObject({ name: 'calcularTotal', operationMethodId: 'm1' });
    expect(next.items[1]).toMatchObject({ name: 'calcular' });
    const nested = next.items[2];
    expect(nested.kind === 'fragment' && nested.operands[0].items[0]).toMatchObject({ name: 'calcularTotal' });
  });

  it('renames a linked participant only while it still shows the old class name', () => {
    const content = sequence({
      participants: [
        participant('p1', ':Tramite', 'c1'),
        participant('p2', 'OtraCosa', 'c1'),
        participant('p3', 'Tramite'),
      ],
    });

    const next = applyClassModelRenamesToSequence(content, renames)!;

    expect(next.participants.map((candidate) => candidate.classifierName)).toEqual(['Expediente', 'OtraCosa', 'Tramite']);
  });

  it('returns null when nothing in the diagram refers to the renamed elements', () => {
    expect(applyClassModelRenamesToSequence(sequence({ items: [call('otro', 'm9')] }), renames)).toBeNull();
  });
});

describe('isSequenceUsingClassModel', () => {
  const classDiagram = { id: 'cd', type: 'class-diagram' } as DesignArtifact;

  it('follows the explicit reference, or the only class diagram when there is none', () => {
    const model = new Set(['cd']);
    expect(isSequenceUsingClassModel(sequence({ classDiagramArtifactId: 'cd' }), model, [classDiagram])).toBe(true);
    expect(isSequenceUsingClassModel(sequence({ classDiagramArtifactId: 'other' }), model, [classDiagram])).toBe(false);
    expect(isSequenceUsingClassModel(sequence({}), model, [classDiagram])).toBe(true);
    expect(isSequenceUsingClassModel(sequence({}), model, [classDiagram, { id: 'cd2', type: 'class-diagram' } as DesignArtifact])).toBe(false);
  });
});
