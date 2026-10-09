import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import type { ClassDiagramArtifact, DesignArtifact, DiagramProject, UseCaseFlowArtifact } from '../types/diagram';
import { normalizeUseCaseFlowContent } from '../utils/diagramNormalization';
import { academicLightTheme } from '../theme/themes';
import { UseCaseFlowEditor } from './UseCaseFlowEditor';

// The "Diagrama de clases" select of the flow editor. null is "Sin referencia" chosen explicitly;
// undefined is a flow that never chose a diagram and takes the project's only class diagram.

const dates = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };

const classDiagram = (id: string, name: string): ClassDiagramArtifact => ({
  ...dates, id, type: 'class-diagram', name, content: { nodes: [], edges: [] },
});

const flow = (classDiagramArtifactId: string | null | undefined): UseCaseFlowArtifact => ({
  ...dates,
  id: 'flow',
  type: 'use-case-flow',
  name: 'Flujo',
  content: { ...normalizeUseCaseFlowContent(undefined), classDiagramArtifactId },
});

const render = (artifacts: DesignArtifact[], artifact: UseCaseFlowArtifact): string => {
  const project: DiagramProject = { ...dates, id: 'p', name: 'Proyecto', activeArtifactId: artifact.id, artifacts: [...artifacts, artifact] };
  return renderToString(createElement(UseCaseFlowEditor, {
    artifact,
    canRedo: false,
    canUndo: false,
    project,
    theme: academicLightTheme,
    onChangeContent: () => undefined,
    onRedo: () => undefined,
    onUndo: () => undefined,
  }));
};

// The <option> that carries the selected attribute inside the diagram select.
const selectedOptionOf = (html: string): string | null => {
  const selects = html.match(/<select[\s\S]*?<\/select>/g) ?? [];
  const diagramSelect = selects.find((select) => select.includes('Sin referencia') || select.includes('Sin diagramas de clases'));
  if (diagramSelect === undefined) return null;
  const option = diagramSelect.match(/<option[^>]*selected=""[^>]*>[^<]*<\/option>/);
  return option ? option[0] : null;
};

const missingReference = 'La referencia guardada ya no existe.';

describe('flow → class diagram reference', () => {
  it('a stored reference shows as the selected option', () => {
    const html = render([classDiagram('A', 'Modelo A'), classDiagram('B', 'Modelo B')], flow('B'));
    expect(selectedOptionOf(html)).toContain('value="B"');
  });

  it('"Sin referencia" (null) with a single class diagram stays "Sin referencia"', () => {
    const html = render([classDiagram('model', 'Modelo')], flow(null));
    expect(selectedOptionOf(html)).toMatch(/value=""[^>]*>Sin referencia</);
    expect(html).not.toContain(missingReference);
  });

  it('a never-chosen flow (undefined) with a single class diagram selects that diagram', () => {
    const html = render([classDiagram('model', 'Modelo')], flow(undefined));
    expect(selectedOptionOf(html)).toContain('value="model"');
  });

  it('a saved reference to a deleted diagram is reported and is not replaced by the only remaining one', () => {
    const html = render([classDiagram('B', 'Modelo B')], flow('A-deleted'));
    expect(html).toContain(missingReference);
    expect(html).not.toMatch(/<option value="B" selected/);
  });

  it('"Sin referencia" (null) with two class diagrams stays selected', () => {
    const html = render([classDiagram('B', 'Modelo B'), classDiagram('C', 'Modelo C')], flow(null));
    expect(selectedOptionOf(html)).toMatch(/value=""[^>]*>Sin referencia</);
  });

  it('a deleted reference is reported with two class diagrams too', () => {
    const html = render([classDiagram('B', 'Modelo B'), classDiagram('C', 'Modelo C')], flow('A-deleted'));
    expect(html).toContain(missingReference);
  });
});
