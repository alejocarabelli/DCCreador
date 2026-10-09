import { describe, expect, it } from 'vitest';
import type { ClassDiagramContent, ClassDiagramNode, SequenceDiagramContent } from '../types/diagram';
import { createEmptySequenceDiagramContent, createSequenceFragment, createSequenceMessage } from './sequenceDiagram';
import { bindSequenceToModel, findSequenceMessagesMissingInModel, importClassesFromSequences, planSequenceClassImport } from './sequenceClassImport';

const empty: ClassDiagramContent = { nodes: [], edges: [] };
const node: ClassDiagramNode = { id: 'class-t', type: 'classNode', position: { x: 0, y: 0 }, data: { name: 'Tramite', methods: [], attributes: [] } };
const sequence: SequenceDiagramContent = {
  ...createEmptySequenceDiagramContent(),
  participants: [
    { id: 'actor', kind: 'actor', name: 'Usuario', classifierName: '', x: 0 },
    { id: 't', kind: 'entity', name: 'instancia', classifierName: ':Tramite', x: 200 },
  ],
  items: [
    { ...createSequenceMessage('synchronous', 'actor', 't'), id: 'set', name: 'setNombre(valor)' },
    { ...createSequenceMessage('asynchronous', 'actor', 't'), id: 'get', name: 'getNombre', returnType: 'String' },
    { ...createSequenceMessage('synchronous', 't', 'actor'), id: 'actor-call', name: 'avisar' },
    { ...createSequenceMessage('return', 'actor', 't'), id: 'return', name: 'ok' },
  ],
};

describe('sequence class synchronization plan', () => {
  it('is deterministic, deduplicates methods and infers typed attributes without changing inputs', () => {
    const before = JSON.stringify({ empty, sequence });
    const plan = planSequenceClassImport(empty, [sequence, sequence]);
    expect(plan).toEqual([
      { key: 'class:tramite', type: 'class', className: 'Tramite', elementName: 'Tramite' },
      { key: 'method:tramite:setnombre', type: 'method', className: 'Tramite', elementName: 'setNombre', parameters: 'valor', returnType: '' },
      { key: 'method:tramite:getnombre', type: 'method', className: 'Tramite', elementName: 'getNombre', parameters: '', returnType: 'String' },
      { key: 'attribute:tramite:nombre', type: 'attribute', className: 'Tramite', elementName: 'nombre', attributeType: 'String' },
    ]);
    expect(planSequenceClassImport(empty, [sequence])).toEqual(plan);
    expect(JSON.stringify({ empty, sequence })).toBe(before);
    expect(planSequenceClassImport(importClassesFromSequences(empty, [sequence]).content, [sequence])).toEqual([]);
  });

  it('does not include methods with different case or parentheses already in the model', () => {
    const model = { ...empty, nodes: [{ ...node, data: { ...node.data, methods: [{ id: 'm', visibility: '+' as const, name: 'GETNOMBRE(id)', parameters: 'id: int', returnType: 'String' }], attributes: [{ id: 'a', name: 'NOMBRE', type: 'Custom' }] } }] };
    expect(planSequenceClassImport(model, [sequence]).map((novelty) => novelty.key)).toEqual(['method:tramite:setnombre']);
    const imported = importClassesFromSequences(model, [sequence]);
    expect(imported.content.nodes[0].data.methods).toHaveLength(2);
    expect(imported.content.nodes[0].data.attributes).toEqual(model.nodes[0].data.attributes);
  });

  it('blocks children of a rejected class even if their keys are accepted', () => {
    const keys = new Set(planSequenceClassImport(empty, [sequence]).filter((novelty) => novelty.type !== 'class').map((novelty) => novelty.key));
    expect(importClassesFromSequences(empty, [sequence], keys).content.nodes).toEqual([]);
    expect(importClassesFromSequences(empty, [sequence], new Set()).summary.createdClasses).toBe(0);
  });

  it('selects methods and attributes independently on new and existing classes', () => {
    const keys = new Set(['class:tramite', 'method:tramite:setnombre', 'attribute:tramite:nombre']);
    for (const model of [empty, { ...empty, nodes: [node] }]) {
      const result = importClassesFromSequences(model, [sequence], keys);
      expect(result.content.nodes[0].data.methods.map((method) => method.name)).toEqual(['setNombre']);
      expect(result.content.nodes[0].data.attributes).toMatchObject([{ name: 'nombre', type: 'String' }]);
      expect(result.summary).toMatchObject({ addedMethods: 1, addedAttributes: 1 });
    }
    const onlyClass = importClassesFromSequences(empty, [sequence], new Set(['class:tramite']));
    expect(onlyClass.content.nodes[0].data).toMatchObject({ methods: [], attributes: [] });
  });

  it('uses an explicit classifier id for imports even when its display name differs', () => {
    const linked = { ...sequence, participants: sequence.participants.map((participant) => participant.id === 't' ? { ...participant, classifierNodeId: node.id, classifierName: 'Nombre anterior' } : participant) };
    const result = importClassesFromSequences({ ...empty, nodes: [node] }, [linked]);
    expect(result.summary.createdClasses).toBe(0);
    expect(result.content.nodes[0].data.methods).toHaveLength(2);
    expect(planSequenceClassImport({ ...empty, nodes: [node] }, [linked]).every((novelty) => novelty.className === 'Tramite')).toBe(true);
  });
});

describe('missing sequence elements', () => {
  it('marks missing non-actor classes and all their incoming messages', () => {
    const missing = findSequenceMessagesMissingInModel(sequence, empty);
    expect([...missing.participantIds]).toEqual(['t']);
    expect([...missing.messageIds]).toEqual(['set', 'get', 'return']);
  });

  it('matches by name without case and marks only calls on existing classes, including nested messages', () => {
    const fragment = createSequenceFragment('alt');
    fragment.operands[0].items = [sequence.items[0]];
    const nested = { ...sequence, items: [fragment, ...sequence.items.slice(1)] };
    const model = { ...empty, nodes: [{ ...node, data: { ...node.data, name: 'TRAMITE', methods: [{ id: 'm', visibility: '+' as const, name: 'getnombre(id)', parameters: '', returnType: '' }] } }] };
    const missing = findSequenceMessagesMissingInModel(nested, model);
    expect([...missing.participantIds]).toEqual([]);
    expect([...missing.messageIds]).toEqual(['set']);
  });

  it('follows the classifier id first, and the class name when the id is missing or stale', () => {
    const model = importClassesFromSequences(empty, [sequence]).content;
    const linked = { ...sequence, participants: sequence.participants.map((participant) => participant.id === 't' ? { ...participant, classifierNodeId: model.nodes[0].id, classifierName: 'Otra' } : participant) };
    expect(findSequenceMessagesMissingInModel(linked, model).messageIds.size).toBe(0);
    linked.participants[1].classifierNodeId = 'deleted';
    linked.participants[1].classifierName = 'Tramite';
    expect(findSequenceMessagesMissingInModel(linked, model).participantIds.size).toBe(0);
    linked.participants[1].classifierName = 'Otra';
    expect([...findSequenceMessagesMissingInModel(linked, model).participantIds]).toEqual(['t']);
    const fallback = { ...sequence, participants: [{ ...sequence.participants[1], classifierName: '', name: 'tramite' }] };
    expect(findSequenceMessagesMissingInModel(fallback, model).participantIds.size).toBe(0);
  });
});

describe('novelties come only from the sequences', () => {
  const tramite: ClassDiagramNode = { id: 'class-t', type: 'classNode', position: { x: 0, y: 0 }, data: { name: 'Tramite', attributes: [], methods: [
    { id: 'm-estado', visibility: '+', name: 'getEstadoActual', parameters: '', returnType: 'EstadoTramite' },
  ] } };
  const estado: ClassDiagramNode = { id: 'class-e', type: 'classNode', position: { x: 300, y: 0 }, data: { name: 'EstadoTramite', attributes: [], methods: [] } };
  const calls: SequenceDiagramContent = {
    ...createEmptySequenceDiagramContent(),
    participants: [
      { id: 'g', kind: 'control', name: '', classifierName: 'Gestor', x: 0 },
      { id: 't', kind: 'entity', name: 'actual', classifierName: 'Tramite', x: 200 },
    ],
    items: [
      { ...createSequenceMessage('synchronous', 'g', 't'), id: 'nro', name: 'getNroTramite', returnType: 'int' },
      { ...createSequenceMessage('synchronous', 'g', 't'), id: 'lista', name: 'getListEstados', returnType: 'List<EstadoTramite>' },
    ],
  };

  it('does not suggest attributes for model methods the sequence never calls, nor for getters of other classes', () => {
    const plan = planSequenceClassImport({ nodes: [tramite, estado], edges: [] }, [calls]);
    expect(plan.filter((novelty) => novelty.type === 'attribute').map((novelty) => novelty.elementName)).toEqual(['nroTramite']);
  });
});

describe('bindSequenceToModel', () => {
  const model: ClassDiagramContent = { nodes: [{ ...node, data: { ...node.data, methods: [{ id: 'm-nombre', visibility: '+', name: 'getNombre', parameters: '', returnType: 'String' }] } }], edges: [] };

  it('links participants and calls by name and keeps the content when nothing changes', () => {
    const bound = bindSequenceToModel(sequence, model);
    expect(bound.participants.find((participant) => participant.id === 't')?.classifierNodeId).toBe('class-t');
    expect(bound.participants.find((participant) => participant.id === 'actor')?.classifierNodeId).toBeUndefined();
    expect(bound.items.find((item) => item.id === 'get')).toMatchObject({ operationMethodId: 'm-nombre' });
    expect(bound.items.find((item) => item.id === 'set')).not.toHaveProperty('operationMethodId');
    expect(bindSequenceToModel(bound, model)).toBe(bound);
  });

  it('re-resolves links to deleted elements and keeps a deliberate link to another class name', () => {
    const stale = { ...sequence, participants: sequence.participants.map((participant) => participant.id === 't' ? { ...participant, classifierNodeId: 'deleted' } : participant) };
    expect(bindSequenceToModel(stale, model).participants[1].classifierNodeId).toBe('class-t');
    const renamed = { ...sequence, participants: sequence.participants.map((participant) => participant.id === 't' ? { ...participant, classifierName: 'Otra', classifierNodeId: 'class-t' } : participant) };
    expect(bindSequenceToModel(renamed, model).participants[1].classifierNodeId).toBe('class-t');
    const orphan = { ...sequence, participants: sequence.participants.map((participant) => participant.id === 't' ? { ...participant, classifierName: 'Otra', classifierNodeId: 'deleted' } : participant) };
    expect(bindSequenceToModel(orphan, model).participants[1].classifierNodeId).toBeUndefined();
  });
});


describe('legacy methods without parameters', () => {
  const call = { ...sequence, items: [{ ...createSequenceMessage('synchronous', 'actor', 't'), id: 'call', name: 'f(dato)', returnType: 'Incoming' }] };
  const method = { id: 'legacy', visibility: '-' as const, name: 'f', parameters: '', returnType: 'Saved' };
  const model = { ...empty, nodes: [{ ...node, data: { ...node.data, methods: [method] } }] };

  it('plans and completes parameters without duplicating or changing other fields', () => {
    const before = JSON.stringify(model);
    const plan = planSequenceClassImport(model, [call]);
    expect(plan).toMatchObject([{ key: 'method:tramite:f', parameters: 'dato' }]);
    expect([...findSequenceMessagesMissingInModel(call, model).messageIds]).toEqual(['call']);
    const imported = importClassesFromSequences(model, [call], new Set(plan.map((item) => item.key)));
    expect(imported.content.nodes[0].data.methods).toEqual([{ ...method, parameters: 'dato' }]);
    expect(imported.summary).toMatchObject({ addedMethods: 0, updatedMethods: 1, updatedClasses: 1 });
    expect(planSequenceClassImport(imported.content, [call])).toEqual([]);
    expect(importClassesFromSequences(imported.content, [call]).content.nodes[0]).toBe(imported.content.nodes[0]);
    expect(JSON.stringify(model)).toBe(before);
  });

  it('respects deselection and existing parameters, even when different', () => {
    expect(importClassesFromSequences(model, [call], new Set()).content.nodes[0]).toBe(model.nodes[0]);
    const populated = { ...model, nodes: [{ ...model.nodes[0], data: { ...node.data, methods: [{ ...method, parameters: 'otro: int' }] } }] };
    expect(planSequenceClassImport(populated, [call])).toEqual([]);
    expect(importClassesFromSequences(populated, [call]).content.nodes[0]).toBe(populated.nodes[0]);
    const noParameters = { ...call, items: [{ ...createSequenceMessage('synchronous', 'actor', 't'), name: 'f()' }] };
    expect(planSequenceClassImport(model, [noParameters])).toEqual([]);
  });
});
