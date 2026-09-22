import { describe, expect, it } from 'vitest';
import type { UseCaseFlowContent, UseCaseFlowStep } from '../types/diagram';
import { buildFlowDocument } from './flowDocument';
import { buildFlowDocumentXml } from './flowExportDocx';
import { reviewUseCaseFlow } from './useCaseFlowReview';

const row = (id: string, actor: string, system: string, ref = ''): UseCaseFlowStep => ({ id, actor, system, ref });

const content = (patch: Partial<UseCaseFlowContent>): UseCaseFlowContent => ({
  description: {
    useCaseNumber: '3', useCaseName: 'Actualizar Trámite', actor: 'Consultor', description: '', priority: 'A',
    inputParameters: '', precondition: '', postcondition: '', initialState: '', finalState: '',
  },
  basicFlow: [],
  alternativeFlows: [],
  ...patch,
});

const symbols = {
  classes: [
    { name: 'Tramite', attributes: [{ name: 'nroTramite', type: 'int' }], methods: [], parametricValues: [], relatedClasses: [] },
  ],
};

describe('reviewUseCaseFlow', () => {
  it('reports missing steps, blocks without children and unknown classes', () => {
    const issues = reviewUseCaseFlow(content({
      basicFlow: [
        row('a', '1. Ingresar número', ''),
        row('b', '', [
          '2. Buscar instancia de Tramitte con:',
          '3. SI no existe',
          '4. SINO',
          '5. Volver al paso 9',
        ].join('\n')),
      ],
    }), symbols);
    const messages = issues.map((issue) => issue.message).join('\n');

    expect(messages).toContain('paso 9');
    expect(messages).toContain('«Tramitte»');
    expect(messages).toContain('El SI del paso 3');
  });

  it('flags a path nobody references, without name and without an ending', () => {
    const issues = reviewUseCaseFlow(content({
      basicFlow: [row('a', '1. Ingresar', '2. Mostrar')],
      alternativeFlows: [{ id: 'p', code: 'CA 1', name: '', steps: [row('x', '', '3. Mostrar mensaje')] }],
    }), symbols);
    const ids = issues.map((issue) => issue.id);

    expect(ids).toContain('orphan:p');
    expect(ids).toContain('unnamed:p');
    expect(ids).toContain('end:CA 1');
  });

  it('is quiet for a consistent flow', () => {
    const issues = reviewUseCaseFlow(content({
      basicFlow: [row('a', '1. Ingresar', '2. Buscar instancia de Tramite con:\n        - nroTramite igual a número [CA 1]')],
      alternativeFlows: [{ id: 'p', code: 'CA 1', name: 'No existe', steps: [row('x', '', '3. Retornar a paso 1 del camino básico')] }],
    }), symbols);

    expect(issues).toEqual([]);
  });
});

describe('buildFlowDocumentXml', () => {
  it('writes the description, the flow tables and the path reference column', () => {
    const flow = content({
      basicFlow: [row('a', '1. Ingresar', '2. Validar datos [CA 1]')],
      alternativeFlows: [{ id: 'p', code: 'CA 1', name: 'Datos inconsistentes', steps: [row('x', '', '3. Retornar a paso 1 del camino básico')] }],
    });
    const xml = buildFlowDocumentXml(buildFlowDocument(flow, 'Actualizar Trámite', symbols));

    expect(xml).toContain('Nombre Caso de Uso');
    expect(xml).toContain('CAMINO BÁSICO');
    expect(xml).toContain('CAMINO ALTERNO N° 1 : Datos inconsistentes');
    expect(xml).toContain('C.A N°1');
    expect(xml).toContain('w:orient="landscape"');
    expect(xml).not.toContain('[CA 1]');
  });
});
