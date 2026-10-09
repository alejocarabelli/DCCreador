import { describe, expect, it } from 'vitest';
import type { ClassDiagramArtifact, ClassDiagramNode, UseCaseFlowContent, UseCaseFlowStep } from '../types/diagram';
import { buildProjectSymbolIndex } from './projectSymbolIndex';
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
  it.each(['Fin del caso de uso', 'Finalizar el caso de uso', 'Fin de CU', 'Fin CU'])('accepts «%s» as the end of a path (D5)', (ending) => {
    const issues = reviewUseCaseFlow(content({
      basicFlow: [row('a', '1. Ingresar [CA 1]', '2. Mostrar')],
      alternativeFlows: [{ id: 'p', code: 'CA 1', name: 'Cancela', steps: [row('x', '', `3. ${ending}`)] }],
    }), symbols);

    expect(issues.map((issue) => issue.id)).not.toContain('end:CA 1');
  });

  it('knows the attributes a class inherits (D4)', () => {
    const node = (id: string, name: string, attribute: string): ClassDiagramNode => ({
      id, type: 'classNode', position: { x: 0, y: 0 },
      data: { name, attributes: attribute ? [{ id: `${id}-a`, name: attribute, type: 'string', visibility: 'private' }] : [], methods: [] },
    } as unknown as ClassDiagramNode);
    const diagram = {
      id: 'd', type: 'class-diagram', name: 'Dominio', createdAt: 'now', updatedAt: 'now',
      content: {
        nodes: [node('persona', 'Persona', 'nombre'), node('alumno', 'Alumno', 'legajo')],
        edges: [{ id: 'g', source: 'alumno', target: 'persona', type: 'association', data: { relationType: 'generalization' } }],
      },
    } as unknown as ClassDiagramArtifact;
    const index = buildProjectSymbolIndex(diagram);
    const alumno = index.classes.find((entry) => entry.name === 'Alumno');

    expect(alumno?.attributes.map((attribute) => attribute.name)).toEqual(['legajo', 'nombre']);
    const issues = reviewUseCaseFlow(content({
      basicFlow: [row('a', '1. Ingresar', '2. Buscar instancia de Alumno con:\n        - nombre igual a Ana')],
    }), index);
    expect(issues.map((issue) => issue.message).join('\n')).not.toContain('nombre');
  });

  it('does not loop on an inheritance cycle', () => {
    const node = (id: string, name: string): ClassDiagramNode => ({
      id, type: 'classNode', position: { x: 0, y: 0 }, data: { name, attributes: [], methods: [] },
    } as unknown as ClassDiagramNode);
    const diagram = {
      id: 'd', type: 'class-diagram', name: 'Dominio', createdAt: 'now', updatedAt: 'now',
      content: {
        nodes: [node('a', 'A'), node('b', 'B')],
        edges: [
          { id: 'g1', source: 'a', target: 'b', type: 'association', data: { relationType: 'generalization' } },
          { id: 'g2', source: 'b', target: 'a', type: 'association', data: { relationType: 'generalization' } },
        ],
      },
    } as unknown as ClassDiagramArtifact;

    expect(buildProjectSymbolIndex(diagram).classes).toHaveLength(2);
  });

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
