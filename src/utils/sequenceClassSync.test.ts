import { describe, expect, it } from 'vitest';
import type { ClassDiagramContent, ClassDiagramNode, SequenceDiagramContent } from '../types/diagram';
import { createEmptySequenceDiagramContent, createSequenceFragment, createSequenceMessage } from './sequenceDiagram';
import { findSequenceMessagesMissingInModel, importClassesFromSequences, planSequenceClassImport } from './sequenceClassImport';

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
      { key: 'method:tramite:setnombre', type: 'method', className: 'Tramite', elementName: 'setNombre', returnType: '' },
      { key: 'method:tramite:getnombre', type: 'method', className: 'Tramite', elementName: 'getNombre', returnType: 'String' },
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

  it('uses classifier ids strictly, and falls back to the participant name only without an id', () => {
    const model = importClassesFromSequences(empty, [sequence]).content;
    const linked = { ...sequence, participants: sequence.participants.map((participant) => participant.id === 't' ? { ...participant, classifierNodeId: model.nodes[0].id, classifierName: 'Otra' } : participant) };
    expect(findSequenceMessagesMissingInModel(linked, model).messageIds.size).toBe(0);
    linked.participants[1].classifierNodeId = 'deleted';
    linked.participants[1].classifierName = 'Tramite';
    expect([...findSequenceMessagesMissingInModel(linked, model).participantIds]).toEqual(['t']);
    const fallback = { ...sequence, participants: [{ ...sequence.participants[1], classifierName: '', name: 'tramite' }] };
    expect(findSequenceMessagesMissingInModel(fallback, model).participantIds.size).toBe(0);
  });
});
