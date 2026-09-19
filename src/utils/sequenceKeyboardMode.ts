import type {
  SequenceDiagramContent,
  SequenceFragment,
  SequenceFragmentOperator,
  SequenceMessage,
  SequenceMessageType,
  SequenceParticipantKind,
  SequenceTimelineItem,
} from '../types/diagram';
import { analyzeSequenceDiagramSemantics, insertSequenceItemAtY } from './sequenceDiagram';
import type { SequenceLayout } from './sequenceDiagramLayout';
import { parseMessageSignature } from './sequenceMessageEditing';
import { parseSequenceParticipantLabel } from './sequenceParticipantEditing';

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
  'asynchronous',
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

export const resolveKeyboardTargetMessageType = (
  sourceIndex: number,
  targetIndex: number,
  currentType: SequenceMessageType = 'synchronous',
): SequenceMessageType => {
  if (sourceIndex >= 0 && targetIndex >= 0) {
    if (targetIndex < sourceIndex) return 'return';
    if (targetIndex > sourceIndex) return 'synchronous';
  }
  return currentType;
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
      return { ...state, text: action.text, operationMethodId: action.operationMethodId };
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

type ItemBounds = { top: number; bottom: number };

const getItemBounds = (item: SequenceTimelineItem, layout: SequenceLayout): ItemBounds | undefined => {
  if (item.kind === 'message') {
    const message = layout.messageLayouts.get(item.id);
    return message ? { top: message.y - message.height / 2, bottom: message.y + message.height / 2 } : undefined;
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
      items: insertSequenceItemAtY(content.items, probe, layout, slot.y),
    };
    return !analyzeSequenceDiagramSemantics(candidate).problems.some((problem) => (
      problem.code === 'unmatched-return' && problem.messageId === probe.id
    ));
  });

export const getSequenceParticipantIdsAliveAtSlot = (
  content: SequenceDiagramContent,
  layout: SequenceLayout,
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
    items: insertSequenceItemAtY(content.items, probe, layout, slot.y),
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
      ? '← → ubicación · ↑ ↓ tipo · Enter confirmar · Esc volver'
      : '← → destino · ↑ ↓ tipo · Enter confirmar · Esc volver';
  }
  if (state.stage === 'typing') {
    return state.messageType === 'create'
      ? 'Escribí nombre : Clase · Enter crear · Esc volver'
      : state.messageType === 'return'
        ? 'Enter guardar retorno · Esc volver'
        : 'Enter guardar · ⇧ Enter guardar + retorno · Esc volver';
  }
  if (state.stage === 'participant') {
    return 'Escribí instancia:Clase o :Clase · Enter crear · Esc cancelar';
  }
  if (state.stage === 'fragment') {
    return '↑ ↓ operador · Enter crear · Esc cancelar';
  }
  return 'Escribí la guarda · Enter guardar · Esc cancelar';
};
