import { describe, expect, it } from 'vitest';
import type { SequenceFragment, SequenceMessage, SequenceNote } from '../types/diagram';
import { cloneSequenceBlock } from './sequenceDiagram';

const call: SequenceMessage = {
  id: 'call', kind: 'message', type: 'synchronous', sourceId: 'a', targetId: 'b',
  name: 'buscar', arguments: 'id', parameterValues: '', returnType: 'Pedido', flowReference: '',
};
const note = (anchorKind: SequenceNote['anchorKind'], anchorId?: string): SequenceNote => ({
  id: `note-${anchorKind}`, text: 'Nota vinculada', x: 150, y: 300, width: 180, height: 90,
  color: 'green', anchorKind, anchorId,
});

describe('sequence clipboard references', () => {
  it('anchors a copied note to the copied message and allocates fresh references on every paste', () => {
    const sourceNote = note('message', call.id);
    const first = cloneSequenceBlock([call], [sourceNote]);
    const second = cloneSequenceBlock([call], [sourceNote]);

    expect(first.items[0].id).not.toBe(call.id);
    expect(first.notes[0].anchorId).toBe(first.items[0].id);
    expect(first.notes[0]).toMatchObject({ text: sourceNote.text, x: 174, y: 324, color: 'green' });
    expect(first.notes[0].id).not.toBe(sourceNote.id);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(second.notes[0].anchorId).toBe(second.items[0].id);
    expect(sourceNote.anchorId).toBe(call.id);
  });

  it('remaps fragment notes and nested message notes along with internal return references', () => {
    const reply: SequenceMessage = { ...call, id: 'reply', type: 'return', sourceId: 'b', targetId: 'a', replyToMessageId: call.id };
    const inner: SequenceFragment = {
      id: 'inner', kind: 'fragment', operator: 'opt', name: 'Interior',
      operands: [{ id: 'inner-operand', guard: 'si', items: [call, reply] }],
    };
    const outer: SequenceFragment = {
      id: 'outer', kind: 'fragment', operator: 'loop', name: 'Exterior',
      operands: [{ id: 'outer-operand', guard: 'repetir', items: [inner] }],
    };
    const cloned = cloneSequenceBlock([outer], [note('fragment', inner.id), note('message', call.id)]);
    const clonedOuter = cloned.items[0] as SequenceFragment;
    const clonedInner = clonedOuter.operands[0].items[0] as SequenceFragment;
    const [clonedCall, clonedReply] = clonedInner.operands[0].items as SequenceMessage[];

    expect(cloned.notes[0].anchorId).toBe(clonedInner.id);
    expect(cloned.notes[1].anchorId).toBe(clonedCall.id);
    expect(clonedReply.replyToMessageId).toBe(clonedCall.id);
    expect(clonedInner.id).not.toBe(inner.id);
    expect(clonedOuter.operands[0].id).not.toBe(outer.operands[0].id);
    expect(outer.operands[0].items[0].id).toBe('inner');
  });

  it.each(['message', 'fragment', 'participant', 'free'] as const)('keeps external %s anchors when only the note is copied', (kind) => {
    const original = note(kind, kind === 'free' ? undefined : 'outside-block');
    const cloned = cloneSequenceBlock([], [original]);

    expect(cloned.notes[0].anchorKind).toBe(kind);
    expect(cloned.notes[0].anchorId).toBe(original.anchorId);
    expect(cloned.notes[0].id).not.toBe(original.id);
  });
});
