import type {
  SequenceDiagramContent,
  SequenceFragment,
  SequenceFragmentOperator,
  SequenceMessage,
  SequenceMessageType,
  SequenceParticipantKind,
  SequenceTimelineItem,
} from '../types/diagram';
import { analyzeSequenceDiagramSemantics, insertSequenceItem, insertSequenceItemBefore } from './sequenceDiagram';
import type { SequenceLayout } from './sequenceDiagramLayout';
import { parseMessageSignature } from './sequenceMessageEditing';
import { parseSequenceParticipantLabel } from './sequenceParticipantEditing';
import { shortcutLabel } from './shortcutLabel';

export type SequenceKeyboardStage = 'off' | 'navigate' | 'aim' | 'typing' | 'fragment' | 'guard' | 'participant';

export type SequenceKeyboardModeState = {
  stage: SequenceKeyboardStage;
  slotIndex: number;
  sourceId: string;
  targetId: string;
  messageType: SequenceMessageType;
  text: string;
  operationMethodId?: string;
  editId?: string;
  returnCandidateIds: string[];
  returnCandidateIndex: number;
  createKind: Exclude<SequenceParticipantKind, 'actor'>;
  createSide: -1 | 1;
  fragmentOperator: SequenceFragmentOperator;
  guardFragmentId?: string;
  guardOperandId?: string;
  guardText: string;
};

export const sequenceKeyboardMessageTypes: SequenceMessageType[] = [
  'synchronous',
  'return',
  'create',
  'destroy',
];

export const sequenceKeyboardCreateKinds: Array<Exclude<SequenceParticipantKind, 'actor'>> = [
  'object',
  'boundary',
  'control',
  'entity',
];

export const sequenceKeyboardFragmentOperators: SequenceFragmentOperator[] = [
  'alt',
  'loop',
  'opt',
  'par',
  'break',
  'critical',
  'ref',
];

export const moveCircular = <T,>(items: T[], current: T, direction: -1 | 1): T | undefined => {
  if (items.length === 0) return undefined;
  const currentIndex = Math.max(0, items.indexOf(current));
  return items[(currentIndex + direction + items.length) % items.length];
};

export const createInactiveSequenceKeyboardState = (): SequenceKeyboardModeState => ({
  stage: 'off',
  slotIndex: 0,
  sourceId: '',
  targetId: '',
  messageType: 'synchronous',
  text: '',
  returnCandidateIds: [],
  returnCandidateIndex: 0,
  createKind: 'object',
  createSide: 1,
  fragmentOperator: 'alt',
  guardText: '',
});

export type SequenceKeyboardModeAction =
  | { type: 'activate'; slotIndex: number; sourceId: string }
  | { type: 'deactivate' }
  | { type: 'navigate'; slotIndex?: number; sourceId?: string }
  | { type: 'begin'; messageType: SequenceMessageType; targetId?: string; returnCandidateIds?: string[]; preserveEdit?: boolean }
  | { type: 'set-route'; sourceId?: string; targetId?: string; messageType?: SequenceMessageType; returnCandidateIds?: string[]; returnCandidateIndex?: number; createSide?: -1 | 1 }
  | { type: 'set-message-type'; messageType: SequenceMessageType }
  | { type: 'set-create-kind'; createKind: Exclude<SequenceParticipantKind, 'actor'> }
  | { type: 'start-typing'; text?: string; editId?: string; operationMethodId?: string }
  | { type: 'set-text'; text: string; operationMethodId?: string }
  | { type: 'set-method'; operationMethodId: string; text: string }
  | { type: 'begin-participant' }
  | { type: 'open-fragment'; operator?: SequenceFragmentOperator }
  | { type: 'set-fragment-operator'; operator: SequenceFragmentOperator }
  | { type: 'open-guard'; fragmentId: string; operandId: string; text: string }
  | { type: 'set-guard'; text: string }
  | { type: 'committed'; slotIndex: number; sourceId: string }
  | { type: 'back' };

const signatureName = (text: string): string => text.split(/[(:]/)[0].trim();

export type KeyboardReturnCall = { id: string; sourceId: string };

export type KeyboardRouteChange = {
  targetId?: string;
  returnCandidateIds?: string[];
  returnCandidateIndex?: number;
  /** Why the move did nothing, when the user should be told. */
  feedback?: string;
};

export const noPendingCallFeedback = 'No hay llamada pendiente para retornar.';

/**
 * Where ← / → send the target. The arrows only move the destination: the
 * message type is chosen explicitly (S, R, C, D) and never changes here,
 * so a call can go either way and a return can go back to either side.
 *
 * A return can only go back to someone who has a call waiting for it, so its
 * arrows step through those callers (in lifeline order) instead of every
 * participant. `returnCalls` lists them most recent first.
 */
export const resolveKeyboardTargetMove = ({
  participantIds,
  targetId,
  messageType,
  direction,
  returnCalls,
}: {
  participantIds: string[];
  targetId: string;
  messageType: SequenceMessageType;
  direction: -1 | 1;
  returnCalls: KeyboardReturnCall[];
}): KeyboardRouteChange => {
  if (messageType === 'return') {
    const callers = participantIds.filter((id) => returnCalls.some((call) => call.sourceId === id));
    if (callers.length === 0) return { feedback: noPendingCallFeedback };
    const next = moveCircular(callers, targetId, direction);
    if (next === undefined) return {};
    const callsToNext = returnCalls.filter((call) => call.sourceId === next);
    return {
      targetId: next,
      returnCandidateIds: callsToNext.map((call) => call.id),
      returnCandidateIndex: 0,
    };
  }
  const next = moveCircular(participantIds, targetId, direction);
  return next === undefined ? {} : { targetId: next };
};

export const sequenceKeyboardModeReducer = (
  state: SequenceKeyboardModeState,
  action: SequenceKeyboardModeAction,
): SequenceKeyboardModeState => {
  switch (action.type) {
    case 'activate':
      return {
        ...createInactiveSequenceKeyboardState(),
        stage: 'navigate',
        slotIndex: action.slotIndex,
        sourceId: action.sourceId,
        targetId: action.sourceId,
      };
    case 'deactivate':
      return createInactiveSequenceKeyboardState();
    case 'navigate':
      return {
        ...state,
        stage: 'navigate',
        slotIndex: action.slotIndex ?? state.slotIndex,
        sourceId: action.sourceId ?? state.sourceId,
        targetId: action.sourceId ?? state.sourceId,
        text: '',
        operationMethodId: undefined,
        editId: undefined,
        returnCandidateIds: [],
        returnCandidateIndex: 0,
        guardFragmentId: undefined,
        guardOperandId: undefined,
        guardText: '',
      };
    case 'begin':
      return {
        ...state,
        stage: 'aim',
        messageType: action.messageType,
        targetId: action.targetId ?? state.sourceId,
        text: action.preserveEdit ? state.text : '',
        operationMethodId: undefined,
        editId: action.preserveEdit ? state.editId : undefined,
        returnCandidateIds: action.returnCandidateIds ?? [],
        returnCandidateIndex: 0,
      };
    case 'set-route': {
      const nextMessageType = action.messageType ?? state.messageType;
      return {
        ...state,
        sourceId: action.sourceId ?? state.sourceId,
        targetId: action.targetId ?? state.targetId,
        messageType: nextMessageType,
        returnCandidateIds: action.returnCandidateIds ?? (nextMessageType === 'return' ? state.returnCandidateIds : []),
        returnCandidateIndex: action.returnCandidateIndex ?? state.returnCandidateIndex,
        createSide: action.createSide ?? state.createSide,
        operationMethodId: undefined,
      };
    }
    case 'set-message-type':
      return {
        ...state,
        messageType: action.messageType,
        returnCandidateIds: action.messageType === 'return' ? state.returnCandidateIds : [],
        returnCandidateIndex: action.messageType === 'return' ? state.returnCandidateIndex : 0,
        operationMethodId: undefined,
      };
    case 'set-create-kind':
      return { ...state, createKind: action.createKind };
    case 'start-typing':
      if (state.messageType === 'return') {
        return {
          ...state,
          stage: 'aim',
          text: '',
          editId: action.editId ?? state.editId,
          operationMethodId: undefined,
        };
      }
      return {
        ...state,
        stage: 'typing',
        text: action.text ?? state.text,
        editId: action.editId ?? state.editId,
        operationMethodId: action.operationMethodId ?? state.operationMethodId,
      };
    case 'begin-participant':
      return {
        ...state,
        stage: 'participant',
        text: '',
        operationMethodId: undefined,
        editId: undefined,
      };
    case 'set-text':
      return {
        ...state,
        text: action.text,
        // Completing arguments or the return type keeps the linked method;
        // only renaming the operation drops it.
        operationMethodId: action.operationMethodId
          ?? (signatureName(action.text) === signatureName(state.text) ? state.operationMethodId : undefined),
      };
    case 'set-method':
      return { ...state, text: action.text, operationMethodId: action.operationMethodId };
    case 'open-fragment':
      return { ...state, stage: 'fragment', fragmentOperator: action.operator ?? state.fragmentOperator };
    case 'set-fragment-operator':
      return { ...state, fragmentOperator: action.operator };
    case 'open-guard':
      return {
        ...state,
        stage: 'guard',
        guardFragmentId: action.fragmentId,
        guardOperandId: action.operandId,
        guardText: action.text,
      };
    case 'set-guard':
      return { ...state, guardText: action.text };
    case 'committed':
      return {
        ...createInactiveSequenceKeyboardState(),
        stage: 'navigate',
        slotIndex: action.slotIndex,
        sourceId: action.sourceId,
        targetId: action.sourceId,
      };
    case 'back':
      if (state.stage === 'participant') return { ...state, stage: 'navigate', text: '', operationMethodId: undefined };
      if (state.stage === 'typing') return { ...state, stage: 'aim', operationMethodId: undefined };
      if (state.stage === 'aim' || state.stage === 'fragment' || state.stage === 'guard') {
        return {
          ...state,
          stage: 'navigate',
          targetId: state.sourceId,
          text: '',
          operationMethodId: undefined,
          editId: undefined,
          returnCandidateIds: [],
          returnCandidateIndex: 0,
          guardFragmentId: undefined,
          guardOperandId: undefined,
          guardText: '',
        };
      }
      return createInactiveSequenceKeyboardState();
    default:
      return state;
  }
};

export type SequenceKeyboardInsertionSlot = {
  id: string;
  containerId: string;
  containerName: string;
  parentFragmentId?: string;
  operandId?: string;
  index: number;
  y: number;
  bounds?: { x: number; width: number; top: number; bottom: number };
  itemIds: string[];
};

/**
 * Puts an item exactly where the keyboard cursor is. The cursor already knows
 * its branch and position, so nothing is guessed from a Y coordinate: guessing
 * moved a message out of the fragment the cursor was inside (the branch has to
 * horizontally cover the new message) or next to the wrong neighbour.
 */
export const insertSequenceItemAtSlot = (
  items: SequenceTimelineItem[],
  item: SequenceTimelineItem,
  slot: SequenceKeyboardInsertionSlot,
): SequenceTimelineItem[] => {
  const previousId = slot.itemIds[slot.index - 1];
  if (previousId !== undefined) return insertSequenceItem(items, item, { afterItemId: previousId });
  const nextId = slot.itemIds[slot.index];
  if (nextId !== undefined) return insertSequenceItemBefore(items, item, nextId);
  if (slot.parentFragmentId !== undefined && slot.operandId !== undefined) {
    return insertSequenceItem(items, item, { fragmentId: slot.parentFragmentId, operandId: slot.operandId });
  }
  return insertSequenceItem(items, item);
};

type ItemBounds = { top: number; bottom: number };

const getItemBounds = (item: SequenceTimelineItem, layout: SequenceLayout): ItemBounds | undefined => {
  if (item.kind === 'message') {
    const message = layout.messageLayouts.get(item.id);
    return message ? { top: message.top, bottom: message.top + message.height } : undefined;
  }
  const fragment = layout.fragmentLayouts.get(item.id);
  return fragment ? { top: fragment.y, bottom: fragment.y + fragment.height } : undefined;
};

const slotY = (
  items: SequenceTimelineItem[],
  index: number,
  layout: SequenceLayout,
  top?: number,
  bottom?: number,
): number => {
  if (items.length === 0) {
    if (top !== undefined && bottom !== undefined) return (top + bottom) / 2;
    return layout.timelineStart + 20;
  }
  if (index === 0) {
    const first = getItemBounds(items[0], layout);
    return top !== undefined
      ? Math.max(top + 8, ((first?.top ?? top + 28) + top) / 2)
      : Math.max(layout.timelineStart + 8, (first?.top ?? layout.timelineStart + 32) - 20);
  }
  if (index === items.length) {
    const last = getItemBounds(items[items.length - 1], layout);
    return bottom !== undefined
      ? Math.min(bottom - 8, ((last?.bottom ?? bottom - 28) + bottom) / 2)
      : (last?.bottom ?? layout.height - 70) + 20;
  }
  const before = getItemBounds(items[index - 1], layout);
  const after = getItemBounds(items[index], layout);
  return ((before?.bottom ?? layout.timelineStart) + (after?.top ?? layout.timelineStart + 40)) / 2;
};

export const buildSequenceKeyboardInsertionSlots = (
  content: SequenceDiagramContent,
  layout: SequenceLayout,
): SequenceKeyboardInsertionSlot[] => {
  const slots: SequenceKeyboardInsertionSlot[] = [];
  const addContainer = (
    containerId: string,
    containerName: string,
    items: SequenceTimelineItem[],
    parentFragmentId?: string,
    operandId?: string,
    bounds?: SequenceKeyboardInsertionSlot['bounds'],
  ): void => {
    for (let index = 0; index <= items.length; index += 1) {
      slots.push({
        id: `${containerId}:${index}`,
        containerId,
        containerName,
        parentFragmentId,
        operandId,
        index,
        y: Math.round(slotY(items, index, layout, bounds?.top, bounds?.bottom)),
        bounds,
        itemIds: items.map((item) => item.id),
      });
    }
  };

  addContainer('root', 'Secuencia principal', content.items);

  const visit = (items: SequenceTimelineItem[]): void => {
    items.forEach((item) => {
      if (item.kind !== 'fragment') return;
      const fragmentLayout = layout.fragmentLayouts.get(item.id);
      item.operands.forEach((operand, operandIndex) => {
        const operandLayout = fragmentLayout?.operands.find((candidate) => candidate.id === operand.id);
        const name = `${item.operator}${operand.guard ? ` [${operand.guard}]` : ` · rama ${operandIndex + 1}`}`;
        addContainer(
          operand.id,
          name,
          operand.items,
          item.id,
          operand.id,
          fragmentLayout && operandLayout
            ? {
                x: fragmentLayout.x,
                width: fragmentLayout.width,
                top: operandLayout.top,
                bottom: operandLayout.bottom,
              }
            : undefined,
        );
        visit(operand.items);
      });
    });
  };
  visit(content.items);

  return slots.sort((left, right) => left.y - right.y || left.containerName.localeCompare(right.containerName));
};

export const findSequenceKeyboardSlotAfterItem = (
  slots: SequenceKeyboardInsertionSlot[],
  itemId: string,
): number => {
  const index = slots.findIndex((slot) => slot.itemIds[slot.index - 1] === itemId);
  return index >= 0 ? index : Math.max(0, slots.length - 1);
};

/** Compatibility alias: keyboard, dialog and inspector share one parser. */
export const parseSequenceKeyboardSignature = parseMessageSignature;

export const parseSequenceCreatedParticipant = (text: string): { name: string; classifierName: string } => {
  const parsed = parseSequenceParticipantLabel(text);
  return {
    name: parsed.instanceName,
    classifierName: parsed.classifierName || 'Objeto',
  };
};

const makeReturnProbe = (sourceId: string, call: SequenceMessage): SequenceMessage => ({
  id: `__keyboard_return_probe__:${call.id}`,
  kind: 'message',
  type: 'return',
  sourceId,
  targetId: call.sourceId,
  name: '',
  arguments: '',
  parameterValues: '',
  returnType: '',
  replyToMessageId: call.id,
  flowReference: '',
});

/**
 * Finds returns that are valid in the exact branch selected by the keyboard
 * cursor. The semantic analyzer remains the source of truth for activation
 * and alternative-path scope.
 */
export const findCompatibleSequenceReturnCalls = (
  content: SequenceDiagramContent,
  layout: SequenceLayout,
  slot: SequenceKeyboardInsertionSlot,
  sourceId: string,
): SequenceMessage[] => layout.orderedMessages
  .filter((message) => (
    message.type === 'synchronous'
    && message.targetId === sourceId
    && (layout.messageLayouts.get(message.id)?.y ?? Number.POSITIVE_INFINITY) < slot.y
  ))
  .reverse()
  .filter((call) => {
    const probe = makeReturnProbe(sourceId, call);
    const candidate: SequenceDiagramContent = {
      ...content,
      items: insertSequenceItemAtSlot(content.items, probe, slot),
    };
    return !analyzeSequenceDiagramSemantics(candidate).problems.some((problem) => (
      problem.code === 'unmatched-return' && problem.messageId === probe.id
    ));
  });

export const getSequenceParticipantIdsAliveAtSlot = (
  content: SequenceDiagramContent,
  _layout: SequenceLayout,
  slot: SequenceKeyboardInsertionSlot,
): string[] => content.participants.flatMap((participant) => {
  const probe: SequenceMessage = {
    id: `__keyboard_alive_probe__:${participant.id}`,
    kind: 'message',
    type: 'synchronous',
    sourceId: participant.id,
    targetId: participant.id,
    name: 'probe',
    arguments: '',
    parameterValues: '',
    returnType: '',
    flowReference: '',
  };
  const candidate: SequenceDiagramContent = {
    ...content,
    items: insertSequenceItemAtSlot(content.items, probe, slot),
  };
  const invalid = analyzeSequenceDiagramSemantics(candidate).problems.some((problem) => (
    problem.severity === 'error' && problem.messageId === probe.id
  ));
  return invalid ? [] : [participant.id];
});

export const findFragmentOperand = (
  items: SequenceTimelineItem[],
  operandId: string,
): { fragment: SequenceFragment; operandIndex: number } | undefined => {
  for (const item of items) {
    if (item.kind !== 'fragment') continue;
    const operandIndex = item.operands.findIndex((operand) => operand.id === operandId);
    if (operandIndex >= 0) return { fragment: item, operandIndex };
    for (const operand of item.operands) {
      const nested = findFragmentOperand(operand.items, operandId);
      if (nested) return nested;
    }
  }
  return undefined;
};

export const getSequenceKeyboardInstruction = (state: SequenceKeyboardModeState): string => {
  if (state.stage === 'navigate') {
    return '← → participante · ↑ ↓ momento · Enter crear · P participante · R retorno · F fragmento';
  }
  if (state.stage === 'aim') {
    return state.messageType === 'create'
      ? '← → ubicación · S R C D tipo · Enter confirmar · Esc volver'
      : state.messageType === 'return'
        ? '← → quién llamó · S R C D tipo · Enter confirmar · Esc volver'
        : '← → destino · S R C D tipo · Enter confirmar · Esc volver';
  }
  if (state.stage === 'typing') {
    return state.messageType === 'create'
      ? 'Escribí nombre : Clase · Enter crear · Esc volver'
      : state.messageType === 'return'
        ? 'Enter guardar retorno · Esc volver'
        : shortcutLabel('Enter guardar (vacío: toma la sugerencia) · ⇧ Enter guardar + retorno · Esc volver');
  }
  if (state.stage === 'participant') {
    return 'Escribí instancia:Clase o :Clase · Enter crear · Esc cancelar';
  }
  if (state.stage === 'fragment') {
    return '↑ ↓ operador · Enter crear · Esc cancelar';
  }
  return 'Escribí la guarda · Enter guardar · Esc cancelar';
};
