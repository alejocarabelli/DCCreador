import { describe, expect, it } from 'vitest';
import { formatSequenceMessageChange } from './sequenceEditorFeedback';
import { createEmptySequenceDiagramContent, normalizeSequenceDiagramContent } from './sequenceDiagram';

describe('sequence editor feedback plurals', () => {
  it.each([
    [0, 'incorporado', '0 mensajes incorporados'],
    [1, 'incorporado', '1 mensaje incorporado'],
    [2, 'incorporado', '2 mensajes incorporados'],
    [0, 'liberado', '0 mensajes liberados'],
    [1, 'liberado', '1 mensaje liberado'],
    [2, 'liberado', '2 mensajes liberados'],
  ] as const)('formats %i messages %s', (count, change, expected) => {
    expect(formatSequenceMessageChange(count, change)).toBe(expected);
  });

  it.each([0, 1])('reports %i operands preserved by normalization', (count) => {
    const content = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      items: [{ id: 'fragment', kind: 'fragment', operator: 'alt', name: '', operands: Array.from({ length: count }, (_, index) => ({ id: `operand-${index}`, guard: '', items: [] })) }],
    });
    const problem = content.problems.find((candidate) => candidate.id.endsWith(':operand-count'));
    expect(problem?.message).toBe(`El fragmento alt conserva ${count} ${count === 1 ? 'operando' : 'operandos'}; no se inventaron operandos de relleno.`);
  });
});
