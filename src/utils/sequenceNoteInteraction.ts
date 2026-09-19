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
