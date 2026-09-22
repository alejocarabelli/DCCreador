import { describe, expect, it } from 'vitest';
import type {
  ClassDiagramNode,
  SequenceDiagramContent,
  SequenceMessage,
  SequenceParticipant,
  SequenceParticipantKind,
} from '../types/diagram';
import { findFreeClassPosition } from './classPlacement';
import { createEmptySequenceDiagramContent, createSequenceFragment, createSequenceMessage } from './sequenceDiagram';
import { importClassesFromSequences } from './sequenceClassImport';

const participant = (id: string, kind: SequenceParticipantKind, name: string, classifierName: string, x: number): SequenceParticipant => ({
  id, kind, name, classifierName, x,
});

const call = (
  source: string,
  target: string,
  name: string,
  extra: Partial<SequenceMessage> = {},
): SequenceMessage => ({ ...createSequenceMessage('synchronous', source, target), name, ...extra });

const classNode = (id: string, name: string, x: number, y: number, methods: ClassDiagramNode['data']['methods'] = []): ClassDiagramNode => ({
  id, type: 'classNode', position: { x, y }, data: { name, attributes: [], methods },
});

const sequence = (patch: Partial<SequenceDiagramContent>): SequenceDiagramContent => ({
  ...createEmptySequenceDiagramContent(),
  ...patch,
});

describe('importClassesFromSequences', () => {
  it('creates one class per non-actor participant with the operations it receives', () => {
    const fragment = createSequenceFragment('alt');
    fragment.operands[0].items = [call('p', 'r', 'buscarPermiso', { arguments: 'rolId', returnType: 'Permiso' })];
    const content = sequence({
      participants: [
        participant('u', 'actor', 'Usuario', '', 0),
        participant('p', 'boundary', 'Portal Web', 'Portal', 200),
        participant('r', 'entity', 'repo', ':Repositorio', 400),
      ],
      items: [
        call('u', 'p', 'iniciarSesion', { arguments: 'usuario, clave', returnType: 'void' }),
        { ...createSequenceMessage('return', 'p', 'u'), name: 'ok' },
        createSequenceMessage('create', 'p', 'r'),
        fragment,
      ],
    });

    const { content: result, summary } = importClassesFromSequences({ nodes: [], edges: [] }, [content]);

    expect(result.nodes.map((node) => node.data.name)).toEqual(['Portal', 'Repositorio']);
    expect(result.nodes[0].data.methods).toMatchObject([
      { name: 'iniciarSesion', parameters: '', returnType: 'void', visibility: '+' },
    ]);
    expect(result.nodes[1].data.methods).toMatchObject([
      { name: 'buscarPermiso', parameters: '', returnType: 'Permiso' },
    ]);
    expect(summary).toEqual({ createdClasses: 2, addedAttributes: 0, addedMethods: 2, updatedClasses: 0 });
  });

  it('merges into existing classes by name and is idempotent', () => {
    const content = sequence({
      participants: [participant('p', 'control', '', 'Gestor', 0)],
      items: [call('p', 'p', 'validar'), call('p', 'p', 'guardar(dato)')],
    });
    const existing = classNode('g', 'gestor', 0, 0, [
      { id: 'm1', visibility: '+', name: 'validar', parameters: '', returnType: '' },
    ]);

    const first = importClassesFromSequences({ nodes: [existing], edges: [] }, [content]);
    expect(first.content.nodes).toHaveLength(1);
    expect(first.content.nodes[0].data.methods.map((method) => [method.name, method.parameters]))
      .toEqual([['validar', ''], ['guardar', '']]);
    expect(first.summary).toEqual({ createdClasses: 0, addedAttributes: 0, addedMethods: 1, updatedClasses: 1 });

    const second = importClassesFromSequences(first.content, [content]);
    expect(second.summary).toEqual({ createdClasses: 0, addedAttributes: 0, addedMethods: 0, updatedClasses: 0 });
    expect(second.content.nodes[0]).toBe(first.content.nodes[0]);
  });

  it('brings each method once, without the arguments passed in the messages', () => {
    const content = sequence({
      participants: [participant('p', 'control', '', 'Gestor', 0), participant('t', 'entity', '', 'Tramite', 200)],
      items: [
        call('p', 't', 'buscar', { arguments: 'nroTramite' }),
        call('p', 't', 'buscar(codConsultor)'),
        call('p', 't', 'getEstado', { arguments: 'fechaActual' }),
      ],
    });
    const existing = classNode('t', 'Tramite', 0, 0, [
      { id: 'm1', visibility: '+', name: 'getEstado', parameters: 'fecha: Date', returnType: '' },
    ]);

    const { content: result, summary } = importClassesFromSequences({ nodes: [existing], edges: [] }, [content]);
    expect(result.nodes[0].data.methods.map((method) => [method.name, method.parameters]))
      .toEqual([['getEstado', 'fecha: Date'], ['buscar', '']]);
    expect(summary.addedMethods).toBe(1);
  });

  it('places new classes beside the existing diagram without overlapping it', () => {
    const content = sequence({ participants: [participant('a', 'object', 'a', 'Nueva', 0)] });
    const existing = classNode('x', 'Existente', 100, 100);
    const { content: result } = importClassesFromSequences({ nodes: [existing], edges: [] }, [content]);
    expect(result.nodes[1].position.x).toBeGreaterThan(100 + 240);
  });
});

describe('findFreeClassPosition', () => {
  it('returns the preferred slot when it is free and moves off an occupied one', () => {
    expect(findFreeClassPosition([], { x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
    const next = findFreeClassPosition([classNode('a', 'A', 50, 50)], { x: 50, y: 50 });
    expect(next).not.toEqual({ x: 50, y: 50 });
    expect(Math.abs(next.x - 50) >= 240 || Math.abs(next.y - 50) >= 150).toBe(true);
  });
});

describe('accessor attributes', () => {
  it('adds the attribute behind each get or set, typed by the getter', () => {
    const content = sequence({
      participants: [participant('c', 'control', '', 'Gestor', 0), participant('t', 'entity', '', 'Tramite', 200)],
      items: [
        call('c', 't', 'setEstado', { arguments: 'estadoNuevo' }),
        call('c', 't', 'getEstado', { returnType: 'TramiteEstado' }),
        call('c', 't', 'getNroTramite', { returnType: 'int' }),
        call('c', 't', 'getURL'),
        call('c', 't', 'buscarDocumentos'),
        call('c', 't', 'getter'),
      ],
    });

    const { content: result, summary } = importClassesFromSequences({ nodes: [], edges: [] }, [content]);
    const tramite = result.nodes.find((node) => node.data.name === 'Tramite');
    expect(tramite?.data.attributes.map((attribute) => [attribute.name, attribute.type])).toEqual([
      ['estado', 'TramiteEstado'],
      ['nroTramite', 'int'],
      ['URL', ''],
    ]);
    expect(summary.addedAttributes).toBe(3);
  });

  it('does not repeat attributes the class already has', () => {
    const content = sequence({
      participants: [participant('c', 'control', '', 'Gestor', 0), participant('t', 'entity', '', 'Tramite', 200)],
      items: [call('c', 't', 'getEstado'), call('c', 't', 'getFechaAlta')],
    });
    const existing = classNode('t', 'Tramite', 0, 0);
    existing.data.attributes = [{ id: 'a1', name: 'estado', type: 'String' }];

    const first = importClassesFromSequences({ nodes: [existing], edges: [] }, [content]);
    expect(first.content.nodes[0].data.attributes.map((attribute) => attribute.name)).toEqual(['estado', 'fechaAlta']);
    expect(first.summary.addedAttributes).toBe(1);

    const second = importClassesFromSequences(first.content, [content]);
    expect(second.summary).toEqual({ createdClasses: 0, addedAttributes: 0, addedMethods: 0, updatedClasses: 0 });
  });
});
