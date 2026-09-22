import { describe, expect, it } from 'vitest';
import type { UseCaseFlowContent, UseCaseFlowStep } from '../types/diagram';
import {
  appendLineRef,
  buildFlowDocument,
  getBulletDepths,
  getDefaultFirstStepNumber,
  getTurnSwitchLevel,
  parseFlowLine,
  parseFlowText,
  tokenizeFlowInline,
} from './flowDocument';
import { normalizeUseCaseFlowContentNumbering } from './useCaseFlowNumbering';

const row = (id: string, actor: string, system: string, ref = ''): UseCaseFlowStep => ({ id, actor, system, ref });

const content = (patch: Partial<UseCaseFlowContent>): UseCaseFlowContent => ({
  description: {
    useCaseNumber: '', useCaseName: '', actor: '', description: '', priority: 'A', inputParameters: '',
    precondition: '', postcondition: '', initialState: '', finalState: '',
  },
  basicFlow: [],
  alternativeFlows: [],
  ...patch,
});

// Step 7 of «Actualizar Estado Trámite»: the actor answers inside a POR CADA.
const tramiteRows = [
  row('r6', '6. Seleccionar acción', ''),
  row('r7', '', [
    '7. Actualizar estado del Tramite',
    '    7.1. Controlar consistencia de datos ingresada [CA 1]',
    '    7.4. SI accionSeleccionada es igual a Suspender',
    '        7.4.1. Definir pseudoentidad DTODocObservado(nombreTipoDocumentacion, observacionesDocObservado)',
    '        7.4.2. POR CADA nombreDocumento',
    '            7.4.2.1. Mostrar mensaje: "Ingresar las observaciones"',
  ].join('\n')),
  row('r8', '            7.4.2.2. obsDocObservado', ''),
  row('r9', '', '            7.4.2.3. Controlar consistencia de datos ingresada'),
];

describe('parseFlowLine', () => {
  it('reads numbered lines, bullets and trailing path references', () => {
    expect(parseFlowLine('    3.1. Buscar EstadoTramite con: [CA 2]')).toMatchObject({
      kind: 'step', number: '3.1', level: 2, body: 'Buscar EstadoTramite con:', refs: ['CA 2'],
    });
    expect(parseFlowLine('        - fechaHoraBajaET igual a null')).toMatchObject({ kind: 'bullet', indent: 8 });
    expect(parseFlowLine('Leer [C.A N°3]').refs).toEqual(['CA 3']);
  });

  it('counts bullet depth from the step they detail', () => {
    const lines = parseFlowText('    3.1. Buscar Tramite con:\n        - a\n        - Relacionada a X con:\n            - b');
    expect(getBulletDepths(lines)).toEqual([0, 0, 0, 1]);
  });
});

describe('turn switching with ⌘↵', () => {
  it('opens the next main step outside a block', () => {
    expect(getTurnSwitchLevel(tramiteRows, 'r6', 'actor', 0)).toBe(1);
    expect(getTurnSwitchLevel(tramiteRows, 'r7', 'system', 1)).toBe(1);
  });

  it('keeps the block numbering inside POR CADA, from either side', () => {
    expect(getTurnSwitchLevel(tramiteRows, 'r7', 'system', 5)).toBe(4);
    expect(getTurnSwitchLevel(tramiteRows, 'r8', 'actor', 0)).toBe(4);
  });

  it('inverts the rule with ⇧', () => {
    expect(getTurnSwitchLevel(tramiteRows, 'r7', 'system', 5, true)).toBe(1);
    expect(getTurnSwitchLevel(tramiteRows, 'r6', 'actor', 0, true)).toBe(2);
  });
});

describe('alternative paths', () => {
  it('start after the main step that references them, and renumber with it', () => {
    const flow = content({
      basicFlow: tramiteRows,
      alternativeFlows: [{ id: 'ca1', code: 'CA 1', name: 'Datos inconsistentes', steps: [row('a1', '', '1. Informar inconsistencia\n2. Retornar a paso 7 del camino básico')] }],
    });
    expect(getDefaultFirstStepNumber(flow, flow.alternativeFlows[0])).toBe(8);

    // The basic flow renumbers from 1 (6 → 1, 7 → 2): the path follows step 2
    // and its return reference follows step 7 to its new number.
    const numbered = normalizeUseCaseFlowContentNumbering(flow);
    expect(numbered.alternativeFlows[0].steps[0].system).toBe('3. Informar inconsistencia\n4. Retornar a paso 2 del camino básico');
  });

  it('honours an explicit first number', () => {
    const flow = content({
      alternativeFlows: [{ id: 'ca6', code: 'CA 6', name: '', firstStepNumber: 14, steps: [row('a', '', '1. Informar error')] }],
    });
    expect(normalizeUseCaseFlowContentNumbering(flow).alternativeFlows[0].steps[0].system).toBe('14. Informar error');
  });

  it('appends a reference to a line only once', () => {
    const once = appendLineRef('1. A\n    1.1. B', 1, 'CA 2');
    expect(once).toBe('1. A\n    1.1. B [CA 2]');
    expect(appendLineRef(once, 1, 'ca2')).toBe(once);
  });
});

describe('step references follow renumbering', () => {
  it('rewrites (paso N) when a step is inserted above it', () => {
    const flow = content({
      basicFlow: [row('r1', '', [
        '3. Listar trámites',
        '    3.1. Buscar EstadoTramite con:',
        '    3.2. Nuevo paso',
        '    3.2. Buscar instancias de Tramite con:',
        '        - Relacionada a EstadoTramite distinto a EstadoTramite buscado (paso 3.1)',
        '    3.3. POR CADA instancia de Tramite (paso 3.2)',
      ].join('\n'))],
    });
    const system = normalizeUseCaseFlowContentNumbering(flow).basicFlow[0].system.split('\n');
    expect(system[0]).toBe('1. Listar trámites');
    expect(system[4]).toContain('(paso 1.1)');
    expect(system[5]).toBe('    1.4. POR CADA instancia de Tramite (paso 1.3)');
  });
});

describe('inline tokens', () => {
  it('marks classes, attributes, keywords and references', () => {
    const vocabulary = { classes: new Set(['Tramite']), attributes: new Set(['nroTramite']) };
    const tokens = tokenizeFlowInline('POR CADA instancia de Tramite (paso 3.2) nroTramite [CA 1]', vocabulary);
    expect(tokens.map((token) => token.kind)).toEqual(['keyword', 'plain', 'class', 'plain', 'stepRef', 'plain', 'attribute', 'plain', 'pathRef']);
  });
});

describe('buildFlowDocument', () => {
  it('prints main steps in bold and formats the initial state', () => {
    const doc = buildFlowDocument(
      content({
        description: {
          useCaseNumber: '3', useCaseName: 'Actualizar Estado Trámite', actor: 'Consultor', description: '', priority: 'A',
          inputParameters: '', precondition: '', postcondition: '',
          initialState: 'Instancia de Consultor con:\n• fechaHoraBajaConsultor igual a vacío\nSi el trámite está en progreso',
          finalState: '',
        },
        basicFlow: [row('r1', '1. Iniciar CU', ''), row('r2', '', '2. Verificar consultor\n    2.1. Invocar servicio [CA 2]')],
      }),
      'Flujo',
      { classes: [{ name: 'Consultor', attributes: [{ name: 'fechaHoraBajaConsultor', type: '' }], methods: [], parametricValues: [], relatedClasses: [] }] },
    );

    expect(doc.basic.rows[1].system).toMatchObject([
      { number: '2.', bold: true, depth: 0 },
      { number: '2.1.', depth: 1, refs: ['CA 2'], segments: [{ text: 'Invocar servicio' }] },
    ]);
    const initial = doc.fields.find((field) => field.label === 'Estado Inicial')?.lines ?? [];
    expect(initial[0].segments).toContainEqual({ text: 'Consultor', underline: true, italic: undefined });
    expect(initial[1]).toMatchObject({ bullet: 0 });
    expect(initial[1].segments[0]).toMatchObject({ text: 'fechaHoraBajaConsultor', italic: true });
    expect(initial[2].bold).toBe(true);
  });
});
