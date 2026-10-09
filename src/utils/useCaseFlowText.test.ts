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
      caretPosition: value.length, lineIndex: 0, markerLength: 6, value: '    ◦ Pendiente',
    });
  });

  it('leaves typing after an existing state bullet to the native caret', () => {
    const heading = 'Instancia de Libro con:';
    const insertion = insertStateBulletLine(heading, heading.length);
    let value = insertion.value;
    let position = value.length;

    for (const letter of 'titulo igual a vacío') {
      value = value.slice(0, position) + letter + value.slice(position);
      position += letter.length;
      expect(normalizeStateBulletShortcut(value, position)).toBeNull();
    }

    expect(value).toBe(`${heading}\n• titulo igual a vacío`);
    expect(position).toBe(value.length);
  });

  it.each(['•', '◦', '▪'])('does not move the caret when editing a formatted %s bullet', (symbol) => {
    const indent = symbol === '•' ? '' : symbol === '◦' ? '    ' : '        ';
    const value = `${indent}${symbol} titulo igual a vacío`;
    expect(normalizeStateBulletShortcut(value, value.length)).toBeNull();
    expect(normalizeStateBulletShortcut(value, value.indexOf('igual'))).toBeNull();
  });

  it('preserves the body offset when replacing a marker with a different length', () => {
    const value = 'Instancia de Libro con:\n  -uno más\nOtra línea';
    const position = value.indexOf(' más');
    expect(normalizeStateBulletShortcut(value, position)).toEqual({
      caretPosition: position - 1,
      lineIndex: 1,
      markerLength: 2,
      value: 'Instancia de Libro con:\n• uno más\nOtra línea',
    });
  });

  it('keeps a pasted shortcut caret after the pasted body', () => {
    expect(normalizeStateBulletShortcut('- uno', 5)).toEqual({
      caretPosition: 5, lineIndex: 0, markerLength: 2, value: '• uno',
    });
  });

  it('exits an empty state bullet when pressing Enter', () => {
    expect(insertStateBulletLine('• ', 2)).toEqual({
      lineIndex: 0, markerLength: 0, value: '',
    });
  });
});
