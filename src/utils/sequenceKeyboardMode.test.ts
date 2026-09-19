import { describe, expect, it } from 'vitest';
import type { SequenceDiagramContent, SequenceMessage } from '../types/diagram';
import { createSequenceFragment, createSequenceMessage } from './sequenceDiagram';
import { buildSequenceLayout } from './sequenceDiagramLayout';
import {
  buildSequenceKeyboardInsertionSlots,
  createInactiveSequenceKeyboardState,
  findCompatibleSequenceReturnCalls,
  moveCircular,
  parseSequenceCreatedParticipant,
  parseSequenceKeyboardSignature,
  resolveKeyboardTargetMessageType,
  sequenceKeyboardMessageTypes,
  sequenceKeyboardModeReducer,
} from './sequenceKeyboardMode';

const participant = (id: string, x: number) => ({
  id,
  kind: 'object' as const,
  name: id,
  classifierName: id.toUpperCase(),
  x,
});

const contentWith = (items: SequenceDiagramContent['items']): SequenceDiagramContent => ({
  version: 1,
  numbering: 'sequential',
  showActivations: true,
  participants: [participant('a', 120), participant('b', 350), participant('c', 580)],
  items,
  activations: [],
  problems: [],
  notes: [],
  canvas: { width: 900, height: 700 },
});

describe('sequence keyboard mode state', () => {
  it('enters, composes, edits and backs out one stage at a time', () => {
    let state = createInactiveSequenceKeyboardState();
    state = sequenceKeyboardModeReducer(state, { type: 'activate', slotIndex: 2, sourceId: 'a' });
    expect(state).toMatchObject({ stage: 'navigate', slotIndex: 2, sourceId: 'a', targetId: 'a' });

    state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType: 'synchronous' });
    state = sequenceKeyboardModeReducer(state, { type: 'set-route', targetId: 'b' });
    state = sequenceKeyboardModeReducer(state, { type: 'start-typing', text: 'buscar(id): Caso' });
    expect(state).toMatchObject({ stage: 'typing', targetId: 'b', text: 'buscar(id): Caso' });

    state = sequenceKeyboardModeReducer(state, { type: 'back' });
    expect(state.stage).toBe('aim');
    expect(state.text).toBe('buscar(id): Caso');
    state = sequenceKeyboardModeReducer(state, { type: 'back' });
    expect(state.stage).toBe('navigate');
    state = sequenceKeyboardModeReducer(state, { type: 'back' });
    expect(state.stage).toBe('off');
  });

  it('keeps a call and its return as one committed cursor transition', () => {
    const state = sequenceKeyboardModeReducer(
      sequenceKeyboardModeReducer(
        sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 0, sourceId: 'a' }),
        { type: 'begin', messageType: 'synchronous', targetId: 'b' },
      ),
      { type: 'committed', slotIndex: 1, sourceId: 'a' },
    );
    expect(state).toMatchObject({ stage: 'navigate', slotIndex: 1, sourceId: 'a', targetId: 'a' });
  });

  it('opens a participant command without entering message signature mode and cancels with Escape', () => {
    let state = sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 0, sourceId: '' });
    state = sequenceKeyboardModeReducer(state, { type: 'begin-participant' });
    expect(state).toMatchObject({ stage: 'participant', text: '' });
    state = sequenceKeyboardModeReducer(state, { type: 'set-text', text: '  TramiteActual : Tramite  ' });
    expect(state.text).toBe('  TramiteActual : Tramite  ');
    state = sequenceKeyboardModeReducer(state, { type: 'back' });
    expect(state).toMatchObject({ stage: 'navigate', text: '' });
  });

  it('preserves the edited message when its type changes to a return', () => {
    let state = sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 1, sourceId: 'b' });
    state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType: 'synchronous', targetId: 'a' });
    state = sequenceKeyboardModeReducer(state, { type: 'start-typing', text: 'buscar()', editId: 'message-1' });
    state = sequenceKeyboardModeReducer(state, {
      type: 'begin',
      messageType: 'return',
      targetId: 'a',
      returnCandidateIds: ['call-1'],
      preserveEdit: true,
    });
    expect(state).toMatchObject({
      stage: 'aim',
      messageType: 'return',
      editId: 'message-1',
      text: 'buscar()',
      returnCandidateIds: ['call-1'],
    });
  });

  it('defaults right-to-left navigation (target < source) to return, and left-to-right (target > source) to synchronous', () => {
    // Participant indices: 0: A, 1: B, 2: C
    // From B (index 1) to A (index 0) - moving to the left:
    expect(resolveKeyboardTargetMessageType(1, 0, 'synchronous')).toBe('return');
    // From B (index 1) to C (index 2) - moving to the right:
    expect(resolveKeyboardTargetMessageType(1, 2, 'return')).toBe('synchronous');
    // Self-call (same index): keeps current type
    expect(resolveKeyboardTargetMessageType(1, 1, 'asynchronous')).toBe('asynchronous');

    // In reducer: set-route can update messageType and returnCandidateIds atomically
    let state = sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 0, sourceId: 'b' });
    state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType: 'synchronous', targetId: 'b' });
    state = sequenceKeyboardModeReducer(state, {
      type: 'set-route',
      targetId: 'a',
      messageType: 'return',
      returnCandidateIds: ['call-1'],
    });
    expect(state).toMatchObject({
      stage: 'aim',
      targetId: 'a',
      messageType: 'return',
      returnCandidateIds: ['call-1'],
    });

    state = sequenceKeyboardModeReducer(state, {
      type: 'set-route',
      targetId: 'c',
      messageType: 'synchronous',
      returnCandidateIds: [],
    });
    expect(state).toMatchObject({
      stage: 'aim',
      targetId: 'c',
      messageType: 'synchronous',
      returnCandidateIds: [],
    });
  });
});

describe('sequence keyboard parsing', () => {
  it('parses a compact method signature without losing free text', () => {
    expect(parseSequenceKeyboardSignature('autenticarUsuario(credenciales): Sesion')).toEqual({
      name: 'autenticarUsuario',
      arguments: 'credenciales',
      returnType: 'Sesion',
    });
    expect(parseSequenceKeyboardSignature('texto libre / especial')).toEqual({
      name: 'texto libre / especial',
      arguments: '',
      returnType: '',
    });
    expect(parseSequenceKeyboardSignature('validar(calcular(a,b),c):boolean')).toEqual({
      name: 'validar',
      arguments: 'calcular(a,b),c',
      returnType: 'boolean',
    });
  });

  it('parses the compact participant notation used by create', () => {
    expect(parseSequenceCreatedParticipant('pedido : Pedido')).toEqual({ name: 'pedido', classifierName: 'Pedido' });
    expect(parseSequenceCreatedParticipant('Pedido')).toEqual({ name: '', classifierName: 'Pedido' });
  });
});

describe('sequence keyboard insertion and returns', () => {
  it('exposes root and empty operand slots', () => {
    const fragment = createSequenceFragment('alt');
    const content = contentWith([fragment]);
    const slots = buildSequenceKeyboardInsertionSlots(content, buildSequenceLayout(content));
    expect(slots.some((slot) => slot.containerId === 'root')).toBe(true);
    fragment.operands.forEach((operand) => {
      expect(slots.some((slot) => slot.containerId === operand.id && slot.itemIds.length === 0)).toBe(true);
    });
  });

  it('finds only calls that remain open in the selected branch', () => {
    const call = createSequenceMessage('synchronous', 'a', 'b');
    call.name = 'abrir';
    const content = contentWith([call]);
    const layout = buildSequenceLayout(content);
    const slots = buildSequenceKeyboardInsertionSlots(content, layout);
    const lastSlot = slots.find((slot) => slot.containerId === 'root' && slot.index === 1)!;
    expect(findCompatibleSequenceReturnCalls(content, layout, lastSlot, 'b').map((message) => message.id)).toEqual([call.id]);

    const reply = createSequenceMessage('return', 'b', 'a');
    reply.replyToMessageId = call.id;
    const closedContent = contentWith([call, reply] as SequenceMessage[]);
    const closedLayout = buildSequenceLayout(closedContent);
    const closedSlot = buildSequenceKeyboardInsertionSlots(closedContent, closedLayout)
      .find((slot) => slot.containerId === 'root' && slot.index === 2)!;
    expect(findCompatibleSequenceReturnCalls(closedContent, closedLayout, closedSlot, 'b')).toEqual([]);
  });
});

describe('sequence keyboard message type navigation and confirmation', () => {
  it('allows navigating through every creatable message type including destroy', () => {
    // Forward from synchronous
    let current = sequenceKeyboardMessageTypes[0]; // synchronous
    expect(current).toBe('synchronous');

    current = moveCircular(sequenceKeyboardMessageTypes, current, 1)!;
    expect(current).toBe('asynchronous');

    current = moveCircular(sequenceKeyboardMessageTypes, current, 1)!;
    expect(current).toBe('return');

    current = moveCircular(sequenceKeyboardMessageTypes, current, 1)!;
    expect(current).toBe('create');

    // Destroy is a regular creatable type and then the cycle wraps.
    current = moveCircular(sequenceKeyboardMessageTypes, current, 1)!;
    expect(current).toBe('destroy');
    current = moveCircular(sequenceKeyboardMessageTypes, current, 1)!;
    expect(current).toBe('synchronous');

    // Backward from create goes to return
    const prevFromCreate = moveCircular(sequenceKeyboardMessageTypes, 'create', -1);
    expect(prevFromCreate).toBe('return');

    // Backward from synchronous wraps to destroy.
    const prevFromSync = moveCircular(sequenceKeyboardMessageTypes, 'synchronous', -1);
    expect(prevFromSync).toBe('destroy');
  });

  it('advances text-bearing message types from aim to typing', () => {
    for (const type of sequenceKeyboardMessageTypes.filter((candidate) => candidate !== 'return')) {
      let state = createInactiveSequenceKeyboardState();
      state = sequenceKeyboardModeReducer(state, { type: 'activate', slotIndex: 0, sourceId: 'a' });
      state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType: type, targetId: 'b' });
      expect(state.stage).toBe('aim');
      expect(state.messageType).toBe(type);

      // Confirming with Enter transitions to typing
      state = sequenceKeyboardModeReducer(state, { type: 'start-typing' });
      expect(state.stage).toBe('typing');
      expect(state.messageType).toBe(type);

      // Esc returns back to aim
      state = sequenceKeyboardModeReducer(state, { type: 'back' });
      expect(state.stage).toBe('aim');
      expect(state.messageType).toBe(type);
    }
  });

  it('keeps creation and editing of textless returns in aim without retaining text', () => {
    let creation = createInactiveSequenceKeyboardState();
    creation = sequenceKeyboardModeReducer(creation, { type: 'activate', slotIndex: 0, sourceId: 'b' });
    creation = sequenceKeyboardModeReducer(creation, {
      type: 'begin', messageType: 'return', targetId: 'a', returnCandidateIds: ['call'],
    });
    creation = sequenceKeyboardModeReducer(creation, { type: 'start-typing', text: 'texto descartable' });
    expect(creation).toMatchObject({ stage: 'aim', messageType: 'return', text: '' });

    const editing = sequenceKeyboardModeReducer(creation, {
      type: 'start-typing', text: 'resultado legado', editId: 'return-1',
    });
    expect(editing).toMatchObject({ stage: 'aim', messageType: 'return', text: '', editId: 'return-1' });
  });
});
