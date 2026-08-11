import { describe, expect, it } from 'vitest';
import type { UseCaseFlowContent, UseCaseFlowStep } from '../types/diagram';
import { normalizeFlowRowsNumbering, normalizeUseCaseFlowContentNumbering } from '../utils/useCaseFlowNumbering';

describe('use case flow numbering', () => {
  it('renumbers actor and system globally in reading order', () => {
    const rows: UseCaseFlowStep[] = [
      { id: 'row-1', actor: '7. Iniciar CU', system: '1. Solicitar datos', ref: '' },
      { id: 'row-2', actor: '1. Ingresar datos', system: '3. Verificar datos', ref: '' },
    ];

    const normalized = normalizeFlowRowsNumbering(rows);

    expect(normalized[0].actor).toBe('1. Iniciar CU');
    expect(normalized[0].system).toBe('2. Solicitar datos');
    expect(normalized[1].actor).toBe('3. Ingresar datos');
    expect(normalized[1].system).toBe('4. Verificar datos');
  });

  it('preserves hierarchy and ignores bullet details', () => {
    const rows: UseCaseFlowStep[] = [
      {
        id: 'row-1',
        actor: '8. Iniciar CU',
        system: '4. Verificar existencia\n4.9. Buscar instancia Caso con:\n    - estado = "Disponible"',
        ref: '',
      },
    ];

    const [normalized] = normalizeFlowRowsNumbering(rows);

    expect(normalized.actor).toBe('1. Iniciar CU');
    expect(normalized.system).toBe(
      '2. Verificar existencia\n    2.1. Buscar instancia Caso con:\n    - estado = "Disponible"',
    );
  });

  it('numbers alternative flows independently from the basic flow', () => {
    const content = {
      description: {
        useCaseName: '', actor: '', description: '', priority: 'A', inputParameters: '', precondition: '',
        postcondition: '', initialState: '', finalState: '',
      },
      basicFlow: [{ id: 'basic', actor: '9. Básico', system: '', ref: '' }],
      alternativeFlows: [{
        id: 'alternative', code: 'CA 1', name: '',
        steps: [{ id: 'alternative-step', actor: '', system: '9. Alternativo', ref: '' }],
      }],
    } satisfies UseCaseFlowContent;

    const normalized = normalizeUseCaseFlowContentNumbering(content);

    expect(normalized.basicFlow[0].actor).toBe('1. Básico');
    expect(normalized.alternativeFlows[0].steps[0].system).toBe('1. Alternativo');
  });
});
