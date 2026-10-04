import { describe, expect, it } from 'vitest';
import {
  analyzeSequenceDiagramSemantics,
  collectSequenceReviewProblems,
  createEmptySequenceDiagramContent,
  createSequenceFragment,
  createSequenceMessage,
  normalizeSequenceDiagramContent,
} from './sequenceDiagram';
import { wrapSequenceItems } from './sequenceDiagramWrapping';

const base = () => ({
  ...createEmptySequenceDiagramContent(),
  participants: [
    { id: 'a', kind: 'object' as const, name: '', classifierName: 'A', x: 120 },
    { id: 'b', kind: 'object' as const, name: '', classifierName: 'B', x: 360 },
  ],
});

describe('collectSequenceReviewProblems', () => {
  it('reports nameless calls and empty fragments as warnings', () => {
    const nameless = { ...createSequenceMessage('synchronous', 'a', 'b'), id: 'sin-nombre' };
    const empty = { ...createSequenceFragment('opt'), id: 'vacio' };
    const content = normalizeSequenceDiagramContent({ ...base(), items: [nameless, empty] });
    const problems = collectSequenceReviewProblems(content, analyzeSequenceDiagramSemantics(content).problems);
    expect(problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unnamed-message', messageId: 'sin-nombre', severity: 'warning' }),
      expect.objectContaining({ code: 'incomplete-fragment', fragmentId: 'vacio', severity: 'warning' }),
    ]));
  });

  it('says nothing about a complete diagram', () => {
    const call = { ...createSequenceMessage('synchronous', 'a', 'b'), name: 'buscar' };
    const content = normalizeSequenceDiagramContent({ ...base(), items: [call] });
    expect(collectSequenceReviewProblems(content, analyzeSequenceDiagramSemantics(content).problems)).toEqual([]);
  });

  it('wraps a selection in par with two branches, so it needs no repair', () => {
    const call = { ...createSequenceMessage('synchronous', 'a', 'b'), name: 'buscar' };
    const wrapped = wrapSequenceItems([call], [call.id], 'par');
    expect(wrapped?.createdFragment.operands).toHaveLength(2);
    expect(wrapped?.createdFragment.name).toBe('');
  });
});
