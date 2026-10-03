import type { SequenceLayout } from './sequenceDiagramLayout';
import type { SequenceNote } from '../types/diagram';

export type SequenceNotePointer = {
  clientX: number;
  clientY: number;
  scrollLeft?: number;
  scrollTop?: number;
};

export type SequenceNoteDragStart = SequenceNotePointer & {
  noteX: number;
  noteY: number;
};

/**
 * Resolve a note position in canvas coordinates.  Pointer coordinates are
 * viewport coordinates, so scroll movement must be included before converting
 * through the current zoom.  Keeping this calculation in one place prevents
 * the note from jumping when the canvas is scrolled during a drag.
 */
export const resolveSequenceNoteDragPosition = (
  note: Pick<SequenceNote, 'x' | 'y'>,
  start: SequenceNotePointer,
  current: SequenceNotePointer,
  zoom: number,
): { x: number; y: number } => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const scrollDeltaX = (current.scrollLeft ?? 0) - (start.scrollLeft ?? 0);
  const scrollDeltaY = (current.scrollTop ?? 0) - (start.scrollTop ?? 0);
  return {
    x: Math.max(0, note.x + (current.clientX - start.clientX + scrollDeltaX) / safeZoom),
    y: Math.max(0, note.y + (current.clientY - start.clientY + scrollDeltaY) / safeZoom),
  };
};

/** Ignore the tiny pointer jitter produced by a click or a touch release. */
export const hasMeaningfulSequenceNoteDrag = (
  start: SequenceNotePointer,
  current: SequenceNotePointer,
  threshold = 2,
): boolean => Math.hypot(current.clientX - start.clientX, current.clientY - start.clientY) >= threshold;

/** Place a new note beside its anchor, or in the centre of the visible canvas. */
export const resolveNewSequenceNotePosition = (
  layout: SequenceLayout,
  anchor: Pick<SequenceNote, 'anchorKind' | 'anchorId'>,
  viewport: { left: number; top: number; width: number; height: number; zoom: number },
  size = { width: 230, height: 110 },
): { x: number; y: number } => {
  const gap = 24;
  let point: { x: number; y: number } | undefined;
  const id = anchor.anchorId;
  if (id && anchor.anchorKind === 'message') {
    const message = layout.orderedMessages.find((candidate) => candidate.id === id);
    const box = layout.messageLayouts.get(id);
    if (message && box) {
      const sourceX = layout.participantX.get(message.sourceId) ?? 0;
      const targetX = layout.participantX.get(message.targetId) ?? sourceX;
      const arrowRight = Math.max(sourceX, targetX) + (message.sourceId === message.targetId ? 52 : 0);
      point = { x: Math.max(arrowRight, box.labelCenterX + box.labelWidth / 2) + gap, y: box.y };
    }
  } else if (id && anchor.anchorKind === 'fragment') {
    const box = layout.fragmentLayouts.get(id);
    if (box) point = { x: box.x + box.width + gap, y: box.y + box.headerHeight };
  } else if (id && anchor.anchorKind === 'participant') {
    const x = layout.participantX.get(id);
    const box = layout.participantLayouts.get(id);
    if (x !== undefined) point = {
      x: x + (box?.headerWidth ?? 118) / 2 + gap,
      y: layout.participantStartY.get(id) ?? layout.timelineStart,
    };
  }
  const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
  return {
    x: Math.max(0, point?.x ?? (viewport.left + viewport.width / 2) / zoom - size.width / 2),
    y: Math.max(0, point?.y ?? (viewport.top + viewport.height / 2) / zoom - size.height / 2),
  };
};
