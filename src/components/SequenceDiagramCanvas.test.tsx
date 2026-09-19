import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { themes } from '../theme/themes';
import { createEmptySequenceDiagramContent, normalizeSequenceDiagramContent } from '../utils/sequenceDiagram';
import { buildSequenceLayout } from '../utils/sequenceDiagramLayout';
import { SequenceDiagramCanvas } from './SequenceDiagramCanvas';

const content = normalizeSequenceDiagramContent({
  ...createEmptySequenceDiagramContent(),
  participants: [
    { id: 'p1', kind: 'object', name: 'A', classifierName: 'ClaseA', x: 180 },
    { id: 'p2', kind: 'object', name: 'B', classifierName: 'ClaseB', x: 460 },
  ],
  notes: [{ id: 'n1', text: 'Nota de prueba', x: 260, y: 220, width: 220, height: 90, anchorKind: 'free' }],
});

const props = {
  content,
  layout: buildSequenceLayout(content),
  selected: { kind: 'note' as const, id: 'n1' },
  theme: themes[0],
  onSelect: vi.fn(),
  onParticipantPointerDown: vi.fn(),
  onNotePointerDown: vi.fn(),
  onNoteResizePointerDown: vi.fn(),
};

describe('SequenceDiagramCanvas notes', () => {
  it('does not draw a connector to the origin for a missing participant anchor', () => {
    const anchoredContent = {
      ...content,
      notes: [{ ...content.notes[0], anchorKind: 'participant' as const, anchorId: 'missing' }],
    };
    const html = renderToString(
      <SequenceDiagramCanvas {...props} content={anchoredContent} layout={buildSequenceLayout(anchoredContent)} />,
    );

    expect(html).not.toContain('<circle cx="0"');
    expect(html).not.toContain('<line x1="0"');
  });

  it('renders one note object with discreet resize controls when selected', () => {
    const html = renderToString(<SequenceDiagramCanvas {...props} />);

    expect((html.match(/class="sequence-note/g) ?? [])).toHaveLength(1);
    expect((html.match(/data-export-control="true"/g) ?? []).length).toBeGreaterThan(0);
    expect((html.match(/filter="url\(#sequence-note-shadow\)"/g) ?? [])).toHaveLength(1);
  });

  it('switches the selected note to the inline editor without drawing a second body', () => {
    const html = renderToString(<SequenceDiagramCanvas {...props} editingNoteId="n1" />);

    expect((html.match(/class="sequence-note/g) ?? [])).toHaveLength(1);
    expect(html).toContain('data-editing="true"');
    expect(html).not.toContain('filter="url(#sequence-note-shadow)"');
    expect(html).not.toContain('Doble clic para escribir');
    expect(html).not.toContain('cursor="nwse-resize"');
  });

  it('shows resize controls only for the primary fragment in a block selection', () => {
    const fragments = ['f1', 'f2'].map((id) => ({
      id,
      kind: 'fragment' as const,
      operator: 'opt' as const,
      name: id,
      operands: [{ id: `${id}-operand`, guard: '', items: [] }],
    }));
    const fragmentContent = { ...content, items: fragments, notes: [] };
    const html = renderToString(
      <SequenceDiagramCanvas
        {...props}
        content={fragmentContent}
        layout={buildSequenceLayout(fragmentContent)}
        selected={{ kind: 'fragment', id: 'f1' }}
        selectedTimelineIds={['f1', 'f2']}
      />,
    );

    expect((html.match(/class="sequence-fragment-resize-controls"/g) ?? [])).toHaveLength(1);
  });
});
