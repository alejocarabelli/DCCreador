import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SequenceReviewPanel } from './SequenceReviewPanel';
import type { SequenceDiagramProblem } from '../types/diagram';

describe('SequenceReviewPanel', () => {
  it('renders empty state when there are no problems', () => {
    const html = renderToString(
      <SequenceReviewPanel
        problems={[]}
        onSelectProblemTarget={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('Diagrama válido');
    expect(html).toContain('0 errores');
    expect(html).toContain('0 advertencias');
  });

  it('renders error and warning sections with counts and messages', () => {
    const problems: SequenceDiagramProblem[] = [
      {
        id: 'p1',
        code: 'message-before-create',
        severity: 'error',
        message: 'El mensaje usa un participante antes de su create().',
        messageId: 'msg-1',
      },
      {
        id: 'p2',
        code: 'unlinked-interaction-reference',
        severity: 'warning',
        message: 'El fragmento ref no tiene interacción asignada.',
        fragmentId: 'frag-1',
      },
    ];

    const html = renderToString(
      <SequenceReviewPanel
        problems={problems}
        onSelectProblemTarget={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('1 error');
    expect(html).toContain('1 advertencia');
    expect(html).toContain('message-before-create');
    expect(html).toContain('unlinked-interaction-reference');
    expect(html).toContain('Enfocar elemento');
  });
});
