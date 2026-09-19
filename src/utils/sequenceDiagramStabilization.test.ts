import { describe, expect, it } from 'vitest';
import sequenceBaselineProject from '../../fixtures/sequence-stabilization-baseline.json';
import type {
  SequenceDiagramContent,
  SequenceFragment,
  SequenceMessage,
  SequenceParticipant,
} from '../types/diagram';
import {
  analyzeSequenceDiagramSemantics,
  applySequenceDiagramMutation,
  createEmptySequenceDiagramContent,
  normalizeSequenceDiagramContent,
  reconcileRemovedSequenceReferences,
} from './sequenceDiagram';

const participant = (id: string, x: number): SequenceParticipant => ({
  id,
  kind: 'object',
  name: '',
  classifierName: id,
  x,
});

const message = (
  id: string,
  sourceId: string,
  targetId: string,
  type: SequenceMessage['type'] = 'synchronous',
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
  flowReference: '',
});

const alt = (id: string, operands: SequenceFragment['operands']): SequenceFragment => ({
  id,
  kind: 'fragment',
  operator: 'alt',
  name: '',
  operands,
});

describe('sequence normalization stabilization', () => {
  it('reconciles references to removed scopes without hiding preexisting dangling references', () => {
    const scoped = {
      id: 'fragment', kind: 'fragment' as const, operator: 'opt' as const, name: 'scope',
      operands: [{ id: 'operand', guard: '', items: [message('start', 'a', 'b')] }],
    };
    const before = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 100), participant('b', 300)],
      items: [scoped],
      activations: [
        { id: 'valid', participantId: 'b', startMessageId: 'start', endScope: { fragmentId: 'fragment', operandId: 'operand' } },
        { id: 'already-broken', participantId: 'b', startMessageId: 'start', endScope: { fragmentId: 'missing', operandId: 'missing' } },
      ],
      notes: [{ id: 'note', text: 'n', x: 0, y: 0, width: 100, height: 60, anchorKind: 'fragment', anchorId: 'fragment' }],
    });
    const after = { ...before, items: scoped.operands[0].items };

    const reconciled = reconcileRemovedSequenceReferences(before, after);

    expect(reconciled.activations[0].endScope).toBeUndefined();
    expect(reconciled.activations[1].endScope).toEqual({ fragmentId: 'missing', operandId: 'missing' });
    expect(reconciled.notes[0]).toMatchObject({ anchorKind: 'free', anchorId: undefined });

    const participantNoteBefore = {
      ...before,
      notes: [{ ...before.notes[0], anchorKind: 'participant' as const, anchorId: 'b' }],
    };
    const withoutParticipant = {
      ...participantNoteBefore,
      participants: participantNoteBefore.participants.filter((candidate) => candidate.id !== 'b'),
    };
    const freed = reconcileRemovedSequenceReferences(participantNoteBefore, withoutParticipant);
    expect(freed.notes[0]).toMatchObject({ anchorKind: 'free', anchorId: undefined });
    expect(normalizeSequenceDiagramContent(freed)).toEqual(normalizeSequenceDiagramContent(normalizeSequenceDiagramContent(freed)));
  });

  it('does not repair or drift the existing well-shaped stabilization fixture', () => {
    const once = normalizeSequenceDiagramContent(sequenceBaselineProject.artifacts[0].content);
    const twice = normalizeSequenceDiagramContent(once);

    expect(once.problems.filter((problem) => problem.code === 'normalization-repair')).toEqual([]);
    expect(twice).toEqual(once);
  });

  it('reports semantic repairs, preserves broken anchors, and does not invent operands', () => {
    const normalized = normalizeSequenceDiagramContent({
      participants: [participant('a', 120), participant('b', 360)],
      items: [
        { ...message('invalid-type', 'a', 'b'), type: 'surprise' },
        {
          ...message('missing-type', 'a', 'b'),
          type: undefined,
        },
        {
          id: 'invalid-fragment',
          kind: 'fragment',
          operator: 'surprise',
          name: '',
          startParticipantId: 'missing-participant',
          operands: [{ id: 'only', guard: '', items: [] }],
        },
      ],
      notes: [{
        id: 'broken-note',
        text: 'Conservar referencia',
        x: 100,
        y: 180,
        width: 220,
        height: 110,
        anchorKind: 'message',
        anchorId: 'missing-message',
      }],
    });

    expect((normalized.items[0] as SequenceMessage).type).toBe('synchronous');
    expect((normalized.items[1] as SequenceMessage).type).toBe('synchronous');
    expect((normalized.items[2] as SequenceFragment).operator).toBe('alt');
    expect((normalized.items[2] as SequenceFragment).operands).toHaveLength(1);
    expect((normalized.items[2] as SequenceFragment).startParticipantId).toBe('missing-participant');
    expect(normalized.notes[0]).toMatchObject({
      anchorKind: 'message',
      anchorId: 'missing-message',
    });
    expect(normalized.problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'normalization-repair', messageId: 'invalid-type' }),
      expect.objectContaining({ code: 'normalization-repair', messageId: 'missing-type' }),
      expect.objectContaining({ code: 'normalization-repair', fragmentId: 'invalid-fragment' }),
      expect.objectContaining({
        code: 'normalization-repair',
        fragmentId: 'invalid-fragment',
        participantId: 'missing-participant',
      }),
      expect.objectContaining({ code: 'normalization-repair', message: expect.stringContaining('missing-message') }),
    ]));
    expect(normalizeSequenceDiagramContent(normalized)).toEqual(normalized);
  });

  it('repairs duplicate ids deterministically and remaps every supported internal reference', () => {
    const raw = {
      participants: [
        participant('p', 120),
        participant('p', 360),
        participant('p~2', 600),
      ],
      items: [
        message('call', 'p~2', 'p'),
        message('call', 'p', 'p~2'),
        { ...message('call~2', 'p~2', 'p', 'return'), replyToMessageId: 'call~2' },
        {
          id: 'fragment',
          kind: 'fragment',
          operator: 'opt',
          name: '',
          startParticipantId: 'p~2',
          endParticipantId: 'p',
          operands: [
            { id: 'operand', guard: '', items: [] },
            { id: 'operand', guard: '', items: [] },
            { id: 'operand~2', guard: '', items: [] },
          ],
        },
      ],
      activations: [{
        id: 'activation',
        participantId: 'p~2',
        startMessageId: 'call~2',
        endMessageId: 'call~2',
        endScope: { fragmentId: 'fragment', operandId: 'operand~2' },
        level: 0,
        manual: true,
      }],
      notes: [{
        id: 'note',
        text: '',
        x: 100,
        y: 180,
        width: 220,
        height: 110,
        anchorKind: 'message',
        anchorId: 'call~2',
      }],
    };

    const once = normalizeSequenceDiagramContent(raw);
    const independentlyNormalized = normalizeSequenceDiagramContent(raw);
    const twice = normalizeSequenceDiagramContent(once);
    const messages = once.items.filter((item): item is SequenceMessage => item.kind === 'message');
    const fragment = once.items.find((item): item is SequenceFragment => item.kind === 'fragment')!;
    const activation = once.activations[0];

    expect(independentlyNormalized).toEqual(once);
    expect(twice).toEqual(once);
    expect(once.participants.map((item) => item.id)).toEqual(['p', 'p~2', 'p~2~2']);
    expect(messages.map((item) => item.id)).toEqual(['call', 'call~2', 'call~2~2']);
    expect(messages[0].sourceId).toBe('p~2~2');
    expect(messages[2].replyToMessageId).toBe('call~2~2');
    expect(fragment.startParticipantId).toBe('p~2~2');
    expect(fragment.operands.map((operand) => operand.id)).toEqual(['operand', 'operand~2', 'operand~2~2']);
    expect(activation).toMatchObject({
      participantId: 'p~2~2',
      startMessageId: 'call~2~2',
      endMessageId: 'call~2~2',
      endScope: { fragmentId: 'fragment', operandId: 'operand~2~2' },
    });
    expect(once.notes[0].anchorId).toBe('call~2~2');
    expect(once.problems.some((problem) => problem.code === 'normalization-repair')).toBe(true);
  });
});

describe('sequence mutation gate stabilization', () => {
  const participants = [participant('a', 120), participant('b', 360)];

  it('keeps otherwise identical problems distinct when they belong to different operands', () => {
    const content: SequenceDiagramContent = {
      ...createEmptySequenceDiagramContent(),
      participants,
      items: [alt('choice', [
        { id: 'first', guard: 'first', items: [message('same-orphan', 'b', 'a', 'return')] },
        { id: 'second', guard: 'second', items: [message('same-orphan', 'b', 'a', 'return')] },
      ])],
    };

    const problems = analyzeSequenceDiagramSemantics(content).problems
      .filter((problem) => problem.code === 'unmatched-return');

    expect(problems).toHaveLength(2);
    expect(new Set(problems.map((problem) => problem.id)).size).toBe(2);
    expect(problems.map((problem) => problem.operandId)).toEqual(['first', 'second']);
  });

  it('blocks a newly introduced unmatched return warning', () => {
    const current = normalizeSequenceDiagramContent({ ...createEmptySequenceDiagramContent(), participants });
    const candidate = { ...current, items: [message('orphan', 'b', 'a', 'return')] };

    const mutation = applySequenceDiagramMutation(current, candidate);

    expect(mutation.accepted).toBe(false);
    expect(mutation.newProblems).toContainEqual(expect.objectContaining({
      code: 'unmatched-return',
      messageId: 'orphan',
    }));
  });

  it('treats the same temporal problem in another operand as a new scoped problem', () => {
    const current = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants,
      items: [alt('choice', [
        { id: 'first', guard: 'first', items: [message('orphan', 'b', 'a', 'return')] },
        { id: 'second', guard: 'second', items: [] },
      ])],
    });
    const candidate: SequenceDiagramContent = {
      ...current,
      items: [alt('choice', [
        { id: 'first', guard: 'first', items: [] },
        { id: 'second', guard: 'second', items: [message('orphan', 'b', 'a', 'return')] },
      ])],
    };

    const mutation = applySequenceDiagramMutation(current, candidate);

    expect(mutation.accepted).toBe(false);
    expect(mutation.newProblems).toContainEqual(expect.objectContaining({
      code: 'unmatched-return',
      fragmentId: 'choice',
      operandId: 'second',
    }));
  });

  it('allows an edit when its blocking temporal problem is truly preexisting', () => {
    const current = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants,
      items: [message('orphan', 'b', 'a', 'return')],
    });
    const candidate = { ...current, canvas: { width: 2600, height: 1800 } };

    const mutation = applySequenceDiagramMutation(current, candidate);

    expect(mutation.accepted).toBe(true);
    expect(mutation.newProblems).toEqual([]);
  });

  it('blocks a duplicate-create warning introduced inside an operand', () => {
    const current = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants,
      items: [message('create-b', 'a', 'b', 'create')],
    });
    const candidate: SequenceDiagramContent = {
      ...current,
      items: [
        ...current.items,
        alt('choice', [
          { id: 'first', guard: 'first', items: [message('duplicate-create', 'a', 'b', 'create')] },
          { id: 'second', guard: 'second', items: [] },
        ]),
      ],
    };

    const mutation = applySequenceDiagramMutation(current, candidate);

    expect(mutation.accepted).toBe(false);
    expect(mutation.newProblems).toContainEqual(expect.objectContaining({
      code: 'duplicate-create',
      severity: 'warning',
      operandId: 'first',
    }));
  });
});

describe('invalid lifecycle messages are semantically inert', () => {
  it('preserves and reports invalid root and operand messages without changing markers or activations', () => {
    const participants = [participant('a', 120), participant('b', 360)];
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants,
      items: [
        alt('before-create-scope', [
          { id: 'before', guard: 'before', items: [message('before-create', 'a', 'b')] },
          { id: 'empty-before', guard: 'else', items: [] },
        ]),
        message('create-b', 'a', 'b', 'create'),
        message('duplicate-create-root', 'a', 'b', 'create'),
        alt('create-scope', [
          { id: 'duplicate-create-branch', guard: 'duplicate', items: [message('duplicate-create-operand', 'a', 'b', 'create')] },
          { id: 'empty-create', guard: 'else', items: [] },
        ]),
        message('destroy-b', 'a', 'b', 'destroy'),
        message('duplicate-destroy-root', 'a', 'b', 'destroy'),
        alt('destroy-scope', [
          {
            id: 'duplicate-destroy-branch',
            guard: 'duplicate',
            items: [
              message('duplicate-destroy-operand', 'a', 'b', 'destroy'),
              message('after-destroy-operand', 'b', 'a'),
            ],
          },
          { id: 'empty-destroy', guard: 'else', items: [] },
        ]),
        message('after-destroy-root', 'b', 'a'),
      ],
    });

    const semantics = analyzeSequenceDiagramSemantics(content);
    const participantB = content.participants.find((item) => item.id === 'b');
    const invalidIds = [
      'before-create',
      'duplicate-create-root',
      'duplicate-create-operand',
      'duplicate-destroy-root',
      'duplicate-destroy-operand',
      'after-destroy-operand',
      'after-destroy-root',
    ];

    expect(participantB).toMatchObject({
      createdByMessageId: 'create-b',
      destroyedByMessageId: 'destroy-b',
    });
    expect(semantics.validMessageIds.has('create-b')).toBe(true);
    expect(semantics.validMessageIds.has('destroy-b')).toBe(true);
    invalidIds.forEach((id) => expect(semantics.validMessageIds.has(id)).toBe(false));
    expect(semantics.activations.some((activation) => invalidIds.includes(activation.startMessageId))).toBe(false);
    expect(content.problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'message-before-create', messageId: 'before-create', operandId: 'before' }),
      expect.objectContaining({ code: 'duplicate-create', messageId: 'duplicate-create-root' }),
      expect.objectContaining({ code: 'duplicate-create', messageId: 'duplicate-create-operand', operandId: 'duplicate-create-branch' }),
      expect.objectContaining({ code: 'duplicate-destroy', messageId: 'duplicate-destroy-root' }),
      expect.objectContaining({ code: 'duplicate-destroy', messageId: 'duplicate-destroy-operand', operandId: 'duplicate-destroy-branch' }),
      expect.objectContaining({ code: 'message-after-destroy', messageId: 'after-destroy-operand', operandId: 'duplicate-destroy-branch' }),
      expect.objectContaining({ code: 'message-after-destroy', messageId: 'after-destroy-root' }),
    ]));
  });
});
