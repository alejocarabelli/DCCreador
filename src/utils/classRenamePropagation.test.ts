import { describe, expect, it } from 'vitest';
import type {
  ClassDiagramNode,
  ClassMethod,
  SequenceDiagramContent,
  SequenceMessage,
  SequenceParticipant,
} from '../types/diagram';
import {
  applyClassModelRenamesToSequence,
  applyModelNamesToSequence,
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

  it('replaces only the method token and preserves embedded and separate arguments', () => {
    const fragment = createSequenceFragment('loop');
    fragment.operands[0].items = [{ ...call(' calcular(id, otro) ', 'm1'), arguments: 'separado' }];
    const content = sequence({ items: [
      { ...call('calcular', 'm1'), arguments: 'id' },
      call('calcularEspecial(id)', 'm1'),
      call('Texto personalizado', 'm1'),
      fragment,
    ] });
    const next = applyClassModelRenamesToSequence(content, renames)!;
    expect(next.items[0]).toMatchObject({ name: 'calcularTotal', arguments: 'id' });
    expect(next.items[1]).toEqual(content.items[1]);
    expect(next.items[2]).toEqual(content.items[2]);
    const nested = next.items[3];
    expect(nested.kind === 'fragment' && nested.operands[0].items[0])
      .toMatchObject({ name: ' calcularTotal(id, otro) ', arguments: 'separado' });
  });

  it('matches the previous operation token without case sensitivity', () => {
    const caseRenames = findClassModelRenames(
      { nodes: [classNode('c1', 'Cliente', [method('m1', 'buscar')])] },
      { nodes: [classNode('c1', 'Cliente', [method('m1', 'consultar')])] },
    );
    const content = sequence({ items: [{ ...call(' Buscar(id) ', 'm1'), arguments: 'otro' }] });
    expect(applyClassModelRenamesToSequence(content, caseRenames)?.items[0])
      .toMatchObject({ name: ' consultar(id) ', operationMethodId: 'm1', arguments: 'otro' });
  });

  it('returns null when nothing in the diagram refers to the renamed elements', () => {
    expect(applyClassModelRenamesToSequence(sequence({ items: [call('otro', 'm9')] }), renames)).toBeNull();
  });
});

describe('applyModelNamesToSequence', () => {
  const model = { nodes: [classNode('c1', 'Expediente', [method('m1', 'calcularTotal')])] };
  const snapshotModel = { nodes: [classNode('c1', 'Tramite', [method('m1', 'calcular')])] };

  it('gives linked participants and calls the names the model has now, nested calls included', () => {
    const fragment = createSequenceFragment('loop');
    fragment.operands[0].items = [call('calcular', 'm1')];
    const content = sequence({
      participants: [participant('p1', 'Tramite', 'c1'), participant('p2', 'Otro')],
      items: [call('calcular', 'm1'), call('calcular'), fragment],
    });

    const next = applyModelNamesToSequence(content, model, snapshotModel)!;

    expect(next.participants.map((candidate) => candidate.classifierName)).toEqual(['Expediente', 'Otro']);
    expect(next.items[0]).toMatchObject({ name: 'calcularTotal', operationMethodId: 'm1' });
    expect(next.items[1]).toMatchObject({ name: 'calcular' });
    const nested = next.items[2];
    expect(nested.kind === 'fragment' && nested.operands[0].items[0]).toMatchObject({ name: 'calcularTotal' });
  });

  it('does nothing when the snapshot model has not changed, despite different linked text', () => {
    const content = sequence({
      participants: [participant('p1', 'Cliente VIP', 'c1')],
      items: [{ ...call('calcularTotal(id)', 'm1'), arguments: '' }],
    });
    expect(applyModelNamesToSequence(content, model, model)).toBeNull();
  });

  it('leaves links to elements that no longer exist as they are', () => {
    const content = sequence({
      participants: [participant('p1', 'Tramite', 'gone')],
      items: [call('calcular', 'm9')],
    });

    expect(applyModelNamesToSequence(content, model, snapshotModel)).toBeNull();
  });

  it('returns null when the names already match the model', () => {
    const content = sequence({
      participants: [participant('p1', 'Expediente', 'c1')],
      items: [call('calcularTotal', 'm1')],
    });

    expect(applyModelNamesToSequence(content, model, snapshotModel)).toBeNull();
  });

  it('ignores a class or method whose name is cleared in the model', () => {
    const blank = { nodes: [classNode('c1', '  ', [method('m1', '')])] };
    const content = sequence({ participants: [participant('p1', 'Tramite', 'c1')], items: [call('calcular', 'm1')] });

    expect(applyModelNamesToSequence(content, blank, snapshotModel)).toBeNull();
  });
});

describe('isSequenceUsingClassModel', () => {
  it('follows only the explicit reference to the model', () => {
    expect(isSequenceUsingClassModel(sequence({ classDiagramArtifactId: 'csd' }), 'csd')).toBe(true);
    expect(isSequenceUsingClassModel(sequence({ classDiagramArtifactId: 'other' }), 'csd')).toBe(false);
    expect(isSequenceUsingClassModel(sequence({}), 'csd')).toBe(false);
  });
});
