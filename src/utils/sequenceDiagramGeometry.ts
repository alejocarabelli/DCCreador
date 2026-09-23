import type {
  SequenceFragment,
  SequenceNote,
  SequenceParticipant,
  SequenceTimelineItem,
} from '../types/diagram';

export const SEQUENCE_MIN_PARTICIPANT_GAP = 180;

export type SequenceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SequenceDiagramBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type SequenceTextLayout = {
  lines: string[];
  width: number;
  height: number;
};

/**
 * Wrap text deterministically for SVG. Unlike the former renderer, this
 * never truncates by number of lines; long words are split only when they
 * cannot fit on the available line.
 */
export const wrapSequenceText = (text: string, maxCharacters: number): string[] => {
  const capacity = Math.max(1, Math.floor(maxCharacters));
  const lines: string[] = [];
  text.split('\n').forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean).flatMap((word) => {
      if (word.length <= capacity) return [word];
      return Array.from({ length: Math.ceil(word.length / capacity) }, (_, index) =>
        word.slice(index * capacity, (index + 1) * capacity));
    });
    if (words.length === 0) {
      lines.push('');
      return;
    }
    let line = '';
    words.forEach((word) => {
      const candidate = line.length === 0 ? word : `${line} ${word}`;
      if (candidate.length <= capacity || line.length === 0) {
        line = candidate;
        return;
      }
      lines.push(line);
      line = word;
    });
    lines.push(line);
  });
  return lines.length > 0 ? lines : [''];
};

export const measureSequenceText = (
  text: string,
  maxCharacters: number,
  characterWidth: number,
  lineHeight: number,
): SequenceTextLayout => {
  const lines = wrapSequenceText(text, maxCharacters);
  return {
    lines,
    width: Math.max(0, ...lines.map((line) => line.length * characterWidth)),
    height: Math.max(lineHeight, lines.length * lineHeight),
  };
};

export const getSequenceParticipantHeaderWidth = (
  participant: Pick<SequenceParticipant, 'kind' | 'name' | 'classifierName'>,
): number => {
  const name = participant.kind === 'actor'
    ? participant.name.trim() || 'Actor'
    : participant.name.trim() && participant.classifierName.trim()
      ? `${participant.name.trim()} : ${participant.classifierName.trim()}`
      : participant.classifierName.trim()
        ? `:${participant.classifierName.trim()}`
        : participant.name.trim() || ':Objeto';
  const maxWordLen = Math.max(0, ...name.split(/\s+/).filter(Boolean).map((word) => word.length));
  const capacity = Math.min(38, Math.max(26, maxWordLen));
  const measured = measureSequenceText(name, capacity, 6.3, 14);
  return Math.max(participant.kind === 'actor' ? 112 : 160, Math.ceil(measured.width + 28));
};

/**
 * Note typography, shared by the SVG body and the inline textarea so both wrap
 * the same words onto the same lines.
 */
export const SEQUENCE_NOTE_FONT_SIZE = 11;
export const SEQUENCE_NOTE_FONT_FAMILY = 'Inter, Arial, sans-serif';
export const SEQUENCE_NOTE_LINE_HEIGHT = 15;
/** Horizontal inset of the text; the textarea adds a 1px border on each side. */
export const SEQUENCE_NOTE_PADDING_X = 12;
export const SEQUENCE_NOTE_PADDING_TOP = 10;
export const SEQUENCE_NOTE_MIN_WIDTH = 120;
export const SEQUENCE_NOTE_MIN_HEIGHT = 70;
const SEQUENCE_NOTE_VERTICAL_CHROME = 34;

type TextMeasurer = (text: string) => number;
let noteMeasurer: TextMeasurer | null | undefined;

/** Real glyph widths when a 2D canvas exists; tests and SSR fall back to null. */
const getNoteMeasurer = (): TextMeasurer | null => {
  if (noteMeasurer !== undefined) return noteMeasurer;
  noteMeasurer = null;
  try {
    if (typeof OffscreenCanvas === 'undefined') return noteMeasurer;
    const context = new OffscreenCanvas(1, 1).getContext('2d');
    if (!context) return noteMeasurer;
    context.font = `${SEQUENCE_NOTE_FONT_SIZE}px ${SEQUENCE_NOTE_FONT_FAMILY}`;
    const cache = new Map<string, number>();
    noteMeasurer = (text) => {
      let width = cache.get(text);
      if (width === undefined) {
        width = context.measureText(text).width;
        if (cache.size > 4000) cache.clear();
        cache.set(text, width);
      }
      return width;
    };
  } catch {
    noteMeasurer = null;
  }
  return noteMeasurer;
};

/** Greedy pixel wrap that, like a textarea, only splits words that cannot fit a line. */
const wrapTextToWidth = (text: string, maxWidth: number, measure: TextMeasurer): string[] => {
  const lines: string[] = [];
  const splitWord = (word: string): string[] => {
    const parts: string[] = [];
    let part = '';
    Array.from(word).forEach((character) => {
      if (part.length > 0 && measure(part + character) > maxWidth) {
        parts.push(part);
        part = character;
      } else {
        part += character;
      }
    });
    if (part.length > 0) parts.push(part);
    return parts;
  };
  text.split('\n').forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean).flatMap((word) => (measure(word) <= maxWidth ? [word] : splitWord(word)));
    if (words.length === 0) {
      lines.push('');
      return;
    }
    let line = '';
    words.forEach((word) => {
      const candidate = line.length === 0 ? word : `${line} ${word}`;
      if (line.length === 0 || measure(candidate) <= maxWidth) {
        line = candidate;
        return;
      }
      lines.push(line);
      line = word;
    });
    lines.push(line);
  });
  return lines.length > 0 ? lines : [''];
};

export const wrapSequenceNoteText = (text: string, width: number): string[] => {
  const noteWidth = Math.max(SEQUENCE_NOTE_MIN_WIDTH, width);
  const measure = getNoteMeasurer();
  if (measure === null) {
    return wrapSequenceText(text, Math.max(12, Math.floor((noteWidth - SEQUENCE_NOTE_PADDING_X * 2) / 7)));
  }
  // Same content box as the textarea: padding on both sides plus its 1px borders.
  return wrapTextToWidth(text, noteWidth - SEQUENCE_NOTE_PADDING_X * 2 - 2, measure);
};

export const getSequenceNoteMinimumHeight = (note: Pick<SequenceNote, 'text' | 'width'>): number => {
  const lines = wrapSequenceNoteText(note.text || 'Nota', note.width);
  return Math.max(SEQUENCE_NOTE_MIN_HEIGHT, Math.ceil(lines.length * SEQUENCE_NOTE_LINE_HEIGHT + SEQUENCE_NOTE_VERTICAL_CHROME));
};

/**
 * `note.height` is the height the user chose; the rendered box only grows past
 * it while the text needs more room, and never writes that growth back.
 */
export const resolveSequenceNoteRect = (note: SequenceNote): SequenceRect => ({
  x: note.x,
  y: note.y,
  width: Math.max(SEQUENCE_NOTE_MIN_WIDTH, note.width),
  height: Math.max(note.height, getSequenceNoteMinimumHeight(note)),
});

export const calculateSequenceBounds = (
  rectangles: SequenceRect[],
  fallback: SequenceRect = { x: 0, y: 0, width: 1200, height: 900 },
): SequenceDiagramBounds => {
  const valid = rectangles.filter((rect) =>
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.width >= 0
    && rect.height >= 0);
  const source = valid.length > 0 ? valid : [fallback];
  const left = Math.min(...source.map((rect) => rect.x));
  const top = Math.min(...source.map((rect) => rect.y));
  const right = Math.max(...source.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...source.map((rect) => rect.y + rect.height));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};

/**
 * Finds the closest legal center, considering the union of every forbidden
 * interval instead of pushing the value against one participant at a time.
 * This keeps the requested 180px gap even after large drags or crossings.
 */
export const resolveSequenceParticipantX = (
  participants: SequenceParticipant[],
  participantId: string,
  requestedX: number,
  minimumX = 90,
  gap = SEQUENCE_MIN_PARTICIPANT_GAP,
): number => {
  const desired = Math.max(minimumX, Math.round(requestedX));
  const moving = participants.find((participant) => participant.id === participantId);
  const movingWidth = moving === undefined ? 160 : getSequenceParticipantHeaderWidth(moving);
  const intervals = participants
    .filter((participant) => participant.id !== participantId)
    .map((participant) => {
      const requiredGap = (movingWidth + getSequenceParticipantHeaderWidth(participant)) / 2 + (gap - 160);
      return { left: participant.x - requiredGap, right: participant.x + requiredGap };
    })
    .sort((left, right) => left.left - right.left)
    .reduce<Array<{ left: number; right: number }>>((merged, interval) => {
      const last = merged.at(-1);
      if (last === undefined || interval.left > last.right) {
        merged.push({ ...interval });
      } else {
        last.right = Math.max(last.right, interval.right);
      }
      return merged;
    }, []);
  const isLegal = (candidate: number): boolean => candidate >= minimumX
    && participants.every((participant) => participant.id === participantId
      || Math.abs(candidate - participant.x)
        >= (movingWidth + getSequenceParticipantHeaderWidth(participant)) / 2 + (gap - 160));
  if (isLegal(desired)) return desired;

  const candidates = [minimumX, ...intervals.flatMap((interval) => [interval.left, interval.right])]
    .filter(isLegal);
  if (candidates.length === 0) {
    const rightmost = Math.max(minimumX, ...participants
      .filter((participant) => participant.id !== participantId)
      .map((participant) => participant.x
        + (movingWidth + getSequenceParticipantHeaderWidth(participant)) / 2 + (gap - 160)));
    return Math.round(rightmost);
  }
  return Math.round(candidates.reduce((closest, candidate) =>
    Math.abs(candidate - desired) < Math.abs(closest - desired) ? candidate : closest));
};

/**
 * Reorders one participant by one horizontal slot without placing the pair
 * on top of each other. The pair keeps its previous separation when that is
 * already safe; only a too-small separation is expanded to the measured
 * header widths. Outer participants stay in place whenever the available
 * interval permits it.
 */
export const reorderSequenceParticipants = (
  participants: SequenceParticipant[],
  participantId: string,
  direction: -1 | 1,
  minimumX = 90,
): SequenceParticipant[] | null => {
  const sorted = [...participants].sort((left, right) => left.x - right.x || left.id.localeCompare(right.id));
  const index = sorted.findIndex((participant) => participant.id === participantId);
  if (index < 0) return null;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= sorted.length) return null;

  const current = sorted[index];
  const neighbor = sorted[targetIndex];
  const pairStart = Math.min(index, targetIndex);
  const pairEnd = Math.max(index, targetIndex);
  const pairLeft = direction < 0 ? current : neighbor;
  const pairRight = direction < 0 ? neighbor : current;
  const requiredGap = (getSequenceParticipantHeaderWidth(current) + getSequenceParticipantHeaderWidth(neighbor)) / 2 + 20;
  const pairDistance = Math.max(requiredGap, Math.abs(current.x - neighbor.x));
  const pairCenter = (current.x + neighbor.x) / 2;
  const initialLeftX = pairCenter - pairDistance / 2;
  const initialRightX = pairCenter + pairDistance / 2;
  const outerLeft = sorted[pairStart - 1];
  const outerRight = sorted[pairEnd + 1];
  const lowerBounds = [minimumX - initialLeftX];
  const upperBounds = [Number.POSITIVE_INFINITY];
  if (outerLeft) {
    lowerBounds.push(
      outerLeft.x
      + (getSequenceParticipantHeaderWidth(outerLeft) + getSequenceParticipantHeaderWidth(pairLeft)) / 2
      + 20
      - initialLeftX,
    );
  }
  if (outerRight) {
    upperBounds.push(
      outerRight.x
      - (getSequenceParticipantHeaderWidth(outerRight) + getSequenceParticipantHeaderWidth(pairRight)) / 2
      - 20
      - initialRightX,
    );
  }
  const lower = Math.max(...lowerBounds);
  const upper = Math.min(...upperBounds);
  const shift = lower <= upper
    ? Math.min(Math.max(0, lower), upper)
    : Math.abs(lower) <= Math.abs(upper) ? lower : upper;
  const leftX = Math.round(initialLeftX + shift);
  const rightX = Math.round(initialRightX + shift);
  return participants.map((participant) => {
    if (participant.id === pairLeft.id) return { ...participant, x: leftX };
    if (participant.id === pairRight.id) return { ...participant, x: rightX };
    return participant;
  }).sort((left, right) => left.x - right.x || left.id.localeCompare(right.id));
};

export type SequenceFragmentGeometry = Pick<SequenceFragment, 'x' | 'y' | 'width' | 'height'>;

/**
 * Persists a fragment move and translates explicit nested coordinates by the
 * same delta. Implicit descendants keep their automatic placement and follow
 * the parent through the layout tree.
 */
export const moveSequenceFragmentGeometry = (
  items: SequenceTimelineItem[],
  fragmentId: string,
  nextGeometry: SequenceFragmentGeometry,
  delta: { x: number; y: number },
): SequenceTimelineItem[] => {
  const visit = (source: SequenceTimelineItem[], inheritedMove = false): SequenceTimelineItem[] => source.map((item) => {
    if (item.kind === 'message') return item;
    const isTarget = item.id === fragmentId;
    const followsTarget = inheritedMove || isTarget;
    const translated = inheritedMove && !isTarget
      ? {
          ...item,
          ...(item.x !== undefined ? { x: item.x + delta.x } : {}),
          ...(item.y !== undefined ? { y: item.y + delta.y } : {}),
        }
      : item;
    const updated = isTarget ? { ...translated, ...nextGeometry } : translated;
    return {
      ...updated,
      operands: updated.operands.map((operand) => ({
        ...operand,
        items: visit(operand.items, followsTarget),
      })),
    };
  });
  return visit(items);
};
