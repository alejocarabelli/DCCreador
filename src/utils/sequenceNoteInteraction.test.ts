import { buildSequenceLayout } from './sequenceDiagramLayout';
import { createEmptySequenceDiagramContent, createSequenceMessage, createSequenceFragment } from './sequenceDiagram';
import { describe, expect, it } from 'vitest';
import { hasMeaningfulSequenceNoteDrag, resolveNewSequenceNotePosition, resolveSequenceNoteDragPosition } from './sequenceNoteInteraction';

describe('sequence note pointer interaction', () => {
  it('keeps canvas coordinates stable across zoom and horizontal/vertical scroll', () => {
    expect(resolveSequenceNoteDragPosition(
      { x: 120, y: 80 },
      { clientX: 100, clientY: 200, scrollLeft: 40, scrollTop: 20 },
      { clientX: 130, clientY: 230, scrollLeft: 70, scrollTop: 50 },
      0.5,
    )).toEqual({ x: 240, y: 200 });

    expect(resolveSequenceNoteDragPosition(
      { x: 120, y: 80 },
      { clientX: 100, clientY: 200, scrollLeft: 40, scrollTop: 20 },
      { clientX: 130, clientY: 225, scrollLeft: 25, scrollTop: 10 },
      1.5,
    )).toEqual({ x: 130, y: 90 });
  });

  it('does not turn a click into a drag, but accepts a real short movement', () => {
    const start = { clientX: 100, clientY: 100 };
    expect(hasMeaningfulSequenceNoteDrag(start, { clientX: 101, clientY: 101 })).toBe(false);
    expect(hasMeaningfulSequenceNoteDrag(start, { clientX: 102, clientY: 102 })).toBe(true);
  });
});

describe('new sequence note position', () => {
  const content = createEmptySequenceDiagramContent();
  content.participants = [
    { id: 'left', kind: 'object', name: 'Cliente', classifierName: '', x: 120 },
    { id: 'right', kind: 'object', name: 'Servicio', classifierName: '', x: 420 },
  ];
  const message = { ...createSequenceMessage('synchronous', 'right', 'left'), id: 'message' };
  const self = { ...createSequenceMessage('synchronous', 'right', 'right'), id: 'self' };
  const fragment = { ...createSequenceFragment('opt'), id: 'fragment' };
  content.items = [message, self, fragment];
  const layout = buildSequenceLayout(content);
  const viewport = { left: 300, top: 180, width: 800, height: 600, zoom: 2 };

  it('centres the whole note in the visible area at the current scroll and zoom', () => {
    expect(resolveNewSequenceNotePosition(layout, { anchorKind: 'free' }, viewport))
      .toEqual({ x: 235, y: 185 });
    expect(resolveNewSequenceNotePosition(layout, { anchorKind: 'free' }, { ...viewport, zoom: 0.5 }))
      .toEqual({ x: 1285, y: 905 });
  });

  it('places a message note beyond the arrow and label, including right-to-left and self messages', () => {
    for (const id of ['message', 'self']) {
      const box = layout.messageLayouts.get(id)!;
      const position = resolveNewSequenceNotePosition(layout, { anchorKind: 'message', anchorId: id }, viewport);
      expect(position).toEqual({ x: Math.max(id === 'self' ? 472 : 420, box.labelCenterX + box.labelWidth / 2) + 24, y: box.y });
    }
  });

  it('places a fragment note beyond its right edge beside the header', () => {
    const box = layout.fragmentLayouts.get('fragment')!;
    expect(resolveNewSequenceNotePosition(layout, { anchorKind: 'fragment', anchorId: 'fragment' }, viewport))
      .toEqual({ x: box.x + box.width + 24, y: box.y + box.headerHeight });
  });

  it('places a participant note beyond the header at its lifeline start', () => {
    const box = layout.participantLayouts.get('right')!;
    expect(resolveNewSequenceNotePosition(layout, { anchorKind: 'participant', anchorId: 'right' }, viewport))
      .toEqual({ x: 420 + box.headerWidth / 2 + 24, y: layout.participantStartY.get('right') });
  });

  it('falls back to the viewport for missing anchors and prevents negative coordinates', () => {
    expect(resolveNewSequenceNotePosition(layout, { anchorKind: 'message', anchorId: 'missing' }, viewport))
      .toEqual({ x: 235, y: 185 });
    expect(resolveNewSequenceNotePosition(layout, { anchorKind: 'free' }, { left: 0, top: 0, width: 100, height: 50, zoom: 0 }))
      .toEqual({ x: 0, y: 0 });
  });
});
