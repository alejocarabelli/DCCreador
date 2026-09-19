import { describe, expect, it } from 'vitest';
import type {
  SequenceActivation,
  SequenceDiagramContent,
  SequenceFragment,
  SequenceMessage,
  SequenceParticipant,
} from '../types/diagram';
import {
  analyzeSequenceDiagramSemantics,
  cloneSequenceTimelineItems,
  createEmptySequenceDiagramContent,
  duplicateSequenceItem,
  normalizeSequenceDiagramContent,
} from './sequenceDiagram';

const participant = (id: string, x: number): SequenceParticipant => ({
  id,
  kind: 'object',
  name: id,
  classifierName: '',
  x,
});

const message = (
  id: string,
  sourceId: string,
  targetId: string,
  type: SequenceMessage['type'] = 'synchronous',
  replyToMessageId?: string,
): SequenceMessage => ({
  id,
  kind: 'message',
  type,
  sourceId,
  targetId,
  name: type === 'return' ? '' : id,
  arguments: '',
  parameterValues: '',
  returnType: '',
  ...(replyToMessageId !== undefined ? { replyToMessageId } : {}),
  flowReference: '',
});

const diagram = (
  items: SequenceDiagramContent['items'],
  activations: SequenceActivation[] = [],
  participantIds = ['a', 'b', 'c'],
): SequenceDiagramContent => normalizeSequenceDiagramContent({
  ...createEmptySequenceDiagramContent(),
  participants: participantIds.map((id, index) => participant(id, 120 + index * 240)),
  items,
  activations,
});

const derivedFor = (
  content: SequenceDiagramContent,
  participantId: string,
  startMessageId: string,
): SequenceActivation | undefined => analyzeSequenceDiagramSemantics(content).activations.find((activation) =>
  !activation.manual
  && activation.participantId === participantId
  && activation.startMessageId === startMessageId);

describe('synchronous call stack and returns', () => {
  it('matches A→B with an implicit return', () => {
    const content = diagram([
      message('call-ab', 'a', 'b'),
      message('return-ba', 'b', 'a', 'return'),
    ]);

    expect(derivedFor(content, 'b', 'call-ab')).toMatchObject({
      endMessageId: 'return-ba',
      level: 0,
    });
    expect(content.problems.some((problem) => problem.code === 'unmatched-return')).toBe(false);
  });

  it('unwinds A→B→C in inverse order', () => {
    const content = diagram([
      message('call-ab', 'a', 'b'),
      message('call-bc', 'b', 'c'),
      message('return-cb', 'c', 'b', 'return', 'call-bc'),
      message('return-ba', 'b', 'a', 'return', 'call-ab'),
    ]);

    expect(derivedFor(content, 'c', 'call-bc')).toMatchObject({ endMessageId: 'return-cb', level: 0 });
    expect(derivedFor(content, 'b', 'call-ab')).toMatchObject({ endMessageId: 'return-ba', level: 0 });
  });

  it('supports callback A→B→A and closes both receiver activations', () => {
    const content = diagram([
      message('call-ab', 'a', 'b'),
      message('callback-ba', 'b', 'a'),
      message('return-ab', 'a', 'b', 'return', 'callback-ba'),
      message('return-ba', 'b', 'a', 'return', 'call-ab'),
    ], [], ['a', 'b']);

    expect(derivedFor(content, 'a', 'callback-ba')).toMatchObject({
      endMessageId: 'return-ab',
      level: 1,
    });
    expect(derivedFor(content, 'b', 'call-ab')).toMatchObject({
      endMessageId: 'return-ba',
      level: 0,
    });
  });

  it('supports reentrancy A→B→A→B and unwinds in strict reverse order', () => {
    const content = diagram([
      message('call-ab-1', 'a', 'b'),
      message('callback-ba', 'b', 'a'),
      message('call-ab-2', 'a', 'b'),
      message('return-ba-2', 'b', 'a', 'return', 'call-ab-2'),
      message('return-ab', 'a', 'b', 'return', 'callback-ba'),
      message('return-ba-1', 'b', 'a', 'return', 'call-ab-1'),
    ], [], ['a', 'b']);

    expect(derivedFor(content, 'b', 'call-ab-1')).toMatchObject({ endMessageId: 'return-ba-1', level: 0 });
    expect(derivedFor(content, 'a', 'callback-ba')).toMatchObject({ endMessageId: 'return-ab', level: 1 });
    expect(derivedFor(content, 'b', 'call-ab-2')).toMatchObject({ endMessageId: 'return-ba-2', level: 1 });
    expect(content.problems.some((problem) => problem.code === 'unmatched-return')).toBe(false);
  });

  it('creates a nested receiver activation for a self-message', () => {
    const content = diagram([
      message('self-call', 'a', 'a'),
      message('self-return', 'a', 'a', 'return', 'self-call'),
    ], [], ['a']);
    const activations = analyzeSequenceDiagramSemantics(content).activations
      .filter((activation) => activation.startMessageId === 'self-call');

    expect(activations).toEqual(expect.arrayContaining([
      expect.objectContaining({ participantId: 'a', level: 0 }),
      expect.objectContaining({ participantId: 'a', level: 1, endMessageId: 'self-return' }),
    ]));
  });

  it('keeps multiple calls between the same participants nested and infers returns LIFO', () => {
    const content = diagram([
      message('call-1', 'a', 'b'),
      message('call-2', 'a', 'b'),
      message('return-2', 'b', 'a', 'return'),
      message('return-1', 'b', 'a', 'return'),
    ], [], ['a', 'b']);

    expect(derivedFor(content, 'b', 'call-1')).toMatchObject({ endMessageId: 'return-1', level: 0 });
    expect(derivedFor(content, 'b', 'call-2')).toMatchObject({ endMessageId: 'return-2', level: 1 });
  });

  it('gives an explicit replyToMessageId priority without falling back to another call', () => {
    const content = diagram([
      message('call-1', 'a', 'b'),
      message('call-2', 'a', 'b'),
      message('out-of-order-return', 'b', 'a', 'return', 'call-1'),
    ], [], ['a', 'b']);
    const analysis = analyzeSequenceDiagramSemantics(content);

    expect(analysis.problems).toContainEqual(expect.objectContaining({
      code: 'unmatched-return',
      messageId: 'out-of-order-return',
    }));
    expect(derivedFor(content, 'b', 'call-1')?.endMessageId).toBeUndefined();
    expect(derivedFor(content, 'b', 'call-2')?.endMessageId).toBeUndefined();
  });

  it('preserves an explicit reply link through normalization and rejects a misdirected return', () => {
    const content = diagram([
      message('call-ab', 'a', 'b'),
      message('wrong-return', 'b', 'c', 'return', 'call-ab'),
    ]);

    expect((content.items[1] as SequenceMessage).replyToMessageId).toBe('call-ab');
    expect(content.problems).toContainEqual(expect.objectContaining({
      code: 'unmatched-return',
      messageId: 'wrong-return',
    }));
    expect(derivedFor(content, 'b', 'call-ab')?.endMessageId).toBeUndefined();
  });

  it('reports a return with no open compatible call', () => {
    const content = diagram([message('orphan', 'b', 'a', 'return')], [], ['a', 'b']);

    expect(content.problems).toContainEqual(expect.objectContaining({
      code: 'unmatched-return',
      messageId: 'orphan',
    }));
  });

  it('does not close a call from a sibling operand', () => {
    const content = diagram([{
      id: 'choice',
      kind: 'fragment',
      operator: 'alt',
      name: '',
      operands: [
        { id: 'first', guard: 'first', items: [message('call-ab', 'a', 'b')] },
        { id: 'second', guard: 'second', items: [message('return-ba', 'b', 'a', 'return', 'call-ab')] },
      ],
    } satisfies SequenceFragment], [], ['a', 'b']);

    expect(content.problems).toContainEqual(expect.objectContaining({
      code: 'unmatched-return',
      messageId: 'return-ba',
      operandId: 'second',
    }));
    expect(derivedFor(content, 'b', 'call-ab')?.endMessageId).toBeUndefined();
  });
});

describe('manual activation coherence', () => {
  const call = message('call-ab', 'a', 'b');
  const returned = message('return-ba', 'b', 'a', 'return', 'call-ab');

  it('accepts a valid manual activation matching the derived interval', () => {
    const content = diagram([call, returned], [{
      id: 'manual-valid',
      participantId: 'b',
      startMessageId: 'call-ab',
      endMessageId: 'return-ba',
      level: 0,
      manual: true,
    }], ['a', 'b']);
    const analysis = analyzeSequenceDiagramSemantics(content);

    expect(analysis.problems.some((problem) => problem.code === 'invalid-manual-activation')).toBe(false);
    expect(analysis.activations).toContainEqual(expect.objectContaining({
      id: 'manual-valid',
      manual: true,
      endMessageId: 'return-ba',
    }));
    expect(analysis.activations.some((activation) =>
      !activation.manual && activation.participantId === 'b' && activation.startMessageId === 'call-ab')).toBe(false);
  });

  it('rejects a manual activation whose end precedes its start and keeps the derived activation', () => {
    const content = diagram([
      message('earlier', 'a', 'b', 'asynchronous'),
      call,
      returned,
    ], [{
      id: 'manual-backwards',
      participantId: 'b',
      startMessageId: 'call-ab',
      endMessageId: 'earlier',
      level: 0,
      manual: true,
    }], ['a', 'b']);
    const analysis = analyzeSequenceDiagramSemantics(content);

    expect(analysis.problems).toContainEqual(expect.objectContaining({
      code: 'invalid-manual-activation',
      activationId: 'manual-backwards',
    }));
    expect(analysis.activations.some((activation) => activation.id === 'manual-backwards')).toBe(false);
    expect(analysis.activations).toContainEqual(expect.objectContaining({
      manual: false,
      participantId: 'b',
      startMessageId: 'call-ab',
      endMessageId: 'return-ba',
    }));
  });

  it('rejects a manual activation crossing sibling operands', () => {
    const content = diagram([{
      id: 'choice',
      kind: 'fragment',
      operator: 'alt',
      name: '',
      operands: [
        { id: 'first', guard: 'first', items: [call] },
        { id: 'second', guard: 'second', items: [message('other', 'a', 'b', 'asynchronous')] },
      ],
    } satisfies SequenceFragment], [{
      id: 'manual-cross-scope',
      participantId: 'b',
      startMessageId: 'call-ab',
      endMessageId: 'other',
      level: 0,
      manual: true,
    }], ['a', 'b']);
    const analysis = analyzeSequenceDiagramSemantics(content);

    expect(analysis.problems).toContainEqual(expect.objectContaining({
      code: 'invalid-manual-activation',
      activationId: 'manual-cross-scope',
    }));
    expect(analysis.activations.some((activation) => activation.id === 'manual-cross-scope')).toBe(false);
    expect(analysis.activations).toContainEqual(expect.objectContaining({
      manual: false,
      participantId: 'b',
      startMessageId: 'call-ab',
      endMessageId: 'call-ab',
    }));
  });

  it('does not let a manual activation replace a derived activation with another closure', () => {
    const content = diagram([
      call,
      returned,
      message('later', 'a', 'b', 'asynchronous'),
    ], [{
      id: 'manual-other-close',
      participantId: 'b',
      startMessageId: 'call-ab',
      endMessageId: 'later',
      level: 0,
      manual: true,
    }], ['a', 'b']);
    const analysis = analyzeSequenceDiagramSemantics(content);

    expect(analysis.problems).toContainEqual(expect.objectContaining({
      code: 'invalid-manual-activation',
      activationId: 'manual-other-close',
    }));
    expect(analysis.activations.some((activation) => activation.id === 'manual-other-close')).toBe(false);
    expect(analysis.activations).toContainEqual(expect.objectContaining({
      manual: false,
      participantId: 'b',
      startMessageId: 'call-ab',
      endMessageId: 'return-ba',
    }));
  });
});

describe('reply reference cloning', () => {
  it('remaps replyToMessageId when cloning a call+return block', () => {
    const source = [
      message('call-ab', 'a', 'b'),
      message('return-ba', 'b', 'a', 'return', 'call-ab'),
    ];

    const cloned = cloneSequenceTimelineItems(source) as SequenceMessage[];

    expect(cloned[0].id).not.toBe('call-ab');
    expect(cloned[1].id).not.toBe('return-ba');
    expect(cloned[1].replyToMessageId).toBe(cloned[0].id);
  });

  it('remaps internal reply links when duplicating a fragment block', () => {
    const fragment: SequenceFragment = {
      id: 'fragment',
      kind: 'fragment',
      operator: 'opt',
      name: '',
      operands: [{
        id: 'operand',
        guard: '',
        items: [
          message('call-ab', 'a', 'b'),
          message('return-ba', 'b', 'a', 'return', 'call-ab'),
        ],
      }],
    };

    const result = duplicateSequenceItem([fragment], 'fragment');
    const duplicated = result.items[1] as SequenceFragment;
    const clonedCall = duplicated.operands[0].items[0] as SequenceMessage;
    const clonedReturn = duplicated.operands[0].items[1] as SequenceMessage;

    expect(clonedReturn.replyToMessageId).toBe(clonedCall.id);
  });
});
