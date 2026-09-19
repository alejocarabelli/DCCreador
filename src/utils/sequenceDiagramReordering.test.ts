import { describe, expect, it } from 'vitest';
import type { SequenceDiagramContent, SequenceFragment, SequenceMessage, SequenceTimelineItem } from '../types/diagram';
import {
  calculateMessageInsertionSlots,
  calculateTimelineItemInsertionSlots,
  findBlockDropTarget,
  getBlockDropGuideY,
  findClosestInsertionSlot,
  getBlockContainerName,
  insertTimelineItemsAt,
  isBlockDropForbidden,
  moveSequenceItemsBlockToSlot,
  moveTimelineItemInTree,
  reorderFragmentByY,
  validateBlockCandidate,
  validateSequenceItemMove,
  validateSequenceItemsBlockMove,
} from './sequenceDiagramReordering';
import { buildSequenceLayout } from './sequenceDiagramLayout';
import { applySequenceDiagramMutation, removeSequenceItemsBlock } from './sequenceDiagram';

const createMsg = (
  id: string,
  name: string,
  from: string,
  to: string,
  type: SequenceMessage['type'] = 'synchronous',
): SequenceMessage => ({
  id,
  kind: 'message',
  name,
  type,
  sourceId: from,
  targetId: to,
  arguments: '',
  parameterValues: '',
  returnType: '',
  flowReference: '',
});

const createBaseDiagram = (items: SequenceTimelineItem[]): SequenceDiagramContent => ({
  version: 1,
  numbering: 'sequential',
  showActivations: true,
  participants: [
    { id: 'p1', kind: 'actor', name: 'User', classifierName: '', x: 100 },
    { id: 'p2', kind: 'object', name: 'Service', classifierName: 'Service', x: 300 },
    { id: 'p3', kind: 'object', name: 'Database', classifierName: 'Database', x: 500 },
  ],
  items,
  activations: [],
  problems: [],
  notes: [],
  canvas: { width: 1200, height: 800 },
});

describe('sequenceDiagramReordering', () => {
  describe('moveTimelineItemInTree', () => {
    it('moves an item forward in a list', () => {
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first', 'p1', 'p2'),
        createMsg('m2', 'second', 'p1', 'p2'),
        createMsg('m3', 'third', 'p1', 'p2'),
      ];

      // Move m1 to after m2 (slot index 2)
      const result = moveTimelineItemInTree(items, 'm1', 'root', 2);
      expect(result).not.toBeNull();
      expect(result!.map((i) => i.id)).toEqual(['m2', 'm1', 'm3']);
    });

    it('moves an item backward in a list', () => {
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first', 'p1', 'p2'),
        createMsg('m2', 'second', 'p1', 'p2'),
        createMsg('m3', 'third', 'p1', 'p2'),
      ];

      // Move m3 to index 0 (before m1)
      const result = moveTimelineItemInTree(items, 'm3', 'root', 0);
      expect(result).not.toBeNull();
      expect(result!.map((i) => i.id)).toEqual(['m3', 'm1', 'm2']);
    });

    it('moves an item to the end of the list', () => {
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first', 'p1', 'p2'),
        createMsg('m2', 'second', 'p1', 'p2'),
        createMsg('m3', 'third', 'p1', 'p2'),
      ];

      // Move m1 to slot 3 (after m3)
      const result = moveTimelineItemInTree(items, 'm1', 'root', 3);
      expect(result).not.toBeNull();
      expect(result!.map((i) => i.id)).toEqual(['m2', 'm3', 'm1']);
    });
  });

  describe('validateSequenceItemMove', () => {
    it('permits valid reordering of independent messages', () => {
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first', 'p1', 'p2'),
        createMsg('m2', 'second', 'p1', 'p3'),
      ];
      const diagram = createBaseDiagram(items);

      const result = validateSequenceItemMove(diagram, 'm2', 'root', 0);
      expect(result.valid).toBe(true);
      expect(result.newContent?.items.map((i) => i.id)).toEqual(['m2', 'm1']);
    });

    it('blocks moving a message before participant create()', () => {
      // p2 is created by m1
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'create', 'p1', 'p2', 'create'),
        createMsg('m2', 'doWork', 'p1', 'p2', 'synchronous'),
      ];
      const diagram = createBaseDiagram(items);

      // Try to move m2 before m1
      const result = validateSequenceItemMove(diagram, 'm2', 'root', 0);
      expect(result.valid).toBe(false);
      expect(result.problemCode).toBe('message-before-create');
      expect(result.reason).toContain('create()');
    });

    it('blocks moving a message after participant destroy()', () => {
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'doWork', 'p1', 'p2', 'synchronous'),
        createMsg('m2', 'destroy', 'p1', 'p2', 'destroy'),
      ];
      const diagram = createBaseDiagram(items);

      // Try to move m1 after m2 (slot 2)
      const result = validateSequenceItemMove(diagram, 'm1', 'root', 2);
      expect(result.valid).toBe(false);
      expect(result.problemCode).toBe('message-after-destroy');
      expect(result.reason).toContain('destroy()');
    });

    it('treats no-op slot move as valid', () => {
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first', 'p1', 'p2'),
        createMsg('m2', 'second', 'p1', 'p2'),
      ];
      const diagram = createBaseDiagram(items);

      // m1 is at index 0. Target slot 0 or 1 is no-op.
      const result0 = validateSequenceItemMove(diagram, 'm1', 'root', 0);
      expect(result0.valid).toBe(true);
      const result1 = validateSequenceItemMove(diagram, 'm1', 'root', 1);
      expect(result1.valid).toBe(true);
    });
  });

  describe('calculateMessageInsertionSlots and findClosestInsertionSlot', () => {
    it('calculates slots and correctly flags invalid slots', () => {
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'create', 'p1', 'p2', 'create'),
        createMsg('m2', 'doWork', 'p1', 'p2', 'synchronous'),
      ];
      const diagram = createBaseDiagram(items);
      const layout = buildSequenceLayout(diagram);

      const slots = calculateMessageInsertionSlots(diagram, layout, 'm2');
      expect(slots).toHaveLength(3); // slots 0, 1, 2

      // Slot 0 (before m1) is invalid because m2 uses p2 before create()
      expect(slots[0].isValid).toBe(false);
      expect(slots[0].reason).toContain('create()');

      // Slot 1 (no-op) is valid
      expect(slots[1].isValid).toBe(true);

      // Slot 2 (after m2, no-op) is valid
      expect(slots[2].isValid).toBe(true);

      // Closest slot to top Y
      const closest = findClosestInsertionSlot(slots, slots[0].y);
      expect(closest?.index).toBe(0);
    });

    it('calculates slots inside fragment operands allowing messages to be inserted into fragments', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'alt',
        name: 'Camino',
        operands: [
          { id: 'op1', guard: 'condicion', items: [] },
          { id: 'op2', guard: 'else', items: [] },
        ],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'msg1', 'p1', 'p2', 'synchronous'),
        frag,
      ];
      const diagram = createBaseDiagram(items);
      const layout = buildSequenceLayout(diagram);

      const slots = calculateMessageInsertionSlots(diagram, layout, 'm1');
      // Root slots (0 before m1, 1 between m1 and frag, 2 after frag)
      // + op1 slot (index 0)
      // + op2 slot (index 0)
      expect(slots.length).toBeGreaterThanOrEqual(5);

      const op1Slot = slots.find((s) => s.containerId === 'op1');
      expect(op1Slot).toBeDefined();
      expect(op1Slot?.containerName).toContain('alt [condicion]');
      expect(op1Slot?.isValid).toBe(true);

      const op2Slot = slots.find((s) => s.containerId === 'op2');
      expect(op2Slot).toBeDefined();
      expect(op2Slot?.containerName).toContain('alt [else]');
      expect(op2Slot?.isValid).toBe(true);

      // Testing closest slot when pointer is inside operand 1
      if (op1Slot?.containerBounds) {
        const closestInside = findClosestInsertionSlot(
          slots,
          op1Slot.y,
          op1Slot.containerBounds.x + 50,
        );
        expect(closestInside?.containerId).toBe('op1');
      }
    });

    it('reorders a fragment vertically among sibling items with reorderFragmentByY', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        name: 'loop',
        operator: 'loop',
        operands: [{ id: 'op1', guard: '1..10', items: [] }],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'msg1', 'p1', 'p2', 'synchronous'),
        createMsg('m2', 'msg2', 'p1', 'p2', 'synchronous'),
        frag,
      ];
      const diagram = createBaseDiagram(items);
      const layout = buildSequenceLayout(diagram);

      // Drag fragment above m1 (targetY = 50, which is < m1.y)
      const reorderedAbove = reorderFragmentByY(items, 'frag1', 50, layout);
      expect(reorderedAbove[0].id).toBe('frag1');
      expect(reorderedAbove[1].id).toBe('m1');
      expect(reorderedAbove[2].id).toBe('m2');

      // Drag fragment between m1 and m2 (targetY = 200, assuming m1.y ~ 150 and m2.y ~ 230)
      const m1Y = layout.messageLayouts.get('m1')?.y ?? 150;
      const m2Y = layout.messageLayouts.get('m2')?.y ?? 230;
      const reorderedBetween = reorderFragmentByY(items, 'frag1', (m1Y + m2Y) / 2, layout);
      expect(reorderedBetween[0].id).toBe('m1');
      expect(reorderedBetween[1].id).toBe('frag1');
      expect(reorderedBetween[2].id).toBe('m2');
    });

    it('allows moving return messages freely even when there is no matching call route', () => {
      const m1 = createMsg('m1', 'llamar', 'p1', 'p2', 'synchronous');
      const ret = createMsg('ret1', '', 'p2', 'p1', 'return');
      const m2 = createMsg('m2', 'otraLlamada', 'p1', 'p2', 'synchronous');
      const diagram = createBaseDiagram([m1, ret, m2]);

      // Move ret1 to index 0 (before m1 where there is no open call)
      const validation = validateSequenceItemMove(diagram, 'ret1', 'root', 0);
      expect(validation.valid).toBe(true);
      expect(validation.newContent?.items[0].id).toBe('ret1');

      // Check that all insertion slots for return are valid
      const layout = buildSequenceLayout(diagram);
      const slots = calculateMessageInsertionSlots(diagram, layout, 'ret1');
      expect(slots.every((s) => s.isValid)).toBe(true);
    });

    it('allows moving create messages into fragments', () => {
      const frag: SequenceFragment = {
        id: 'frag-loop',
        kind: 'fragment',
        name: 'loop',
        operator: 'loop',
        operands: [{ id: 'loop-body', guard: 'para cada item', items: [] }],
      };
      const createMsgItem = createMsg('c1', 'create', 'p1', 'p2', 'create');
      const m1 = createMsg('m1', 'metodo', 'p1', 'p2', 'synchronous');
      const diagram = createBaseDiagram([frag, createMsgItem, m1]);

      const validation = validateSequenceItemMove(diagram, 'c1', 'loop-body', 0);
      expect(validation.valid).toBe(true);
    });

    it('calcula ranuras de inserción para fragmentos excluyendo sus propios operandos', () => {
      const frag: SequenceFragment = {
        id: 'frag-parent',
        kind: 'fragment',
        name: 'parent',
        operator: 'alt',
        operands: [
          { id: 'op1', guard: 'cond1', items: [createMsg('m1', 'msg1', 'p1', 'p2')] },
          { id: 'op2', guard: 'cond2', items: [] },
        ],
      };
      const externalMsg = createMsg('m2', 'externo', 'p1', 'p2');
      const diagram = createBaseDiagram([externalMsg, frag]);
      const layout = buildSequenceLayout(diagram);

      const slots = calculateTimelineItemInsertionSlots(diagram, layout, 'frag-parent');
      // No debe contener slots con containerId 'frag-parent', 'op1' ni 'op2'
      expect(slots.some((s) => s.containerId === 'op1')).toBe(false);
      expect(slots.some((s) => s.containerId === 'op2')).toBe(false);
      expect(slots.some((s) => s.containerId === 'root')).toBe(true);
    });

    it('elimina la coordenada y fija al mover un fragmento en el árbol', () => {
      const frag: SequenceFragment = {
        id: 'frag-to-move',
        kind: 'fragment',
        name: 'loop',
        operator: 'loop',
        y: 450,
        operands: [{ id: 'op-body', guard: 'guard', items: [] }],
      };
      const m1 = createMsg('m1', 'primero', 'p1', 'p2');
      const m2 = createMsg('m2', 'segundo', 'p1', 'p2');
      const items = [m1, frag, m2];

      const moved = moveTimelineItemInTree(items, 'frag-to-move', 'root', 0);
      expect(moved).not.toBeNull();
      expect(moved![0].id).toBe('frag-to-move');
      const movedFrag = moved![0] as SequenceFragment;
      expect(movedFrag.y).toBeUndefined();
    });
  });
});

describe('movimiento de bloques', () => {
  const blockItems = (): SequenceTimelineItem[] => [
    createMsg('m1', 'primero', 'p1', 'p2'),
    createMsg('m2', 'segundo', 'p1', 'p2'),
    createMsg('m3', 'tercero', 'p1', 'p2'),
    createMsg('m4', 'cuarto', 'p1', 'p2'),
  ];

  it('inserta varios elementos en una posición del contenedor', () => {
    const items = blockItems();
    const toInsert = [createMsg('x1', 'extra1', 'p1', 'p2'), createMsg('x2', 'extra2', 'p1', 'p2')];
    const result = insertTimelineItemsAt(items, 'root', 1, toInsert);
    expect(result.map((i) => i.id)).toEqual(['m1', 'x1', 'x2', 'm2', 'm3', 'm4']);
  });

  it('reubica un bloque al principio y al final', () => {
    const toEnd = moveSequenceItemsBlockToSlot(blockItems(), ['m1', 'm2'], 'root', 4);
    expect(toEnd?.map((i) => i.id)).toEqual(['m3', 'm4', 'm1', 'm2']);

    const toStart = moveSequenceItemsBlockToSlot(blockItems(), ['m3', 'm4'], 'root', 0);
    expect(toStart?.map((i) => i.id)).toEqual(['m3', 'm4', 'm1', 'm2']);
  });

  it('detecta noop cuando el bloque queda en su lugar', () => {
    const diagram = createBaseDiagram(blockItems());
    const validation = validateSequenceItemsBlockMove(diagram, ['m2', 'm3'], 'root', 1);
    expect(validation.valid).toBe(true);
    expect(validation.isNoop).toBe(true);
  });

  it('valida un bloque movido a otra posición', () => {
    const diagram = createBaseDiagram(blockItems());
    const validation = validateSequenceItemsBlockMove(diagram, ['m1', 'm2'], 'root', 4);
    expect(validation.valid).toBe(true);
    expect(validation.newContent?.items.map((i) => i.id)).toEqual(['m3', 'm4', 'm1', 'm2']);
  });

  it('rechaza bloques vacíos o inexistentes', () => {
    const diagram = createBaseDiagram(blockItems());
    expect(validateSequenceItemsBlockMove(diagram, [], 'root', 0).valid).toBe(false);
    expect(validateSequenceItemsBlockMove(diagram, ['nope'], 'root', 0).valid).toBe(false);
    expect(moveSequenceItemsBlockToSlot(blockItems(), ['nope'], 'root', 0)).toBeNull();
    // Los ids inexistentes se ignoran y el resto del bloque se mueve igual.
    expect(moveSequenceItemsBlockToSlot(blockItems(), ['m4', 'nope'], 'root', 0)?.map((i) => i.id)[0]).toBe('m4');
  });
});

describe('mapeo de hueco para arrastre', () => {
  const fragWithOperand = (fragId: string, opId: string, inner: SequenceTimelineItem[]): SequenceFragment => ({
    id: fragId,
    kind: 'fragment',
    name: '',
    operator: 'opt',
    operands: [{ id: opId, guard: 'g', items: inner }],
  });

  const diagramWithFragment = () => createBaseDiagram([
    createMsg('m1', 'primero', 'p1', 'p2'),
    fragWithOperand('f1', 'op1', [createMsg('inner1', 'dentro1', 'p1', 'p2'), createMsg('inner2', 'dentro2', 'p1', 'p2')]),
    createMsg('m2', 'segundo', 'p1', 'p2'),
  ]);

  const dropTarget = (
    diagram: SequenceDiagramContent,
    groupIds: string[],
    x: number,
    y: number,
  ) => {
    const layout = buildSequenceLayout(diagram);
    const { items: withoutItems } = removeSequenceItemsBlock(diagram.items, groupIds);
    const withoutLayout = buildSequenceLayout({ ...diagram, items: withoutItems });
    return findBlockDropTarget(diagram.items, layout, groupIds, withoutItems, withoutLayout, { x, y });
  };

  it('mapea el puntero a huecos de la raíz (marco base)', () => {
    const diagram = createBaseDiagram([
      createMsg('m1', 'primero', 'p1', 'p2'),
      createMsg('m2', 'segundo', 'p1', 'p2'),
      createMsg('m3', 'tercero', 'p1', 'p2'),
    ]);
    const layout = buildSequenceLayout(diagram);
    const y1 = layout.messageLayouts.get('m1')!.y;
    const y2 = layout.messageLayouts.get('m2')!.y;
    const y3 = layout.messageLayouts.get('m3')!.y;
    // Puntero sobre la fila de m2 con el grupo [m2]: hueco propio (noop).
    expect(dropTarget(diagram, ['m2'], 300, y2)).toEqual({ containerId: 'root', index: 1 });
    // Puntero entre m1 y m2: hueco 1 sin grupo.
    expect(dropTarget(diagram, [], 300, (y1 + y2) / 2)).toEqual({ containerId: 'root', index: 1 });
    // Puntero al final.
    expect(dropTarget(diagram, [], 300, y3 + 100)).toEqual({ containerId: 'root', index: 3 });
    // Puntero al principio.
    expect(dropTarget(diagram, [], 300, y1 - 100)).toEqual({ containerId: 'root', index: 0 });
  });

  it('agarrar cualquier mensaje sin salir de su fila da noop', () => {
    const diagram = diagramWithFragment();
    const layout = buildSequenceLayout(diagram);
    const checkNoop = (id: string, y: number, x = 300): void => {
      const target = dropTarget(diagram, [id], x, y);
      const { items: without, removed } = removeSequenceItemsBlock(diagram.items, [id]);
      const candidate = insertTimelineItemsAt(without, target.containerId, target.index, removed);
      expect(validateBlockCandidate(diagram, candidate, [id], target.containerId).isNoop).toBe(true);
    };
    const y1 = layout.messageLayouts.get('m1')!.y;
    checkNoop('m1', y1);
    checkNoop('m2', layout.messageLayouts.get('m2')!.y);
    const fragBox = layout.fragmentLayouts.get('f1')!;
    const x = fragBox.x + fragBox.width / 2;
    checkNoop('inner1', layout.messageLayouts.get('inner1')!.y, x);
    checkNoop('inner2', layout.messageLayouts.get('inner2')!.y, x);
  });

  it('elige el operando más profundo que contiene al puntero', () => {
    const diagram = diagramWithFragment();
    const layout = buildSequenceLayout(diagram);
    const fragBox = layout.fragmentLayouts.get('f1')!;
    const opTop = fragBox.operands[0].top;
    const opBottom = fragBox.operands[0].bottom;
    const yIn1 = layout.messageLayouts.get('inner1')!.y;
    const yIn2 = layout.messageLayouts.get('inner2')!.y;
    const x = fragBox.x + fragBox.width / 2;
    const above = dropTarget(diagram, [], x, (opTop + yIn1) / 2);
    expect(above).toEqual({ containerId: 'op1', index: 0 });
    const between = dropTarget(diagram, [], x, (yIn1 + yIn2) / 2);
    expect(between).toEqual({ containerId: 'op1', index: 1 });
    const below = dropTarget(diagram, [], x, (yIn2 + opBottom) / 2);
    expect(below).toEqual({ containerId: 'op1', index: 2 });
  });

  it('prohíbe soltar un fragmento dentro de sí mismo', () => {
    const diagram = diagramWithFragment();
    expect(isBlockDropForbidden(diagram.items, ['f1'], 'op1')).toBe(true);
    expect(isBlockDropForbidden(diagram.items, ['f1'], 'root')).toBe(false);
    expect(isBlockDropForbidden(diagram.items, ['m1'], 'op1')).toBe(false);
  });

  it('nombra los contenedores destino', () => {
    const diagram = diagramWithFragment();
    expect(getBlockContainerName(diagram.items, 'root')).toBe('Secuencia principal');
    expect(getBlockContainerName(diagram.items, 'op1')).toBe('opt [g]');
    expect(getBlockContainerName(diagram.items, 'inexistente')).toBe('fragmento');
  });

  it('valida un candidato: noop, válido y prohibido', () => {
    const diagram = createBaseDiagram([
      createMsg('m1', 'primero', 'p1', 'p2'),
      createMsg('m2', 'segundo', 'p1', 'p2'),
    ]);
    expect(validateBlockCandidate(diagram, diagram.items, ['m1'], 'root').isNoop).toBe(true);
    const moved = [diagram.items[1], diagram.items[0]];
    const validation = validateBlockCandidate(diagram, moved, ['m1'], 'root');
    expect(validation.valid).toBe(true);
    expect(validation.newContent?.items.map((i) => i.id)).toEqual(['m2', 'm1']);

    const withFrag = diagramWithFragment();
    const forbidden = validateBlockCandidate(withFrag, withFrag.items, ['f1'], 'op1');
    expect(forbidden.valid).toBe(false);
    expect(forbidden.reason).toMatch(/dentro de sí mismo/);
  });

  it('identifica el unmatched-return que el editor debe compartir con la compuerta de commit', () => {
    const call = createMsg('call', 'llamada', 'p1', 'p2');
    const returned = createMsg('returned', 'retorno', 'p2', 'p1', 'return');
    const diagram = createBaseDiagram([call, returned]);
    const validation = validateBlockCandidate(diagram, [returned, call], ['returned'], 'root');
    const gate = applySequenceDiagramMutation(diagram, { ...diagram, items: [returned, call] });

    expect(validation.valid).toBe(true);
    expect(gate.accepted).toBe(false);
    expect(gate.newProblems[0]?.code).toBe('unmatched-return');
  });

  it('ancla la guía del bloque al primer elemento visual del candidato, no al primer id recibido', () => {
    const diagram = createBaseDiagram([
      createMsg('m1', 'primero', 'p1', 'p2'),
      createMsg('m2', 'segundo', 'p1', 'p2'),
    ]);
    const layout = buildSequenceLayout(diagram);
    const firstY = layout.messageLayouts.get('m1')!.y;
    const secondY = layout.messageLayouts.get('m2')!.y;

    expect(getBlockDropGuideY(layout, ['m2', 'm1'], 0)).toBe(firstY);
    expect(getBlockDropGuideY(layout, ['missing', 'm2'], 0)).toBe(secondY);
  });

  it('mantiene guía y aterrizaje en la misma geometría cuando un bloque cambia de posición', () => {
    const diagram = createBaseDiagram([
      createMsg('m1', 'primero', 'p1', 'p2'),
      createMsg('m2', 'segundo', 'p1', 'p2'),
      createMsg('m3', 'tercero', 'p1', 'p2'),
    ]);
    const layout = buildSequenceLayout(diagram);
    const { items: withoutItems, removed } = removeSequenceItemsBlock(diagram.items, ['m1', 'm2']);
    const withoutLayout = buildSequenceLayout({ ...diagram, items: withoutItems });
    const target = findBlockDropTarget(
      diagram.items,
      layout,
      ['m1', 'm2'],
      withoutItems,
      withoutLayout,
      { x: 300, y: layout.messageLayouts.get('m3')!.y + 40 },
    );
    const candidate = insertTimelineItemsAt(withoutItems, target.containerId, target.index, removed);
    const previewLayout = buildSequenceLayout({ ...diagram, items: candidate });

    expect(getBlockDropGuideY(previewLayout, ['m1', 'm2'], 0)).toBe(previewLayout.messageLayouts.get('m1')!.y);
  });
});
