import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SequenceKeyboardComposer } from './SequenceKeyboardComposer';
import {
  createInactiveSequenceKeyboardState,
  sequenceKeyboardModeReducer,
} from '../utils/sequenceKeyboardMode';

const renderComposer = (state: ReturnType<typeof createInactiveSequenceKeyboardState>): string => renderToString(
  <SequenceKeyboardComposer
    state={state}
    context="Secuencia principal"
    sourceName="Sin participantes"
    targetName="Elegí un destino"
    position={{ left: '120px', top: '80px' }}
    methodOptions={[]}
    selectedCount={0}
    onTextChange={vi.fn()}
    onGuardChange={vi.fn()}
    onSubmit={vi.fn()}
    onBack={vi.fn()}
    onMethodSelect={vi.fn()}
    onAddParticipant={vi.fn()}
  />,
);

describe('SequenceKeyboardComposer participant flow', () => {
  it('exposes the participant command from the empty navigation state', () => {
    const state = sequenceKeyboardModeReducer(
      createInactiveSequenceKeyboardState(),
      { type: 'activate', slotIndex: 0, sourceId: '' },
    );
    const html = renderComposer(state);

    expect(html).toContain('Participante');
    expect(html).toContain('P');
  });

  it('renders the shared textual participant input and cancellation hint', () => {
    let state = sequenceKeyboardModeReducer(
      createInactiveSequenceKeyboardState(),
      { type: 'activate', slotIndex: 0, sourceId: '' },
    );
    state = sequenceKeyboardModeReducer(state, { type: 'begin-participant' });
    const html = renderComposer(state);

    expect(html).toContain('Agregar participante');
    expect(html).toContain('instancia:Clase o :Clase');
    expect(html).toContain('Esc cancelar');
  });

  it('does not render a signature input when creating a return by keyboard', () => {
    let state = sequenceKeyboardModeReducer(
      createInactiveSequenceKeyboardState(),
      { type: 'activate', slotIndex: 0, sourceId: 'b' },
    );
    state = sequenceKeyboardModeReducer(state, {
      type: 'begin', messageType: 'return', targetId: 'a', returnCandidateIds: ['call-1'],
    });
    state = sequenceKeyboardModeReducer(state, { type: 'start-typing' });

    const html = renderComposer(state);
    expect(html).not.toContain('<input');
    expect(html).not.toContain('resultado / valor');
    expect(html).toContain('Retorno');
  });

  it('does not render a signature input when editing an existing return by keyboard', () => {
    let state = sequenceKeyboardModeReducer(
      createInactiveSequenceKeyboardState(),
      { type: 'activate', slotIndex: 0, sourceId: 'b' },
    );
    state = sequenceKeyboardModeReducer(state, {
      type: 'begin', messageType: 'return', targetId: 'a', returnCandidateIds: ['call-1'],
    });
    state = sequenceKeyboardModeReducer(state, {
      type: 'start-typing', text: 'resultado legado', editId: 'return-1',
    });

    const html = renderComposer(state);
    expect(state.editId).toBe('return-1');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('resultado legado');
    expect(html).toContain('Retorno');
  });
});
