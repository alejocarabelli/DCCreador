import { describe, expect, it } from 'vitest';
import {
  changeLineLevel,
  insertLineAfterCurrent,
  insertStateBulletLine,
  normalizeStateBulletShortcut,
  removeOrPromoteFlowMarker,
} from './useCaseFlowText';

describe('flow text editing', () => {
  it('inserts a nested step without changing the following text', () => {
    const value = '2. Controlar datos\n3. Guardar cambios';
    const result = insertLineAfterCurrent(value, '2. Controlar datos'.length, true);
    expect(result).toEqual({
      lineIndex: 1,
      markerLength: 9,
      value: '2. Controlar datos\n    2.1. \n3. Guardar cambios',
    });
  });

  it('promotes a nested step and preserves its contents', () => {
    const value = '    2.1. Buscar instancia Pedido';
    expect(changeLineLevel(value, value.length, -1)).toEqual({
      lineIndex: 0, markerLength: 3, value: '3. Buscar instancia Pedido',
    });
  });

  it('only handles backspace inside the marker, leaving ordinary deletion to the input', () => {
    const value = '    - estado';
    expect(removeOrPromoteFlowMarker(value, value.length)).toBeNull();
    expect(removeOrPromoteFlowMarker(value, 6)).toEqual({
      lineIndex: 0, markerLength: 2, value: '- estado',
    });
  });

  it('converts a state bullet shortcut at its current indentation level', () => {
    const value = '    - Pendiente';
    expect(normalizeStateBulletShortcut(value, value.length)).toEqual({
      lineIndex: 0, markerLength: 6, value: '    ◦ Pendiente',
    });
  });

  it('exits an empty state bullet when pressing Enter', () => {
    expect(insertStateBulletLine('• ', 2)).toEqual({
      lineIndex: 0, markerLength: 0, value: '',
    });
  });
});
