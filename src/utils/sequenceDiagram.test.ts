import { describe, expect, it } from 'vitest';
import type { SequenceDiagramContent, SequenceFragment, SequenceMessage, SequenceParticipant } from '../types/diagram';
import {
  adjustOperandsForOperator,
  buildSequenceMessageNumbers,
  buildDerivedActivations,
  clampParticipantX,
  cloneSequenceTimelineItems,
  createEmptySequenceDiagramContent,
  duplicateSequenceItem,
  flattenSequenceItems,
  formatSequenceMessageLabel,
  formatSequenceParticipantName,
  getTopLevelBlockIds,
  insertSequenceItemAtY,
  moveSequenceItemsBlock,
  normalizeSequenceDiagramContent,
  removeSequenceItemsBlock,
  resolveSequenceInsertionTarget,
} from './sequenceDiagram';
import { buildSequenceLayout } from './sequenceDiagramLayout';
import { getSequenceMessageEndpoints } from './sequenceDiagramLayout';

const participant = (id: string, x: number): SequenceParticipant => ({
  id,
  kind: 'object',
  name: '',
  classifierName: id,
  x,
});

const message = (id: string, sourceId: string, targetId: string, type: SequenceMessage['type'] = 'synchronous'): SequenceMessage => ({
  id,
  kind: 'message',
  type,
  sourceId,
  targetId,
  name: type === 'return' ? 'texto que debe descartarse' : `operacion${id}`,
  arguments: '',
  parameterValues: '',
  returnType: '',
  flowReference: '',
});

describe('sequence diagram model', () => {
  it('normalizes incomplete content and hides return payloads', () => {
    const normalized = normalizeSequenceDiagramContent({
      participants: [participant('a', 100), participant('b', 330)],
      items: [message('call', 'a', 'b'), { ...message('return', 'b', 'a', 'return'), arguments: 'dato', returnType: 'Caso' }],
    });
    const returned = normalized.items[1] as SequenceMessage;

    expect(normalized.version).toBe(1);
    expect(returned.name).toBe('');
    expect(returned.arguments).toBe('');
    expect(returned.returnType).toBe('');
    expect(buildSequenceMessageNumbers(normalized).has(returned.id)).toBe(false);
  });

  it('preserves nested fragments and lays messages out without overlap', () => {
    const leaf = message('nested-message', 'a', 'b');
    let nested: SequenceFragment = {
      id: 'fragment-5', kind: 'fragment', operator: 'loop', name: '',
      operands: [{ id: 'operand-5', guard: 'i < 5', items: [leaf] }],
    };
    for (let depth = 4; depth >= 0; depth -= 1) {
      nested = {
        id: `fragment-${depth}`,
        kind: 'fragment',
        operator: depth % 2 === 0 ? 'alt' : 'loop',
        name: '',
        operands: [{ id: `operand-${depth}`, guard: `nivel ${depth}`, items: [nested] }],
      };
    }
    const content: SequenceDiagramContent = {
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 350)],
      items: [nested],
    };
    const normalized = normalizeSequenceDiagramContent(content);
    const layout = buildSequenceLayout(normalized);

    expect(flattenSequenceItems(normalized.items)).toHaveLength(7);
    expect(layout.fragmentLayouts.size).toBe(6);
    expect(layout.messageLayouts.get('nested-message')?.y).toBeGreaterThan(300);
    expect(layout.height).toBeGreaterThanOrEqual(900);
  });

  it('handles the target volume of 30 participants and 500 messages', () => {
    const participants = Array.from({ length: 30 }, (_, index) => participant(`p${index}`, 120 + index * 230));
    const items = Array.from({ length: 500 }, (_, index) => message(
      `m${index}`,
      participants[index % participants.length].id,
      participants[(index + 1) % participants.length].id,
      index % 7 === 0 ? 'return' : 'synchronous',
    ));
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants,
      items,
    });
    const layout = buildSequenceLayout(content);
    const messageYs = Array.from(layout.messageLayouts.values()).map((entry) => entry.y);

    expect(layout.participantX.size).toBe(30);
    expect(layout.messageLayouts.size).toBe(500);
    expect(layout.width).toBeGreaterThan(6700);
    expect(layout.height).toBeGreaterThan(25_000);
    expect(messageYs.every((value, index) => index === 0 || value > messageYs[index - 1])).toBe(true);
  });

  it('resolves a click before and after root timeline items', () => {
    const first = message('first', 'a', 'b');
    const second = message('second', 'b', 'a');
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 350)],
      items: [first, second],
    });
    const layout = buildSequenceLayout(content);

    expect(resolveSequenceInsertionTarget(content.items, layout, layout.messageLayouts.get('first')!.y - 20))
      .toMatchObject({ placement: 'before', relativeToId: 'first' });
    const firstLayout = layout.messageLayouts.get('first')!;
    expect(resolveSequenceInsertionTarget(content.items, layout, firstLayout.y + firstLayout.height / 2 + 1))
      .toMatchObject({ placement: 'after', relativeToId: 'first' });
  });

  it('resolves an empty fragment operand as the append destination', () => {
    const fragment: SequenceFragment = {
      id: 'fragment', kind: 'fragment', operator: 'alt', name: '',
      operands: [
        { id: 'when', guard: 'condición', items: [message('inside', 'a', 'b')] },
        { id: 'else', guard: 'else', items: [] },
      ],
    };
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 350)],
      items: [fragment],
    });
    const layout = buildSequenceLayout(content);
    const emptyOperand = layout.fragmentLayouts.get('fragment')!.operands[1];

    expect(resolveSequenceInsertionTarget(content.items, layout, (emptyOperand.top + emptyOperand.bottom) / 2))
      .toMatchObject({ placement: 'end', parentFragmentId: 'fragment', operandId: 'else' });
  });

  it('does not treat a Y-only hit as an opt insertion when message endpoints are outside its horizontal frame', () => {
    const fragment: SequenceFragment = {
      id: 'opt-ab', kind: 'fragment', operator: 'opt', name: '',
      operands: [{ id: 'opt-body', guard: 'condición', items: [message('inside-ab', 'a', 'b')] }],
    };
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [
        participant('a', 120), participant('b', 350), participant('c', 580),
        participant('d', 810), participant('e', 1040),
      ],
      items: [fragment, message('after', 'd', 'e')],
    });
    const layout = buildSequenceLayout(content);
    const optBody = layout.fragmentLayouts.get('opt-ab')!.operands[0];
    const target = resolveSequenceInsertionTarget(
      content.items,
      layout,
      (optBody.top + optBody.bottom) / 2,
      { sourceId: 'd', targetId: 'e' },
    );

    expect(target.parentFragmentId).toBeUndefined();
    expect(target.operandId).toBeUndefined();

    const inserted = insertSequenceItemAtY(content.items, message('new-de', 'd', 'e'), layout, (optBody.top + optBody.bottom) / 2);
    const insertedFragment = inserted.find((item) => item.id === 'opt-ab');
    expect(insertedFragment?.kind).toBe('fragment');
    expect(insertedFragment?.kind === 'fragment' ? insertedFragment.operands[0].items.map((item) => item.id) : []).toEqual(['inside-ab']);
    expect(inserted.some((item) => item.id === 'new-de')).toBe(true);
  });

  it('keeps insertion in the operand only when both endpoints belong to its horizontal content', () => {
    const fragment: SequenceFragment = {
      id: 'alt-branches', kind: 'fragment', operator: 'alt', name: '',
      operands: [
        { id: 'when-ab', guard: 'A/B', items: [message('inside-ab', 'a', 'b')] },
        { id: 'when-de', guard: 'D/E', items: [message('inside-de', 'd', 'e')] },
      ],
    };
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [
        participant('a', 120), participant('b', 350), participant('c', 580),
        participant('d', 810), participant('e', 1040),
      ],
      items: [fragment],
    });
    const layout = buildSequenceLayout(content);
    const fragmentLayout = layout.fragmentLayouts.get('alt-branches')!;
    const firstOperand = fragmentLayout.operands[0];
    const secondOperand = fragmentLayout.operands[1];

    expect(resolveSequenceInsertionTarget(content.items, layout, firstOperand.contentTop + 20, {
      sourceId: 'a', targetId: 'b',
    })).toMatchObject({ parentFragmentId: 'alt-branches', operandId: 'when-ab' });
    expect(resolveSequenceInsertionTarget(content.items, layout, firstOperand.contentTop + 20, {
      sourceId: 'a', targetId: 'd',
    }).parentFragmentId).toBeUndefined();
    expect(resolveSequenceInsertionTarget(content.items, layout, secondOperand.contentTop + 20, {
      sourceId: 'd', targetId: 'e',
    })).toMatchObject({ parentFragmentId: 'alt-branches', operandId: 'when-de' });
  });

  it('resolves a nested operand using the nested participants instead of its outer Y range', () => {
    const nested: SequenceFragment = {
      id: 'nested-opt', kind: 'fragment', operator: 'opt', name: '',
      operands: [{ id: 'nested-body', guard: 'B/C', items: [message('nested-bc', 'b', 'c')] }],
    };
    const outer: SequenceFragment = {
      id: 'outer-alt', kind: 'fragment', operator: 'alt', name: '',
      operands: [{ id: 'outer-body', guard: 'camino', items: [nested] }],
    };
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 350), participant('c', 580), participant('d', 810)],
      items: [outer],
    });
    const layout = buildSequenceLayout(content);
    const nestedOperand = layout.fragmentLayouts.get('nested-opt')!.operands[0];

    expect(resolveSequenceInsertionTarget(content.items, layout, nestedOperand.contentTop + 20, {
      sourceId: 'b', targetId: 'c',
    })).toMatchObject({ parentFragmentId: 'nested-opt', operandId: 'nested-body' });
    expect(resolveSequenceInsertionTarget(content.items, layout, nestedOperand.contentTop + 20, {
      sourceId: 'a', targetId: 'd',
    }).parentFragmentId).toBeUndefined();
  });

  it('derives receiver executions and closes the matching nested return', () => {
    const call = message('call', 'a', 'b');
    const nested = message('nested', 'b', 'c');
    const returned = { ...message('return', 'c', 'b', 'return'), replyToMessageId: 'nested' };
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 350), participant('c', 580)],
      items: [call, nested, returned],
    });
    const activations = buildDerivedActivations(content);

    expect(activations.filter((activation) => activation.participantId === 'c')).toHaveLength(1);
    expect(activations.find((activation) => activation.startMessageId === 'nested')?.endMessageId).toBe('return');
  });

  it('matches an implicit return to the inverse call and leaves unrelated bars open', () => {
    const ab = message('ab', 'a', 'b');
    const bc = message('bc', 'b', 'c');
    const cb = message('cb', 'c', 'b', 'return');
    const ba = message('ba', 'b', 'a', 'return');
    const unmatched = message('unmatched', 'c', 'a', 'return');
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 350), participant('c', 580)],
      items: [ab, bc, cb, ba, unmatched],
    });
    const activations = buildDerivedActivations(content);
    expect(activations.find((activation) => activation.startMessageId === 'bc')?.endMessageId).toBe('cb');
    expect(activations.find((activation) => activation.startMessageId === 'ab' && activation.participantId === 'b')?.endMessageId).toBe('ba');
    expect(activations.find((activation) => activation.startMessageId === 'bc')?.endMessageId).not.toBe('unmatched');
  });

  it('does not create a receiver execution for create and keeps open bars temporal', () => {
    const create = { ...message('create', 'a', 'b', 'create') };
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 350)],
      items: [create],
    });
    const layout = buildSequenceLayout(content);
    const activations = buildDerivedActivations(content);

    expect(activations.some((activation) => activation.participantId === 'b')).toBe(false);
    const sourceActivation = layout.activationLayouts.find((activation) => activation.participantId === 'a');
    expect(sourceActivation?.height).toBeLessThan(layout.height - 100);
    expect(getSequenceMessageEndpoints(content, layout, create)?.targetX).toBe(270);
  });

  it('normalizes valid note semantic colors and discards unsupported colors', () => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      notes: [
        { id: 'n1', text: 'Nota amarilla', x: 100, y: 150, width: 200, height: 100, anchorKind: 'free', color: 'yellow' },
        { id: 'n2', text: 'Nota alerta', x: 300, y: 150, width: 200, height: 100, anchorKind: 'free', color: 'red' },
        { id: 'n3', text: 'Nota éxito', x: 500, y: 150, width: 200, height: 100, anchorKind: 'free', color: 'green' },
        { id: 'n4', text: 'Nota técnica', x: 700, y: 150, width: 200, height: 100, anchorKind: 'free', color: 'blue' },
        { id: 'n5', text: 'Nota sin color', x: 900, y: 150, width: 200, height: 100, anchorKind: 'free' },
        { id: 'n6', text: 'Nota inválida', x: 1100, y: 150, width: 200, height: 100, anchorKind: 'free', color: 'purple' as unknown as 'yellow' },
      ],
    });

    expect(content.notes[0].color).toBe('yellow');
    expect(content.notes[1].color).toBe('red');
    expect(content.notes[2].color).toBe('green');
    expect(content.notes[3].color).toBe('blue');
    expect(content.notes[4].color).toBeUndefined();
    expect(content.notes[5].color).toBeUndefined();
  });
});


describe('sequence execution geometry', () => {
  it('touches both bar edges and closes the receiver at the return, independent of canvas size', () => {
    const call = message('call', 'a', 'b');
    const reply = message('reply', 'b', 'a', 'return');
    const content = normalizeSequenceDiagramContent({ participants: [participant('a', 120), participant('b', 350)], items: [call, reply] });
    const layout = buildSequenceLayout(content);
    const bar = layout.activationLayouts.find((item) => item.participantId === 'b')!;
    const endpoints = getSequenceMessageEndpoints(content, layout, call)!;
    expect(endpoints.sourceX).toBe(126);
    expect(endpoints.targetX).toBe(bar.x);
    expect(bar.y + bar.height).toBe(layout.messageLayouts.get(reply.id)!.y + 3);
    const enlarged = buildSequenceLayout({ ...content, canvas: { ...content.canvas, height: 5000 } });
    expect(enlarged.activationLayouts).toEqual(layout.activationLayouts);
    expect(getSequenceMessageEndpoints({ ...content, showActivations: false }, layout, call)?.targetX).toBe(350);
  });

  it('moves a created participant back to the top when its create message changes type', () => {
    const content = normalizeSequenceDiagramContent({ participants: [participant('a', 120), participant('b', 350)], items: [message('create', 'a', 'b', 'create')] });
    expect(content.participants[1].createdByMessageId).toBe('create');
    const changed = normalizeSequenceDiagramContent({ ...content, items: [message('create', 'a', 'b')] });
    expect(changed.participants[1].createdByMessageId).toBeUndefined();
  });

  it('pads operands for alt/par and merges them without loss for single-section operators', () => {
    const single = [{ id: 'only', guard: 'x > 0', items: [message('m1', 'a', 'b')] }];
    const padded = adjustOperandsForOperator('alt', single);
    expect(padded).toHaveLength(2);
    expect(padded[0].items.map((item) => item.id)).toEqual(['m1']);

    const merged = adjustOperandsForOperator('loop', [
      { id: 'first', guard: 'cada elemento', items: [message('m1', 'a', 'b')] },
      { id: 'second', guard: 'extra', items: [message('m2', 'b', 'a')] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].guard).toBe('cada elemento');
    expect(merged[0].items.map((item) => item.id)).toEqual(['m1', 'm2']);

    expect(adjustOperandsForOperator('opt', [])).toHaveLength(1);
  });

  it('keeps dragged participants from overlapping each other', () => {
    const participants = [participant('a', 120), participant('b', 350)];
    expect(clampParticipantX(participants, 'b', 200)).toBe(300);
    expect(clampParticipantX(participants, 'a', 300)).toBe(170);
    expect(clampParticipantX(participants, 'a', 10)).toBe(90);
    expect(clampParticipantX(participants, 'b', 800)).toBe(800);
  });

  it('insets nested fragments instead of growing them over the parent border', () => {
    const inner = message('inner', 'a', 'b');
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 350)],
      items: [{
        id: 'outer', kind: 'fragment', operator: 'alt', name: '',
        operands: [{
          id: 'op', guard: '', items: [{
            id: 'inner-fragment', kind: 'fragment', operator: 'loop', name: '',
            operands: [{ id: 'op2', guard: '', items: [inner] }],
          }],
        }, { id: 'else', guard: 'else', items: [] }],
      }],
    });
    const layout = buildSequenceLayout(content);
    const outer = layout.fragmentLayouts.get('outer')!;
    const nested = layout.fragmentLayouts.get('inner-fragment')!;
    expect(nested.x).toBeGreaterThanOrEqual(outer.x);
    expect(nested.x + nested.width).toBeLessThanOrEqual(outer.x + outer.width);
  });

  it('keeps a realistic mixed diagram coherent: monotonic timeline, closed activations, valid endpoints', () => {
    const login = message('login', 'a', 'b');
    const buscar = { ...message('buscar', 'b', 'c'), name: 'buscar', parameterValues: '42' };
    const found = { ...message('found', 'c', 'b', 'return'), replyToMessageId: 'buscar' };
    const created = { ...message('created', 'b', 'd', 'create'), name: 'create' };
    const render = message('render', 'b', 'a');
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 350), participant('c', 580), participant('d', 810)],
      items: [
        login,
        {
          id: 'alt', kind: 'fragment', operator: 'alt', name: '',
          operands: [
            { id: 'ok', guard: 'encontrado', items: [buscar, found, created] },
            { id: 'fail', guard: 'else', items: [message('error', 'b', 'a')] },
          ],
        } as SequenceFragment,
        render,
      ],
    });
    const layout = buildSequenceLayout(content);
    const ys = layout.orderedMessages.map((item) => layout.messageLayouts.get(item.id)!.y);
    expect(ys.every((value, index) => index === 0 || value > ys[index - 1])).toBe(true);

    const activations = buildDerivedActivations(content);
    expect(activations.find((activation) => activation.startMessageId === 'buscar')?.endMessageId).toBe('found');

    for (const item of layout.orderedMessages) {
      expect(getSequenceMessageEndpoints(content, layout, item)).toBeDefined();
    }

    // d is created mid-timeline, so its lifeline starts below a/b/c.
    expect(layout.participantStartY.get('d')).toBeGreaterThan(layout.participantStartY.get('a')!);
    // Normalize is idempotent: lifecycle markers survive a second pass.
    const again = normalizeSequenceDiagramContent(content);
    expect(again.participants.find((p) => p.id === 'd')?.createdByMessageId).toBe('created');
    expect(buildSequenceMessageNumbers(again).get('buscar')).toBe('2');
  });

  it('formats message label correctly when name ends in () and has parameters', () => {
    const msg: SequenceMessage = {
      id: 'm1',
      kind: 'message',
      type: 'synchronous',
      sourceId: 'a',
      targetId: 'b',
      name: 'buscar()',
      arguments: '',
      parameterValues: '42',
      returnType: '',
      flowReference: '',
    };
    expect(formatSequenceMessageLabel(msg)).toBe('buscar(42)');
  });

  it('builds sequence layout with positive width and valid bounds when startParticipant has higher X than endParticipant', () => {
    const p1 = participant('p1', 500);
    const p2 = participant('p2', 200);
    const fragment: SequenceFragment = {
      id: 'frag1',
      kind: 'fragment',
      operator: 'opt',
      name: '',
      startParticipantId: 'p1',
      endParticipantId: 'p2',
      operands: [{ id: 'op1', guard: 'cond', items: [] }],
    };
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [p1, p2],
      items: [fragment],
    });
    const layout = buildSequenceLayout(content);
    const fragLayout = layout.fragmentLayouts.get('frag1');
    expect(fragLayout).toBeDefined();
    expect(fragLayout!.width).toBeGreaterThan(0);
    expect(fragLayout!.x).toBeLessThan(fragLayout!.x + fragLayout!.width);
    expect(fragLayout!.x).toBe(114);
    expect(fragLayout!.width).toBe(472);
  });

  it('preserves free fragment coordinates (x, y, width, height) in normalization and layout', () => {
    const p1 = participant('p1', 120);
    const p2 = participant('p2', 380);
    const freeFragment: SequenceFragment = {
      id: 'frag-free',
      kind: 'fragment',
      operator: 'alt',
      name: 'Verificación',
      x: 150,
      y: 280,
      width: 460,
      height: 220,
      operands: [
        { id: 'op1', guard: 'aprobado', items: [] },
        { id: 'op2', guard: 'rechazado', items: [] },
      ],
    };
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [p1, p2],
      items: [freeFragment],
    });
    const normalizedFrag = content.items[0] as SequenceFragment;
    expect(normalizedFrag.x).toBe(150);
    expect(normalizedFrag.y).toBe(280);
    expect(normalizedFrag.width).toBe(460);
    expect(normalizedFrag.height).toBe(220);

    const layout = buildSequenceLayout(content);
    const box = layout.fragmentLayouts.get('frag-free')!;
    expect(box).toBeDefined();
    expect(box.x).toBe(150);
    expect(box.y).toBe(280);
    expect(box.width).toBe(460);
    expect(box.height).toBe(220);
    // Operands partition the height
    expect(box.operands).toHaveLength(2);
    expect(box.operands[0].top).toBe(280 + 26);
    expect(box.operands[1].top).toBeGreaterThan(box.operands[0].top);
    expect(box.operands[1].bottom).toBe(280 + 220);
  });

  it('offsets fragment position by +30px when duplicated', () => {
    const original: SequenceFragment = {
      id: 'orig',
      kind: 'fragment',
      operator: 'loop',
      name: 'Bucle',
      x: 200,
      y: 300,
      width: 400,
      height: 180,
      operands: [{ id: 'op1', guard: 'i < 10', items: [] }],
    };
    const { items, duplicateId } = duplicateSequenceItem([original], 'orig');
    expect(items).toHaveLength(2);
    expect(duplicateId).toBeDefined();
    const duplicate = items.find((it) => it.id === duplicateId) as SequenceFragment;
    expect(duplicate.x).toBe(230);
    expect(duplicate.y).toBe(330);
    expect(duplicate.width).toBe(400);
    expect(duplicate.height).toBe(180);
  });

  describe('formatSequenceParticipantName', () => {
    it('handles single classifier without duplicating colons', () => {
      expect(formatSequenceParticipantName({
        id: 'p1', kind: 'object', name: '', classifierName: ':IndireccionPersistencia', x: 100,
      })).toBe(':IndireccionPersistencia');

      expect(formatSequenceParticipantName({
        id: 'p2', kind: 'object', name: '', classifierName: 'IndireccionPersistencia', x: 100,
      })).toBe(':IndireccionPersistencia');
    });

    it('formats single-line name and classifier with space and colon', () => {
      expect(formatSequenceParticipantName({
        id: 'p3', kind: 'object', name: 'servicio', classifierName: 'IndireccionPersistencia', x: 100,
      })).toBe('servicio : IndireccionPersistencia');
    });

    it('preserves newline between name and classifier when user pressed Enter', () => {
      expect(formatSequenceParticipantName({
        id: 'p4', kind: 'object', name: 'servicio\n', classifierName: 'IndireccionPersistencia', x: 100,
      })).toBe('servicio\n:IndireccionPersistencia');
    });

    it('preserves internal newlines inside classifier when user formatted it', () => {
      expect(formatSequenceParticipantName({
        id: 'p5', kind: 'object', name: '', classifierName: 'Indireccion\nPersistencia', x: 100,
      })).toBe(':Indireccion\nPersistencia');
    });
  });

  describe('participantColors setting normalization', () => {
    it('defaults participantColors to "automatic" when not provided or undefined', () => {
      const normalized = normalizeSequenceDiagramContent({});
      expect(normalized.participantColors).toBe('automatic');
    });

    it('preserves participantColors "disabled"', () => {
      const normalized = normalizeSequenceDiagramContent({ participantColors: 'disabled' });
      expect(normalized.participantColors).toBe('disabled');
    });

    it('preserves participantColors "automatic"', () => {
      const normalized = normalizeSequenceDiagramContent({ participantColors: 'automatic' });
      expect(normalized.participantColors).toBe('automatic');
    });
  });

  describe('terminateLifeline normalization', () => {
    it('preserves boolean terminateLifeline flags on participants', () => {
      const content = normalizeSequenceDiagramContent({
        participants: [
          { id: 'p1', kind: 'object', name: 'p1', classifierName: '', x: 100, terminateLifeline: true },
          { id: 'p2', kind: 'object', name: 'p2', classifierName: '', x: 300, terminateLifeline: false },
          { id: 'p3', kind: 'object', name: 'p3', classifierName: '', x: 500 },
        ],
      });
      expect(content.participants[0].terminateLifeline).toBe(true);
      expect(content.participants[1].terminateLifeline).toBe(false);
      expect(content.participants[2].terminateLifeline).toBeUndefined();
    });
  });
});


describe('operaciones de bloque', () => {
  const blockMsg = (id: string): SequenceMessage => ({
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

  it('filtra ids de primer nivel en orden de documento', () => {
    const inner = blockMsg('inner');
    const items = [
      blockMsg('m1'),
      blockMsg('m2'),
      {
        id: 'f1', kind: 'fragment', operator: 'opt', name: '',
        operands: [{ id: 'op1', guard: '', items: [inner] }],
      } as SequenceFragment,
      blockMsg('m3'),
    ];
    // 'inner' está anidado en 'f1': se descarta si el fragmento también está seleccionado.
    expect(getTopLevelBlockIds(items, ['m3', 'inner', 'f1', 'm1', 'nope'])).toEqual(['m1', 'f1', 'm3']);
  });

  it('mueve un bloque contiguo hacia arriba y abajo', () => {
    const items = [blockMsg('m1'), blockMsg('m2'), blockMsg('m3'), blockMsg('m4')];
    expect(moveSequenceItemsBlock(items, ['m2', 'm3'], -1).map((i) => i.id)).toEqual(['m2', 'm3', 'm1', 'm4']);
    expect(moveSequenceItemsBlock(items, ['m2', 'm3'], 1).map((i) => i.id)).toEqual(['m1', 'm4', 'm2', 'm3']);
    // Bordes y bloques no contiguos no cambian nada.
    expect(moveSequenceItemsBlock(items, ['m1', 'm2'], -1)).toBe(items);
    expect(moveSequenceItemsBlock(items, ['m3', 'm4'], 1)).toBe(items);
    expect(moveSequenceItemsBlock(items, ['m1', 'm3'], 1)).toBe(items);
  });

  it('elimina un bloque incluyendo fragmentos con hijos', () => {
    const inner1 = blockMsg('inner1');
    const inner2 = blockMsg('inner2');
    const items = [
      blockMsg('m1'),
      {
        id: 'f1', kind: 'fragment', operator: 'opt', name: '',
        operands: [{ id: 'op1', guard: '', items: [inner1, inner2] }],
      } as SequenceFragment,
      blockMsg('m2'),
    ];
    const result = removeSequenceItemsBlock(items, ['m1', 'f1', 'inner1']);
    expect(result.items.map((i) => i.id)).toEqual(['m2']);
    expect(result.removed.map((i) => i.id)).toEqual(['m1', 'f1']);
  });

  it('clona elementos con identificadores nuevos', () => {
    const items = [blockMsg('m1')];
    const clones = cloneSequenceTimelineItems(items);
    expect(clones).toHaveLength(1);
    expect(clones[0].id).not.toBe('m1');
    expect({ ...clones[0], id: 'm1' }).toEqual(items[0]);
  });
});
