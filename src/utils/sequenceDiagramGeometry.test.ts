import { describe, expect, it } from 'vitest';
import type { SequenceParticipant } from '../types/diagram';
import { getSequenceParticipantHeaderWidth, resolveSequenceParticipantDragReorder, SEQUENCE_MIN_PARTICIPANT_GAP } from './sequenceDiagramGeometry';

const participant = (id: string, x: number, name = id): SequenceParticipant => ({
  id, x, name, kind: 'object', classifierName: '',
});
const participants = [participant('a', 90), participant('b', 310), participant('c', 530)];

describe('resolveSequenceParticipantDragReorder', () => {
  it('moves to the end while reusing the original slots', () => {
    expect(resolveSequenceParticipantDragReorder(participants, 'a', 600)).toEqual({
      order: ['b', 'c', 'a'], positions: { b: 90, c: 310, a: 530 },
    });
    expect(participants.map((item) => item.x)).toEqual([90, 310, 530]);
  });

  it('moves to the beginning and never places a participant below 90', () => {
    expect(resolveSequenceParticipantDragReorder(participants, 'c', -100)).toEqual({
      order: ['c', 'a', 'b'], positions: { c: 90, a: 310, b: 530 },
    });
  });

  it('keeps the original order and slots when no neighbor is crossed', () => {
    expect(resolveSequenceParticipantDragReorder(participants, 'b', 350)).toEqual({
      order: ['a', 'b', 'c'], positions: { a: 90, b: 310, c: 530 },
    });
  });

  it('expands only the necessary gaps for different header widths', () => {
    const source = [participant('a', 90), participant('b', 270), participant('wide', 450, 'W'.repeat(50)), participant('d', 1200)];
    const result = resolveSequenceParticipantDragReorder(source, 'wide', 0);
    expect(result.order).toEqual(['wide', 'a', 'b', 'd']);
    expect(result.positions.wide).toBe(90);
    result.order.slice(1).forEach((id, index) => {
      const previousId = result.order[index];
      const left = source.find((item) => item.id === previousId)!;
      const right = source.find((item) => item.id === id)!;
      const required = (getSequenceParticipantHeaderWidth(left) + getSequenceParticipantHeaderWidth(right)) / 2 + SEQUENCE_MIN_PARTICIPANT_GAP - 160;
      expect(result.positions[id]).toBe(Math.max(source[index + 1].x, Math.ceil(result.positions[previousId] + required)));
    });
    expect(result.positions.d).toBe(1200);
  });

  it('keeps a single participant in its original slot', () => {
    expect(resolveSequenceParticipantDragReorder([participant('a', 140)], 'a', 900)).toEqual({
      order: ['a'], positions: { a: 140 },
    });
  });

  it('accepts unsorted input and an empty diagram', () => {
    expect(resolveSequenceParticipantDragReorder([...participants].reverse(), 'a', 600).order).toEqual(['b', 'c', 'a']);
    expect(resolveSequenceParticipantDragReorder([], 'missing', 300)).toEqual({ order: [], positions: {} });
  });
});
