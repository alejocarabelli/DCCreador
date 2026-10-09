import { describe, expect, it } from 'vitest';
import { createInactiveSequenceKeyboardState, sequenceKeyboardModeReducer } from './sequenceKeyboardMode';

const activateFromNavigation = () => sequenceKeyboardModeReducer(
  createInactiveSequenceKeyboardState(),
  { type: 'activate', slotIndex: 0, sourceId: 'participant-1' },
);

describe('C5: Escape goes back one step in sequence keyboard mode', () => {
  it('leaves the mode when there is no earlier step', () => {
    expect(sequenceKeyboardModeReducer(activateFromNavigation(), { type: 'back' }).stage).toBe('off');
  });

  it('returns from aiming to navigation while the exit button deactivates immediately', () => {
    const aiming = sequenceKeyboardModeReducer(activateFromNavigation(), { type: 'begin', messageType: 'synchronous' });
    expect(sequenceKeyboardModeReducer(aiming, { type: 'back' }).stage).toBe('navigate');
    expect(sequenceKeyboardModeReducer(aiming, { type: 'deactivate' }).stage).toBe('off');
  });

  it('returns from typing to aiming and preserves the draft', () => {
    const aiming = sequenceKeyboardModeReducer(activateFromNavigation(), { type: 'begin', messageType: 'synchronous' });
    const typing = sequenceKeyboardModeReducer(aiming, { type: 'start-typing', text: 'buscar()' });
    expect(sequenceKeyboardModeReducer(typing, { type: 'back' })).toMatchObject({ stage: 'aim', text: 'buscar()' });
  });
});
