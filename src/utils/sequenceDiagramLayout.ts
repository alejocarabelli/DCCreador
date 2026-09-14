import type {
  SequenceDiagramContent,
  SequenceFragment,
  SequenceMessage,
  SequenceParticipant,
  SequenceTimelineItem,
} from '../types/diagram';
import { buildDerivedActivations, formatSequenceMessageLabel } from './sequenceDiagram';

export const SEQUENCE_HEADER_Y = 34;
export const SEQUENCE_HEADER_HEIGHT = 58;
export const SEQUENCE_TIMELINE_START = 134;
export const SEQUENCE_PARTICIPANT_GAP = 230;
export const SEQUENCE_MARGIN_X = 110;
export const SEQUENCE_ROW_HEIGHT = 58;

export type SequenceMessageLayout = {
  id: string;
  y: number;
  height: number;
  depth: number;
  parentFragmentId?: string;
  operandId?: string;
};

export type SequenceOperandLayout = {
  id: string;
  guard: string;
  top: number;
  bottom: number;
};

export type SequenceFragmentLayout = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  operands: SequenceOperandLayout[];
};

export type SequenceActivationLayout = {
  id: string;
  participantId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
};

export type SequenceLayout = {
  width: number;
  height: number;
  participantX: Map<string, number>;
  messageLayouts: Map<string, SequenceMessageLayout>;
  fragmentLayouts: Map<string, SequenceFragmentLayout>;
  activationLayouts: SequenceActivationLayout[];
  orderedMessages: SequenceMessage[];
  participantStartY: Map<string, number>;
  participantEndY: Map<string, number>;
};

const estimateMessageHeight = (message: SequenceMessage, label: string, span: number): number => {
  if (message.type === 'return') return message.sourceId === message.targetId ? 84 : 42;
  const columns = Math.max(18, Math.floor(span / 7.6));
  const lines = label.split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / columns)), 0);
  return Math.max(SEQUENCE_ROW_HEIGHT, 2 * (lines * 14 + 24));
};

const participantPosition = (participant: SequenceParticipant, index: number): number =>
  Number.isFinite(participant.x) ? participant.x : SEQUENCE_MARGIN_X + index * SEQUENCE_PARTICIPANT_GAP;

export const buildSequenceLayout = (content: SequenceDiagramContent): SequenceLayout => {
  const participantX = new Map(content.participants.map((participant, index) => [
    participant.id,
    participantPosition(participant, index),
  ]));
  const messageLayouts = new Map<string, SequenceMessageLayout>();
  const fragmentLayouts = new Map<string, SequenceFragmentLayout>();
  const orderedMessages: SequenceMessage[] = [];
  let cursorY = SEQUENCE_TIMELINE_START;

  const layoutItems = (
    items: SequenceTimelineItem[],
    depth: number,
    parentFragmentId?: string,
    operandId?: string,
  ): void => {
    items.forEach((item) => {
      if (item.kind === 'message') {
        const label = formatSequenceMessageLabel(item);
        const span = Math.abs((participantX.get(item.sourceId) ?? 0) - (participantX.get(item.targetId) ?? 0)) - (item.type === 'create' ? 86 : 12);
        const height = estimateMessageHeight(item, label, span);
        const y = cursorY + height / 2;
        messageLayouts.set(item.id, { id: item.id, y, height, depth, parentFragmentId, operandId });
        orderedMessages.push(item);
        cursorY += height;
        return;
      }

      const isExplicitY = item.y !== undefined && Number.isFinite(item.y);
      const isExplicitH = item.height !== undefined && Number.isFinite(item.height);

      const autoFragmentTop = cursorY;
      cursorY += 39;
      const operandLayouts: SequenceOperandLayout[] = [];
      item.operands.forEach((operand) => {
        const operandTop = cursorY;
        cursorY += 28;
        layoutItems(operand.items, depth + 1, item.id, operand.id);
        if (operand.items.length === 0) cursorY += 42;
        operandLayouts.push({ id: operand.id, guard: operand.guard, top: operandTop, bottom: cursorY });
      });
      cursorY += 20;

      const autoHeight = cursorY - autoFragmentTop;
      const finalHeight = isExplicitH ? item.height! : autoHeight;
      const finalY = isExplicitY ? item.y! : autoFragmentTop;

      const allParticipantXs = Array.from(participantX.values());
      const minDiagramX = allParticipantXs.length > 0 ? Math.min(...allParticipantXs) : SEQUENCE_MARGIN_X;
      const maxDiagramX = allParticipantXs.length > 0 ? Math.max(...allParticipantXs) : minDiagramX + 520;
      const startX = item.startParticipantId ? participantX.get(item.startParticipantId) : undefined;
      const endX = item.endParticipantId ? participantX.get(item.endParticipantId) : undefined;
      const minBound = Math.min(startX ?? minDiagramX, endX ?? (startX !== undefined ? startX + 230 : maxDiagramX));
      const maxBound = Math.max(endX ?? maxDiagramX, startX ?? (endX !== undefined ? endX - 230 : minDiagramX));
      const left = minBound - 86;
      const right = Math.max(left + 270, maxBound + 86);

      const defaultLeft = left + depth * 8;
      const defaultWidth = Math.max(270, right - left - depth * 16);
      const finalX = item.x !== undefined && Number.isFinite(item.x) ? item.x : defaultLeft;
      const finalWidth = item.width !== undefined && Number.isFinite(item.width) ? item.width : defaultWidth;

      const effectiveOperandLayouts: SequenceOperandLayout[] = (isExplicitY || isExplicitH) && item.operands.length > 0
        ? (() => {
            const headerOffset = 26;
            const availableH = Math.max(30, finalHeight - headerOffset);
            const opH = availableH / item.operands.length;
            return item.operands.map((operand, opIdx) => ({
              id: operand.id,
              guard: operand.guard,
              top: finalY + headerOffset + opIdx * opH,
              bottom: finalY + headerOffset + (opIdx + 1) * opH,
            }));
          })()
        : operandLayouts;

      fragmentLayouts.set(item.id, {
        id: item.id,
        x: finalX,
        y: finalY,
        width: finalWidth,
        height: finalHeight,
        depth,
        operands: effectiveOperandLayouts,
      });
    });
  };

  layoutItems(content.items, 0);

  const messageY = new Map(Array.from(messageLayouts.values()).map((layout) => [layout.id, layout.y]));
  // `timelineBottom` is the end of the actual temporal content. Keep it
  // separate from the canvas height so open activations do not fill empty
  // scroll space added by the document size.
  const timelineBottom = cursorY;
  const allFragmentBottoms = Array.from(fragmentLayouts.values()).map((f) => f.y + f.height);
  const bottom = Math.max(cursorY + 90, content.canvas.height, ...allFragmentBottoms, 900);
  const participantStartY = new Map<string, number>();
  const participantEndY = new Map<string, number>();
  content.participants.forEach((participant) => {
    const createdAt = participant.createdByMessageId ? messageY.get(participant.createdByMessageId) : undefined;
    const destroyedAt = participant.destroyedByMessageId ? messageY.get(participant.destroyedByMessageId) : undefined;
    participantStartY.set(participant.id, createdAt === undefined
      ? SEQUENCE_HEADER_Y + SEQUENCE_HEADER_HEIGHT
      : createdAt + SEQUENCE_HEADER_HEIGHT / 2);
    participantEndY.set(participant.id, destroyedAt ?? bottom - 46);
  });

  const activations = buildDerivedActivations(content);
  const activationLayouts = activations.flatMap((activation): SequenceActivationLayout[] => {
    const x = participantX.get(activation.participantId);
    const startY = messageY.get(activation.startMessageId);
    if (x === undefined || startY === undefined) return [];
    const endY = activation.endMessageId === undefined
      ? timelineBottom
      : messageY.get(activation.endMessageId) ?? timelineBottom;
    return [{
      id: activation.id,
      participantId: activation.participantId,
      x: x + activation.level * 7 - 6,
      y: startY - 3,
      width: 12,
      height: Math.max(18, endY - startY + 6),
      level: activation.level,
    }];
  });

  const maxParticipantX = Math.max(SEQUENCE_MARGIN_X, ...Array.from(participantX.values()));
  const maxNoteX = Math.max(0, ...content.notes.map((note) => note.x + note.width));
  const maxNoteY = Math.max(0, ...content.notes.map((note) => note.y + note.height));
  const maxFragmentX = Math.max(0, ...Array.from(fragmentLayouts.values()).map((f) => f.x + f.width));
  const maxFragmentY = Math.max(0, ...Array.from(fragmentLayouts.values()).map((f) => f.y + f.height));

  return {
    width: Math.max(content.canvas.width, maxParticipantX + SEQUENCE_MARGIN_X, maxNoteX + 80, maxFragmentX + 80, 1200),
    height: Math.max(bottom, maxNoteY + 80, maxFragmentY + 80),
    participantX,
    messageLayouts,
    fragmentLayouts,
    activationLayouts,
    orderedMessages,
    participantStartY,
    participantEndY,
  };
};

export type SequenceMessageEndpoints = {
  sourceX: number;
  targetX: number;
  y: number;
};

/** Return arrow endpoints, touching active bars when they are present. */
export const getSequenceMessageEndpoints = (
  content: SequenceDiagramContent,
  layout: SequenceLayout,
  message: SequenceMessage,
): SequenceMessageEndpoints | undefined => {
  const messageLayout = layout.messageLayouts.get(message.id);
  const sourceCenter = layout.participantX.get(message.sourceId)
    ?? content.participants.find((participant) => participant.id === message.sourceId)?.x;
  const targetCenter = layout.participantX.get(message.targetId)
    ?? content.participants.find((participant) => participant.id === message.targetId)?.x;
  if (messageLayout === undefined || sourceCenter === undefined || targetCenter === undefined) return undefined;
  const barAt = (participantId: string) => layout.activationLayouts
    .filter((activation) => activation.participantId === participantId
      && messageLayout.y >= activation.y && messageLayout.y <= activation.y + activation.height)
    .sort((a, b) => b.level - a.level)[0];
  const sourceBar = barAt(message.sourceId);
  const targetBar = barAt(message.targetId);
  const direction = targetCenter >= sourceCenter ? 1 : -1;
  const showBars = content.showActivations;
  const edge = (center: number, bar: SequenceActivationLayout | undefined, side: number): number => {
    if (bar === undefined) return center;
    return side > 0 ? bar.x + bar.width : bar.x;
  };
  if (message.sourceId === message.targetId) {
    if (!showBars) return { sourceX: sourceCenter, targetX: targetCenter, y: messageLayout.y };
    // The penultimate bar is the caller and the innermost bar is the recursive callee.
    const bars = layout.activationLayouts
      .filter((activation) => activation.participantId === message.sourceId
        && messageLayout.y >= activation.y && messageLayout.y <= activation.y + activation.height)
      .sort((a, b) => a.level - b.level);
    return {
      sourceX: edge(sourceCenter, message.type === 'return' ? bars.at(-1) : bars.at(-2) ?? bars[0], direction),
      targetX: edge(targetCenter, message.type === 'return' ? bars.at(-2) ?? bars[0] : bars.at(-1), direction),
      y: messageLayout.y,
    };
  }
  if (!showBars) return { sourceX: sourceCenter, targetX: message.type === 'create' ? targetCenter - direction * 80 : targetCenter, y: messageLayout.y };
  return {
    sourceX: edge(sourceCenter, sourceBar, direction),
    targetX: message.type === 'create'
      ? targetCenter - direction * 80
      : edge(targetCenter, targetBar, -direction),
    y: messageLayout.y,
  };
};

export const findContainingFragment = (
  items: SequenceTimelineItem[],
  itemId: string,
): SequenceFragment | undefined => {
  for (const item of items) {
    if (item.kind !== 'fragment') continue;
    if (item.operands.some((operand) => operand.items.some((child) => child.id === itemId))) return item;
    for (const operand of item.operands) {
      const nested = findContainingFragment(operand.items, itemId);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
};
