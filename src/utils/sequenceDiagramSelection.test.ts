import { describe, expect, it } from 'vitest';
import type { SequenceDiagramContent, SequenceFragment, SequenceMessage } from '../types/diagram';
import {
  areItemsContiguous,
  areItemsInSameContainer,
  findMarqueeHits,
  findSequenceItemLocation,
  getContiguousRange,
  getOrderedSelectionInContainer,
  pruneSequenceSelection,
  replaceSequenceSelection,
  selectSequenceElement,
  toggleSequenceElement,
} from './sequenceDiagramSelection';
import { buildSequenceLayout } from './sequenceDiagramLayout';
import { createEmptySequenceDiagramContent, removeSequenceItemsBlock } from './sequenceDiagram';
import { wrapSequenceItems } from './sequenceDiagramWrapping';

const msg = (id: string): SequenceMessage => ({
  id,
  kind: 'message',
  type: 'synchronous',
  sourceId: 'a',
  targetId: 'b',
  name: id,
  arguments: '',
  parameterValues: '',
  returnType: '',
  flowReference: '',
});

const frag = (id: string, operands: SequenceFragment['operands']): SequenceFragment => ({
  id,
  kind: 'fragment',
  operator: 'alt',
  name: id,
  operands,
});

describe('sequence diagram selection utilities', () => {
  const items = [
    msg('m1'),
    msg('m2'),
    frag('f1', [
      { id: 'op1', guard: 'g1', items: [msg('inner1'), msg('inner2'), msg('inner3')] },
      { id: 'op2', guard: 'g2', items: [msg('inner4')] },
    ]),
    msg('m3'),
  ];

  it('poda selecciones fantasma cuando el contenido cambia por historial o transformaciones', () => {
    const content = { ...createEmptySequenceDiagramContent(), items: [msg('kept')] };
    const state = replaceSequenceSelection([
      { kind: 'message', id: 'removed' },
      { kind: 'message', id: 'kept' },
      { kind: 'note', id: 'missing-note' },
    ], { kind: 'message', id: 'removed' });

    expect(pruneSequenceSelection(state, content)).toEqual({
      primary: { kind: 'message', id: 'kept' },
      elements: [{ kind: 'message', id: 'kept' }],
    });
  });

  it('localiza elementos en la raíz y dentro de operandos', () => {
    const locRoot = findSequenceItemLocation(items, 'm2');
    expect(locRoot?.containerId).toBe('root');
    expect(locRoot?.index).toBe(1);

    const locInner = findSequenceItemLocation(items, 'inner2');
    expect(locInner?.containerId).toBe('op1');
    expect(locInner?.index).toBe(1);
  });

  it('determina si varios elementos pertenecen al mismo contenedor', () => {
    expect(areItemsInSameContainer(items, ['m1', 'm2'])).toBe(true);
    expect(areItemsInSameContainer(items, ['inner1', 'inner2', 'inner3'])).toBe(true);
    // Cruza de contenedores (raíz y operando)
    expect(areItemsInSameContainer(items, ['m1', 'inner1'])).toBe(false);
    // Cruza entre distintos operandos del mismo fragmento
    expect(areItemsInSameContainer(items, ['inner1', 'inner4'])).toBe(false);
  });

  it('valida si los elementos son contiguos', () => {
    expect(areItemsContiguous(items, ['m1', 'm2'])).toBe(true);
    expect(areItemsContiguous(items, ['m2', 'm1'])).toBe(true);
    expect(areItemsContiguous(items, ['inner1', 'inner2', 'inner3'])).toBe(true);
    // Elementos separados (no contiguos)
    expect(areItemsContiguous(items, ['m1', 'm3'])).toBe(false);
    expect(areItemsContiguous(items, ['inner1', 'inner3'])).toBe(false);
    // Elementos en distintos contenedores
    expect(areItemsContiguous(items, ['m1', 'inner1'])).toBe(false);
  });

  it('obtiene el rango contiguo entre dos elementos del mismo contenedor', () => {
    expect(getContiguousRange(items, 'm1', 'f1')).toEqual(['m1', 'm2', 'f1']);
    expect(getContiguousRange(items, 'inner1', 'inner3')).toEqual(['inner1', 'inner2', 'inner3']);
    // Elementos en contenedores distintos devuelven null
    expect(getContiguousRange(items, 'm1', 'inner2')).toBeNull();
  });

  it('obtiene los elementos ordenados dentro del contenedor', () => {
    const ordered = getOrderedSelectionInContainer(items, ['m2', 'm1']);
    expect(ordered?.map((item) => item.id)).toEqual(['m1', 'm2']);
  });

  it('mantiene una única selección canónica para foco, multiselección y marquee', () => {
    let state = selectSequenceElement({ kind: 'message', id: 'm1' });
    state = toggleSequenceElement(state, { kind: 'message', id: 'm2' });
    expect(state.elements.map((element) => element.id)).toEqual(['m1', 'm2']);
    expect(state.primary?.id).toBe('m2');

    state = replaceSequenceSelection([{ kind: 'message', id: 'm3' }]);
    expect(state).toEqual({
      primary: { kind: 'message', id: 'm3' },
      elements: [{ kind: 'message', id: 'm3' }],
    });
  });

  it('envuelve exactamente los dos elementos visualmente seleccionados', () => {
    let state = selectSequenceElement({ kind: 'message', id: 'm1' });
    state = toggleSequenceElement(state, { kind: 'message', id: 'm2' });
    const result = wrapSequenceItems(items, state.elements.map((element) => element.id), 'opt');

    expect(result).not.toBeNull();
    if (!result) throw new Error('expected a valid wrap');
    expect(result?.createdFragment.operands[0].items.map((item) => item.id)).toEqual(['m1', 'm2']);
    expect(result.items.map((item) => item.id)).toEqual([result.createdFragment.id, 'f1', 'm3']);
  });

  it('un marquee reemplaza la selección previa y Delete usa solo lo visible', () => {
    const state = replaceSequenceSelection([{ kind: 'message', id: 'm3' }]);
    const result = removeSequenceItemsBlock(items, state.elements.map((element) => element.id));

    expect(result.removed.map((item) => item.id)).toEqual(['m3']);
    expect(result.items.map((item) => item.id)).toEqual(['m1', 'm2', 'f1']);
  });
});

describe('marquee de selección en bloque', () => {
  const diagram: SequenceDiagramContent = {
    version: 1,
    numbering: 'sequential',
    showActivations: true,
    participants: [
      { id: 'a', kind: 'actor', name: 'A', classifierName: '', x: 140 },
      { id: 'b', kind: 'object', name: 'B', classifierName: 'B', x: 420 },
    ],
    items: [
      msg('m1'),
      frag('f1', [{ id: 'op1', guard: 'g1', items: [msg('inner1'), msg('inner2')] }]),
      msg('m2'),
    ],
    activations: [],
    problems: [],
    notes: [],
    canvas: { width: 1200, height: 800 },
  };
  const layout = buildSequenceLayout(diagram);
  const fragBox = layout.fragmentLayouts.get('f1')!;
  const inner1Y = layout.messageLayouts.get('inner1')!.y;

  it('prefiere lo de adentro: el contenedor parcial sale del bloque', () => {
    const hits = findMarqueeHits(diagram, layout, {
      x: fragBox.x + 10,
      y: inner1Y - 15,
      width: fragBox.width - 20,
      height: 30,
    });
    expect(hits.timelineIds).toEqual(['inner1']);
  });

  it('si el marquee encierra al fragmento, lo de adentro va implícito', () => {
    const hits = findMarqueeHits(diagram, layout, {
      x: fragBox.x,
      y: fragBox.y,
      width: fragBox.width,
      height: fragBox.height,
    });
    expect(hits.timelineIds).toContain('f1');
    expect(hits.timelineIds).not.toContain('inner1');
    expect(hits.timelineIds).not.toContain('inner2');
  });

  it('un fragmento tocado sin nada adentro sí se selecciona', () => {
    const hits = findMarqueeHits(diagram, layout, {
      x: fragBox.x + 2,
      y: fragBox.y + 2,
      width: 30,
      height: 18,
    });
    expect(hits.timelineIds).toEqual(['f1']);
  });

  it('los mensajes sueltos se seleccionan sin contenedores', () => {
    const m1Y = layout.messageLayouts.get('m1')!.y;
    const hits = findMarqueeHits(diagram, layout, { x: 0, y: m1Y - 20, width: 1200, height: 40 });
    expect(hits.timelineIds).toEqual(['m1']);
  });

  it('no mezcla en un mismo marquee elementos de raíz y de una rama', () => {
    const m1Y = layout.messageLayouts.get('m1')!.y;
    const hits = findMarqueeHits(diagram, layout, {
      x: 0,
      y: m1Y - 20,
      width: 1200,
      height: inner1Y - m1Y + 40,
    });

    expect(areItemsInSameContainer(diagram.items, hits.timelineIds)).toBe(true);
    expect(hits.timelineIds).toEqual(['inner1']);
  });
});
