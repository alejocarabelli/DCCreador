import { describe, expect, it } from 'vitest';
import type {
  SequenceDiagramContent,
  SequenceFragment,
  SequenceMessage,
  SequenceParticipant,
  SequenceTimelineItem,
} from '../types/diagram';
import { createEmptySequenceDiagramContent } from './sequenceDiagram';
import { buildSequenceLayout } from './sequenceDiagramLayout';
import {
  applyFragmentBoundaryChanges,
  calculateFragmentBoundaryChanges,
  unwrapSequenceFragment,
  validateFragmentBoundaryChanges,
  wrapSequenceItems,
  calculateFragmentMoveChanges,
  applyFragmentMoveChanges,
  validateFragmentMoveChanges,
} from './sequenceDiagramWrapping';

const createMsg = (id: string, name: string): SequenceMessage => ({
  id,
  kind: 'message',
  name,
  type: 'synchronous',
  sourceId: 'p1',
  targetId: 'p2',
  arguments: '',
  parameterValues: '',
  returnType: '',
  flowReference: '',
});

describe('sequenceDiagramWrapping', () => {
  it('does not absorb a horizontally external message during vertical fragment expansion', () => {
    const participants: SequenceParticipant[] = [
      { id: 'p1', kind: 'object', name: 'P1', classifierName: '', x: 120 },
      { id: 'p2', kind: 'object', name: 'P2', classifierName: '', x: 320 },
      { id: 'p3', kind: 'object', name: 'P3', classifierName: '', x: 620 },
      { id: 'p4', kind: 'object', name: 'P4', classifierName: '', x: 820 },
    ];
    const inside = createMsg('inside', 'inside');
    const external = { ...createMsg('external', 'external'), sourceId: 'p3', targetId: 'p4' };
    const fragment: SequenceFragment = {
      id: 'bounded', kind: 'fragment', operator: 'opt', name: 'P1-P2',
      startParticipantId: 'p1', endParticipantId: 'p2',
      operands: [{ id: 'operand', guard: '', items: [inside] }],
    };
    const content: SequenceDiagramContent = {
      ...createEmptySequenceDiagramContent(), participants, items: [fragment, external],
    };
    const layout = buildSequenceLayout(content);
    const box = layout.fragmentLayouts.get(fragment.id)!;
    const externalY = layout.messageLayouts.get(external.id)!.y;

    const changes = calculateFragmentBoundaryChanges(
      content.items, layout, fragment.id, box.y, externalY + 20 - box.y, 's',
    );

    expect(changes?.itemsToAbsorb.map((item) => item.id) ?? []).not.toContain(external.id);

    const moveChanges = calculateFragmentMoveChanges(
      content.items, layout, fragment.id, externalY - 15, 30,
    );
    expect(moveChanges?.itemsToAbsorb.map((item) => item.id) ?? []).not.toContain(external.id);
  });

  it('wraps a single message in a loop fragment at root', () => {
    const items: SequenceTimelineItem[] = [
      createMsg('m1', 'start()'),
      createMsg('m2', 'step()'),
      createMsg('m3', 'end()'),
    ];

    const result = wrapSequenceItems(items, ['m2'], 'loop', 'Retry Loop', 'hasRetries');
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual(items[0]);
    expect(result.items[2]).toEqual(items[2]);

    const fragment = result.items[1];
    expect(fragment.kind).toBe('fragment');
    if (fragment.kind !== 'fragment') return;

    expect(fragment.operator).toBe('loop');
    expect(fragment.name).toBe('Retry Loop');
    expect(fragment.operands).toHaveLength(1);
    expect(fragment.operands[0].guard).toBe('hasRetries');
    expect(fragment.operands[0].items).toEqual([items[1]]);
  });

  it('wraps multiple contiguous items in an alt fragment with default else branch', () => {
    const items: SequenceTimelineItem[] = [
      createMsg('m1', 'msg1'),
      createMsg('m2', 'msg2'),
      createMsg('m3', 'msg3'),
      createMsg('m4', 'msg4'),
    ];

    const result = wrapSequenceItems(items, ['m2', 'm3'], 'alt');
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe('m1');
    expect(result.items[2].id).toBe('m4');

    const fragment = result.items[1];
    expect(fragment.kind).toBe('fragment');
    if (fragment.kind !== 'fragment') return;

    expect(fragment.operator).toBe('alt');
    expect(fragment.operands).toHaveLength(2);
    expect(fragment.operands[0].items.map((i) => i.id)).toEqual(['m2', 'm3']);
    expect(fragment.operands[1].guard).toBe('else');
    expect(fragment.operands[1].items).toEqual([]);
  });

  it('wraps contiguous items nested within an operand', () => {
    const nestedMsg1 = createMsg('n1', 'nested1');
    const nestedMsg2 = createMsg('n2', 'nested2');
    const nestedMsg3 = createMsg('n3', 'nested3');

    const items: SequenceTimelineItem[] = [
      createMsg('m1', 'root1'),
      {
        id: 'frag1',
        kind: 'fragment',
        operator: 'opt',
        name: 'Optional block',
        operands: [
          {
            id: 'op1',
            guard: 'isValid',
            items: [nestedMsg1, nestedMsg2, nestedMsg3],
          },
        ],
      },
    ];

    const result = wrapSequenceItems(items, ['n1', 'n2'], 'loop');
    expect(result).not.toBeNull();
    if (!result) return;

    const rootFrag = result.items[1];
    expect(rootFrag.kind).toBe('fragment');
    if (rootFrag.kind !== 'fragment') return;

    const op1 = rootFrag.operands[0];
    expect(op1.items).toHaveLength(2);
    expect(op1.items[0].kind).toBe('fragment');
    expect(op1.items[1].id).toBe('n3');

    const innerFrag = op1.items[0];
    if (innerFrag.kind !== 'fragment') return;
    expect(innerFrag.operator).toBe('loop');
    expect(innerFrag.operands[0].items.map((i) => i.id)).toEqual(['n1', 'n2']);
  });

  it('rejects wrapping non-contiguous items', () => {
    const items: SequenceTimelineItem[] = [
      createMsg('m1', 'msg1'),
      createMsg('m2', 'msg2'),
      createMsg('m3', 'msg3'),
    ];

    const result = wrapSequenceItems(items, ['m1', 'm3'], 'loop');
    expect(result).toBeNull();
  });

  it('rejects wrapping items from different containers', () => {
    const items: SequenceTimelineItem[] = [
      createMsg('m1', 'msg1'),
      {
        id: 'frag1',
        kind: 'fragment',
        operator: 'opt',
        name: 'Opt',
        operands: [
          {
            id: 'op1',
            guard: 'cond',
            items: [createMsg('m2', 'msg2')],
          },
        ],
      },
    ];

    const result = wrapSequenceItems(items, ['m1', 'm2'], 'loop');
    expect(result).toBeNull();
  });

  it('rejects empty selections', () => {
    const items: SequenceTimelineItem[] = [createMsg('m1', 'msg1')];
    expect(wrapSequenceItems(items, [], 'opt')).toBeNull();
  });

  describe('Fragment boundary absorption and ejection', () => {
    const p1: SequenceParticipant = { id: 'p1', kind: 'actor', name: 'Actor', classifierName: '', x: 100 };
    const p2: SequenceParticipant = { id: 'p2', kind: 'object', name: 'Service', classifierName: 'Service', x: 300 };

    it('absorbs preceding sibling into fragment when dragging top handle up', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{ id: 'op1', guard: 'guard', items: [createMsg('inside', 'inside()')] }],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first()'),
        createMsg('m2', 'second()'),
        frag,
        createMsg('m3', 'third()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const m2Y = layout.messageLayouts.get('m2')!.y;

      // Drag top handle up past m2
      const changes = calculateFragmentBoundaryChanges(items, layout, 'frag1', m2Y - 10, 150, 'n');
      expect(changes).not.toBeNull();
      expect(changes?.edge).toBe('top');
      expect(changes?.itemsToAbsorb.map((i) => i.id)).toEqual(['m2']);
      expect(changes?.itemsToEject).toHaveLength(0);

      const applied = applyFragmentBoundaryChanges(items, changes!);
      expect(applied).toHaveLength(3);
      expect(applied[0].id).toBe('m1');
      expect(applied[1].id).toBe('frag1');
      expect(applied[2].id).toBe('m3');

      const updatedFrag = applied[1] as SequenceFragment;
      expect(updatedFrag.operands[0].items.map((i) => i.id)).toEqual(['m2', 'inside']);
    });

    it('absorbs following sibling into fragment when dragging bottom handle down', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{ id: 'op1', guard: 'guard', items: [createMsg('inside', 'inside()')] }],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first()'),
        frag,
        createMsg('m2', 'second()'),
        createMsg('m3', 'third()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const fragLayout = layout.fragmentLayouts.get('frag1')!;
      const m2Y = layout.messageLayouts.get('m2')!.y;

      // Drag bottom handle down past m2
      const targetHeight = (m2Y + 20) - fragLayout.y;
      const changes = calculateFragmentBoundaryChanges(items, layout, 'frag1', fragLayout.y, targetHeight, 's');
      expect(changes).not.toBeNull();
      expect(changes?.edge).toBe('bottom');
      expect(changes?.itemsToAbsorb.map((i) => i.id)).toEqual(['m2']);

      const applied = applyFragmentBoundaryChanges(items, changes!);
      expect(applied).toHaveLength(3);
      expect(applied[0].id).toBe('m1');
      expect(applied[1].id).toBe('frag1');
      expect(applied[2].id).toBe('m3');

      const updatedFrag = applied[1] as SequenceFragment;
      expect(updatedFrag.operands[0].items.map((i) => i.id)).toEqual(['inside', 'm2']);
    });

    it('ejects message from fragment when shrinking top handle down', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{
          id: 'op1',
          guard: 'guard',
          items: [createMsg('inside1', 'in1()'), createMsg('inside2', 'in2()')],
        }],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first()'),
        frag,
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const in1Y = layout.messageLayouts.get('inside1')!.y;

      // Drag top handle down past inside1
      const changes = calculateFragmentBoundaryChanges(items, layout, 'frag1', in1Y + 10, 100, 'n');
      expect(changes).not.toBeNull();
      expect(changes?.edge).toBe('top');
      expect(changes?.itemsToEject.map((i) => i.id)).toEqual(['inside1']);
      expect(changes?.itemsToAbsorb).toHaveLength(0);

      const applied = applyFragmentBoundaryChanges(items, changes!);
      expect(applied).toHaveLength(3);
      expect(applied[0].id).toBe('m1');
      expect(applied[1].id).toBe('inside1');
      expect(applied[2].id).toBe('frag1');

      const updatedFrag = applied[2] as SequenceFragment;
      expect(updatedFrag.operands[0].items.map((i) => i.id)).toEqual(['inside2']);
    });

    it('ejects message from fragment when shrinking bottom handle up', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{
          id: 'op1',
          guard: 'guard',
          items: [createMsg('inside1', 'in1()'), createMsg('inside2', 'in2()')],
        }],
      };
      const items: SequenceTimelineItem[] = [
        frag,
        createMsg('m3', 'last()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const fragLayout = layout.fragmentLayouts.get('frag1')!;
      const in2Y = layout.messageLayouts.get('inside2')!.y;

      // Drag bottom handle up above inside2
      const targetHeight = (in2Y - 10) - fragLayout.y;
      const changes = calculateFragmentBoundaryChanges(items, layout, 'frag1', fragLayout.y, targetHeight, 's');
      expect(changes).not.toBeNull();
      expect(changes?.edge).toBe('bottom');
      expect(changes?.itemsToEject.map((i) => i.id)).toEqual(['inside2']);

      const applied = applyFragmentBoundaryChanges(items, changes!);
      expect(applied).toHaveLength(3);
      expect(applied[0].id).toBe('frag1');
      expect(applied[1].id).toBe('inside2');
      expect(applied[2].id).toBe('m3');

      const updatedFrag = applied[0] as SequenceFragment;
      expect(updatedFrag.operands[0].items.map((i) => i.id)).toEqual(['inside1']);
    });

    it('validates boundary changes against semantic rules', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{ id: 'op1', guard: 'guard', items: [createMsg('inside', 'inside()')] }],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first()'),
        frag,
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const m1Y = layout.messageLayouts.get('m1')!.y;

      const changes = calculateFragmentBoundaryChanges(items, layout, 'frag1', m1Y - 10, 150, 'n');
      expect(changes).not.toBeNull();

      const validation = validateFragmentBoundaryChanges(diagram, changes!);
      expect(validation.valid).toBe(true);
      expect(validation.newItems).toBeDefined();
    });

    it('aplica histeresis direccional para evitar parpadeos/jitter cerca del umbral de absorcion/eyeccion', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{ id: 'op1', guard: 'guard', items: [createMsg('inside', 'inside()')] }],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first()'),
        frag,
        createMsg('m2', 'after()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const m2Y = layout.messageLayouts.get('m2')!.y;

      // Si el borde inferior sobrepasa m2Y pero por menos de HYSTERESIS (8px), no debe absorber todavía
      const changesWithinDeadband = calculateFragmentBoundaryChanges(items, layout, 'frag1', layout.fragmentLayouts.get('frag1')!.y, m2Y + 4 - layout.fragmentLayouts.get('frag1')!.y, 's');
      expect(changesWithinDeadband).toBeNull();

      // Si supera m2Y + 8px, absorbe
      const changesPastDeadband = calculateFragmentBoundaryChanges(items, layout, 'frag1', layout.fragmentLayouts.get('frag1')!.y, m2Y + 12 - layout.fragmentLayouts.get('frag1')!.y, 's');
      expect(changesPastDeadband).not.toBeNull();
      expect(changesPastDeadband?.itemsToAbsorb.map((i) => i.id)).toEqual(['m2']);
    });

    it('absorbs multiple consecutive siblings when dragging bottom handle past all of them', () => {
      const frag: SequenceFragment = {
        id: 'frag-multi',
        kind: 'fragment',
        operator: 'opt',
        name: 'Opcional',
        operands: [{ id: 'op1', guard: 'cond', items: [createMsg('initial', 'initial()')] }],
      };
      const items: SequenceTimelineItem[] = [
        frag,
        createMsg('m1', 'first()'),
        createMsg('m2', 'second()'),
        createMsg('m3', 'third()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const m3Y = layout.messageLayouts.get('m3')!.y;

      const changes = calculateFragmentBoundaryChanges(
        items,
        layout,
        'frag-multi',
        layout.fragmentLayouts.get('frag-multi')!.y,
        m3Y + 20 - layout.fragmentLayouts.get('frag-multi')!.y,
        's',
      );

      expect(changes).not.toBeNull();
      expect(changes?.itemsToAbsorb.map((i) => i.id)).toEqual(['m1', 'm2', 'm3']);

      const applied = applyFragmentBoundaryChanges(items, changes!);
      expect(applied).toHaveLength(1);
      const resultFrag = applied[0] as SequenceFragment;
      expect(resultFrag.operands[0].items.map((i) => i.id)).toEqual(['initial', 'm1', 'm2', 'm3']);
    });

    it('ejects multiple messages when shrinking bottom handle up past them', () => {
      const frag: SequenceFragment = {
        id: 'frag-shrink',
        kind: 'fragment',
        operator: 'loop',
        name: 'Bucle',
        operands: [{
          id: 'op1',
          guard: 'cond',
          items: [createMsg('m1', 'm1()'), createMsg('m2', 'm2()'), createMsg('m3', 'm3()')],
        }],
      };
      const items: SequenceTimelineItem[] = [frag, createMsg('after', 'after()')];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const m1Y = layout.messageLayouts.get('m1')!.y;

      // Shrink bottom up to m1Y + 4 (past m3 and m2, but keeping m1)
      const targetHeight = m1Y + 4 - layout.fragmentLayouts.get('frag-shrink')!.y;
      const changes = calculateFragmentBoundaryChanges(
        items,
        layout,
        'frag-shrink',
        layout.fragmentLayouts.get('frag-shrink')!.y,
        targetHeight,
        's',
      );

      expect(changes).not.toBeNull();
      expect(changes?.itemsToEject.map((i) => i.id)).toEqual(['m2', 'm3']);

      const applied = applyFragmentBoundaryChanges(items, changes!);
      expect(applied.map((i) => i.id)).toEqual(['frag-shrink', 'm2', 'm3', 'after']);
      const resultFrag = applied[0] as SequenceFragment;
      expect(resultFrag.operands[0].items.map((i) => i.id)).toEqual(['m1']);
    });

    it('absorbs following sibling within the same parent operand for a nested fragment', () => {
      const nestedFrag: SequenceFragment = {
        id: 'nested-opt',
        kind: 'fragment',
        operator: 'opt',
        name: 'Inner',
        operands: [{ id: 'inner-op1', guard: 'guard', items: [createMsg('nested-msg', 'nested()')] }],
      };
      const outerFrag: SequenceFragment = {
        id: 'outer-loop',
        kind: 'fragment',
        operator: 'loop',
        name: 'Outer',
        operands: [{
          id: 'outer-op1',
          guard: 'loop-guard',
          items: [nestedFrag, createMsg('sibling-msg', 'sibling()')],
        }],
      };
      const items: SequenceTimelineItem[] = [outerFrag, createMsg('root-after', 'afterAll()')];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const sibY = layout.messageLayouts.get('sibling-msg')!.y;
      const nestedBox = layout.fragmentLayouts.get('nested-opt')!;

      // Drag nested fragment bottom handle past sibling-msg
      const changes = calculateFragmentBoundaryChanges(
        items,
        layout,
        'nested-opt',
        nestedBox.y,
        (sibY + 16) - nestedBox.y,
        's',
      );

      expect(changes).not.toBeNull();
      expect(changes?.itemsToAbsorb.map((i) => i.id)).toEqual(['sibling-msg']);

      const applied = applyFragmentBoundaryChanges(items, changes!);
      const resOuter = applied[0] as SequenceFragment;
      const resInner = resOuter.operands[0].items[0] as SequenceFragment;
      expect(resOuter.operands[0].items).toHaveLength(1);
      expect(resInner.operands[0].items.map((i) => i.id)).toEqual(['nested-msg', 'sibling-msg']);
    });
  });

  describe('unwrapSequenceFragment', () => {
    it('desempaqueta un fragmento en la raiz preservando el orden de los mensajes', () => {
      const m1 = createMsg('m1', 'first()');
      const m2 = createMsg('m2', 'inside1()');
      const m3 = createMsg('m3', 'inside2()');
      const m4 = createMsg('m4', 'last()');

      const frag: SequenceFragment = {
        id: 'frag-loop',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{ id: 'op1', guard: 'cond', items: [m2, m3] }],
      };

      const items: SequenceTimelineItem[] = [m1, frag, m4];
      const result = unwrapSequenceFragment(items, 'frag-loop');
      expect(result).not.toBeNull();
      expect(result?.unwrappedItems.map((i) => i.id)).toEqual(['m2', 'm3']);
      expect(result?.items.map((i) => i.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    });

    it('desempaqueta un fragmento multi-rama (alt) volcando los mensajes de todas las ramas en orden', () => {
      const m1 = createMsg('m1', 'primero()');
      const mBranch1 = createMsg('mb1', 'rama1()');
      const mBranch2 = createMsg('mb2', 'rama2()');
      const mEnd = createMsg('mEnd', 'fin()');

      const fragAlt: SequenceFragment = {
        id: 'frag-alt',
        kind: 'fragment',
        operator: 'alt',
        name: 'Condicional',
        operands: [
          { id: 'op-if', guard: 'cond', items: [mBranch1] },
          { id: 'op-else', guard: 'else', items: [mBranch2] },
        ],
      };

      const items: SequenceTimelineItem[] = [m1, fragAlt, mEnd];
      const result = unwrapSequenceFragment(items, 'frag-alt');
      expect(result).not.toBeNull();
      expect(result?.unwrappedItems.map((i) => i.id)).toEqual(['mb1', 'mb2']);
      expect(result?.items.map((i) => i.id)).toEqual(['m1', 'mb1', 'mb2', 'mEnd']);
    });

    it('desempaqueta un fragmento anidado (ej. opt dentro de loop) volcando su contenido en el operando del padre', () => {
      const mInsideOpt = createMsg('mOpt', 'opcional()');
      const mLoopAfter = createMsg('mLoopAfter', 'despues()');

      const optFrag: SequenceFragment = {
        id: 'inner-opt',
        kind: 'fragment',
        operator: 'opt',
        name: 'Opcional',
        operands: [{ id: 'op-opt', guard: 'talVez', items: [mInsideOpt] }],
      };

      const loopFrag: SequenceFragment = {
        id: 'outer-loop',
        kind: 'fragment',
        operator: 'loop',
        name: 'Bucle',
        operands: [{ id: 'op-loop', guard: 'cond', items: [optFrag, mLoopAfter] }],
      };

      const items: SequenceTimelineItem[] = [loopFrag];
      const result = unwrapSequenceFragment(items, 'inner-opt');
      expect(result).not.toBeNull();
      expect(result?.unwrappedItems.map((i) => i.id)).toEqual(['mOpt']);

      const updatedOuterLoop = result?.items[0] as SequenceFragment;
      expect(updatedOuterLoop.kind).toBe('fragment');
      expect(updatedOuterLoop.operands[0].items.map((i) => i.id)).toEqual(['mOpt', 'mLoopAfter']);
    });
  });

  describe('calculateFragmentMoveChanges (Sliding Window / Scanner dragging)', () => {
    const p1: SequenceParticipant = { id: 'p1', kind: 'actor', name: 'User', classifierName: '', x: 100 };
    const p2: SequenceParticipant = { id: 'p2', kind: 'object', name: 'Service', classifierName: 'Service', x: 300 };

    it('absorbe un mensaje hermano posterior al deslizar el fragmento hacia abajo', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{ id: 'op1', guard: 'guard', items: [createMsg('inside', 'inside()')] }],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first()'),
        frag,
        createMsg('m2', 'second()'),
        createMsg('m3', 'third()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const fragBox = layout.fragmentLayouts.get('frag1')!;
      const m2Y = layout.messageLayouts.get('m2')!.y;

      // Deslizar ventana hacia abajo de modo que el borde inferior sobrepase m2 por más de 8px
      const targetY = m2Y + 12 - fragBox.height;
      const changes = calculateFragmentMoveChanges(items, layout, 'frag1', targetY, fragBox.height);
      expect(changes).not.toBeNull();
      expect(changes?.itemsToAbsorb.map((i) => i.id)).toEqual(['m2']);
      expect(changes?.itemsToEject).toHaveLength(0);

      const applied = applyFragmentMoveChanges(items, changes!);
      expect(applied).toHaveLength(3);
      expect(applied[0].id).toBe('m1');
      expect(applied[1].id).toBe('frag1');
      expect(applied[2].id).toBe('m3');

      const updatedFrag = applied[1] as SequenceFragment;
      expect(updatedFrag.operands[0].items.map((i) => i.id)).toEqual(['inside', 'm2']);
    });

    it('absorbe un mensaje hermano anterior al deslizar el fragmento hacia arriba', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'opt',
        name: 'Opt',
        operands: [{ id: 'op1', guard: 'guard', items: [createMsg('inside', 'inside()')] }],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first()'),
        createMsg('m2', 'second()'),
        frag,
        createMsg('m3', 'third()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const fragBox = layout.fragmentLayouts.get('frag1')!;
      const m2Y = layout.messageLayouts.get('m2')!.y;

      // Deslizar ventana hacia arriba de modo que el borde superior suba más allá de m2 por más de 8px
      const targetY = m2Y - 12;
      const changes = calculateFragmentMoveChanges(items, layout, 'frag1', targetY, fragBox.height);
      expect(changes).not.toBeNull();
      expect(changes?.itemsToAbsorb.map((i) => i.id)).toEqual(['m2']);
      expect(changes?.itemsToEject).toHaveLength(0);

      const applied = applyFragmentMoveChanges(items, changes!);
      expect(applied).toHaveLength(3);
      expect(applied[0].id).toBe('m1');
      expect(applied[1].id).toBe('frag1');
      expect(applied[2].id).toBe('m3');

      const updatedFrag = applied[1] as SequenceFragment;
      expect(updatedFrag.operands[0].items.map((i) => i.id)).toEqual(['m2', 'inside']);
    });

    it('expulsa un mensaje hacia arriba al deslizar el fragmento hacia abajo (el mensaje queda atrás)', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{
          id: 'op1',
          guard: 'guard',
          items: [createMsg('in1', 'in1()'), createMsg('in2', 'in2()')],
        }],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first()'),
        frag,
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const in1Y = layout.messageLayouts.get('in1')!.y;

      // Deslizar el fragmento hacia abajo de modo que targetY supere in1Y por más de 8px
      const targetY = in1Y + 12;
      const changes = calculateFragmentMoveChanges(items, layout, 'frag1', targetY, 60);
      expect(changes).not.toBeNull();
      expect(changes?.itemsToEject.map((i) => i.id)).toEqual(['in1']);
      expect(changes?.itemsBefore.map((i) => i.id)).toEqual(['m1', 'in1']);

      const applied = applyFragmentMoveChanges(items, changes!);
      expect(applied.map((i) => i.id)).toEqual(['m1', 'in1', 'frag1']);
      const updatedFrag = applied[2] as SequenceFragment;
      expect(updatedFrag.operands[0].items.map((i) => i.id)).toEqual(['in2']);
    });

    it('expulsa un mensaje hacia abajo al deslizar el fragmento hacia arriba (el mensaje queda abajo)', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{
          id: 'op1',
          guard: 'guard',
          items: [createMsg('in1', 'in1()'), createMsg('in2', 'in2()')],
        }],
      };
      const items: SequenceTimelineItem[] = [
        frag,
        createMsg('m3', 'third()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const fragBox = layout.fragmentLayouts.get('frag1')!;
      const in2Y = layout.messageLayouts.get('in2')!.y;

      // Deslizar hacia arriba de modo que el borde inferior quede por encima de in2 por más de 8px
      const targetY = in2Y - 12 - fragBox.height;
      const changes = calculateFragmentMoveChanges(items, layout, 'frag1', targetY, fragBox.height);
      expect(changes).not.toBeNull();
      expect(changes?.itemsToEject.map((i) => i.id)).toEqual(['in2']);
      expect(changes?.itemsAfter.map((i) => i.id)).toEqual(['in2', 'm3']);

      const applied = applyFragmentMoveChanges(items, changes!);
      expect(applied.map((i) => i.id)).toEqual(['frag1', 'in2', 'm3']);
      const updatedFrag = applied[0] as SequenceFragment;
      expect(updatedFrag.operands[0].items.map((i) => i.id)).toEqual(['in1']);
    });

    it('absorbe y expulsa simultaneamente al deslizar la ventana sobre el flujo de mensajes', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{
          id: 'op1',
          guard: 'guard',
          items: [createMsg('in1', 'in1()')],
        }],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first()'),
        frag,
        createMsg('m2', 'second()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const in1Y = layout.messageLayouts.get('in1')!.y;
      const m2Y = layout.messageLayouts.get('m2')!.y;

      // Deslizar de tal forma que in1 queda por encima de targetY (expulsado)
      // y m2 queda por debajo de targetBottom (absorbido)
      const targetY = in1Y + 12;
      const targetH = m2Y + 12 - targetY;
      const changes = calculateFragmentMoveChanges(items, layout, 'frag1', targetY, targetH);
      expect(changes).not.toBeNull();
      expect(changes?.itemsToEject.map((i) => i.id)).toEqual(['in1']);
      expect(changes?.itemsToAbsorb.map((i) => i.id)).toEqual(['m2']);

      const applied = applyFragmentMoveChanges(items, changes!);
      expect(applied.map((i) => i.id)).toEqual(['m1', 'in1', 'frag1']);
      const updatedFrag = applied[2] as SequenceFragment;
      expect(updatedFrag.operands[0].items.map((i) => i.id)).toEqual(['m2']);
    });

    it('asigna mensajes a los compartimentos correctos en fragmentos multi-operando (alt)', () => {
      const fragAlt: SequenceFragment = {
        id: 'frag-alt',
        kind: 'fragment',
        operator: 'alt',
        name: 'Condicional',
        operands: [
          { id: 'op-if', guard: 'cond', items: [] },
          { id: 'op-else', guard: 'else', items: [] },
        ],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first()'),
        fragAlt,
        createMsg('m2', 'second()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const fragBox = layout.fragmentLayouts.get('frag-alt')!;
      const m1Y = layout.messageLayouts.get('m1')!.y;
      const m2Y = layout.messageLayouts.get('m2')!.y;

      // Deslizar ventana hacia abajo para absorber m2 en el compartimento inferior (else)
      const targetYDown = m2Y + 12 - fragBox.height;
      const changesDown = calculateFragmentMoveChanges(items, layout, 'frag-alt', targetYDown, fragBox.height);
      expect(changesDown).not.toBeNull();
      expect(changesDown?.itemsToAbsorb.map((i) => i.id)).toEqual(['m2']);

      const appliedDown = applyFragmentMoveChanges(items, changesDown!);
      const resFragDown = appliedDown.find((i) => i.id === 'frag-alt') as SequenceFragment;
      expect(resFragDown.operands[0].items).toHaveLength(0);
      expect(resFragDown.operands[1].items.map((i) => i.id)).toEqual(['m2']);

      // Deslizar ventana hacia arriba para absorber m1 en el compartimento superior (if)
      const targetYUp = m1Y - 12;
      const changesUp = calculateFragmentMoveChanges(items, layout, 'frag-alt', targetYUp, fragBox.height);
      expect(changesUp).not.toBeNull();
      expect(changesUp?.itemsToAbsorb.map((i) => i.id)).toEqual(['m1']);

      const appliedUp = applyFragmentMoveChanges(items, changesUp!);
      const resFragUp = appliedUp.find((i) => i.id === 'frag-alt') as SequenceFragment;
      expect(resFragUp.operands[0].items.map((i) => i.id)).toEqual(['m1']);
      expect(resFragUp.operands[1].items).toHaveLength(0);
    });

    it('aplica histeresis de 8px para evitar parpadeos/jitter al deslizar cerca de los umbrales', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{ id: 'op1', guard: 'guard', items: [createMsg('inside', 'inside()')] }],
      };
      const items: SequenceTimelineItem[] = [
        frag,
        createMsg('m2', 'after()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const fragBox = layout.fragmentLayouts.get('frag1')!;
      const m2Y = layout.messageLayouts.get('m2')!.y;

      // targetBottom sobrepasa m2Y por 4px (< 8px HYSTERESIS) -> no absorbe
      const withinDeadband = calculateFragmentMoveChanges(items, layout, 'frag1', m2Y + 4 - fragBox.height, fragBox.height);
      expect(withinDeadband?.itemsToAbsorb).toHaveLength(0);

      // targetBottom sobrepasa m2Y por 12px (> 8px HYSTERESIS) -> absorbe
      const pastDeadband = calculateFragmentMoveChanges(items, layout, 'frag1', m2Y + 12 - fragBox.height, fragBox.height);
      expect(pastDeadband?.itemsToAbsorb.map((i) => i.id)).toEqual(['m2']);
    });

    it('valida cambios semanticos y rechaza cambios invalidos de ciclo de vida', () => {
      const createMsgItem: SequenceMessage = {
        id: 'c1',
        kind: 'message',
        name: 'create()',
        type: 'create',
        sourceId: 'p1',
        targetId: 'p2',
        arguments: '',
        parameterValues: '',
        returnType: '',
        flowReference: '',
      };
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'opt',
        name: 'Opt',
        operands: [{ id: 'op1', guard: 'cond', items: [] }],
      };
      const workMsg: SequenceMessage = {
        id: 'w1',
        kind: 'message',
        name: 'work()',
        type: 'synchronous',
        sourceId: 'p1',
        targetId: 'p2',
        arguments: '',
        parameterValues: '',
        returnType: '',
        flowReference: '',
      };
      const items: SequenceTimelineItem[] = [createMsgItem, frag, workMsg];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const c1Y = layout.messageLayouts.get('c1')!.y;
      const fragBox = layout.fragmentLayouts.get('frag1')!;

      // Deslizar el fragmento 'opt' hacia arriba para absorber c1 (el create de p2)
      // dejando workMsg afuera (después del opt)
      const targetY = c1Y - 12;
      const changes = calculateFragmentMoveChanges(items, layout, 'frag1', targetY, fragBox.height);
      expect(changes).not.toBeNull();
      expect(changes?.itemsToAbsorb.map((i) => i.id)).toEqual(['c1']);

      const validation = validateFragmentMoveChanges(diagram, changes!);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('caminos');
    });

    it('mantiene la histeresis bidireccional continua (16px deadband) usando prevChanges para evitar jitter', () => {
      const frag: SequenceFragment = {
        id: 'frag1',
        kind: 'fragment',
        operator: 'loop',
        name: 'Loop',
        operands: [{ id: 'op1', guard: 'guard', items: [createMsg('inside', 'inside()')] }],
      };
      const items: SequenceTimelineItem[] = [
        frag,
        createMsg('m2', 'after()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const fragBox = layout.fragmentLayouts.get('frag1')!;
      const m2Y = layout.messageLayouts.get('m2')!.y;

      // Paso 1: deslizar hacia abajo 12px más allá de m2Y (> 8px) -> absorbe m2
      const step1 = calculateFragmentMoveChanges(items, layout, 'frag1', m2Y + 12 - fragBox.height, fragBox.height);
      expect(step1?.itemsToAbsorb.map((i) => i.id)).toEqual(['m2']);

      // Paso 2: retroceder el mouse hacia arriba ligeramente (targetBottom a m2Y + 2px)
      // Como m2 ya fue absorbido en step1, la histeresis exige retroceder hasta m2Y - 8px para expulsarlo
      const step2 = calculateFragmentMoveChanges(items, layout, 'frag1', m2Y + 2 - fragBox.height, fragBox.height, step1);
      // Debe seguir absorbido sin parpadear
      expect(step2?.itemsToAbsorb.map((i) => i.id)).toEqual(['m2']);

      // Paso 3: retroceder aún más pero sin cruzar m2Y - 8px (por ejemplo a m2Y - 4px)
      const step3 = calculateFragmentMoveChanges(items, layout, 'frag1', m2Y - 4 - fragBox.height, fragBox.height, step2);
      expect(step3?.itemsToAbsorb.map((i) => i.id)).toEqual(['m2']);

      // Paso 4: retroceder completamente más allá de m2Y - 8px (a m2Y - 12px) -> ahora sí se expulsa
      const step4 = calculateFragmentMoveChanges(items, layout, 'frag1', m2Y - 12 - fragBox.height, fragBox.height, step3);
      expect(step4?.itemsToAbsorb).toHaveLength(0);
      expect(step4?.itemsAfter.map((i) => i.id)).toEqual(['m2']);
    });

    it('particiona adecuadamente mensajes en fragmentos con 3 operandos (if, else if, else)', () => {
      const frag3: SequenceFragment = {
        id: 'frag-3op',
        kind: 'fragment',
        operator: 'alt',
        name: 'Tres caminos',
        operands: [
          { id: 'op1', guard: 'x > 0', items: [] },
          { id: 'op2', guard: 'x == 0', items: [] },
          { id: 'op3', guard: 'else', items: [] },
        ],
      };
      const items: SequenceTimelineItem[] = [
        frag3,
        createMsg('m1', 'msg1()'),
        createMsg('m2', 'msg2()'),
        createMsg('m3', 'msg3()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const m1Y = layout.messageLayouts.get('m1')!.y;
      const m3Y = layout.messageLayouts.get('m3')!.y;

      // Deslizar ventana de altura para cubrir m1 en op1, m2 en op2 y m3 en op3
      const targetHeight = (m3Y - m1Y) + 60;
      const targetY = m1Y - 15;
      const changes = calculateFragmentMoveChanges(items, layout, 'frag-3op', targetY, targetHeight);
      expect(changes).not.toBeNull();
      expect(changes?.itemsToAbsorb).toHaveLength(3);

      const applied = applyFragmentMoveChanges(items, changes!);
      const resFrag = applied.find((i) => i.id === 'frag-3op') as SequenceFragment;
      expect(resFrag.operands[0].items.map((i) => i.id)).toContain('m1');
      expect(resFrag.operands[1].items.map((i) => i.id)).toContain('m2');
      expect(resFrag.operands[2].items.map((i) => i.id)).toContain('m3');
    });

    it('absorbe un fragmento anidado completo cuando se desliza sobre el', () => {
      const innerFrag: SequenceFragment = {
        id: 'inner-loop',
        kind: 'fragment',
        operator: 'loop',
        name: 'Bucle interno',
        operands: [{ id: 'inner-op', guard: 'condition', items: [createMsg('nested', 'nested()')] }],
      };
      const outerFrag: SequenceFragment = {
        id: 'outer-opt',
        kind: 'fragment',
        operator: 'opt',
        name: 'Opt externo',
        operands: [{ id: 'outer-op', guard: 'opt', items: [] }],
      };
      const items: SequenceTimelineItem[] = [
        createMsg('m1', 'first()'),
        innerFrag,
        outerFrag,
        createMsg('m2', 'last()'),
      ];
      const diagram: SequenceDiagramContent = {
        ...createEmptySequenceDiagramContent(),
        participants: [p1, p2],
        items,
      };
      const layout = buildSequenceLayout(diagram);
      const innerBox = layout.fragmentLayouts.get('inner-loop')!;
      const outerBox = layout.fragmentLayouts.get('outer-opt')!;

      // Deslizar outerFrag hacia arriba para envolver innerFrag completamente
      const targetY = innerBox.y - 12;
      const targetHeight = outerBox.height + innerBox.height + 20;
      const changes = calculateFragmentMoveChanges(items, layout, 'outer-opt', targetY, targetHeight);
      expect(changes).not.toBeNull();
      expect(changes?.itemsToAbsorb.map((i) => i.id)).toEqual(['inner-loop']);

      const applied = applyFragmentMoveChanges(items, changes!);
      const updatedOuter = applied.find((i) => i.id === 'outer-opt') as SequenceFragment;
      expect(updatedOuter.operands[0].items.map((i) => i.id)).toEqual(['inner-loop']);
      const containedInner = updatedOuter.operands[0].items[0] as SequenceFragment;
      expect(containedInner.operands[0].items.map((i) => i.id)).toEqual(['nested']);
    });
  });
});
