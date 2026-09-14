import { describe, expect, it } from 'vitest';
import type { ProjectSymbolIndex } from './projectSymbolIndex';
import { buildFlowSuggestions } from './useCaseFlowCompletion';

const symbols: ProjectSymbolIndex = {
  classes: [{
    name: 'Pedido',
    attributes: [{ name: 'estado', type: 'string' }],
    methods: [],
    parametricValues: ['Pendiente', 'Entregado'],
    relatedClasses: [],
  }],
};
const usage = { classes: [], refs: [], variables: [] };

describe('flow completion', () => {
  it('completes an actor action at the caret without replacing the suffix', () => {
    const value = '1. Sele producto';
    const position = '1. Sele'.length;
    const suggestions = buildFlowSuggestions('actor', value, position, symbols, usage);
    expect(suggestions.map(suggestion => suggestion.label)).toEqual(['Seleccionar']);
    expect(suggestions[0].apply(value, position)).toEqual({
      value: '1. Seleccionar  producto', caretPosition: '1. Seleccionar '.length,
    });
  });

  it('inserts the selected class with a condition line and positions the caret there', () => {
    const value = '2. Buscar instancia Pe';
    const suggestions = buildFlowSuggestions('system', value, value.length, symbols, usage);
    expect(suggestions.map(suggestion => suggestion.label)).toEqual(['Pedido']);
    const expected = '2. Buscar instancia Pedido con:\n    - ';
    expect(suggestions[0].apply(value, value.length)).toEqual({
      value: expected, caretPosition: expected.length,
    });
  });

  it('suggests values from the class searched on the previous line', () => {
    const value = '2. Buscar instancia Pedido con:\n    - estado = "Pe';
    const suggestions = buildFlowSuggestions('system', value, value.length, symbols, usage);
    expect(suggestions.map(suggestion => suggestion.label)).toEqual(['"Pendiente"']);
    const expected = '2. Buscar instancia Pedido con:\n    - estado = "Pendiente"';
    expect(suggestions[0].apply(value, value.length)).toEqual({
      value: expected, caretPosition: expected.length,
    });
  });

  it('does not invent classes when the linked diagram is empty', () => {
    const value = '2. Buscar instancia Pe';
    expect(buildFlowSuggestions('system', value, value.length, { classes: [] }, usage)).toEqual([]);
  });
});
