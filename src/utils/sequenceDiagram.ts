import type {
  SequenceActivation,
  SequenceDiagramContent,
  SequenceFragment,
  SequenceFragmentOperand,
  SequenceFragmentOperator,
  SequenceMessage,
  SequenceMessageType,
  SequenceNote,
  SequenceNumberingMode,
  SequenceParticipant,
  SequenceParticipantKind,
  SequenceTimelineItem,
} from '../types/diagram';
import { createId } from './id';
import type { SequenceLayout } from './sequenceDiagramLayout';

const participantKinds: SequenceParticipantKind[] = ['actor', 'boundary', 'control', 'entity', 'object'];
const messageTypes: SequenceMessageType[] = ['synchronous', 'asynchronous', 'return', 'create', 'destroy'];
const fragmentOperators: SequenceFragmentOperator[] = ['alt', 'loop', 'opt', 'par', 'break', 'critical', 'ref'];
const numberingModes: SequenceNumberingMode[] = ['sequential', 'hierarchical', 'none'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asOptionalString = (value: unknown): string | undefined => {
  const normalized = asString(value).trim();
  return normalized.length > 0 ? normalized : undefined;
};
const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const createUniqueIdFactory = () => {
  const usedIds = new Set<string>();

  return (candidate: unknown): string => {
    const normalized = asString(candidate).trim();
    if (normalized.length > 0 && !usedIds.has(normalized)) {
      usedIds.add(normalized);
      return normalized;
    }

    let id = createId();
    while (usedIds.has(id)) {
      id = createId();
    }
    usedIds.add(id);
    return id;
  };
};

export const createEmptySequenceDiagramContent = (): SequenceDiagramContent => ({
  version: 1,
  classDiagramArtifactId: undefined,
  flowArtifactId: undefined,
  numbering: 'sequential',
  showActivations: true,
  participants: [],
  items: [],
  activations: [],
  notes: [],
  canvas: { width: 2400, height: 1800 },
});

export const normalizeSequenceDiagramContent = (value: unknown): SequenceDiagramContent => {
  const content = isRecord(value) ? value : {};
  const uniqueParticipantId = createUniqueIdFactory();
  const participants: SequenceParticipant[] = Array.isArray(content.participants)
    ? content.participants.filter(isRecord).map((participant, index) => ({
        id: uniqueParticipantId(participant.id),
        kind: participantKinds.includes(participant.kind as SequenceParticipantKind)
          ? (participant.kind as SequenceParticipantKind)
          : 'object',
        name: asString(participant.name),
        classifierName: asString(participant.classifierName),
        classifierNodeId: asOptionalString(participant.classifierNodeId),
        x: clamp(asNumber(participant.x, 170 + index * 230), 90, 100_000),
        createdByMessageId: asOptionalString(participant.createdByMessageId),
        destroyedByMessageId: asOptionalString(participant.destroyedByMessageId),
      }))
    : [];
  const participantIds = new Set(participants.map((participant) => participant.id));
  const uniqueItemId = createUniqueIdFactory();
  const uniqueOperandId = createUniqueIdFactory();

  const normalizeMessage = (message: Record<string, unknown>): SequenceMessage | null => {
    const sourceId = asString(message.sourceId);
    const targetId = asString(message.targetId);
    if (!participantIds.has(sourceId) || !participantIds.has(targetId)) {
      return null;
    }

    const type = messageTypes.includes(message.type as SequenceMessageType)
      ? (message.type as SequenceMessageType)
      : 'synchronous';

    return {
      id: uniqueItemId(message.id),
      kind: 'message',
      type,
      sourceId,
      targetId,
      name: type === 'return' ? '' : asString(message.name),
      arguments: type === 'return' ? '' : asString(message.arguments),
      parameterValues: type === 'return' ? '' : asString(message.parameterValues),
      returnType: type === 'return' ? '' : asString(message.returnType),
      operationMethodId: asOptionalString(message.operationMethodId),
      replyToMessageId: asOptionalString(message.replyToMessageId),
      flowReference: asString(message.flowReference),
    };
  };

  const normalizeItems = (items: unknown): SequenceTimelineItem[] => {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.flatMap((item): SequenceTimelineItem[] => {
      if (!isRecord(item)) {
        return [];
      }

      if (item.kind === 'message') {
        const message = normalizeMessage(item);
        return message === null ? [] : [message];
      }

      if (item.kind !== 'fragment') {
        return [];
      }

      const operator = fragmentOperators.includes(item.operator as SequenceFragmentOperator)
        ? (item.operator as SequenceFragmentOperator)
        : 'alt';
      const rawOperands = Array.isArray(item.operands) ? item.operands : [];
      const operands: SequenceFragmentOperand[] = rawOperands.filter(isRecord).map((operand) => ({
        id: uniqueOperandId(operand.id),
        guard: asString(operand.guard),
        items: normalizeItems(operand.items),
      }));
      const minimumOperands = operator === 'alt' || operator === 'par' ? 2 : 1;
      while (operands.length < minimumOperands) {
        operands.push({ id: uniqueOperandId(undefined), guard: '', items: [] });
      }

      const rawX = (item as { x?: unknown }).x;
      const rawY = (item as { y?: unknown }).y;
      const rawWidth = (item as { width?: unknown }).width;
      const rawHeight = (item as { height?: unknown }).height;
      const x = typeof rawX === 'number' && Number.isFinite(rawX) ? rawX : undefined;
      const y = typeof rawY === 'number' && Number.isFinite(rawY) ? rawY : undefined;
      const width = typeof rawWidth === 'number' && Number.isFinite(rawWidth) ? Math.max(140, rawWidth) : undefined;
      const height = typeof rawHeight === 'number' && Number.isFinite(rawHeight) ? Math.max(60, rawHeight) : undefined;

      return [{
        id: uniqueItemId(item.id),
        kind: 'fragment',
        operator,
        name: asString(item.name),
        startParticipantId: participantIds.has(asString(item.startParticipantId))
          ? asString(item.startParticipantId)
          : undefined,
        endParticipantId: participantIds.has(asString(item.endParticipantId))
          ? asString(item.endParticipantId)
          : undefined,
        operands,
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {}),
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
      }];
    });
  };

  const items = normalizeItems(content.items);
  const messageIds = new Set(flattenSequenceItems(items)
    .filter((entry): entry is SequenceFlatEntry & { item: SequenceMessage } => entry.item.kind === 'message')
    .map((entry) => entry.item.id));
  const fragmentIds = new Set(flattenSequenceItems(items)
    .filter((entry): entry is SequenceFlatEntry & { item: SequenceFragment } => entry.item.kind === 'fragment')
    .map((entry) => entry.item.id));

  // Lifecycle markers are derived from the current timeline. This prevents
  // stale references after changing a message type, target, or deleting it.
  participants.forEach((participant) => {
    const created = flattenSequenceItems(items)
      .map((entry) => entry.item)
      .find((item): item is SequenceMessage => item.kind === 'message'
        && item.type === 'create' && item.targetId === participant.id);
    const destroyed = flattenSequenceItems(items)
      .map((entry) => entry.item)
      .find((item): item is SequenceMessage => item.kind === 'message'
        && item.type === 'destroy' && item.targetId === participant.id);
    if (created !== undefined) participant.createdByMessageId = created.id;
    else delete participant.createdByMessageId;
    if (destroyed !== undefined) participant.destroyedByMessageId = destroyed.id;
    else delete participant.destroyedByMessageId;
  });

  const uniqueActivationId = createUniqueIdFactory();
  const activations: SequenceActivation[] = Array.isArray(content.activations)
    ? content.activations.filter(isRecord).flatMap((activation): SequenceActivation[] => {
        const participantId = asString(activation.participantId);
        const startMessageId = asString(activation.startMessageId);
        const endMessageId = asOptionalString(activation.endMessageId);
        if (!participantIds.has(participantId) || !messageIds.has(startMessageId)) {
          return [];
        }
        return [{
          id: uniqueActivationId(activation.id),
          participantId,
          startMessageId,
          endMessageId: endMessageId !== undefined && messageIds.has(endMessageId) ? endMessageId : undefined,
          level: clamp(Math.round(asNumber(activation.level, 0)), 0, 12),
          manual: activation.manual === true,
        }];
      })
    : [];

  const uniqueNoteId = createUniqueIdFactory();
  const notes: SequenceNote[] = Array.isArray(content.notes)
    ? content.notes.filter(isRecord).map((note) => {
        const anchorKind = note.anchorKind === 'message' || note.anchorKind === 'fragment' || note.anchorKind === 'participant'
          ? note.anchorKind
          : 'free';
        const anchorId = asOptionalString(note.anchorId);
        const anchorExists = anchorKind === 'message'
          ? anchorId !== undefined && messageIds.has(anchorId)
          : anchorKind === 'fragment'
            ? anchorId !== undefined && fragmentIds.has(anchorId)
            : anchorKind === 'participant'
              ? anchorId !== undefined && participantIds.has(anchorId)
              : false;

        return {
          id: uniqueNoteId(note.id),
          text: asString(note.text),
          x: clamp(asNumber(note.x, 100), 0, 100_000),
          y: clamp(asNumber(note.y, 180), 0, 200_000),
          width: clamp(asNumber(note.width, 220), 120, 1200),
          height: clamp(asNumber(note.height, 110), 70, 1200),
          anchorKind: anchorExists ? anchorKind : 'free',
          anchorId: anchorExists ? anchorId : undefined,
        };
      })
    : [];

  const canvas = isRecord(content.canvas) ? content.canvas : {};

  return {
    version: 1,
    classDiagramArtifactId: asOptionalString(content.classDiagramArtifactId),
    flowArtifactId: asOptionalString(content.flowArtifactId),
    numbering: numberingModes.includes(content.numbering as SequenceNumberingMode)
      ? (content.numbering as SequenceNumberingMode)
      : 'sequential',
    showActivations: content.showActivations !== false,
    participants,
    items,
    activations,
    notes,
    canvas: {
      width: clamp(asNumber(canvas.width, 2400), 1200, 100_000),
      height: clamp(asNumber(canvas.height, 1800), 900, 200_000),
    },
  };
};

export type SequenceFlatEntry = {
  item: SequenceTimelineItem;
  depth: number;
  parentFragmentId?: string;
  operandId?: string;
  index: number;
};

/**
 * Describes the timeline slot selected by a canvas Y coordinate.
 * `relativeToId` can be passed to insertSequenceItem as `afterItemId`, while
 * `placement: 'before'` is handled with insertSequenceItemBefore. When there
 * is no relative item, `parentFragmentId` + `operandId` are directly
 * compatible with insertSequenceItem's operand options.
 */
export type SequenceInsertionTarget = {
  placement: 'before' | 'after' | 'end';
  relativeToId?: string;
  parentFragmentId?: string;
  operandId?: string;
};

type SequenceLayoutBounds = { top: number; bottom: number };

const layoutBounds = (layout: SequenceLayout, item: SequenceTimelineItem): SequenceLayoutBounds => {
  if (item.kind === 'message') {
    const message = layout.messageLayouts.get(item.id);
    if (message !== undefined) return { top: message.y - message.height / 2, bottom: message.y + message.height / 2 };
  } else {
    const fragment = layout.fragmentLayouts.get(item.id);
    if (fragment !== undefined) return { top: fragment.y, bottom: fragment.y + fragment.height };
  }
  return { top: Number.NEGATIVE_INFINITY, bottom: Number.POSITIVE_INFINITY };
};

type SequenceScope = {
  items: SequenceTimelineItem[];
  parentFragmentId?: string;
  operandId?: string;
  top: number;
  bottom: number;
};

const findOperandScope = (
  items: SequenceTimelineItem[],
  layout: SequenceLayout,
  y: number,
): SequenceScope | undefined => {
  let best: SequenceScope | undefined;
  items.forEach((item) => {
    if (item.kind !== 'fragment') return;
    const fragmentLayout = layout.fragmentLayouts.get(item.id);
    item.operands.forEach((operand) => {
      const operandLayout = fragmentLayout?.operands.find((candidate) => candidate.id === operand.id);
      if (operandLayout !== undefined && y >= operandLayout.top && y <= operandLayout.bottom) {
        const candidate: SequenceScope = {
          items: operand.items,
          parentFragmentId: item.id,
          operandId: operand.id,
          top: operandLayout.top,
          bottom: operandLayout.bottom,
        };
        if (best === undefined || candidate.bottom - candidate.top <= best.bottom - best.top) best = candidate;
      }
      const nested = findOperandScope(operand.items, layout, y);
      if (nested !== undefined && (best === undefined || nested.bottom - nested.top <= best.bottom - best.top)) best = nested;
    });
  });
  return best;
};

/** Resolve a canvas Y coordinate to the insertion slot in the visible timeline. */
export const resolveSequenceInsertionTarget = (
  items: SequenceTimelineItem[],
  layout: SequenceLayout,
  canvasY: number,
): SequenceInsertionTarget => {
  const y = Number.isFinite(canvasY) ? canvasY : 0;
  const scope = findOperandScope(items, layout, y);
  const scopeItems = scope?.items ?? items;
  const children = scopeItems.map((item) => ({ item, bounds: layoutBounds(layout, item) }));

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const center = child.bounds.top + (child.bounds.bottom - child.bounds.top) / 2;
    if (y < center) {
      return {
        placement: 'before',
        relativeToId: child.item.id,
        ...(scope?.parentFragmentId ? { parentFragmentId: scope.parentFragmentId } : {}),
        ...(scope?.operandId ? { operandId: scope.operandId } : {}),
      };
    }
    const next = children[index + 1];
    if (next === undefined || y < next.bounds.top + (next.bounds.bottom - next.bounds.top) / 2) {
      return {
        placement: 'after',
        relativeToId: child.item.id,
        ...(scope?.parentFragmentId ? { parentFragmentId: scope.parentFragmentId } : {}),
        ...(scope?.operandId ? { operandId: scope.operandId } : {}),
      };
    }
  }
  return {
    placement: 'end',
    ...(scope?.parentFragmentId ? { parentFragmentId: scope.parentFragmentId } : {}),
    ...(scope?.operandId ? { operandId: scope.operandId } : {}),
  };
};

/** Insert an item in the slot selected by a canvas Y coordinate. */
export const insertSequenceItemAtY = (
  items: SequenceTimelineItem[],
  item: SequenceTimelineItem,
  layout: SequenceLayout,
  canvasY: number,
): SequenceTimelineItem[] => {
  const target = resolveSequenceInsertionTarget(items, layout, canvasY);
  if (target.placement === 'before' && target.relativeToId !== undefined) {
    return insertSequenceItemBefore(items, item, target.relativeToId);
  }
  if (target.relativeToId !== undefined) {
    return insertSequenceItem(items, item, { afterItemId: target.relativeToId });
  }
  if (target.parentFragmentId !== undefined && target.operandId !== undefined) {
    return insertSequenceItem(items, item, {
      fragmentId: target.parentFragmentId,
      operandId: target.operandId,
    });
  }
  return insertSequenceItem(items, item);
};

export const flattenSequenceItems = (
  items: SequenceTimelineItem[],
  depth = 0,
  parentFragmentId?: string,
  operandId?: string,
): SequenceFlatEntry[] => items.flatMap((item, index) => {
  const entry: SequenceFlatEntry = { item, depth, parentFragmentId, operandId, index };
  if (item.kind === 'message') {
    return [entry];
  }
  return [
    entry,
    ...item.operands.flatMap((operand) =>
      flattenSequenceItems(operand.items, depth + 1, item.id, operand.id)),
  ];
});

export const findSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
): SequenceTimelineItem | null => {
  for (const item of items) {
    if (item.id === itemId) {
      return item;
    }
    if (item.kind === 'fragment') {
      for (const operand of item.operands) {
        const nested = findSequenceItem(operand.items, itemId);
        if (nested !== null) {
          return nested;
        }
      }
    }
  }
  return null;
};

export const updateSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
  updater: (item: SequenceTimelineItem) => SequenceTimelineItem,
): SequenceTimelineItem[] => items.map((item) => {
  if (item.id === itemId) {
    return updater(item);
  }
  if (item.kind === 'fragment') {
    return {
      ...item,
      operands: item.operands.map((operand) => ({
        ...operand,
        items: updateSequenceItem(operand.items, itemId, updater),
      })),
    };
  }
  return item;
});

export const removeSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
): { items: SequenceTimelineItem[]; removed: SequenceTimelineItem | null } => {
  let removed: SequenceTimelineItem | null = null;
  const nextItems: SequenceTimelineItem[] = [];

  for (const item of items) {
    if (item.id === itemId) {
      removed = item;
      continue;
    }
    if (item.kind === 'fragment') {
      const nextOperands = item.operands.map((operand) => {
        const result = removeSequenceItem(operand.items, itemId);
        removed ??= result.removed;
        return { ...operand, items: result.items };
      });
      nextItems.push({ ...item, operands: nextOperands });
    } else {
      nextItems.push(item);
    }
  }

  return { items: nextItems, removed };
};

const appendToOperand = (
  items: SequenceTimelineItem[],
  fragmentId: string,
  operandId: string,
  item: SequenceTimelineItem,
): { items: SequenceTimelineItem[]; inserted: boolean } => {
  let inserted = false;
  const nextItems = items.map((currentItem) => {
    if (currentItem.kind !== 'fragment') {
      return currentItem;
    }
    if (currentItem.id === fragmentId) {
      return {
        ...currentItem,
        operands: currentItem.operands.map((operand) => {
          if (operand.id !== operandId) {
            return operand;
          }
          inserted = true;
          return { ...operand, items: [...operand.items, item] };
        }),
      };
    }
    return {
      ...currentItem,
      operands: currentItem.operands.map((operand) => {
        const result = appendToOperand(operand.items, fragmentId, operandId, item);
        inserted ||= result.inserted;
        return { ...operand, items: result.items };
      }),
    };
  });
  return { items: nextItems, inserted };
};

export const insertSequenceItem = (
  items: SequenceTimelineItem[],
  item: SequenceTimelineItem,
  options?: { afterItemId?: string; fragmentId?: string; operandId?: string },
): SequenceTimelineItem[] => {
  if (options?.fragmentId !== undefined && options.operandId !== undefined) {
    const result = appendToOperand(items, options.fragmentId, options.operandId, item);
    if (result.inserted) {
      return result.items;
    }
  }

  if (options?.afterItemId === undefined) {
    return [...items, item];
  }

  let inserted = false;
  const insertAfter = (currentItems: SequenceTimelineItem[]): SequenceTimelineItem[] => {
    const nextItems: SequenceTimelineItem[] = [];
    currentItems.forEach((currentItem) => {
      nextItems.push(currentItem);
      if (currentItem.id === options.afterItemId) {
        nextItems.push(item);
        inserted = true;
      } else if (currentItem.kind === 'fragment') {
        nextItems[nextItems.length - 1] = {
          ...currentItem,
          operands: currentItem.operands.map((operand) => ({
            ...operand,
            items: insertAfter(operand.items),
          })),
        };
      }
    });
    return nextItems;
  };

  const nextItems = insertAfter(items);
  return inserted ? nextItems : [...items, item];
};

export const insertSequenceItemBefore = (
  items: SequenceTimelineItem[],
  item: SequenceTimelineItem,
  beforeItemId: string,
): SequenceTimelineItem[] => {
  let inserted = false;
  const insertBefore = (currentItems: SequenceTimelineItem[]): SequenceTimelineItem[] => {
    const nextItems: SequenceTimelineItem[] = [];
    currentItems.forEach((currentItem) => {
      if (currentItem.id === beforeItemId) {
        nextItems.push(item);
        inserted = true;
      }
      nextItems.push(currentItem.kind === 'fragment'
        ? {
            ...currentItem,
            operands: currentItem.operands.map((operand) => ({
              ...operand,
              items: insertBefore(operand.items),
            })),
          }
        : currentItem);
    });
    return nextItems;
  };
  const nextItems = insertBefore(items);
  return inserted ? nextItems : [...items, item];
};

export const moveSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
  direction: -1 | 1,
): SequenceTimelineItem[] => {
  const moveWithin = (currentItems: SequenceTimelineItem[]): SequenceTimelineItem[] => {
    const index = currentItems.findIndex((item) => item.id === itemId);
    if (index >= 0) {
      const target = index + direction;
      if (target < 0 || target >= currentItems.length) {
        return currentItems;
      }
      const next = [...currentItems];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    }
    return currentItems.map((item) => item.kind === 'fragment'
      ? {
          ...item,
          operands: item.operands.map((operand) => ({ ...operand, items: moveWithin(operand.items) })),
        }
      : item);
  };
  return moveWithin(items);
};

export const reparentSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
  destination?: { fragmentId: string; operandId: string },
): SequenceTimelineItem[] => {
  const result = removeSequenceItem(items, itemId);
  if (result.removed === null) {
    return items;
  }
  if (result.removed.kind === 'fragment' && destination !== undefined) {
    const descendants = new Set(flattenSequenceItems(result.removed.operands.flatMap((operand) => operand.items))
      .filter((entry) => entry.item.kind === 'fragment')
      .map((entry) => entry.item.id));
    if (destination.fragmentId === itemId || descendants.has(destination.fragmentId)) {
      return items;
    }
  }
  return destination === undefined
    ? [...result.items, result.removed]
    : insertSequenceItem(result.items, result.removed, destination);
};

const cloneTimelineItem = (item: SequenceTimelineItem): SequenceTimelineItem => {
  if (item.kind === 'message') {
    return { ...item, id: createId(), replyToMessageId: undefined };
  }
  return {
    ...item,
    id: createId(),
    ...(item.x !== undefined ? { x: item.x + 30 } : {}),
    ...(item.y !== undefined ? { y: item.y + 30 } : {}),
    operands: item.operands.map((operand) => ({
      ...operand,
      id: createId(),
      items: operand.items.map(cloneTimelineItem),
    })),
  };
};

export const duplicateSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
): { items: SequenceTimelineItem[]; duplicateId?: string } => {
  const source = findSequenceItem(items, itemId);
  if (source === null) {
    return { items };
  }
  const duplicate = cloneTimelineItem(source);
  return { items: insertSequenceItem(items, duplicate, { afterItemId: itemId }), duplicateId: duplicate.id };
};

export const createSequenceMessage = (
  type: SequenceMessageType,
  sourceId: string,
  targetId: string,
): SequenceMessage => ({
  id: createId(),
  kind: 'message',
  type,
  sourceId,
  targetId,
  name: type === 'create' ? 'create' : type === 'destroy' ? 'destroy' : '',
  arguments: '',
  parameterValues: '',
  returnType: '',
  flowReference: '',
});

export const createSequenceFragment = (operator: SequenceFragmentOperator): SequenceFragment => ({
  id: createId(),
  kind: 'fragment',
  operator,
  name: '',
  operands: Array.from({ length: operator === 'alt' || operator === 'par' ? 2 : 1 }, (_, index) => ({
    id: createId(),
    guard: operator === 'alt' ? (index === 0 ? 'condición' : 'else') : '',
    items: [],
  })),
});

/**
 * Minimum horizontal distance between participant centers. Headers are
 * 160px wide, so this keeps headers from overlapping when dragging.
 */
export const SEQUENCE_MIN_PARTICIPANT_GAP = 180;

/** Clamp a dragged participant X so headers cannot overlap each other. */
export const clampParticipantX = (
  participants: SequenceParticipant[],
  participantId: string,
  x: number,
): number => {
  let clamped = Math.max(90, x);
  participants.forEach((participant) => {
    if (participant.id === participantId) return;
    if (Math.abs(clamped - participant.x) >= SEQUENCE_MIN_PARTICIPANT_GAP) return;
    const before = participant.x - SEQUENCE_MIN_PARTICIPANT_GAP;
    const after = participant.x + SEQUENCE_MIN_PARTICIPANT_GAP;
    clamped = before < 90
      ? after
      : Math.abs(clamped - before) <= Math.abs(clamped - after) ? before : after;
  });
  return Math.max(90, clamped);
};

/**
 * Adjust operands when a fragment operator changes. Multi-section operators
 * (alt/par) get at least two operands; single-section operators merge the
 * content of extra operands into the first one so nothing is lost.
 */
export const adjustOperandsForOperator = (
  operator: SequenceFragmentOperator,
  operands: SequenceFragmentOperand[],
): SequenceFragmentOperand[] => {
  if (operator === 'alt' || operator === 'par') {
    const next = [...operands];
    while (next.length < 2) {
      next.push({ id: createId(), guard: '', items: [] });
    }
    return next;
  }
  if (operands.length <= 1) {
    return operands.length === 0 ? [{ id: createId(), guard: '', items: [] }] : operands;
  }
  const [first, ...rest] = operands;
  return [{
    ...first,
    items: [...first.items, ...rest.flatMap((operand) => operand.items)],
  }];
};

export const buildSequenceMessageNumbers = (content: SequenceDiagramContent): Map<string, string> => {
  const messages = flattenSequenceItems(content.items)
    .map((entry) => entry.item)
    .filter((item): item is SequenceMessage => item.kind === 'message');
  const numbers = new Map<string, string>();
  if (content.numbering === 'none') {
    return numbers;
  }

  if (content.numbering === 'sequential') {
    let counter = 0;
    messages.forEach((message) => {
      if (message.type !== 'return') {
        counter += 1;
        numbers.set(message.id, String(counter));
      }
    });
    return numbers;
  }

  let rootCounter = 0;
  const stack: Array<{ message: SequenceMessage; label: string; children: number }> = [];
  messages.forEach((message) => {
    if (message.type === 'return') {
      let replyIndex = stack.length - 1;
      if (message.replyToMessageId !== undefined) {
        replyIndex = -1;
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          if (stack[index].message.id === message.replyToMessageId) {
            replyIndex = index;
            break;
          }
        }
      }
      if (replyIndex >= 0) {
        stack.splice(replyIndex);
      }
      return;
    }

    let label: string;
    if (stack.length === 0) {
      rootCounter += 1;
      label = String(rootCounter);
    } else {
      const parent = stack[stack.length - 1];
      parent.children += 1;
      label = `${parent.label}.${parent.children}`;
    }
    numbers.set(message.id, label);
    if (message.type === 'synchronous' || message.type === 'create') {
      stack.push({ message, label, children: 0 });
    }
  });
  return numbers;
};

export const buildDerivedActivations = (content: SequenceDiagramContent): SequenceActivation[] => {
  const messages = flattenSequenceItems(content.items)
    .map((entry) => entry.item)
    .filter((item): item is SequenceMessage => item.kind === 'message');
  const openByParticipant = new Map<string, SequenceActivation[]>();
  const result: SequenceActivation[] = [];
  const open = (participantId: string, messageId: string): void => {
    const stack = openByParticipant.get(participantId) ?? [];
    const activation: SequenceActivation = {
      id: `derived:${participantId}:${messageId}:${stack.length}`,
      participantId,
      startMessageId: messageId,
      level: stack.length,
      manual: false,
    };
    stack.push(activation);
    openByParticipant.set(participantId, stack);
    result.push(activation);
  };

  messages.forEach((message) => {
    if (message.type === 'return') {
      const stack = openByParticipant.get(message.sourceId) ?? [];
      let activationIndex = -1;
      if (message.replyToMessageId !== undefined) {
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          if (stack[index].startMessageId === message.replyToMessageId) {
            activationIndex = index;
            break;
          }
        }
      } else {
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          const call = messages.find((candidate) => candidate.id === stack[index].startMessageId);
          if (call !== undefined && call.targetId === message.sourceId && call.sourceId === message.targetId) {
            activationIndex = index;
            break;
          }
        }
      }
      const activation = activationIndex >= 0 ? stack.splice(activationIndex, 1)[0] : undefined;
      if (activation !== undefined) {
        activation.endMessageId = message.id;
      }
      return;
    }

    if ((openByParticipant.get(message.sourceId)?.length ?? 0) === 0) {
      open(message.sourceId, message.id);
    }
    const targetStack = openByParticipant.get(message.targetId) ?? [];
    const recursive = message.sourceId === message.targetId;
    const startsExecution = message.type === 'synchronous' || message.type === 'asynchronous';
    if (startsExecution && (recursive || targetStack.length === 0)) {
      open(message.targetId, message.id);
    }
    if (message.type === 'destroy') {
      const stack = openByParticipant.get(message.targetId) ?? [];
      stack.forEach((activation) => {
        activation.endMessageId = message.id;
      });
      stack.length = 0;
    }
  });

  const manualKeys = new Set(content.activations
    .filter((activation) => activation.manual)
    .map((activation) => `${activation.participantId}:${activation.startMessageId}:${activation.level}`));
  return [
    ...result.filter((activation) => !manualKeys.has(
      `${activation.participantId}:${activation.startMessageId}:${activation.level}`,
    )),
    ...content.activations.filter((activation) => activation.manual),
  ];
};

export const formatSequenceParticipantName = (participant: SequenceParticipant): string => {
  if (participant.kind === 'actor') {
    return participant.name || 'Actor';
  }
  if (participant.name.trim().length > 0 && participant.classifierName.trim().length > 0) {
    return `${participant.name} : ${participant.classifierName}`;
  }
  if (participant.classifierName.trim().length > 0) {
    return `:${participant.classifierName}`;
  }
  return participant.name || ':Objeto';
};

export const formatSequenceMessageLabel = (message: SequenceMessage, number?: string): string => {
  if (message.type === 'return') {
    return '';
  }
  const values = message.parameterValues.trim() || message.arguments.trim();
  const name = message.name.trim() || (message.type === 'create' ? 'create' : message.type === 'destroy' ? 'destroy' : 'mensaje');
  const cleanName = name.endsWith('()') ? name.slice(0, -2).trim() : name;
  const call = cleanName.endsWith(')') ? cleanName : `${cleanName}(${values})`;
  const result = message.returnType.trim().length > 0 ? `${call}: ${message.returnType.trim()}` : call;
  return number === undefined ? result : `${number}. ${result}`;
};
