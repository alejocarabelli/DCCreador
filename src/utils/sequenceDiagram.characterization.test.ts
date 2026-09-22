import { describe, expect, it } from 'vitest';
import type { SequenceFragment, SequenceMessage, SequenceParticipant } from '../types/diagram';
import { quickMessageValues } from './sequenceMessageDialogCompatibility';
import { buildDerivedActivations, clampParticipantX, createEmptySequenceDiagramContent, normalizeSequenceDiagramContent } from './sequenceDiagram';
import { buildSequenceLayout } from './sequenceDiagramLayout';

const participant = (id: string, x: number): SequenceParticipant => ({ id, kind: 'object', name: id, classifierName: '', x });

const message = (id: string, sourceId: string, targetId: string, type: SequenceMessage['type'] = 'synchronous'): SequenceMessage => ({
  id, kind: 'message', type, sourceId, targetId, name: id, arguments: '', parameterValues: '', returnType: '', flowReference: '',
});

describe('sequence stabilization characterization (known failures)', () => {
  it('moves nested content with a manually moved fragment', () => {
    const fragment: SequenceFragment = {
      id: 'fragment', kind: 'fragment', operator: 'alt', name: '',
      operands: [{ id: 'when', guard: 'sí', items: [message('inside', 'a', 'b')] }, { id: 'else', guard: 'no', items: [] }],
    };
    const before = normalizeSequenceDiagramContent({ ...createEmptySequenceDiagramContent(), participants: [participant('a', 120), participant('b', 400)], items: [fragment] });
    const after = normalizeSequenceDiagramContent({ ...before, items: [{ ...fragment, y: 400, height: 220 }] });
    const beforeLayout = buildSequenceLayout(before);
    const afterLayout = buildSequenceLayout(after);

    expect(afterLayout.messageLayouts.get('inside')!.y - afterLayout.fragmentLayouts.get('fragment')!.y)
      .toBe(beforeLayout.messageLayouts.get('inside')!.y - beforeLayout.fragmentLayouts.get('fragment')!.y);
  });

  it('creates an independent activation for each alt branch', () => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 400)],
      items: [{
        id: 'alt', kind: 'fragment', operator: 'alt', name: '',
        operands: [
          { id: 'first', guard: 'sí', items: [message('call-in-first', 'a', 'b')] },
          { id: 'second', guard: 'no', items: [message('call-in-second', 'b', 'a')] },
        ],
      }],
    });

    expect(buildDerivedActivations(content).map((activation) => activation.startMessageId))
      .toContain('call-in-second');
  });

  it('reports a message that targets a participant before its create interaction', () => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 400)],
      items: [message('before-create', 'a', 'b'), message('create-b', 'a', 'b', 'create')],
    });
    expect(content.problems).toContainEqual(expect.objectContaining({
      code: 'message-before-create',
      messageId: 'before-create',
      participantId: 'b',
    }));
  });

  it('reports a message that uses a participant after its destroy interaction', () => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants: [participant('a', 120), participant('b', 400)],
      items: [message('destroy-b', 'a', 'b', 'destroy'), message('after-destroy', 'b', 'a')],
    });
    expect(content.problems).toContainEqual(expect.objectContaining({
      code: 'message-after-destroy',
      messageId: 'after-destroy',
      participantId: 'b',
    }));
  });

  it('keeps the swapped route in values saved from the quick dialog', () => {
    const values = quickMessageValues({
      sourceId: 'b', targetId: 'a', y: 200, name: 'operar', type: 'synchronous', editId: 'existing',
      arguments: '', parameterValues: '', returnType: '',
    });

    expect(values).toMatchObject({ sourceId: 'b', targetId: 'a' });
  });

  it('keeps all three participant centers at least 180px apart after a drag', () => {
    const participants = [participant('a', 120), participant('b', 300), participant('c', 480)];
    const x = clampParticipantX(participants, 'a', 400);

    expect([300, 480].every((otherX) => Math.abs(x - otherX) >= 180)).toBe(true);
  });
});
